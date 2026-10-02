import { NextRequest, NextResponse } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest, allowProviderWork } from "@/lib/ai-rate-limit";
import { aiErrorResponse, aiFailure, aiHeaders } from "@/lib/ai-http";
import { embed, generate } from "@/lib/ai-provider";
import { retrieveTopK } from "@/lib/knowledge-retrieval";
import { buildCitationPrompt, citableChunks, citationSystemInstruction } from "@/lib/knowledge-citations";
import { verifiedKnowledgeAnswer } from "@/lib/knowledge-answer";

export const dynamic = "force-dynamic";
const noKnowledgeAnswer = "当前知识库里还没有可用于回答的资料。";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try { session = await currentSession(request); } catch { return aiFailure(503, "认证服务暂时不可用。"); }
  if (!session) return unauthorized();
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return aiFailure(400, "请发送 JSON 格式的问题。");
  let body: unknown;
  try { body = await request.json(); } catch { return aiFailure(400, "JSON 格式不正确。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return aiFailure(400, "请填写问题。");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== "question")) return aiFailure(400, "只接受 question；检索与模型参数由服务端决定。");
  if (typeof input.question !== "string" || !input.question.trim() || input.question.trim().length > 1000) return aiFailure(400, "问题需为 1～1000 个字符。");
  if (!allowAiRequest(session.user.id)) return aiFailure(429, "请求太频繁，请一分钟后再试。");

  const started = performance.now();
  try {
    if (!allowProviderWork(session.user.id, 2)) return aiFailure(429, "本分钟模型调用预算已用完，请稍后再试。");
    const query = await embed(input.question.trim());
    const embeddedAt = performance.now();
    const chunks = await retrieveTopK(session.user.id, query);
    const retrievedAt = performance.now();
    const matches = chunks.map(chunk => ({ title: chunk.title, position: chunk.position,
      preview: chunk.content.slice(0, 160), similarity: chunk.similarity }));
    if (chunks.length === 0) return NextResponse.json({ ok: true, kind: query.kind, status: "insufficient", answer: noKnowledgeAnswer, sources: [], matches,
      usage: { embeddingTokens: query.usage?.totalTokens ?? null, chatTokens: null },
      latencyMs: { embedding: Math.round(embeddedAt - started), retrieval: Math.round(retrievedAt - embeddedAt), chat: null, total: Math.round(performance.now() - started) },
    }, { headers: aiHeaders });

    const citable = citableChunks(chunks);
    const raw = query.kind === "mock"
      ? { kind: "mock" as const, text: JSON.stringify({ status: "answered", answer: "MOCK：这是基于第一条命中资料生成的示例回答。", sourceIds: [citable[0].sourceId] }), usage: null }
      : await generate(buildCitationPrompt(input.question.trim(), citable), { structured: true, system: citationSystemInstruction });
    if (raw.kind !== query.kind) throw new Error("PROVIDER_MODE_CHANGED");
    const answer = verifiedKnowledgeAnswer(raw.text, citable);
    const completedAt = performance.now();
    return NextResponse.json({ ok: true, kind: raw.kind, ...answer, matches,
      usage: { embeddingTokens: query.usage?.totalTokens ?? null, chatTokens: raw.usage?.totalTokens ?? null },
      latencyMs: { embedding: Math.round(embeddedAt - started), retrieval: Math.round(retrievedAt - embeddedAt), chat: Math.round(completedAt - retrievedAt), total: Math.round(completedAt - started) },
    }, { headers: aiHeaders });
  } catch (error) { return aiErrorResponse(error); }
}
