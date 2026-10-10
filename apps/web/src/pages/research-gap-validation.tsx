import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import type { GapValidationQueueItem } from "@trend/shared-types";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGapEvidenceRecords, useGapValidationQueue } from "@/features/gaps";
import { GapValidationDecisionForm } from "@/features/gaps/components/gap-expert-validation";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

/** Queue of research gaps whose owners asked verified experts for a validation decision. */
export function ResearchGapValidationPage() {
  const { t } = useI18n();
  const isExpert = useAuthStore((state) => Boolean(state.user?.capabilities?.includes("GAP_VALIDATION")));
  const [page, setPage] = useState(1);
  const queue = useGapValidationQueue(page, isExpert);
  const totalPages = queue.data?.meta.totalPages ?? 1;

  return (
    <main className="container min-w-0 space-y-6 py-8">
      <PageHeader
        title={t("Gap validation queue")}
        description={t("Research gaps whose owners asked verified experts for a decision. Gaps from your own projects are not shown.")}
        actions={<Button asChild variant="outline" size="sm"><Link to="/research-gaps"><ArrowLeft className="h-4 w-4" />{t("Research Gaps")}</Link></Button>}
      />
      {!isExpert ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("This page is for verified experts with research-gap validation rights.")}</p>
      ) : queue.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : queue.isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t("Could not load the validation queue.")}</p>
      ) : queue.data?.data.length ? (
        <div className="space-y-4">
          {queue.data.data.map((gap) => <QueueItem key={gap.id} gap={gap} />)}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("Previous")}</Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{t("Next")}</Button>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("No research gaps are waiting for validation.")}</p>
      )}
    </main>
  );
}

function QueueItem({ gap }: { gap: GapValidationQueueItem }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const evidence = useGapEvidenceRecords(gap.id, open);
  const fields: Array<[string, string | undefined]> = [
    [t("Established knowledge"), gap.establishedKnowledge],
    [t("Observed limitation"), gap.observedLimitation ?? gap.description],
    [t("Missing evidence"), gap.missingEvidence],
    [t("Why it matters"), gap.significanceExplanation],
    [t("Suggested research question"), gap.suggestedResearchQuestion],
  ];

  return (
    <article className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">{gap.validationStatus.replaceAll("_", " ")}</Badge>
        {gap.gapType ? <Badge variant="secondary" className="text-[10px]">{gap.gapType.replaceAll("_", " ")}</Badge> : null}
        {gap.origin === "AI_ASSISTED" ? <Badge variant="secondary" className="text-[10px]">{t("AI-assisted")}</Badge> : null}
        {gap.reviewedByMe ? <Badge className="text-[10px]">{t("You already responded")}</Badge> : null}
      </div>
      <h2 className="mt-3 text-lg font-semibold">{gap.title}</h2>
      <p className="text-xs text-muted-foreground">{gap.topic} · {t("{{count}} evidence record(s)", { count: gap.evidenceCount })} · {t("{{count}} expert decision(s)", { count: gap.validationCount })}</p>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {fields.filter(([, value]) => Boolean(value)).map(([label, value]) => (
          <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 leading-relaxed">{value}</dd></div>
        ))}
      </dl>
      <Button variant="ghost" size="sm" className="mt-3" onClick={() => setOpen((current) => !current)}>
        <ChevronDown className={open ? "h-4 w-4 rotate-180" : "h-4 w-4"} />{open ? t("Hide evidence and decision") : t("Review evidence and decide")}
      </Button>
      {open && (
        <div className="mt-3 grid gap-5 border-t pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Linked evidence")}</h3>
            {evidence.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : evidence.data?.length ? evidence.data.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-xs">
                <div className="flex flex-wrap gap-2"><Badge variant="outline" className="text-[10px]">{item.evidenceKind}</Badge><span className="font-semibold">{item.evidenceType.replaceAll("_", " ")}</span></div>
                <p className="mt-2 leading-relaxed">{item.excerpt}</p>
                <p className="mt-1 text-muted-foreground">{item.explanation}</p>
                {item.paperId ? <Link to={`/papers/${item.paperId.id}`} className="mt-1 block text-cyan-700 hover:underline">{item.paperId.title}</Link> : null}
              </div>
            )) : <p className="text-xs text-muted-foreground">{t("No structured evidence is linked yet.")}</p>}
          </div>
          <GapValidationDecisionForm gap={gap} />
        </div>
      )}
    </article>
  );
}
