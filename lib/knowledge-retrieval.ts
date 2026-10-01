import "server-only";
import { prisma } from "@/lib/prisma";
import { type AiEmbedding } from "@/lib/ai-provider";
import { embeddingDimension, vectorLiteral } from "@/lib/knowledge-vector";

export type RetrievedChunk = {
  chunkId: number;
  documentId: number;
  title: string;
  position: number;
  content: string;
  similarity: number;
};

type RankedRow = Omit<RetrievedChunk, "similarity"> & { distance: number };
export const ragTopK = 3;

/** The owner, readiness, model and dimension filters all run before Top-K in SQL. */
export async function retrieveTopK(ownerId: number, query: AiEmbedding): Promise<RetrievedChunk[]> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !query.model || query.dimension !== embeddingDimension) throw new Error("INVALID_RETRIEVAL_INPUT");
  const literal = vectorLiteral(query.vector);
  const rows = await prisma.$queryRaw<RankedRow[]>`
    SELECT c."id" AS "chunkId", c."documentId", d."title", c."position", c."content",
           (c."embedding" <=> ${literal}::vector) AS "distance"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
    WHERE d."ownerId" = ${ownerId}
      AND d."status" = 'ready'
      AND c."embedding" IS NOT NULL
      AND c."embeddingModel" = ${query.model}
      AND c."embeddingDimension" = ${query.dimension}
    ORDER BY c."embedding" <=> ${literal}::vector, c."id" ASC
    LIMIT ${ragTopK}
  `;
  return rows.map(row => {
    if (typeof row.distance !== "number" || !Number.isFinite(row.distance)) throw new Error("INVALID_RETRIEVAL_RESULT");
    return { chunkId: row.chunkId, documentId: row.documentId, title: row.title,
      position: row.position, content: row.content, similarity: 1 - row.distance };
  });
}
