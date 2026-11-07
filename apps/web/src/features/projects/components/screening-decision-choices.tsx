import { useId } from "react";
import type { ScreeningChoice } from "@trend/shared-types";
import { choiceLabels } from "./screening-common";
import { screeningChoiceTone, type ScreeningTone } from "../screening-status";
import "../screening-status.css";
import "../screening-decision-choices.css";

export const screeningReviewOptions = (["INCLUDE", "EXCLUDE", "UNSURE"] as ScreeningChoice[]).map(value => ({
  value, label: choiceLabels[value], tone: screeningChoiceTone(value),
}));

/** One native radio pattern for initial ballots, revisions and final decisions. */
export function ScreeningDecisionChoices<Value extends string>({
  legend, value, options, onChange, disabled = false, required = false, currentValue,
}: {
  legend: string;
  value: Value | "";
  options: readonly { value: Value; label: string; tone: ScreeningTone; disabled?: boolean }[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  required?: boolean;
  currentValue?: Value;
}) {
  const name = useId();
  return <fieldset className="screening-decision-choices" disabled={disabled}>
    <legend>{legend}</legend>
    <div className="screening-decision-options">
      {options.map(option => <label
        key={option.value}
        className="screening-decision-option screening-check screening-tone"
        data-tone={option.tone}
        data-selected={value === option.value}
        data-disabled={disabled || option.disabled || undefined}
      >
        <input type="radio" name={name} value={option.value} checked={value === option.value}
          disabled={option.disabled} required={required} onChange={() => onChange(option.value)} />
        <span>{option.label}{currentValue === option.value && <small>Hiện tại</small>}</span>
      </label>)}
    </div>
  </fieldset>;
}
