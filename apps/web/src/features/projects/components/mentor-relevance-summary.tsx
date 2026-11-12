import type { AvailableMentor } from "@trend/shared-types";
import { MENTOR_SUPPORT_AREAS } from "@trend/shared-types";
import { useI18n } from "@/i18n";
export function MentorRelevanceSummary({ match }: { match?: AvailableMentor["matchExplanation"] }) {
  const { t } = useI18n(); if (!match) return null;
  const groups = [["Shared research topics", match.topics], ["Related subfields", match.subfields], ["Shared fields", match.fields], ["Matching technical skills", match.skills], ["Aligned research interests", match.interests], ["Topics open for supervision", match.supervisionTopics ?? []], ["Supported mentoring needs", match.support.map(type => t(MENTOR_SUPPORT_AREAS.find(area => area.id === type)?.label ?? type))]] as const;
  return <section data-no-i18n className="space-y-2 py-2" aria-label={t("Why this lecturer")}><p className="text-sm font-semibold">{t(match.relevance === "HIGHLY_RELEVANT" ? "Highly relevant" : match.relevance === "RELEVANT" ? "Relevant" : "Potential match")}</p>
    <dl className="space-y-1 text-xs leading-5">{groups.filter(([, values]) => values.length).map(([label, values]) => <div key={label}><dt className="inline text-muted-foreground">{t(label)}: </dt><dd className="inline break-words">{values.join(" · ")}</dd></div>)}</dl>
    {groups.every(([, values]) => !values.length) && <p className="text-xs text-muted-foreground">{t("No specific expertise overlap yet. Review the profile before inviting.")}</p>}
    {match.gaps.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t("Evidence to discuss")}</summary><ul className="mt-1 list-inside list-disc">{match.gaps.map(gap => <li key={gap}>{t(gap)}</li>)}</ul></details>}
  </section>;
}
