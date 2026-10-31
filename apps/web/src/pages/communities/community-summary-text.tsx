import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";

type Source = { n: number; id: string; title: string; publicSlug?: string };

const href = (source: Source) => `/forum/${encodeURIComponent(source.publicSlug ?? source.id)}`;

/** The AI summary with `[n]` turned into a link to `sources[n-1]` and a Sources list underneath. An unknown `n` stays plain text. */
export function CommunitySummaryText({ summary, sources }: { summary: string; sources: Source[] }) {
  const { t } = useI18n();
  const byNumber = new Map(sources.map((source) => [source.n, source]));
  const parts = summary.split(/(\[\d+\])/g);
  return <>
    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{parts.map((part, index) => {
      const match = /^\[(\d+)\]$/.exec(part);
      const source = match ? byNumber.get(Number(match[1])) : undefined;
      return source
        ? <Link key={index} to={href(source)} className="font-medium text-blue-700 hover:underline" aria-label={source.title}>{part}</Link>
        : <Fragment key={index}>{part}</Fragment>;
    })}</p>
    {sources.length ? <div className="mt-4 border-t pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Sources")}</h4>
      <ol className="mt-2 space-y-1 text-sm">{sources.map((source) => <li key={source.n} className="flex gap-2"><span className="tabular-nums text-muted-foreground">[{source.n}]</span><Link to={href(source)} className="min-w-0 truncate hover:text-blue-700 hover:underline">{source.title}</Link></li>)}</ol>
    </div> : null}
  </>;
}
