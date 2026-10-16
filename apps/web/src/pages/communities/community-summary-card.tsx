import { Loader2, Sparkles } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCommunitySummary, useRequestCommunitySummary } from "@/features/forum";
import { forumPostHref } from "@/features/forum/utils/forum-helpers";
import { useI18n } from "@/i18n";

function requestError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

type SummarySource = { n: number; id: string; title: string; publicSlug?: string };

/** Turns [n] / [n, m] markers into links to the posts they cite; unknown numbers stay plain text. */
function SummaryText({ text, sources }: { text: string; sources: SummarySource[] }) {
  const byNumber = new Map(sources.map((source) => [source.n, source]));
  const parts = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return <>{parts.map((part, index) => {
    const match = /^\[(\d+(?:\s*,\s*\d+)*)\]$/.exec(part);
    if (!match) return <Fragment key={index}>{part}</Fragment>;
    const numbers = match[1]!.split(",").map((value) => Number(value.trim()));
    return <Fragment key={index}>[{numbers.map((n, i) => {
      const source = byNumber.get(n);
      return <Fragment key={i}>{i > 0 ? ", " : null}{source ? <Link to={forumPostHref(source)} title={source.title} className="font-medium text-blue-700 hover:underline">{n}</Link> : n}</Fragment>;
    })}]</Fragment>;
  })}</>;
}

/** On-demand AI summary of the last 7 days. Reading state never triggers the LLM; only the button does. */
export function CommunitySummaryCard({ communityId }: { communityId: string }) {
  const { t } = useI18n();
  const summary = useCommunitySummary(communityId);
  const request = useRequestCommunitySummary();
  const data = summary.data;
  const pending = data?.status === "pending" || request.isPending;
  const noPosts = data?.postCount === 0;

  return <section className="rounded-xl border bg-card p-5">
    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">{t("AI weekly summary")}</h2></div>
    {data?.status === "completed" ? <>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"><SummaryText text={data.summary} sources={data.sources ?? []} /></p>
      <p className="mt-2 text-xs text-muted-foreground">{t("AI summary — check the linked posts")}</p>
    </> : null}
    {data?.status === "failed" ? <p role="alert" className="mt-3 text-sm text-red-600">{t(data.message)}</p> : null}
    {request.error ? <p role="alert" className="mt-3 text-sm text-red-600">{requestError(request.error, t("Could not request a summary."))}</p> : null}
    {noPosts ? <p className="mt-3 text-sm text-muted-foreground">{t("No discussions in the last 7 days to summarize.")}</p> : null}
    <Button size="sm" variant="outline" className="mt-4 w-full gap-2" disabled={pending || noPosts || data?.status === "completed"} onClick={() => request.mutate(communityId)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {t(pending ? "Summarizing…" : "Summarize this week")}
    </Button>
  </section>;
}
