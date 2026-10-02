import { NextRequest, NextResponse } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest, allowProviderWork } from "@/lib/ai-rate-limit";
import { generate } from "@/lib/ai-provider";
import { aiErrorResponse, aiFailure, aiHeaders } from "@/lib/ai-http";
import { parseSuggestion, suggestionPrompt } from "@/lib/ai-suggestion";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOriginWrite(request);
  if (rejected) return rejected;
  let session;
  try { session = await currentSession(request); } catch { return aiFailure(503, "认证服务暂时不可用，请稍后重试。"); }
  if (!session) return unauthorized();
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return aiFailure(400, "请发送 JSON 格式的资料内容。");

  let body: unknown;
  try { body = await request.json(); } catch { return aiFailure(400, "请求中的 JSON 格式不正确。"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return aiFailure(400, "请填写资料内容。");
  const content = (body as Record<string, unknown>).content;
  if (typeof content !== "string" || !content.trim()) return aiFailure(400, "请填写资料内容。");
  const trimmed = content.trim();
  if (trimmed.length > 3000) return aiFailure(400, "资料内容不能超过 3000 个字符。");
  if (!allowAiRequest(session.user.id)) return aiFailure(429, "请求太频繁，请一分钟后再试。");

  try {
    if (!allowProviderWork(session.user.id, 1)) return aiFailure(429, "本分钟模型调用预算已用完，请稍后再试。");
    const answer = await generate(suggestionPrompt(trimmed), { structured: true });
    const suggestion = parseSuggestion(answer.text);
    return NextResponse.json({ ok: true, kind: answer.kind, suggestion, usage: answer.usage }, { headers: aiHeaders });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
