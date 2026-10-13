import { BookMarked, Search, FileSearch, ArrowRight, BookOpen } from "lucide-react";
import { useI18n } from "@/i18n";
import type { PaperPickerSource } from "./project-paper-picker-dialog";

const sources = [
  { source: "search", title: "Search LumiGap", description: "Find papers by topic, title or research question.", icon: Search },
  { source: "library", title: "Choose from saved papers", description: "Bring relevant papers from your reading library.", icon: BookMarked },
  { source: "doi", title: "Add by DOI", description: "Have a specific paper? Add it with its DOI.", icon: FileSearch },
] as const;
const workflow = [
  { title: "Collect literature", description: "Find papers relevant to your research question." },
  { title: "Screen and read", description: "Record decisions and notes using shared criteria." },
  { title: "Build research outputs", description: "Use your included papers for synthesis and gap analysis." },
];

export function ProjectLiteratureEmpty({ readOnly, onAdd }: { readOnly: boolean; onAdd: (source: PaperPickerSource) => void }) {
  const { t } = useI18n();
  return <section className="project-literature-start" data-no-i18n aria-labelledby="literature-start-title">
    <div className="project-literature-onboard" data-readonly={readOnly}>
      <div className="project-literature-start-copy">
        <div className="project-source-mark" aria-hidden="true"><BookOpen /></div>
        <p className="project-eyebrow">{t("Your research library")}</p>
        <h3 id="literature-start-title">{t(readOnly ? "No literature in this project" : "Start with your first paper")}</h3>
        <p className="project-literature-start-description">{t(readOnly ? "This project is read-only. Papers added earlier would appear here." : "Bring your sources into one place, then decide which papers belong in your research.")}</p>
      </div>
      {!readOnly ? <div className="project-source-options" aria-label={t("Add papers")}>
        {sources.map(({ source, title, description, icon: Icon }) => <button key={source} type="button" aria-label={t(title)} aria-describedby={`project-source-help-${source}`} className={`project-source-option ${source === "search" ? "project-source-primary" : ""}`} onClick={() => onAdd(source)}>
          <Icon className="project-source-option-icon" aria-hidden="true" />
          <span><strong>{t(title)}</strong><span id={`project-source-help-${source}`}>{t(description)}</span></span>
          <ArrowRight className="project-source-arrow" aria-hidden="true" />
        </button>)}
      </div> : null}
    </div>
    <div className="project-literature-guidance">
      <h4 className="project-eyebrow">{t("From sources to insights")}</h4>
      <ol className="project-research-steps">{workflow.map((step, index) => <li key={step.title}><span className="project-step-number">{String(index + 1).padStart(2, "0")}</span><div><p className="project-step-title">{t(step.title)}</p><p className="project-step-description">{t(step.description)}</p></div></li>)}</ol>
    </div>
  </section>;
}
