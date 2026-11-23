import type { AvailableMentor } from "@trend/shared-types";
import { MENTOR_SUPPORT_AREAS } from "@trend/shared-types";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/i18n";

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

  // Deduplicate identical terms across groups so the same term (e.g. "Artificial Intelligence") is not repeated on consecutive lines
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

  const relevanceLabel =
    match.relevance === "HIGHLY_RELEVANT"
      ? "Highly relevant"
      : match.relevance === "RELEVANT"
        ? "Relevant"
        : "Potential match";

  const isStrong = match.relevance === "HIGHLY_RELEVANT" || match.relevance === "RELEVANT";

  return (
    <section data-no-i18n className="mt-2.5 space-y-2" aria-label={t("Why this lecturer")}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
            isStrong
              ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t(relevanceLabel)}
        </span>
      </div>

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

      {match.gaps.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">{t("Evidence to discuss")}</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {match.gaps.map((gap) => (
              <li key={gap}>{t(gap)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
