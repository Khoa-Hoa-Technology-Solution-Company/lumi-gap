import { FileText, Github } from "lucide-react";
import { useI18n } from "@/i18n";

/** Manual-activation tabs keep keyboard focus separate from a source transfer. */
export function ManuscriptIntegrationTabs({ selected, onSelect }: { selected: string; onSelect: (tab: "preview" | "github") => void }) {
  const { t } = useI18n();
  return <div className="writing-integration-tabs" role="tablist" aria-label={t("Manuscript tools")} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]?.focus();
  }}>
    {(["preview", "github"] as const).map(tab => <button type="button" role="tab" key={tab} id={`writing-${tab}-tab`} aria-selected={selected === tab} aria-controls={`writing-${tab}-tabpanel`} tabIndex={selected === tab || !["preview", "github"].includes(selected) && tab === "preview" ? 0 : -1} onClick={() => onSelect(tab)}>{tab === "github" ? <Github aria-hidden="true" /> : <FileText aria-hidden="true" />}{tab === "github" ? "GitHub" : t("PDF preview")}</button>)}
  </div>;
}
