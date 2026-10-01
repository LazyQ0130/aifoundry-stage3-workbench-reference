export const embeddingDimension = 1024;

export class InvalidKnowledgeVectorError extends Error {
  constructor() { super("INVALID_KNOWLEDGE_VECTOR"); }
}

/** Validate again at the database boundary, then use as a bound SQL parameter. */
export function vectorLiteral(vector: unknown): string {
  if (!Array.isArray(vector) || vector.length !== embeddingDimension ||
    !vector.every(value => typeof value === "number" && Number.isFinite(value))) {
    throw new InvalidKnowledgeVectorError();
  }
  return `[${vector.join(",")}]`;
}
