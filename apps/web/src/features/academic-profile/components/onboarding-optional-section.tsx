import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";

export function OnboardingOptionalSection({ id, label, count, max, expanded, onToggle, children }: {
  id: string; label: string; count: number; max: number; expanded: boolean;
  onToggle: () => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const overLimit = count > max;
  return <section className="onboarding-optional-section" data-expanded={expanded}>
    <h3><button type="button" id={`optional-${id}`} aria-expanded={expanded} aria-controls={`optional-panel-${id}`} onClick={onToggle}>
      <span className="onboarding-optional-title">{t(label)}<span>{t("Optional")}</span></span>
      <span className="onboarding-optional-count" data-invalid={overLimit} aria-live="polite">{count}/{max}</span>
      <ChevronDown aria-hidden="true" />
    </button></h3>
    {overLimit && <p className="onboarding-limit-error" role="alert">{t("Keep at most {{limit}} selections to continue.", { limit: max })}</p>}
    <div id={`optional-panel-${id}`} hidden={!expanded} className="onboarding-optional-body">
      {children}
    </div>
  </section>;
}
