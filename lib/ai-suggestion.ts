import "server-only";
import { z } from "zod";

export const suggestionSchema = z.strictObject({
  summary: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(5),
  confidence: z.number().min(0).max(1),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export class InvalidSuggestionError extends Error {
  constructor() { super("INVALID_SUGGESTION"); }
}

export function parseSuggestion(text: string): Suggestion {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new InvalidSuggestionError(); }
  const result = suggestionSchema.safeParse(value);
  if (!result.success) throw new InvalidSuggestionError();
  return result.data;
}

export function suggestionPrompt(content: string): string {
  return `分析下面这段资料。只返回一个 JSON object，不要 Markdown、代码围栏或额外说明。
字段必须且只能为：summary（不超过 200 字符的简短摘要）、tags（1～5 个简短标签，每个不超过 32 字符）、confidence（0～1 的数字）。
待分析内容：
${content}`;
}
