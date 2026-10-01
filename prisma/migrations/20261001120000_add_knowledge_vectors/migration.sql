CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "KnowledgeDocument" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'indexing',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeDocument_status_check" CHECK ("status" IN ('indexing', 'ready', 'failed'))
);

CREATE TABLE "KnowledgeChunk" (
  "id" SERIAL NOT NULL,
  "documentId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1024),
  "embeddingModel" TEXT NOT NULL,
  "embeddingDimension" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeChunk_position_check" CHECK ("position" >= 0),
  CONSTRAINT "KnowledgeChunk_dimension_check" CHECK ("embeddingDimension" = 1024)
);

CREATE INDEX "KnowledgeDocument_ownerId_idx" ON "KnowledgeDocument"("ownerId");
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_position_key" ON "KnowledgeChunk"("documentId", "position");
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
