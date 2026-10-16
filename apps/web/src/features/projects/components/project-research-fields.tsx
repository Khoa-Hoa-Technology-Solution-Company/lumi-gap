import { useQuery } from "@tanstack/react-query";
import type { ResearchApproach } from "@trend/shared-types";
import { authApi } from "@/features/auth/api/auth.api";
import { ResearchTagField } from "@/features/academic-profile/components/research-focus-fields";
import { useI18n } from "@/i18n";

export const RESEARCH_APPROACHES = {
  UNDECIDED: "Not decided yet", EXPLORATORY: "Exploratory research", LITERATURE_REVIEW: "Literature review", EMPIRICAL: "Empirical research",
} as const;

export function ProjectResearchFields({ areas, approach, onAreasChange, onApproachChange }: {
  areas: string[]; approach: ResearchApproach; onAreasChange: (areas: string[]) => void; onApproachChange: (approach: ResearchApproach) => void;
}) {
  const { t } = useI18n();
  const taxonomy = useQuery({ queryKey: ["academic-profile", "research-taxonomy"], queryFn: () => authApi.academicOnboardingOptions(), staleTime: 300_000 });
  return <div className="space-y-4">
    <div><ResearchTagField label={t("Research areas (up to 3)")} values={areas} max={3} onChange={onAreasChange} options={taxonomy.data?.researchAreas} />
      <p className="mt-1 text-xs text-muted-foreground">{t("Choose a suggested area or add your own.")}</p>
    </div>
    <label className="block space-y-2 text-sm font-medium"><span>{t("Research approach")}</span>
      <select className="project-form-select" value={approach} onChange={event => onApproachChange(event.target.value as ResearchApproach)}>
        {Object.entries(RESEARCH_APPROACHES).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
      </select>
      <span className="block text-xs font-normal leading-5 text-muted-foreground">{t("A starting direction. You can change it as your question develops.")}</span>
    </label>
  </div>;
}
