import type { QuestionFacets } from "@trend/shared-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { FACET_KEYS } from "../closure-format";

export const FACET_MAX_LENGTH = 300;

interface FacetInputsProps {
  value: QuestionFacets;
  onChange: (next: QuestionFacets) => void;
  idPrefix: string;
  disabled?: boolean;
}

/** PICOC facet inputs: population, intervention, comparison, outcome, context. Empty facets are not checked. */
export function FacetInputs({ value, onChange, idPrefix, disabled }: FacetInputsProps) {
  const { t } = useI18n();
  const labels: Record<(typeof FACET_KEYS)[number], string> = {
    population: t("Population"),
    intervention: t("Intervention"),
    comparison: t("Comparison"),
    outcome: t("Outcome"),
    context: t("Context"),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FACET_KEYS.map((key) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">{labels[key]}</Label>
          <Input
            id={`${idPrefix}-${key}`}
            value={value[key] ?? ""}
            maxLength={FACET_MAX_LENGTH}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
