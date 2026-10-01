"use client";

import { useRef, useState, type FormEvent } from "react";

type Suggestion = { summary: string; tags: string[]; confidence: number };
type Result = { kind: "mock" | "real"; suggestion: Suggestion; usage: { totalTokens: number } | null };
type View = { kind: "idle" | "loading" } | { kind: "success"; result: Result } | { kind: "error"; message: string };

export default function AiSuggestion() {
  const [content, setContent] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 3000) {
      setView({ kind: "error", message: "请输入 1～3000 个字符的资料内容。" });
      return;
    }
    busy.current = true;
    setView({ kind: "loading" });
    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw new Error();
      const body = data as Record<string, unknown>;
      if (!response.ok) {
        setView({ kind: "error", message: typeof body.error === "string" ? body.error : `请求失败（HTTP ${response.status}）。` });
        return;
      }
      const suggestion = body.suggestion;
      if ((body.kind !== "mock" && body.kind !== "real") || !suggestion || typeof suggestion !== "object") throw new Error();
      const item = suggestion as Record<string, unknown>;
      if (typeof item.summary !== "string" || !Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === "string") || typeof item.confidence !== "number") throw new Error();
      const usage = body.usage && typeof body.usage === "object" && typeof (body.usage as Record<string, unknown>).totalTokens === "number"
        ? { totalTokens: (body.usage as { totalTokens: number }).totalTokens } : null;
      setView({ kind: "success", result: { kind: body.kind, suggestion: { summary: item.summary, tags: item.tags as string[], confidence: item.confidence }, usage } });
    } catch {
      setView({ kind: "error", message: "无法读取建议，请检查连接后重试。" });
    } finally {
      busy.current = false;
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-6" aria-labelledby="ai-suggestion-title">
      <h2 id="ai-suggestion-title" className="text-lg font-semibold text-stone-900">AI 资料分析</h2>
      <p className="mt-1 text-sm text-stone-600">粘贴一段非敏感资料，预览摘要、标签和置信度。</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label htmlFor="ai-source" className="block text-sm font-medium text-stone-700">待分析内容</label>
        <textarea id="ai-source" value={content} onChange={(event) => setContent(event.target.value)} maxLength={3000}
          placeholder="Git 是一个分布式版本控制系统，可以记录代码历史，并帮助开发者恢复到之前的版本。"
          className="min-h-28 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">{content.length}/3000 字符</span>
          <button type="submit" disabled={view.kind === "loading"} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
            {view.kind === "loading" ? "正在分析…" : "生成结构化建议"}
          </button>
        </div>
      </form>
      <p className="mt-4 text-xs font-medium text-emerald-900">AI 建议仅供预览，不会自动修改你的资料。</p>
      <div aria-live="polite" className="mt-3 text-sm">
        {view.kind === "loading" && <p className="text-stone-600">正在等待建议…</p>}
        {view.kind === "error" && <p role="alert" className="text-rose-700">{view.message}</p>}
        {view.kind === "success" && <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="font-semibold text-emerald-800">{view.result.kind === "mock" ? "Mock 模式 · 未调用真实模型" : "真实模型"}</p>
          <h3 className="mt-3 font-medium text-stone-900">摘要</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-stone-700">{view.result.suggestion.summary}</p>
          <h3 className="mt-3 font-medium text-stone-900">标签</h3>
          <div className="mt-1 flex flex-wrap gap-2">{view.result.suggestion.tags.map((tag, index) => <span key={`${tag}-${index}`} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800">{tag}</span>)}</div>
          <h3 className="mt-3 font-medium text-stone-900">置信度</h3>
          <p className="mt-1 text-stone-700">{view.result.suggestion.confidence}</p>
          {view.result.usage && <p className="mt-3 text-xs text-stone-500">Total tokens：{view.result.usage.totalTokens}</p>}
        </div>}
      </div>
    </section>
  );
}
