"use client";

import { useState } from "react";
import ResourceCard from "@/components/ResourceCard";
import ResourcePreview from "@/components/ResourcePreview";
import AiExperiment from "@/components/AiExperiment";
import AiSuggestion from "@/components/AiSuggestion";
import KnowledgeIndexer from "@/components/KnowledgeIndexer";
import RagQuestion from "@/components/RagQuestion";
import { Search } from "@/components/icons";
import { resources, tags } from "@/lib/resources";

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("全部");
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [dateOrder, setDateOrder] = useState("default");

  const filtered = resources.filter((r) => {
    const matchTag = activeTag === "全部" || r.tag === activeTag;
    const matchQuery =
      query.trim() === "" ||
      r.title.includes(query.trim()) ||
      r.desc.includes(query.trim());
    const matchImportant = !onlyImportant || r.important;
    return matchTag && matchQuery && matchImportant;
  });

  const displayed = dateOrder === "default"
    ? filtered
    : [...filtered].sort((a, b) => dateOrder === "newest"
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen">
      {/* 顶部 */}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">知</span>
            <span className="text-[15px] font-bold text-stone-900">个人知识工作台</span>
          </div>
          <span className="text-[12px] text-stone-400">我的资料库</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        {/* 介绍 */}
        <section className="pt-10">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            个人知识工作台
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-6 text-stone-500">
            把我平时收集的资料整理在这里，需要的时候一键找到。
          </p>
        </section>

        <ResourcePreview tags={tags} />
        <AiExperiment />
        <AiSuggestion />
        <KnowledgeIndexer />
        <RagQuestion />
        <h2 className="mt-10 text-lg font-semibold text-stone-900">本地示例资料（只读）</h2>
        <p className="text-sm text-stone-600">以下资料仍来自原始文件，筛选与数量只计算这个区域。</p>
        {/* 搜索与筛选 */}
        <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题或简介…"
              className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-[13.5px] outline-none transition placeholder:text-stone-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                  activeTag === tag
                    ? "bg-emerald-600 text-white"
                    : "border border-stone-200 bg-white text-stone-500 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[13px] text-stone-600">
          <input
            type="checkbox"
            checked={onlyImportant}
            onChange={(e) => setOnlyImportant(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          只看重要资料
        </label>

        <label className="mt-3 flex items-center gap-2 text-[13px] text-stone-600">
          排序资料
          <select
            value={dateOrder}
            onChange={(e) => setDateOrder(e.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2"
          >
            <option value="default">默认顺序</option>
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
          </select>
        </label>

        {/* 统计 */}
        <p className="mt-5 text-[12.5px] text-stone-400">
          当前显示 {filtered.length} 条 · 共 {resources.length} 条资料
        </p>

        {/* 资料卡片 */}
        <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </section>

        {filtered.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-stone-300 py-12 text-center text-[13px] text-stone-400">
            没有找到匹配的资料，换个关键词试试。
          </p>
        ) : null}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6 text-center text-[12px] text-stone-400">
        个人知识工作台 · AIFoundry Stage 1
      </footer>
    </div>
  );
}
