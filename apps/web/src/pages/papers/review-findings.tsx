import { AlertTriangle, ListChecks } from "lucide-react";
import type { ReviewClaim, ReviewIssue, ReviewQuote } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";

type Translate = (text: string) => string;

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CLASSIFICATION_ORDER: Record<string, number> = { "Confirmed issue": 0, "Potential issue": 1, "Missing information": 2, "Reviewer suggestion": 3 };
const CLASSIFICATION_STYLE: Record<string, string> = {
  "Confirmed issue": "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "Potential issue": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Missing information": "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "Reviewer suggestion": "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};
const ASSESSMENT_STYLE: Record<string, string> = {
  Supported: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "Partially Supported": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Unsupported: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "Cannot Assess": "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function sortReviewIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    || (CLASSIFICATION_ORDER[a.classification] ?? 9) - (CLASSIFICATION_ORDER[b.classification] ?? 9));
}

function Quotes({ quotes, t }: { quotes?: ReviewQuote[]; t: Translate }) {
  if (!quotes?.length) return null;
  return <ul className="mt-2 space-y-1">
    {quotes.map((quote, index) => <li key={index} className="border-l-2 border-slate-300 pl-2 text-[11px] italic text-slate-600 dark:border-slate-600 dark:text-slate-400">
      “{quote.text}” <span className="not-italic font-semibold">— {t("p.")} {quote.page}</span>
    </li>)}
  </ul>;
}

/** Evidence-checked issues and claims of an AI review. Renders nothing for reviews saved before `analysis` existed. */
export function ReviewFindings({ issues, claims, warnings, t }: { issues?: ReviewIssue[]; claims?: ReviewClaim[]; warnings?: string[]; t: Translate }) {
  const sortedIssues = sortReviewIssues(issues ?? []);
  const claimList = claims ?? [];
  if (!sortedIssues.length && !claimList.length) return null;
  return <div className="mb-6 space-y-5">
    {sortedIssues.length ? <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"><AlertTriangle className="h-4 w-4 text-rose-500" />{t("Issues")}</h3>
      <ul className="space-y-3">
        {sortedIssues.map((issue, index) => <li key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/70">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`text-[10px] ${CLASSIFICATION_STYLE[issue.classification] ?? ""}`}>{t(issue.classification)}</Badge>
            <Badge variant="outline" className="text-[10px] capitalize">{t(issue.severity)}</Badge>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">{issue.category}</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-200">{issue.finding}</p>
          {issue.recommendation ? <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400"><span className="font-semibold">{t("Recommendation")}:</span> {issue.recommendation}</p> : null}
          <Quotes quotes={issue.quotes} t={t} />
        </li>)}
      </ul>
    </section> : null}
    {claimList.length ? <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"><ListChecks className="h-4 w-4 text-indigo-500" />{t("Claims")}</h3>
      <ul className="space-y-3">
        {claimList.map((claim, index) => <li key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/70">
          <div className="flex flex-wrap items-center gap-2"><Badge className={`text-[10px] ${ASSESSMENT_STYLE[claim.assessment] ?? ""}`}>{t(claim.assessment)}</Badge></div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-200">{claim.claim}</p>
          <Quotes quotes={claim.quotes} t={t} />
        </li>)}
      </ul>
    </section> : null}
    {warnings?.length ? <p className="text-[11px] text-slate-500">{t("Some AI quotes could not be verified against the PDF and were removed.")}</p> : null}
  </div>;
}
