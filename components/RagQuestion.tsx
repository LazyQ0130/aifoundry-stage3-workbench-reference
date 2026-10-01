"use client";

import { useState, type FormEvent } from "react";

type Match = { title: string; position: number; preview: string; similarity: number };
type Source = { sourceId: string; title: string; position: number; preview: string };
type Result = { kind: "mock" | "real"; previewOnly: boolean; status: "answered" | "insufficient" | null; answer: string; sources: Source[]; matches: Match[]; usage: { embeddingTokens: number | null; chatTokens: number | null } };

export default function RagQuestion() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function requestKnowledge(previewOnly: boolean) {
    if (busy) return;
    const trimmed = question.trim();
    if (!trimmed || trimmed.length > 1000) { setError("请输入 1～1000 个字符的问题。"); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(previewOnly ? "/api/knowledge/retrieve" : "/api/knowledge/ask", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw new Error("BAD_RESPONSE");
      const body = data as Record<string, unknown>;
      if (!response.ok) { setError(typeof body.error === "string" ? body.error : "知识库问答暂时不可用。"); return; }
      if ((body.kind !== "mock" && body.kind !== "real") || (!previewOnly && typeof body.answer !== "string") || !Array.isArray(body.matches)) throw new Error("BAD_RESPONSE");
      const matches = body.matches.map(item => item as Record<string, unknown>);
      if (!matches.every(item => typeof item.title === "string" && Number.isInteger(item.position) && typeof item.preview === "string" && typeof item.similarity === "number" && Number.isFinite(item.similarity))) throw new Error("BAD_RESPONSE");
      if (!previewOnly && ((body.status !== "answered" && body.status !== "insufficient") || !Array.isArray(body.sources))) throw new Error("BAD_RESPONSE");
      const sources = previewOnly ? [] : (body.sources as unknown[]).map(item => item as Record<string, unknown>);
      if (!sources.every(item => typeof item.sourceId === "string" && typeof item.title === "string" && Number.isInteger(item.position) && typeof item.preview === "string")) throw new Error("BAD_RESPONSE");
      const usage = body.usage && typeof body.usage === "object" ? body.usage as Record<string, unknown> : {};
      setResult({ kind: body.kind, previewOnly, status: previewOnly ? null : body.status as "answered" | "insufficient", answer: previewOnly ? "" : body.answer as string, sources: sources as Source[], matches: matches as Match[],
        usage: { embeddingTokens: typeof usage.embeddingTokens === "number" ? usage.embeddingTokens : null,
          chatTokens: typeof usage.chatTokens === "number" ? usage.chatTokens : null } });
    } catch { setError("无法读取知识库回答，请稍后重试。"); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void requestKnowledge(false); }

  return <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-6" aria-labelledby="rag-title">
    <h2 id="rag-title" className="text-lg font-semibold text-stone-900">问我的知识库</h2>
    <p className="mt-1 text-sm text-stone-600">每次提问先检索你的资料，再校验模型引用的来源是否属于本次命中。这里只做单轮问答。</p>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label htmlFor="rag-question" className="block text-sm font-medium text-stone-700">你的问题</label>
      <textarea id="rag-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} required
        placeholder="什么工具可以帮助我保存代码版本？" className="min-h-24 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm" />
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-stone-500">{question.length}/1000 字符</span>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void requestKnowledge(true)} disabled={busy} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-60">先看检索命中</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? "正在处理…" : "从我的资料回答"}</button></div></div>
    </form>
    <div aria-live="polite" className="mt-4">
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {result && <div className="space-y-4">
        <p className="text-xs font-medium text-emerald-900">{result.kind === "mock" ? "Mock 模式 · 流程示例" : "真实模型 · 知识库问答"}</p>
        {!result.previewOnly && <div className="rounded-lg border border-stone-200 bg-white p-4"><h3 className="font-semibold text-stone-900">{result.status === "insufficient" ? "当前资料中没有足够依据" : "回答"}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{result.answer}</p></div>}
        {!result.previewOnly && <div className="rounded-lg border border-emerald-200 bg-white p-4"><h3 className="font-semibold text-stone-900">回答实际引用</h3>
          {result.sources.length === 0 ? <p className="mt-2 text-sm text-stone-600">本次没有经过验证的引用来源。</p> : <ol className="mt-2 space-y-3">{result.sources.map((source, index) => <li key={source.sourceId} className="break-words border-t border-stone-100 pt-2 text-sm text-stone-700">
            <p className="font-medium text-stone-900">来源 {index + 1} · {source.title} · Chunk {source.position}</p>
            <p className="mt-1 text-xs text-stone-600">{source.preview}{source.preview.length === 160 ? "…" : ""}</p>
            <p className="mt-1 text-xs text-stone-400">{source.sourceId}</p>
          </li>)}</ol>}
        </div>}
        <div className="rounded-lg border border-stone-200 bg-white p-4"><h3 className="font-semibold text-stone-900">本次检索命中</h3>
          {result.matches.length === 0 ? <p className="mt-2 text-sm text-stone-600">没有与当前 Embedding 模型兼容的已入库资料。</p> : <ol className="mt-2 space-y-3">
            {result.matches.map((match, index) => <li key={`${match.title}-${match.position}-${index}`} className="break-words border-t border-stone-100 pt-2 text-sm text-stone-700">
              <p className="font-medium text-stone-900">{index + 1}. {match.title} · Chunk {match.position} · similarity {match.similarity.toFixed(3)}</p>
              <p className="mt-1 text-xs text-stone-600">{match.preview}{match.preview.length === 160 ? "…" : ""}</p>
            </li>)}
          </ol>}
          <p className="mt-3 text-xs text-stone-500">这些只是 Retriever 候选；上方「回答实际引用」才是模型选择且服务端验证过的来源。来源存在不代表每句话都获得充分支持。</p>
        </div>
        {(result.usage.embeddingTokens !== null || result.usage.chatTokens !== null) && <p className="text-xs text-stone-500">Embedding tokens：{result.usage.embeddingTokens ?? "未提供"} · Chat tokens：{result.usage.chatTokens ?? "未提供"}</p>}
      </div>}
    </div>
  </section>;
}
