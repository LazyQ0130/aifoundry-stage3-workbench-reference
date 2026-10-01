import { createHash } from "node:crypto";
import { embeddingDimension } from "./knowledge-vector";

export function mockEmbedding(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  let state = digest.readUInt32LE(0) || 1;
  return Array.from({ length: embeddingDimension }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  });
}
