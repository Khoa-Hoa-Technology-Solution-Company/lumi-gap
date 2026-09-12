import { useState, useEffect } from "react";
import { Lightbulb, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { gapsApi } from "@/features/gaps/api/gaps.api";
import type { GapDirections, GapSupportingPaper } from "@trend/shared-types";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils/format";

/**
 * On-demand AI research-direction suggestions for one gap. Advisory — never
 * affects tier/credit/approval. Lazy by design: this renders once PER gap card
 * in a list, so it does NOT fetch on mount (N cards would fire N un-throttled
 * GETs — the sibling AiEvaluation skips its on-mount GET for the same reason).
 * The first button click sends force:false, so the backend returns the cached
 * doc if one exists, otherwise generates.
 */
export function GapDirectionsPanel({
  gapId,
  supportingPapers = [],
  className,
  variant = "default",
  autoFetch = false,
}: {
  gapId: string;
  supportingPapers?: GapSupportingPaper[];
  className?: string;
  variant?: "default" | "flat";
  autoFetch?: boolean;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<GapDirections | null>(null);
  const [generating, setGenerating] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (autoFetch && !data && !generating) {
      const fetchCached = async () => {
        setGenerating(true);
        try {
          const res = await gapsApi.getDirections(gapId);
          if (res) {
            setData(res);
          }
        } catch (err) {
          console.error("Failed to fetch cached directions", err);
        } finally {
          setGenerating(false);
        }
      };
      void fetchCached();
    }
  }, [autoFetch, gapId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // First click (data === null) sends force:false → cached-or-generate.
      // A later click (data set) sends force:true → real re-generate ("Gợi ý lại").
      const res = await gapsApi.generateDirections(gapId, !!data);
      setData(res);
      toast.success(t("AI research directions suggested."));
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || t("Failed to suggest directions."));
    } finally {
      setGenerating(false);
    }
  };

  const isFlat = variant === "flat";

  return (
    <div
      className={
        isFlat
          ? `space-y-3 ${className ?? ""}`
          : `rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-6 space-y-4 ${className ?? ""}`
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{t("Research Directions (AI)")}</h3>
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
            {t("AI Advisory")}
          </span>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          variant={isFlat ? "outline" : "default"}
          className={
            isFlat
              ? "h-8 px-3 rounded-lg text-xs font-semibold border-amber-200 dark:border-amber-900/50 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-amber-700 dark:text-amber-400 gap-1.5"
              : "h-9 px-4 gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold"
          }
        >
          {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {data ? t("Suggest Again") : t("Suggest Directions")}
        </Button>
      </div>

      {data && data.directions.length > 0 ? (
        <div className="space-y-3">
          {data.directions.map((d, i) => (
            <div key={i} className="rounded-xl bg-slate-50/50 dark:bg-zinc-900/30 border border-slate-100/50 dark:border-zinc-800/30 p-4 space-y-2">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                {i + 1}. {d.title}
              </div>
              {d.rationale && (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{d.rationale}</p>
              )}
              {d.suggestedApproach && (
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100/50 dark:border-slate-800/40">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{t("Approach:")} </span>
                  {d.suggestedApproach}
                </p>
              )}
              {d.relatedPaperIds.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/40 mt-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t("Related Evidence:")}</span>
                  <div className="space-y-1.5">
                    {d.relatedPaperIds.map((id) => {
                      const paper = supportingPapers.find((p) => p.id === id);
                      if (paper) {
                        const metadata = [
                          paper.publicationYear,
                          paper.journalName,
                          paper.citationCount !== undefined ? `${formatNumber(paper.citationCount)} ${t("citations")}` : null
                        ].filter(Boolean).join(" • ");
                        return (
                          <div key={id} className="text-xs">
                            <Link
                              to={`/papers/${id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center gap-1 leading-snug"
                            >
                              <span>{paper.title}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </Link>
                            {metadata && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block mt-0.5">
                                {metadata}
                              </span>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={id} className="text-xs text-slate-400 italic">
                          {t("Unknown supporting paper (ID: {{id}})", { id: id.slice(-6) })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-[10px] text-slate-400">
            {t("Suggestions are grounded in gap evidence, supporting papers, and structured paper knowledge when available. Advisory only; does not affect approval.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("No suggestions yet. Click to generate 2-4 research directions for this gap.")}
          </p>
          <p className="text-[10px] text-slate-400">
            {t("Suggestions are grounded in gap evidence, supporting papers, and structured paper knowledge when available. Advisory only; does not affect approval.")}
          </p>
        </div>
      )}
    </div>
  );
}
