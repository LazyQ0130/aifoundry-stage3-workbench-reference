/** Parses Provider SSE framing. This module contains no credentials or network code. */
export type ProviderFrame = { type: "delta"; text: string } | { type: "usage"; value: unknown };

export class ProviderSseParser {
  private decoder = new TextDecoder();
  private buffer = "";
  private dataLines: string[] = [];
  private completed = false;
  private textLength = 0;

  get done() { return this.completed; }

  push(bytes: Uint8Array): ProviderFrame[] {
    if (this.completed) return [];
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length > 1_000_000) throw new Error("INVALID_STREAM");
    const frames: ProviderFrame[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      frames.push(...this.line(line));
      if (this.completed) break;
    }
    return frames;
  }

  finish(): void {
    this.buffer += this.decoder.decode();
    if (!this.completed && this.buffer) this.line(this.buffer.replace(/\r$/, ""));
    if (!this.completed && this.dataLines.length) this.line("");
    if (!this.completed) throw new Error("STREAM_CLOSED_WITHOUT_DONE");
  }

  private line(line: string): ProviderFrame[] {
    if (line.startsWith("data:")) {
      this.dataLines.push(line.slice(5).trimStart());
      return [];
    }
    if (line !== "") return [];
    if (!this.dataLines.length) return [];
    const payload = this.dataLines.join("\n");
    this.dataLines = [];
    if (payload.trim() === "[DONE]") { this.completed = true; return []; }
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { throw new Error("INVALID_STREAM"); }
    if (!parsed || typeof parsed !== "object") throw new Error("INVALID_STREAM");
    const value = parsed as Record<string, unknown>;
    const frames: ProviderFrame[] = [];
    const first = Array.isArray(value.choices) ? value.choices[0] : null;
    const delta = first && typeof first === "object" ? (first as Record<string, unknown>).delta : null;
    const text = delta && typeof delta === "object" ? (delta as Record<string, unknown>).content : null;
    if (typeof text === "string" && text) {
      this.textLength += text.length;
      if (this.textLength > 4000) throw new Error("STREAM_TEXT_LIMIT");
      frames.push({ type: "delta", text });
    }
    if (value.usage) frames.push({ type: "usage", value: value.usage });
    return frames;
  }
}
