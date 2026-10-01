import { NextRequest, NextResponse } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest } from "@/lib/ai-rate-limit";
import { aiErrorResponse, aiFailure, aiHeaders } from "@/lib/ai-http";
import { embed } from "@/lib/ai-provider";
import { retrieveTopK } from "@/lib/knowledge-retrieval";

export const dynamic = "force-dynamic";

/** Teaching stop: inspect retrieval before adding the Chat step. */
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
  if (Object.keys(input).some(key => key !== "question")) return aiFailure(400, "只接受 question；检索参数由服务端决定。");
  if (typeof input.question !== "string" || !input.question.trim() || input.question.trim().length > 1000) return aiFailure(400, "问题需为 1～1000 个字符。");
  if (!allowAiRequest(session.user.id)) return aiFailure(429, "请求太频繁，请一分钟后再试。");

  try {
    const query = await embed(input.question.trim());
    const chunks = await retrieveTopK(session.user.id, query);
    return NextResponse.json({ ok: true, kind: query.kind,
      matches: chunks.map(chunk => ({ title: chunk.title, position: chunk.position, preview: chunk.content.slice(0, 160), similarity: chunk.similarity })),
      usage: { embeddingTokens: query.usage?.totalTokens ?? null },
    }, { headers: aiHeaders });
  } catch (error) { return aiErrorResponse(error); }
}
