import { useState } from "react";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Coins,
  Gift,
  Info,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AiEvaluation } from "@/components/ai-evaluation";
import type { Paper, PaperAiScore } from "@trend/shared-types";

export interface PaperResearchSignalsSectionProps {
  paper: Paper;
  currentUser?: { id: string; role?: string } | null;
}

export function formatImpactScoreBasis(basis: PaperAiScore["scoreBasis"]): string {
  switch (basis) {
    case "openalex-percentile-fwci":
      return "OpenAlex citation percentile and FWCI";
    case "openalex-fwci":
      return "OpenAlex FWCI normalized by field";
    case "citations-per-year-fallback":
      return "Citations per year fallback";
    default:
      return "Citation impact normalization";
  }
}

export function formatResearchSignalScore(finalScore: number): string {
  return `${Math.round(finalScore * 100)} / 100`;
}

export function PaperResearchSignalsSection({
  paper,
  currentUser,
}: PaperResearchSignalsSectionProps) {
  return (
    <section aria-labelledby="signals-section-title" className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <h2
          id="signals-section-title"
          className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          Research signals and review
        </h2>
      </div>

      {/* C1. Deterministic Research Signal */}
      {paper.aiScore && <DeterministicResearchSignalCard aiScore={paper.aiScore} />}

      {/* C2. Public Quality Rubric */}
      <PlatformQualityRubricCard paper={paper} />

      {/* C3. AI Abstract Review */}
      <AiAbstractReviewCard paper={paper} currentUser={currentUser} />
    </section>
  );
}

function DeterministicResearchSignalCard({ aiScore }: { aiScore: PaperAiScore }) {
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);
  const overallPct = Math.round(aiScore.finalScore * 100);
  const citationPct = Math.round(aiScore.citationImpactScore * 100);
  const recencyPct = Math.round(aiScore.recencyScore * 100);
  const metadataPct = Math.round(aiScore.metadataQualityScore * 100);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              Deterministic research signal
            </h3>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              Deterministic
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Metadata-based indicators of impact, recency, and completeness. This is not an AI review or a judgment of scientific correctness.
          </p>
        </div>

        {/* Score Badge */}
        <div className="flex items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 px-3.5 py-2 dark:border-blue-900/40 dark:bg-blue-950/40 shrink-0">
          <Award className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Overall Signal
            </span>
            <span className="text-lg font-black text-blue-700 dark:text-blue-300 font-mono leading-none">
              {formatResearchSignalScore(aiScore.finalScore)}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-metrics Grid */}
      <div className="grid gap-3 sm:grid-cols-3 pt-1">
        <MetricCard
          label="Citation impact"
          score={citationPct}
          basis={formatImpactScoreBasis(aiScore.scoreBasis)}
        />
        <MetricCard
          label="Recency"
          score={recencyPct}
          basis="How recently the work was published."
        />
        <MetricCard
          label="Metadata completeness"
          score={metadataPct}
          basis="How many expected metadata fields are available."
        />
      </div>

      {/* Formula Disclosure */}
      <div className="border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => setShowFormulaDetails((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <Info className="h-3.5 w-3.5" />
          <span>How this signal is computed</span>
          {showFormulaDetails ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        {showFormulaDetails && (
          <div className="mt-2.5 rounded-xl bg-slate-50 p-3.5 font-mono text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-400 space-y-1">
            <p>Model version: {aiScore.modelVersion}</p>
            <p className="font-sans text-[11px] text-slate-500">
              This score is calculated deterministically from citation counts, field-weighted citation impact (FWCI), publication recency, and metadata field presence. It does not invoke a generative LLM.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  score,
  basis,
}: {
  label: string;
  score: number;
  basis: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-3.5 dark:border-slate-800/60 dark:bg-slate-900/30 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
          {label}
        </span>
        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
          {score} / 100
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        {basis}
      </p>
    </div>
  );
}

function PlatformQualityRubricCard({ paper }: { paper: Paper }) {
  const qualityScore = paper.qualityScore;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              Platform quality rubric
            </h3>
            {paper.qualityTierName && (
              <Badge variant="secondary" className="font-semibold text-xs">
                Tier: {paper.qualityTierName}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            A deterministic platform score used for data quality and upload workflows; it is not a peer-review verdict.
          </p>
        </div>

        {qualityScore !== undefined && qualityScore !== null && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 dark:border-slate-800 dark:bg-slate-900 shrink-0">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
              {Math.round(qualityScore)} / 100
            </span>
          </div>
        )}
      </div>

      {/* Reward / Download Cost details if available */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold pt-1 text-slate-600 dark:text-slate-400">
        {paper.downloadCost !== undefined && paper.downloadCost !== null && (
          <span className="flex items-center gap-1">
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            Download cost: <strong>{paper.downloadCost} credits</strong>
          </span>
        )}
        {paper.uploadCreditReward !== undefined && paper.uploadCreditReward > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Gift className="h-3.5 w-3.5" />
            Uploader reward: <strong>+{paper.uploadCreditReward} credits</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function AiAbstractReviewCard({
  paper,
  currentUser,
}: {
  paper: Paper;
  currentUser?: { id: string } | null;
}) {
  return (
    <div className="rounded-2xl border border-purple-200/60 bg-gradient-to-b from-purple-50/20 to-transparent p-6 shadow-xs dark:border-purple-900/40 dark:from-purple-950/10 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            AI abstract review
          </h3>
          <Badge variant="outline" className="border-purple-300 bg-purple-100/50 text-[10px] font-bold text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
            Advisory LLM
          </Badge>
        </div>
        <p className="mt-1 text-xs text-purple-900/80 dark:text-purple-300/80 font-medium">
          Generated from the title and abstract only. It does not change indexing, approval, credits, or quality tier.
        </p>
      </div>

      <AiEvaluation
        targetKind="paper"
        targetId={paper.id}
        enabled={Boolean(currentUser && paper.abstractText?.trim())}
        disabledHint={
          currentUser
            ? "This paper does not have an abstract for AI evaluation"
            : "Sign in to request an abstract-only AI evaluation"
        }
      />
    </div>
  );
}
