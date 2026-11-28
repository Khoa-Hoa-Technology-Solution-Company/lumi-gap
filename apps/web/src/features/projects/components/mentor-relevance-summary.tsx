import type { AvailableMentor } from "@trend/shared-types";
import { MENTOR_SUPPORT_AREAS } from "@trend/shared-types";
import { useI18n } from "@/i18n";

/**
 * Neutral factual overlap summary — never renders suitability ratings ("Highly relevant", "% match", etc.).
 */
export function MentorRelevanceSummary({ match }: { match?: AvailableMentor["matchExplanation"] }) {
  const { t } = useI18n();
  if (!match) return null;

  const rawGroups = [
    ["Shared research topics", match.topics],
    ["Related subfields", match.subfields],
    ["Shared fields", match.fields],
    ["Matching technical skills", match.skills],
    ["Aligned research interests", match.interests],
    ["Topics open for supervision", match.supervisionTopics ?? []],
    [
      "Supported mentoring needs",
      match.support.map((type) => t(MENTOR_SUPPORT_AREAS.find((area) => area.id === type)?.label ?? type)),
    ],
  ] as const;

  const seen = new Set<string>();
  const groups = rawGroups
    .map(([label, values]) => {
      const unique = values.filter((v) => {
        const norm = v.trim().toLowerCase();
        if (!norm || seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
      return [label, unique] as const;
    })
    .filter(([, values]) => values.length > 0);

  return (
    <section data-no-i18n className="mt-2 space-y-1.5" aria-label={t("Shared declared research terms")}>
      {groups.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-5">
          {groups.map(([label, values]) => (
            <div key={label} className="inline-flex flex-wrap items-center gap-1.5">
              <dt className="font-medium text-muted-foreground">{t(label)}:</dt>
              <dd className="inline-flex flex-wrap items-center gap-1">
                {values.map((val) => (
                  <span
                    key={val}
                    className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11.5px] font-medium text-foreground"
                  >
                    {val}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("No specific expertise overlap yet. Review the profile before inviting.")}
        </p>
      )}
    </section>
  );
}
