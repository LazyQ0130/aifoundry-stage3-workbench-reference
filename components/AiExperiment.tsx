"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createGenerationGate } from "@/lib/ai-stream-generation";

type Answer = { kind: "mock" | "real"; text: string; usage: { totalTokens: number } | null };
type AnswerView = { kind: "idle" | "loading" } | { kind: "success"; answer: Answer } | { kind: "error"; message: string };
type StreamView =
  | { kind: "idle" | "pending" }
  | { kind: "streaming" | "completed"; text: string; mode: "mock" | "real"; totalTokens: number | null }
  | { kind: "cancelled"; text: string }
  | { kind: "failed"; message: string; partialText: string };
type StreamEvent = { type: "meta"; kind: "mock" | "real" } | { type: "delta"; text: string } | { type: "usage"; totalTokens: number } | { type: "done" } | { type: "error"; message: string };

function safeEvent(value: unknown): StreamEvent {
  if (!value || typeof value !== "object") throw new Error("INVALID_EVENT");
  const event = value as Record<string, unknown>;
  if (event.type === "meta" && (event.kind === "mock" || event.kind === "real")) return { type: "meta", kind: event.kind };
  if (event.type === "delta" && typeof event.text === "string") return { type: "delta", text: event.text };
  if (event.type === "usage" && typeof event.totalTokens === "number") return { type: "usage", totalTokens: event.totalTokens };
  if (event.type === "done") return { type: "done" };
  if (event.type === "error" && typeof event.message === "string") return { type: "error", message: event.message };
  throw new Error("INVALID_EVENT");
}

export default function AiExperiment() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"ordinary" | "stream">("ordinary");
  const [answerView, setAnswerView] = useState<AnswerView>({ kind: "idle" });
  const [streamView, setStreamView] = useState<StreamView>({ kind: "idle" });
  const [streamMode, setStreamMode] = useState<"mock" | "real" | null>(null);
  const ordinaryBusy = useRef(false);
  const gate = useRef(createGenerationGate());
  const currentController = useRef<AbortController | null>(null);
  const partialText = useRef("");
  const totalTokens = useRef<number | null>(null);

  useEffect(() => () => { gate.current.invalidate(); currentController.current?.abort(); }, []);

  async function askOrdinary() {
    if (ordinaryBusy.current) return;
    ordinaryBusy.current = true;
    setAnswerView({ kind: "loading" });
    try {
      const response = await fetch("/api/ai/answer", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: input.trim() }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw new Error();
      const result = data as Record<string, unknown>;
      if (!response.ok) { setAnswerView({ kind: "error", message: typeof result.error === "string" ? result.error : `请求失败（HTTP ${response.status}）。` }); return; }
      if ((result.kind !== "mock" && result.kind !== "real") || typeof result.text !== "string" || !result.text.trim()) throw new Error();
      const usage = result.usage && typeof result.usage === "object" && typeof (result.usage as Record<string, unknown>).totalTokens === "number"
        ? { totalTokens: (result.usage as { totalTokens: number }).totalTokens } : null;
      setAnswerView({ kind: "success", answer: { kind: result.kind, text: result.text, usage } });
    } catch { setAnswerView({ kind: "error", message: "无法获得回答，请检查连接后重试。" }); }
    finally { ordinaryBusy.current = false; }
  }

  async function askStream() {
    currentController.current?.abort();
    const id = gate.current.begin();
    const controller = new AbortController();
    currentController.current = controller;
    partialText.current = "";
    totalTokens.current = null;
    setStreamMode(null);
    setStreamView({ kind: "pending" });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let modeFromServer: "mock" | "real" | null = null;
    let completed = false;
    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: input.trim() }), signal: controller.signal,
      });
      if (!gate.current.isCurrent(id)) return;
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const error = data && typeof data === "object" ? (data as Record<string, unknown>).error : null;
        setStreamView({ kind: "failed", message: typeof error === "string" ? error : `请求失败（HTTP ${response.status}）。`, partialText: "" });
        return;
      }
      if (!response.body) throw new Error("EMPTY_STREAM");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (!gate.current.isCurrent(id)) return;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 1_000_000) throw new Error("STREAM_LIMIT");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!gate.current.isCurrent(id)) return;
          if (!line.trim()) continue;
          const event = safeEvent(JSON.parse(line));
          if (event.type === "meta") { modeFromServer = event.kind; setStreamMode(event.kind); }
          if (event.type === "delta") {
            if (!modeFromServer) throw new Error("MISSING_META");
            partialText.current += event.text;
            setStreamView({ kind: "streaming", text: partialText.current, mode: modeFromServer, totalTokens: totalTokens.current });
          }
          if (event.type === "usage") {
            totalTokens.current = event.totalTokens;
            if (modeFromServer && partialText.current) setStreamView({ kind: "streaming", text: partialText.current, mode: modeFromServer, totalTokens: totalTokens.current });
          }
          if (event.type === "error") { setStreamView({ kind: "failed", message: event.message, partialText: partialText.current }); return; }
          if (event.type === "done") {
            if (!modeFromServer || !partialText.current) throw new Error("EMPTY_ANSWER");
            completed = true;
            setStreamView({ kind: "completed", text: partialText.current, mode: modeFromServer, totalTokens: totalTokens.current });
            return;
          }
        }
      }
      if (!completed && gate.current.isCurrent(id)) setStreamView({ kind: "failed", message: "生成中断，请稍后重试。", partialText: partialText.current });
    } catch {
      if (gate.current.isCurrent(id)) setStreamView({ kind: "failed", message: "模型服务暂时不可用，请稍后重试。", partialText: partialText.current });
    } finally {
      if (currentController.current === controller) currentController.current = null;
      await reader?.cancel().catch(() => {});
    }
  }

  function stopStream() {
    gate.current.invalidate();
    currentController.current?.abort();
    currentController.current = null;
    setStreamView({ kind: "cancelled", text: partialText.current });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "stream" && (streamView.kind === "pending" || streamView.kind === "streaming")) return;
    if (!input.trim() || input.trim().length > 2000) {
      const message = "请输入 1～2000 个字符的问题。";
      if (mode === "ordinary") setAnswerView({ kind: "error", message });
      else setStreamView({ kind: "failed", message, partialText: "" });
      return;
    }
    if (mode === "ordinary") void askOrdinary();
    else void askStream();
  }

  const active = streamView.kind === "pending" || streamView.kind === "streaming";
  return (
    <section className="mt-10 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 sm:p-6" aria-labelledby="ai-experiment-title">
      <h2 id="ai-experiment-title" className="text-lg font-semibold text-stone-900">AI 问答</h2>
      <p className="mt-1 text-sm text-stone-600">同一个入口可比较普通回答与逐段生成；先登录，再输入简短问题。</p>
      <div className="mt-4 flex gap-2" role="group" aria-label="问答模式">
        <button type="button" disabled={active || answerView.kind === "loading"} onClick={() => setMode("ordinary")} aria-pressed={mode === "ordinary"} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm disabled:opacity-60">普通模式</button>
        <button type="button" disabled={active || answerView.kind === "loading"} onClick={() => setMode("stream")} aria-pressed={mode === "stream"} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm disabled:opacity-60">流式模式</button>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label htmlFor="ai-question" className="block text-sm font-medium text-stone-700">你的问题</label>
        <textarea id="ai-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000}
          placeholder="用几句话解释 Git 为什么能帮助我安全试错。"
          className="min-h-24 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">{input.length}/2000 字符</span>
          {mode === "stream" && active ? <span className="text-sm text-stone-600">可随时停止</span> :
            <button type="submit" disabled={answerView.kind === "loading"} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {mode === "ordinary" ? answerView.kind === "loading" ? "正在询问…" : "询问 AI" : "开始生成"}
            </button>}
        </div>
      </form>
      {mode === "stream" && active && <button type="button" onClick={stopStream} className="mt-3 rounded-lg border border-violet-700 px-4 py-2 text-sm text-violet-800">停止生成</button>}
      {mode === "ordinary" ? <div aria-live="polite" className="mt-4 text-sm">
        {answerView.kind === "loading" && <p className="text-stone-600">正在等待回答…</p>}
        {answerView.kind === "error" && <p role="alert" className="text-rose-700">{answerView.message}</p>}
        {answerView.kind === "success" && <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="font-semibold text-violet-800">{answerView.answer.kind === "mock" ? "Mock 模式 · 未调用真实模型" : "真实模型"}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-stone-800">{answerView.answer.text}</p>
          {answerView.answer.usage && <p className="mt-3 text-xs text-stone-500">Total tokens：{answerView.answer.usage.totalTokens}</p>}
        </div>}
      </div> : <div aria-live="polite" className="mt-4 text-sm">
        {streamView.kind === "pending" && <p className="text-stone-600">正在连接模型…{streamMode === "mock" ? " Mock 模式 · 未调用真实模型" : streamMode === "real" ? " 真实模型" : ""}</p>}
        {(streamView.kind === "streaming" || streamView.kind === "completed") && <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="font-semibold text-violet-800">{streamView.mode === "mock" ? "Mock 模式 · 未调用真实模型" : "真实模型"}</p>
          <p className="mt-1 text-stone-600">{streamView.kind === "streaming" ? "正在生成…" : "生成完成"}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-stone-800">{streamView.text}</p>
          {streamView.kind === "completed" && streamView.totalTokens !== null && <p className="mt-3 text-xs text-stone-500">Total tokens：{streamView.totalTokens}</p>}
        </div>}
        {streamView.kind === "cancelled" && <div className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-stone-600">已停止生成</p><p className="mt-2 whitespace-pre-wrap break-words">{streamView.text}</p></div>}
        {streamView.kind === "failed" && <div role="alert" className="rounded-lg border border-rose-200 bg-white p-4"><p className="text-rose-700">{streamView.partialText ? `${streamView.message} 以下是已经收到的部分内容。` : streamView.message}</p>{streamView.partialText && <p className="mt-2 whitespace-pre-wrap break-words">{streamView.partialText}</p>}</div>}
      </div>}
    </section>
  );
}
