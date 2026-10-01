import { Star } from "./icons";

type Resource = {
  id: number;
  title: string;
  desc: string;
  tag: string;
  date: string;
  important: boolean;
};

export default function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <article className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-stone-900">{resource.title}</h3>
        {resource.important ? (
          <span title="重要" className="mt-0.5 shrink-0 text-amber-500">
            <Star className="h-4 w-4 fill-current" />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 flex-1 text-[13px] leading-5 text-stone-500">{resource.desc}</p>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-stone-400">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{resource.tag}</span>
        <time>{resource.date}</time>
      </div>
    </article>
  );
}
