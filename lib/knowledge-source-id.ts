/** Pure identifier rule; called only by the server-side citation adapter. */
export function sourceIdForChunk(chunkId: number): string {
  if (!Number.isSafeInteger(chunkId) || chunkId <= 0) throw new Error("INVALID_CHUNK_ID");
  return `SRC-CHUNK-${chunkId}`;
}
