import { ArrowRight, BookOpenCheck, DatabaseZap, PencilLine, SearchCheck } from "lucide-react";
import type { GapNextStep as GapNextStepData } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

/** One plain instruction per gap: what its evidence means and what to do next. */
export function GapNextStep({ step, compact = false }: { step?: GapNextStepData; compact?: boolean }) {
  const { t } = useI18n();
  if (!step) return null;
  const content = {
    likely_studied: {
      icon: BookOpenCheck,
      tone: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
      title: t("Probably already studied"),
      body: step.counterCount === 1
        ? t("1 paper may already answer this gap. Read it: if it does, dismiss the gap; if it only covers part of it, narrow the question to the part it leaves out.")
        : step.counterCount > 1
        ? t("{{count}} papers may already answer this gap. Read them: if one does, dismiss the gap; if they only cover part of it, narrow the question to the part they leave out.", { count: step.counterCount })
        : t("OpenAlex finds this combination well studied. Narrow the question (population, outcome or method) before relying on it."),
    },
    thin_corpus: {
      icon: DatabaseZap,
      tone: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
      title: t("Corpus too thin to judge"),
      body: t("The corpus has too few papers on one of the topics, while OpenAlex has many. Add papers from OpenAlex in the analysis form and run it again."),
    },
    run_closure: {
      icon: SearchCheck,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
      title: t("Promising candidate"),
      body: t("Far fewer papers than expected and nothing found that answers it. Run the closure check below: its question is already filled in."),
    },
    refine: {
      icon: PencilLine,
      tone: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
      title: t("Weak signal"),
      body: t("The counts do not single this gap out. Sharpen the research question, or run a closure check if the idea still matters to you."),
    },
  }[step.kind];
  const Icon = content.icon;
  return (
    <div className={cn("flex gap-2 rounded-xl border", compact ? "p-2.5 text-xs" : "p-3 text-sm", content.tone)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="flex items-center gap-1 font-semibold">{t("Next step")} <ArrowRight className="h-3 w-3" /> {content.title}</p>
        <p className={cn("leading-relaxed", compact ? "text-[11px]" : "text-xs")}>{content.body}</p>
      </div>
    </div>
  );
}
