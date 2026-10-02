/** The original HTTP request guard. It is intentionally separate from Provider units. */
const attempts = new Map<number, number[]>();
const windowMs = 60_000;
const maxAttempts = 5;

export function allowAiRequest(userId: number, now = Date.now()): boolean {
  const recent = (attempts.get(userId) ?? []).filter(time => now - time < windowMs);
  if (recent.length >= maxAttempts) {
    attempts.set(userId, recent);
    return false;
  }
  recent.push(now);
  attempts.set(userId, recent);
  return true;
}
