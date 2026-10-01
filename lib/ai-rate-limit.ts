import "server-only";

// Stage 3 V1 single-instance guard. Serverless instances do not share this Map.
const attempts = new Map<number, number[]>();
const windowMs = 60_000;
const maxAttempts = 5;

export function allowAiRequest(userId: number, now = Date.now()): boolean {
  const recent = (attempts.get(userId) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= maxAttempts) {
    attempts.set(userId, recent);
    return false;
  }
  recent.push(now);
  attempts.set(userId, recent);
  return true;
}
