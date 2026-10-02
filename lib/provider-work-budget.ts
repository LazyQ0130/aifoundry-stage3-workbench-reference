/** Single-instance, per-user guard for real Provider calls. This is not a billing ledger. */
export const providerUnitLimit = 10;
const windowMs = 60_000;
const reservations = new Map<number, { at: number; units: number }[]>();

export function reserveProviderUnits(userId: number, units: number, now = Date.now()): boolean {
  if (!Number.isInteger(units) || units < 1 || units > 8) throw new RangeError("INVALID_PROVIDER_UNITS");
  const recent = (reservations.get(userId) ?? []).filter(item => now - item.at < windowMs);
  const used = recent.reduce((total, item) => total + item.units, 0);
  if (used + units > providerUnitLimit) {
    reservations.set(userId, recent);
    return false;
  }
  recent.push({ at: now, units });
  reservations.set(userId, recent);
  return true;
}

export function reserveForProviderMode(mode: "mock" | "real", userId: number, units: number, now = Date.now()): boolean {
  return mode === "mock" || reserveProviderUnits(userId, units, now);
}
