import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { GapClosureCheckView, QuestionFacets, ResearchGapItem } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { apiErrorMessage, compactFacets, GAP_CLOSURE_CHECK_CREDIT_COST, parseLines } from "../closure-format";
import { useStartGapClosureCheck } from "../hooks/use-gap-closure";
import { FacetInputs } from "./facet-inputs";

const TEXTAREA_CLASS = "min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm";

function parseYear(value: string): number | undefined {
  const year = Number.parseInt(value, 10);
  return Number.isInteger(year) && year >= 1000 && year <= 3000 ? year : undefined;
}

interface ClosureStartFormProps {
  gap: ResearchGapItem;
  onStarted: (check: GapClosureCheckView) => void;
}

/** Question, PICOC facets, optional hand-written queries and year range for a new closure check. */
export function ClosureStartForm({ gap, onStarted }: ClosureStartFormProps) {
  const { t } = useI18n();
  const start = useStartGapClosureCheck(gap.id);
  const [question, setQuestion] = useState(gap.suggestedResearchQuestion ?? "");
  const [facets, setFacets] = useState<QuestionFacets>(gap.questionFacets ?? {});
  const [queriesText, setQueriesText] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 10) {
      setError(t("Write the research question as a full sentence (at least 10 characters)."));
      return;
    }
    const from = parseYear(yearFrom);
    const to = parseYear(yearTo);
    if (from !== undefined && to !== undefined && from > to) {
      setError(t("The first year must not be after the last year."));
      return;
    }
    const queries = parseLines(queriesText);
    try {
      const check = await start.mutateAsync({
        question: trimmedQuestion,
        facets: compactFacets(facets),
        queries: queries.length > 0 ? queries : undefined,
        yearFrom: from,
        yearTo: to,
      });
      toast.success(t("Closure check started. The search runs in the background."));
      onStarted(check);
    } catch (err) {
      const message = apiErrorMessage(err, t("Could not start the closure check."));
      setError(message);
      toast.error(message);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
      <div className="space-y-1.5">
        <Label htmlFor={`closure-question-${gap.id}`} className="text-xs">{t("Research question")}</Label>
        <textarea
          id={`closure-question-${gap.id}`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={1000}
          className={TEXTAREA_CLASS}
        />
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t("The check looks for papers that already answer this exact question, so state it precisely.")}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{t("PICOC facets (optional)")}</h4>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t("A paper answers the question only if every facet you fill in matches. Leave a facet empty to ignore it.")}
        </p>
        <FacetInputs value={facets} onChange={setFacets} idPrefix={`closure-facet-${gap.id}`} disabled={start.isPending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`closure-queries-${gap.id}`} className="text-xs">{t("Search queries (optional, one per line)")}</Label>
        <textarea
          id={`closure-queries-${gap.id}`}
          value={queriesText}
          onChange={(event) => setQueriesText(event.target.value)}
          className={TEXTAREA_CLASS}
        />
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t("Leave empty and the AI proposes a few queries. Every query is logged either way.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`closure-year-from-${gap.id}`} className="text-xs">{t("Year From")}</Label>
          <Input id={`closure-year-from-${gap.id}`} inputMode="numeric" placeholder="2015" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`closure-year-to-${gap.id}`} className="text-xs">{t("Year To")}</Label>
          <Input id={`closure-year-to-${gap.id}`} inputMode="numeric" placeholder="2026" value={yearTo} onChange={(event) => setYearTo(event.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {t("Costs {{credits}} credits. The charge is refunded if the check fails.", { credits: GAP_CLOSURE_CHECK_CREDIT_COST })}
        </span>
        <Button type="submit" size="sm" disabled={start.isPending} className="h-8 gap-1.5 text-xs">
          {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {t("Start closure check")}
        </Button>
      </div>
    </form>
  );
}
