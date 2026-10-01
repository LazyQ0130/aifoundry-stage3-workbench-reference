/** Keeps late chunks from a cancelled or replaced request out of the current view. */
export function createGenerationGate() {
  let current = 0;
  return {
    begin() { current += 1; return current; },
    invalidate() { current += 1; },
    isCurrent(id: number) { return id === current; },
  };
}
