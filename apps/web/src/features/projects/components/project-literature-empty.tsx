import type { ReactNode } from "react";
import { BookMarked, Search, FileSearch, ArrowRight, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import type { PaperPickerSource } from "./project-paper-picker-dialog";

const sources = [
  { source: "search", title: "Find papers", description: "Find papers by topic, title or research question.", icon: Search },
  { source: "library", title: "Add saved papers", description: "Choose papers you have already saved in LumiGap.", icon: BookMarked },
  { source: "doi", title: "Add by DOI", description: "Enter a paper's DOI to add it directly.", icon: FileSearch },
] as const;
const workflow = [
  { title: "Read and take notes", description: "Review each paper and keep notes with its source." },
  { title: "Choose what to include", description: "Record an inclusion or exclusion decision using your criteria." },
  { title: "Use included papers", description: "Use the selected evidence for research gaps and outputs." },
];

export function ProjectLiteratureEmpty({ readOnly, onAdd, screening }: { readOnly: boolean; onAdd: (source: PaperPickerSource) => void; screening: ReactNode }) {
  const { t } = useI18n();
  const sourceAction = ({ source, title, description, icon: Icon }: typeof sources[number]) => <button key={source} type="button" data-source={source} aria-label={t(title)} aria-describedby={`project-source-help-${source}`} className={`project-source-option ${source === "search" ? "project-source-primary" : ""}`} onClick={() => onAdd(source)}>
    <span className="project-source-symbol" aria-hidden="true"><Icon className="project-source-option-icon" /></span>
    <span className="project-source-label"><strong>{t(title)}</strong><span className={source === "search" ? "sr-only" : "project-source-help"} id={`project-source-help-${source}`}>{t(description)}</span></span>
    <ArrowRight className="project-source-arrow" aria-hidden="true" />
  </button>;
  return <section className="project-literature-start" data-no-i18n aria-labelledby="literature-start-title">
    <div className="project-literature-onboard" data-readonly={readOnly}>
      <div className="project-literature-start-copy">
        <h2 id="literature-start-title">{t(readOnly ? "No literature in this project" : "Add papers to this project")}</h2>
        <p className="project-literature-start-description">{t(readOnly ? "This project is read-only. Papers added earlier would appear here." : "Find papers by topic or title. Add them here to read, take notes and decide what to include.")}</p>
        {!readOnly ? <div className="project-source-options" aria-label={t("Add papers")}>
          {sourceAction(sources[0])}
          <div className="project-secondary-sources">{sources.slice(1).map(sourceAction)}</div>
        </div> : null}
      </div>
      <aside className="project-library-guide" aria-label={t("Literature guidance")}>
        {screening}
        <details className="project-literature-guidance">
          <summary>{t("How this library works")}<ChevronDown aria-hidden="true" /></summary>
          <ol className="project-research-steps">{workflow.map((step, index) => <li key={step.title}><span className="project-step-number">{String(index + 1).padStart(2, "0")}</span><div><p className="project-step-title">{t(step.title)}</p><p className="project-step-description">{t(step.description)}</p></div></li>)}</ol>
        </details>
      </aside>
    </div>
  </section>;
}
