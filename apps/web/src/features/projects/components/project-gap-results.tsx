import { ArrowUpRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { ResearchGapItem } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { assessmentLabels } from "./research-gap-evaluation";

export function ProjectGapResults({ projectId, gaps, onOpen }: { projectId: string; gaps: ResearchGapItem[]; onOpen: (gap: ResearchGapItem) => void }) {
  const { t } = useI18n();
  if (!gaps.length) return null;
  return <section className="gap-discovery-candidates" data-no-i18n aria-label={t("Research directions")}>
    <h3>{t("Research directions")}</h3><p className="research-help">{t("Research directions to review, grounded in your selected papers.")}</p>
    {gaps.some(gap => gap.origin !== "HUMAN" && !gap.suggestedResearchQuestion) && <p className="gap-discovery-legacy">{t("These earlier results are saved. Analyze again to get source-linked research questions.")}</p>}
    <div className="gap-discovery-directions">{gaps.map(gap => <article key={gap.id} className="gap-discovery-direction">
      <div className="gap-discovery-direction-meta"><span>{t(gap.origin === "HUMAN" ? "Human proposal" : "AI-suggested candidate")}</span><span>{t(assessmentLabels[gap.assessmentStatus ?? "PROPOSED"])}</span></div>
      <h4><button type="button" onClick={() => onOpen(gap)}>{gap.title}<ArrowUpRight size={17} aria-hidden="true" /></button></h4>
      {gap.suggestedResearchQuestion ? <p className="gap-discovery-question">{gap.suggestedResearchQuestion}</p> : <p>{gap.description}</p>}
      {(gap.observedLimitation || gap.rationale) && <p className="gap-discovery-rationale"><strong>{t("Why explore this?")}</strong> {gap.observedLimitation || gap.rationale}</p>}
      <div className="gap-discovery-direction-sources"><span><FileText size={14} aria-hidden="true" />{t("{{count}} supporting papers", { count: gap.supportingPapers.length })}</span>{gap.supportingPapers.map(paper => <Link key={paper.id} title={paper.title} to={`/projects/${projectId}?tab=papers&source=${encodeURIComponent(paper.id)}`}>{paper.title}</Link>)}</div>
      <button className="gap-discovery-review" type="button" onClick={() => onOpen(gap)}>{t("Review evidence")} <ArrowUpRight size={14} aria-hidden="true" /></button>
    </article>)}</div>
  </section>;
}
