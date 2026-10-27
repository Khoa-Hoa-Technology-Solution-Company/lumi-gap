import { ArrowUpRight, Compass, FileText, HelpCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { ResearchGapItem } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { assessmentLabels } from "./research-gap-evaluation";

export function ProjectGapResults({
  projectId,
  gaps,
  onOpen,
}: {
  projectId: string;
  gaps: ResearchGapItem[];
  onOpen: (gap: ResearchGapItem) => void;
}) {
  const { t } = useI18n();
  if (!gaps.length) return null;

  return (
    <section className="gap-discovery-candidates" data-no-i18n aria-label={t("Research directions")}>
      <div className="gap-candidates-header">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3>{t("Research directions")}</h3>
        </div>
        <p className="research-help">
          {t("Research directions to review, grounded in your selected papers.")}
        </p>
      </div>

      {gaps.some((gap) => gap.origin !== "HUMAN" && !gap.suggestedResearchQuestion) && (
        <p className="gap-discovery-legacy">
          {t("These earlier results are saved. Analyze again to get source-linked research questions.")}
        </p>
      )}

      <div className="gap-discovery-directions">
        {gaps.map((gap) => (
          <article key={gap.id} className="gap-discovery-direction">
            <div className="gap-discovery-direction-meta">
              <span className="gap-origin-badge">
                <Sparkles className="h-3 w-3 text-primary" />
                {t(gap.origin === "HUMAN" ? "Human proposal" : "AI-suggested candidate")}
              </span>
              <span className="gap-status-pill" data-status={gap.assessmentStatus ?? "PROPOSED"}>
                {t(assessmentLabels[gap.assessmentStatus ?? "PROPOSED"])}
              </span>
            </div>

            <h4>
              <button type="button" onClick={() => onOpen(gap)}>
                <span>{gap.title}</span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </h4>

            {gap.suggestedResearchQuestion ? (
              <div className="gap-question-callout">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                  <HelpCircle size={14} />
                  <span>{t("Suggested research question")}</span>
                </div>
                <p className="gap-discovery-question">{gap.suggestedResearchQuestion}</p>
              </div>
            ) : (
              <p className="gap-card-desc">{gap.description}</p>
            )}

            {(gap.observedLimitation || gap.rationale) && (
              <div className="gap-rationale-box">
                <Compass size={14} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p className="gap-discovery-rationale">
                  <strong>{t("Why explore this?")}</strong> {gap.observedLimitation || gap.rationale}
                </p>
              </div>
            )}

            <div className="gap-discovery-direction-sources">
              <span className="gap-sources-label">
                <FileText size={14} aria-hidden="true" />
                {t("{{count}} supporting papers", { count: gap.supportingPapers.length })}
              </span>
              {gap.supportingPapers.map((paper) => (
                <Link
                  key={paper.id}
                  title={paper.title}
                  to={`/projects/${projectId}?tab=papers&source=${encodeURIComponent(paper.id)}`}
                >
                  {paper.title}
                </Link>
              ))}
            </div>

            <div className="gap-card-action">
              <button className="gap-discovery-review" type="button" onClick={() => onOpen(gap)}>
                {t("Review evidence")} <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
