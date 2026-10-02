import "server-only";
import { z } from "zod";
import { type CitableChunk } from "@/lib/knowledge-citations";

const sourceId = z.string().regex(/^SRC-CHUNK-[1-9]\d*$/);
const answerText = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0);
const answerSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("answered"), answer: answerText(300), sourceIds: z.array(sourceId).min(1).max(3) }),
  z.strictObject({ status: z.literal("insufficient"), answer: answerText(120), sourceIds: z.tuple([]) }),
]);

export class InvalidKnowledgeAnswerError extends Error {
  constructor() { super("INVALID_KNOWLEDGE_ANSWER"); }
}

export function verifiedKnowledgeAnswer(raw: string, chunks: readonly CitableChunk[]) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new InvalidKnowledgeAnswerError(); }
  const result = answerSchema.safeParse(parsed);
  if (!result.success) throw new InvalidKnowledgeAnswerError();
  const answer = result.data;
  const allowed = new Map(chunks.map(chunk => [chunk.sourceId, chunk]));
  if (new Set(answer.sourceIds).size !== answer.sourceIds.length) throw new InvalidKnowledgeAnswerError();
  const sources = answer.sourceIds.map(id => {
    const chunk = allowed.get(id);
    if (!chunk) throw new InvalidKnowledgeAnswerError();
    return { sourceId: id, title: chunk.title, position: chunk.position, preview: chunk.content.slice(0, 160) };
  });
  return { status: answer.status, answer: answer.answer.trim(), sources };
}
