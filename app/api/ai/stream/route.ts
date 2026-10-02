import { NextRequest } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest, allowProviderWork } from "@/lib/ai-rate-limit";
import { providerMode, stream, type AiStreamPart } from "@/lib/ai-provider";
import { aiErrorResponse, aiFailure, aiStreamErrorMessage } from "@/lib/ai-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const encoder = new TextEncoder();
const line = (event: object) => encoder.encode(`${JSON.stringify(event)}\n`);

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try { session = await currentSession(request); } catch { return aiFailure(503, "认证服务暂时不可用，请稍后重试。"); }
  if (!session) return unauthorized();
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return aiFailure(400, "请发送 JSON 格式的问题。");
  let body: unknown;
  try { body = await request.json(); } catch { return aiFailure(400, "请求中的 JSON 格式不正确。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return aiFailure(400, "请填写问题。");
  const input = (body as Record<string, unknown>).input;
  if (typeof input !== "string" || !input.trim()) return aiFailure(400, "请填写问题。");
  const prompt = input.trim();
  if (prompt.length > 2000) return aiFailure(400, "问题不能超过 2000 个字符。");
  if (!allowAiRequest(session.user.id)) return aiFailure(429, "请求太频繁，请一分钟后再试。");

  const localAbort = new AbortController();
  const signal = AbortSignal.any([request.signal, localAbort.signal]);
  let mode: "mock" | "real";
  let iterator: AsyncGenerator<AiStreamPart>;
  let first: IteratorResult<AiStreamPart>;
  try {
    if (!allowProviderWork(session.user.id, 1)) return aiFailure(429, "本分钟模型调用预算已用完，请稍后再试。");
    mode = providerMode();
    iterator = stream(prompt, { signal });
    first = await iterator.next();
    if (first.done) return aiFailure(502, "模型服务暂时不可用，请稍后重试。");
  } catch (error) {
    return aiErrorResponse(error);
  }

  const output = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (!closed && !signal.aborted) controller.enqueue(line(event));
      };
      const close = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* reader already cancelled */ } } };
      const sendPart = (part: AiStreamPart) => {
        if (part.type === "delta") send({ type: "delta", text: part.text });
        else send({ type: "usage", promptTokens: part.usage.promptTokens, completionTokens: part.usage.completionTokens, totalTokens: part.usage.totalTokens });
      };
      void (async () => {
        try {
          send({ type: "meta", kind: mode });
          sendPart(first.value);
          for await (const part of iterator) sendPart(part);
          if (!signal.aborted) send({ type: "done" });
        } catch (error) {
          if (!signal.aborted) send({ type: "error", message: aiStreamErrorMessage(error) });
        } finally {
          close();
        }
      })();
    },
    cancel() {
      localAbort.abort();
      void iterator.return(undefined).catch(() => {});
    },
  });
  return new Response(output, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
