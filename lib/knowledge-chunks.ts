/** Small, deterministic paragraph-first splitter for the 3.4 indexing lesson. */
export class KnowledgeLimitError extends Error {
  constructor(readonly code: "CONTENT" | "CHUNKS") { super(code); }
}

export const maxKnowledgeContent = 6000;
export const maxKnowledgeChunks = 8;
export const targetChunkLength = 800;

export function chunkKnowledgeText(input: string): string[] {
  if (typeof input !== "string") throw new KnowledgeLimitError("CONTENT");
  const source = input.replace(/\r\n?/g, "\n").trim();
  if (!source || source.length > maxKnowledgeContent) throw new KnowledgeLimitError("CONTENT");
  const paragraphs = source.split(/\n\s*\n+/).map(part => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const flush = () => { if (current) { chunks.push(current); current = ""; } };
  for (const paragraph of paragraphs) {
    if (paragraph.length > targetChunkLength) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += targetChunkLength) {
        chunks.push(paragraph.slice(offset, offset + targetChunkLength));
      }
      continue;
    }
    const combined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (combined.length > targetChunkLength) { flush(); current = paragraph; }
    else current = combined;
  }
  flush();
  if (chunks.length > maxKnowledgeChunks) throw new KnowledgeLimitError("CHUNKS");
  return chunks;
}
