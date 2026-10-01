import { NextRequest, NextResponse } from "next/server";
import { currentSession, rejectCrossOriginWrite, unauthorized } from "@/lib/auth";
import { allowAiRequest } from "@/lib/ai-rate-limit";
import { generate } from "@/lib/ai-provider";
import { aiErrorResponse, aiFailure, aiHeaders } from "@/lib/ai-http";

export const dynamic = "force-dynamic";
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

  try {
    const answer = await generate(prompt);
    return NextResponse.json({ ok: true, kind: answer.kind, text: answer.text, usage: answer.usage }, { headers: aiHeaders });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
