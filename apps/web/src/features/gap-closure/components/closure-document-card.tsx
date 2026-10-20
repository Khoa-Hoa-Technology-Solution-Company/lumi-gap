import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type {
  ClosureFacetMatch,
  ClosureLabel,
  ClosureQueryLog,
  GapClosureDocumentView,
  QuestionFacets,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import {
  activeFacetKeys,
  apiErrorMessage,
  compactFacetMatch,
  documentExternalUrl,
  documentText,
  isDecidingLabel,
  quoteAppearsInText,
  splitSentences,
} from "../closure-format";
import { useReviewClosureDocument } from "../hooks/use-gap-closure";

const LABELS: ClosureLabel[] = ["ANSWERS", "PARTIAL", "UNRELATED"];
const LABEL_CLASS: Record<ClosureLabel, string> = {
  ANSWERS: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  PARTIAL: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  UNRELATED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
};
const FIELD_CLASS = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function useClosureLabelNames(): Record<ClosureLabel, string> {
  const { t } = useI18n();
  return { ANSWERS: t("Answers the question"), PARTIAL: t("Partly answers"), UNRELATED: t("Unrelated") };
}

export function ClosureLabelBadge({ label }: { label: ClosureLabel }) {
  const names = useClosureLabelNames();
  return <Badge variant="outline" className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", LABEL_CLASS[label])}>{names[label]}</Badge>;
}

type FacetChoice = "match" | "differ" | "unknown";
const toChoice = (value: boolean | undefined): FacetChoice => (value === true ? "match" : value === false ? "differ" : "unknown");
const fromChoice = (choice: FacetChoice): boolean | undefined => (choice === "match" ? true : choice === "differ" ? false : undefined);

interface ClosureDocumentCardProps {
  checkId: string;
  doc: GapClosureDocumentView;
  facets: QuestionFacets;
  /** check.queries; doc.queryIndex points into it (one entry per query and source). */
  queries: ClosureQueryLog[];
  /** Screening is only editable when the check is SCREENING or DECIDED. */
  canReview: boolean;
}

/** One screened document: AI label with quote, the label that counts, and the form for a person to set or change it. */
export function ClosureDocumentCard({ checkId, doc, facets, queries, canReview }: ClosureDocumentCardProps) {
  const { t } = useI18n();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const labelNames = useClosureLabelNames();
  const review = useReviewClosureDocument(checkId);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState<ClosureLabel>(doc.humanLabel ?? doc.aiLabel ?? "UNRELATED");
  const [quote, setQuote] = useState(doc.humanQuote ?? doc.aiQuote ?? "");
  const [facetMatch, setFacetMatch] = useState<ClosureFacetMatch>(doc.humanFacets ?? doc.aiFacets ?? {});
  const [limitation, setLimitation] = useState(doc.limitationStatement);
  const [asSecond, setAsSecond] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = documentExternalUrl(doc);
  const foundBy = queries[doc.queryIndex];
  const needsPerson = doc.effectiveLabel === undefined || doc.effectiveLabel === null;
  const facetKeys = activeFacetKeys(facets);
  const facetNames: Record<(typeof facetKeys)[number], string> = {
    population: t("Population"),
    intervention: t("Intervention"),
    comparison: t("Comparison"),
    outcome: t("Outcome"),
    context: t("Context"),
  };
  const deciding = isDecidingLabel(label);
  const sameAsFirst = Boolean(currentUserId) && doc.reviewerId === currentUserId;
  const text = documentText(doc);
  const quoteLooksWrong = deciding && quote.trim().length > 0 && !quoteAppearsInText(quote, text);
  const sentences = [doc.title, ...splitSentences(doc.abstractText)];

  const save = async () => {
    setError(null);
    if (deciding && quote.trim().length === 0) {
      setError(t("Copy the sentence that supports this label from the title or abstract."));
      return;
    }
    try {
      await review.mutateAsync({
        documentId: doc.id,
        payload: {
          label,
          quote: deciding ? quote.trim() : undefined,
          facets: deciding ? compactFacetMatch(facetMatch) : undefined,
          limitationStatement: limitation,
          asSecondReviewer: asSecond || undefined,
        },
      });
      toast.success(asSecond ? t("Second review recorded.") : t("Label saved."));
      setEditing(false);
      setAsSecond(false);
    } catch (err) {
      const message = apiErrorMessage(err, t("Could not save the label."));
      setError(message);
      toast.error(message);
    }
  };

  const titleClass = "inline-flex items-start gap-1 break-words text-xs font-bold leading-snug text-slate-800 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400";

  return (
    <li className={cn("space-y-2.5 rounded-xl border bg-white p-3.5 text-xs dark:bg-slate-900/30", needsPerson ? "border-amber-300/70 dark:border-amber-500/30" : "border-slate-200/70 dark:border-slate-800")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {doc.paperId ? (
            <Link to={`/papers/${doc.paperId}`} target="_blank" rel="noopener noreferrer" className={titleClass}>
              <span>{doc.title}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            </Link>
          ) : url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={titleClass}>
              <span>{doc.title}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            </a>
          ) : (
            <span className="break-words text-xs font-bold leading-snug text-slate-800 dark:text-slate-100">{doc.title}</span>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {doc.publicationYear && <span>{doc.publicationYear}</span>}
            <span>{doc.retrievedFrom === "LOCAL" ? t("LumiGap corpus") : t("OpenAlex")}</span>
            {foundBy && <span className="normal-case" title={foundBy.query}>{t("Found by")}: {foundBy.query}</span>}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-blue-600">
                {doc.doi ? t("DOI") : t("OpenAlex")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {needsPerson ? (
            <Badge variant="outline" title={t("Until a person labels this document, the check cannot certify the gap as open.")} className="rounded border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">{t("Needs a person")}</Badge>
          ) : (
            <div className="space-y-1">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{t("Counts as")}</span>
              <ClosureLabelBadge label={doc.effectiveLabel!} />
            </div>
          )}
        </div>
      </div>

      {needsPerson && (
        <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-semibold leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {t("This document blocks an open decision until a person labels it.")}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/60">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{t("AI suggestion")}</span>
          {doc.aiLabel ? <ClosureLabelBadge label={doc.aiLabel} /> : <span className="text-slate-500">{t("The AI was not sure, so it left this document unlabelled.")}</span>}
          {doc.aiQuote && (
            <>
              <blockquote className="border-l-2 border-slate-300 pl-2 italic leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-300">{doc.aiQuote}</blockquote>
              {doc.aiQuoteVerified ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><BadgeCheck className="h-3.5 w-3.5" />{t("Quote verified in the text")}</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400"><ShieldAlert className="h-3.5 w-3.5" />{t("Quote not found in the text")}</span>
              )}
            </>
          )}
        </div>
        <div className="space-y-1 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/60">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{t("Label by a person")}</span>
          {doc.humanLabel ? <ClosureLabelBadge label={doc.humanLabel} /> : <span className="text-slate-500">{t("Not reviewed by a person yet")}</span>}
          {doc.humanQuote && <blockquote className="border-l-2 border-slate-300 pl-2 italic leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-300">{doc.humanQuote}</blockquote>}
          {doc.limitationStatement && <span className="block font-semibold text-slate-600 dark:text-slate-300">{t("Stated as a limitation or future work")}</span>}
          {doc.secondLabel && (
            <span className="flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-300">{t("Second reviewer")}: <ClosureLabelBadge label={doc.secondLabel} /></span>
          )}
        </div>
      </div>

      {canReview && !editing && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
          {doc.humanLabel ? t("Change label") : needsPerson ? t("Review this document") : t("Confirm or change the label")}
        </Button>
      )}

      {canReview && editing && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <fieldset className="space-y-1.5">
            <legend className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{t("Label")}</legend>
            <div className="flex flex-wrap gap-3">
              {LABELS.map((option) => (
                <label key={option} className="inline-flex items-center gap-1.5">
                  <input type="radio" name={`label-${doc.id}`} checked={label === option} onChange={() => setLabel(option)} />
                  <span>{labelNames[option]}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {t("Answers: a sentence reports a result on the question and every facet matches. Partly: a facet differs, or the paper only states the question as a limitation or future work.")}
            </p>
          </fieldset>

          {deciding && (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`quote-${doc.id}`} className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{t("Supporting quote")}</label>
                <textarea
                  id={`quote-${doc.id}`}
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                  className={cn(FIELD_CLASS, "min-h-16", quoteLooksWrong && "border-amber-400")}
                />
                {quoteLooksWrong && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("This does not look like a word-for-word copy of the title or abstract, so the server will probably reject it.")}</p>
                )}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">{t("Select sentence: click one to use it as the quote")}</span>
                  <div className="max-h-40 overflow-y-auto rounded-md bg-slate-50 p-2 leading-relaxed dark:bg-slate-900/60">
                    {sentences.map((sentence, index) => (
                      <button
                        key={`${index}-${sentence.slice(0, 16)}`}
                        type="button"
                        onClick={() => setQuote(sentence)}
                        className={cn("mr-1 inline rounded px-0.5 text-left hover:bg-cyan-100 dark:hover:bg-cyan-900/40", quote.trim() === sentence && "bg-cyan-100 dark:bg-cyan-900/40")}
                      >
                        {sentence}
                      </button>
                    ))}
                    {!doc.abstractText && <p className="mt-1 text-slate-500">{t("No abstract is stored for this paper, so only the title can be quoted.")}</p>}
                  </div>
                </div>
              </div>

              {facetKeys.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{t("Does the quoted sentence match each facet?")}</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {facetKeys.map((key) => (
                      <label key={key} className="space-y-1">
                        <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300" title={facets[key]}>{facetNames[key]}: {facets[key]}</span>
                        <select
                          value={toChoice(facetMatch[key])}
                          onChange={(event) => setFacetMatch((current) => ({ ...current, [key]: fromChoice(event.target.value as FacetChoice) }))}
                          className={cn(FIELD_CLASS, "h-8 py-0 text-xs")}
                        >
                          <option value="match">{t("Matches")}</option>
                          <option value="differ">{t("Differs")}</option>
                          <option value="unknown">{t("Not mentioned")}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={limitation} onChange={(event) => setLimitation(event.target.checked)} />
            <span>{t("The paper states this question as a limitation or future work")}</span>
          </label>

          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={asSecond} disabled={sameAsFirst} onChange={(event) => setAsSecond(event.target.checked)} />
            <span>
              {t("Record as second reviewer")}
              <span className="block text-[11px] text-slate-500">
                {sameAsFirst ? t("You gave the first label. A different person must record the second review.") : t("Use this when you label the document independently of the first reviewer. It is used for Cohen's kappa and does not change the decision.")}
              </span>
            </span>
          </label>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={review.isPending} onClick={() => void save()}>
              {review.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("Save label")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={review.isPending} onClick={() => { setEditing(false); setError(null); }}>{t("Cancel")}</Button>
          </div>
        </div>
      )}
    </li>
  );
}
