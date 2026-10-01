"use client";

import { useEffect, useState, type FormEvent } from "react";

type Document = { id: number; title: string; status: "indexing" | "ready" | "failed"; chunkCount: number; model: string | null; dimension: number | null; chunks: { position: number; preview: string }[] };

export default function KnowledgeIndexer() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/knowledge/documents", { cache: "no-store" });
      if (response.status === 401) { setDocuments([]); return; }
      const data = await response.json();
      if (response.ok && Array.isArray(data.documents)) setDocuments(data.documents);
    } catch { setMessage("资料列表暂时无法读取。"); }
  }
  useEffect(() => { void refresh(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!title.trim() || title.trim().length > 100 || !content.trim() || content.trim().length > 6000) {
      setMessage("标题需为 1～100 字符，内容需为 1～6000 字符。"); return;
    }
    setLoading(true); setMessage("正在切分资料并生成向量…");
    try {
      const response = await fetch("/api/knowledge/documents", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await response.json();
      if (!response.ok) { setMessage(typeof data.error === "string" ? data.error : "保存失败，请重试。"); await refresh(); return; }
      setMessage(`${data.kind === "mock" ? "Mock 向量" : "真实 Embedding"}已保存：${data.chunkCount} 个分块，${data.dimension} 维。`);
      setTitle(""); setContent("");
      await refresh();
    } catch { setMessage("连接失败，请重试。"); }
    finally { setLoading(false); }
  }

  return <section className="mt-10 rounded-2xl border border-emerald-200 bg-white p-5 sm:p-6" aria-labelledby="knowledge-title">
    <h2 id="knowledge-title" className="text-lg font-semibold text-stone-900">我的向量资料</h2>
    <p className="mt-1 text-sm text-stone-600">粘贴非敏感纯文本或 Markdown，保存为带 Embedding 的分块。此处只展示入库结果。</p>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-stone-700" htmlFor="knowledge-name">资料标题</label>
      <input id="knowledge-name" value={title} onChange={event => setTitle(event.target.value)} maxLength={100} required className="w-full rounded-lg border border-stone-300 p-2.5 text-sm" placeholder="例如：Git 学习笔记" />
      <label className="block text-sm font-medium text-stone-700" htmlFor="knowledge-content">资料内容</label>
      <textarea id="knowledge-content" value={content} onChange={event => setContent(event.target.value)} maxLength={6000} required className="min-h-36 w-full rounded-lg border border-stone-300 p-3 text-sm" placeholder="在这里粘贴资料…" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500"><span>{content.length}/6000 字符 · 最多 8 个分块</span><button disabled={loading} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{loading ? "正在入库…" : "生成向量并保存"}</button></div>
    </form>
    <p role="status" aria-live="polite" className="mt-3 text-sm text-emerald-800">{message}</p>
    <div className="mt-5 space-y-3">
      {documents.length === 0 && <p className="text-sm text-stone-500">登录后可保存第一份资料；当前列表为空。</p>}
      {documents.map(document => <article key={document.id} className="rounded-lg border border-stone-200 p-4">
        <h3 className="font-medium text-stone-900">{document.title}</h3>
        <p className="mt-1 text-xs text-stone-600">{document.status === "ready" ? "已入库" : document.status === "failed" ? "入库失败" : "入库中"} · {document.chunkCount} 个分块{document.model ? ` · ${document.model.startsWith("mock-") ? "Mock 模式 · " : ""}${document.model}` : ""}{document.dimension ? ` · ${document.dimension} 维` : ""}</p>
        {document.chunks.map(chunk => <p key={chunk.position} className="mt-2 break-words text-xs text-stone-500">分块 {chunk.position + 1}：{chunk.preview}{chunk.preview.length === 100 ? "…" : ""}</p>)}
      </article>)}
    </div>
  </section>;
}
