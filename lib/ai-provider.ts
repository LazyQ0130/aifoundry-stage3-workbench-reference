import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { ProviderSseParser } from "@/lib/provider-sse";
import { embeddingDimension, vectorLiteral } from "@/lib/knowledge-vector";
import { mockEmbedding } from "@/lib/knowledge-mock";

export type AiUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type AiAnswer = { kind: "mock" | "real"; text: string; usage: AiUsage | null };
export type AiStreamPart = { type: "delta"; text: string } | { type: "usage"; usage: AiUsage };
export type AiEmbedding = { kind: "mock" | "real"; vector: number[]; model: string; dimension: number; usage: { promptTokens: number; totalTokens: number } | null };

export class AiProviderError extends Error {
  constructor(readonly code: "CONFIG" | "TIMEOUT" | "UNAUTHORIZED" | "UPSTREAM" | "CANCELLED" | "OUTPUT_TRUNCATED") {
    super(code);
  }
}

export function timeoutMs(value = process.env.AI_TIMEOUT_MS): number {
  const number = Number(value ?? "20000");
  if (!Number.isInteger(number) || number < 1000 || number > 30000) throw new AiProviderError("CONFIG");
  return number;
}

export function providerMode(value = process.env.AI_PROVIDER_MODE): "mock" | "real" {
  if (value === undefined || value === "mock") return "mock";
  if (value === "real") return "real";
  throw new AiProviderError("CONFIG");
}

function realConfig(prefix: "AI_CHAT" | "AI_EMBEDDING" = "AI_CHAT") {
  const base = process.env[`${prefix}_BASE_URL`];
  const key = process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];
  if (!base || !key || !model) throw new AiProviderError("CONFIG");
  let url: URL;
  try { url = new URL(base); } catch { throw new AiProviderError("CONFIG"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new AiProviderError("CONFIG");
  if (url.username || url.password || url.search || url.hash) throw new AiProviderError("CONFIG");
  return { base: base.replace(/\/$/, ""), key, model };
}

function embeddingUsageOf(value: unknown): AiEmbedding["usage"] {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  if (typeof usage.prompt_tokens !== "number" || !Number.isSafeInteger(usage.prompt_tokens) || usage.prompt_tokens < 0) return null;
  const total = usage.total_tokens ?? usage.prompt_tokens;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) return null;
  return { promptTokens: usage.prompt_tokens, totalTokens: total };
}

function usageOf(value: unknown): AiUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const numbers = [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens];
  if (!numbers.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)) return null;
  return { promptTokens: numbers[0] as number, completionTokens: numbers[1] as number, totalTokens: numbers[2] as number };
}

function bounded(input: string, limit: number) {
  if (typeof input !== "string" || !input.trim() || input.trim().length > limit) throw new AiProviderError("UPSTREAM");
  return input.trim();
}

function chatBody(prompt: string, model: string, structured: boolean, streaming: boolean, system?: string) {
  return {
    model, messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }], max_tokens: 256,
    ...(model === "qwen3.7-flash" && process.env.AI_CHAT_DISABLE_THINKING === "1" ? { enable_thinking: false } : {}),
    ...(structured ? { response_format: { type: "json_object" } } : {}),
    ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

async function openProvider(config: ReturnType<typeof realConfig>, path: string, body: unknown, signal?: AbortSignal) {
  const { base, key } = config;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs());
  const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  const close = () => clearTimeout(timer);
  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: requestSignal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new AiProviderError(response.status === 401 ? "UNAUTHORIZED" : "UPSTREAM");
    }
    return { response, close, timedOut: () => timeout.signal.aborted };
  } catch (error) {
    close();
    if (signal?.aborted) throw new AiProviderError("CANCELLED");
    if (timeout.signal.aborted) throw new AiProviderError("TIMEOUT");
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("UPSTREAM");
  }
}

async function openChat(prompt: string, options: { structured?: boolean; streaming?: boolean; signal?: AbortSignal; system?: string }) {
  const config = realConfig();
  return openProvider(config, "/chat/completions", chatBody(prompt, config.model, options.structured === true, options.streaming === true, options.system), options.signal);
}

/** The same server-only adapter handles embeddings, with independent credentials/config. */
export async function embed(input: string): Promise<AiEmbedding> {
  const text = bounded(input, 1000);
  if (providerMode() === "mock") {
    const vector = mockEmbedding(text);
    return { kind: "mock", vector, model: "mock-embedding-v1", dimension: embeddingDimension, usage: null };
  }
  if (process.env.AI_EMBEDDING_DIMENSION !== String(embeddingDimension)) throw new AiProviderError("CONFIG");
  const config = realConfig("AI_EMBEDDING");
  const request = await openProvider(config, "/embeddings", { model: config.model, input: text, dimensions: embeddingDimension, encoding_format: "float" });
  try {
    const data: unknown = await request.response.json();
    if (!data || typeof data !== "object") throw new AiProviderError("UPSTREAM");
    const body = data as Record<string, unknown>;
    const first = Array.isArray(body.data) ? body.data[0] : null;
    const vector = first && typeof first === "object" ? (first as Record<string, unknown>).embedding : null;
    try { vectorLiteral(vector); } catch { throw new AiProviderError("UPSTREAM"); }
    return { kind: "real", vector: vector as number[], model: config.model, dimension: embeddingDimension, usage: embeddingUsageOf(body.usage) };
  } catch (error) {
    if (request.timedOut()) throw new AiProviderError("TIMEOUT");
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("UPSTREAM");
  } finally { request.close(); }
}

/** One server-only Provider contract for ordinary, structured, and streaming calls. */
export async function generate(input: string, options: { structured?: boolean; system?: string } = {}): Promise<AiAnswer> {
  const structured = options.structured === true;
  const prompt = bounded(input, structured || options.system ? 4000 : 2000);
  const system = options.system ? bounded(options.system, 1000) : undefined;
  if (providerMode() === "mock") return structured
    ? { kind: "mock", text: JSON.stringify({ summary: "这是 Mock 模式的结构化建议。", tags: ["Mock", "示例"], confidence: 0.8 }), usage: null }
    : { kind: "mock", text: system ? "MOCK：已根据本次检索内容走通 RAG 链路。此回答仅供流程验证，尚未调用真实模型。" : `MOCK：已收到问题「${prompt.slice(0, 40)}」。这里是固定示例回答，尚未调用真实模型。`, usage: null };
  const chat = await openChat(prompt, { structured, system });
  try {
    const data: unknown = await chat.response.json();
    if (!data || typeof data !== "object") throw new AiProviderError("UPSTREAM");
    const body = data as Record<string, unknown>;
    const first = Array.isArray(body.choices) ? body.choices[0] : null;
    if (structured && first && typeof first === "object" && (first as Record<string, unknown>).finish_reason === "length") throw new AiProviderError("OUTPUT_TRUNCATED");
    const message = first && typeof first === "object" ? (first as Record<string, unknown>).message : null;
    const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : null;
    if (typeof content !== "string" || !content.trim()) throw new AiProviderError("UPSTREAM");
    return { kind: "real", text: content.slice(0, 4000), usage: usageOf(body.usage) };
  } catch (error) {
    if (chat.timedOut()) throw new AiProviderError("TIMEOUT");
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("UPSTREAM");
  } finally { chat.close(); }
}

export async function* stream(input: string, options: { signal?: AbortSignal } = {}): AsyncGenerator<AiStreamPart> {
  const prompt = bounded(input, 2000);
  if (providerMode() === "mock") {
    for (const text of ["MOCK：", "这是", "一段", "流式回答。"]) {
      if (options.signal?.aborted) throw new AiProviderError("CANCELLED");
      try { await pause(800, undefined, { signal: options.signal }); } catch { throw new AiProviderError("CANCELLED"); }
      if (options.signal?.aborted) throw new AiProviderError("CANCELLED");
      yield { type: "delta", text };
    }
    return;
  }

  const chat = await openChat(prompt, { streaming: true, signal: options.signal });
  const reader = chat.response.body?.getReader();
  if (!reader) { chat.close(); throw new AiProviderError("UPSTREAM"); }
  const parser = new ProviderSseParser();
  let deltas = 0;
  try {
    while (true) {
      if (options.signal?.aborted) throw new AiProviderError("CANCELLED");
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of parser.push(value)) {
        if (options.signal?.aborted) throw new AiProviderError("CANCELLED");
        if (frame.type === "delta") { deltas++; yield frame; }
        else { const usage = usageOf(frame.value); if (usage) yield { type: "usage", usage }; }
      }
      if (parser.done) break;
    }
    parser.finish();
    if (deltas === 0) throw new AiProviderError("UPSTREAM");
  } catch (error) {
    if (options.signal?.aborted) throw new AiProviderError("CANCELLED");
    if (chat.timedOut()) throw new AiProviderError("TIMEOUT");
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError("UPSTREAM");
  } finally {
    chat.close();
    await reader.cancel().catch(() => {});
  }
}
