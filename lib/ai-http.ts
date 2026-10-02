import "server-only";
import { NextResponse } from "next/server";
import { AiProviderError } from "@/lib/ai-provider";
import { InvalidSuggestionError } from "@/lib/ai-suggestion";
import { InvalidKnowledgeAnswerError } from "@/lib/knowledge-answer";

export const aiHeaders = { "Cache-Control": "no-store" };

export function aiFailure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: aiHeaders });
}

export function aiErrorResponse(error: unknown) {
  if (error instanceof InvalidSuggestionError) return aiFailure(502, "模型返回的结构不符合要求，请重新生成。");
  if (error instanceof InvalidKnowledgeAnswerError) return aiFailure(502, "模型引用不符合要求，请重新生成。");
  if (error instanceof AiProviderError) {
    if (error.code === "OUTPUT_TRUNCATED") return aiFailure(502, "模型输出达到长度上限，没有得到完整结构。请缩短输入或重新生成。");
    if (error.code === "CONFIG") return aiFailure(503, "模型服务尚未配置好，请联系项目维护者。");
    if (error.code === "TIMEOUT") return aiFailure(504, "模型等待超时，请稍后重试。");
    if (error.code === "UNAUTHORIZED") return aiFailure(502, "模型服务鉴权失败，请联系项目维护者。");
  }
  return aiFailure(502, "模型服务暂时不可用，请稍后重试。");
}

export function aiStreamErrorMessage(error: unknown) {
  if (error instanceof AiProviderError && error.code === "OUTPUT_TRUNCATED") return "回答达到长度上限，生成已中断。";
  if (error instanceof AiProviderError && error.code === "TIMEOUT") return "模型等待超时，请稍后重试。";
  if (error instanceof AiProviderError && error.code === "UNAUTHORIZED") return "模型服务鉴权失败，请联系项目维护者。";
  return "模型服务暂时不可用，请稍后重试。";
}
