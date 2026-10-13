import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Quote } from "lucide-react";
import { useI18n } from "@/i18n";

const lenses = [
  {
    label: "Frame the question",
    description: "Give your reading a purpose. Start with the question you want the literature to help answer.",
    note: "How do language models perform outside standard benchmarks?",
    caption: "A question to investigate",
  },
  {
    label: "Read the evidence",
    description: "Look at the study design, evaluation setting and source behind each claim. Keep the context with your notes.",
    note: "Which datasets, methods and evaluation settings does each study use?",
    caption: "A prompt for closer reading",
  },
  {
    label: "Spot the limitation",
    description: "Record what a study leaves unanswered. Compare those limitations before choosing your next direction.",
    note: "What still needs to be tested in a different real-world context?",
    caption: "A direction to validate",
  },
] as const;

export function HomeReadingLens() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const lens = lenses[active]!;

  return <section id="home-reading" className="academic-reading home-width" aria-labelledby="home-reading-heading" data-home-reveal>
    <div className="academic-section-heading">
      <h2 id="home-reading-heading">{t("Read beyond the abstract.")}</h2>
      <p>{t("Turn a reading session into questions, evidence and directions you can return to.")}</p>
    </div>
    <div className="home-lens-controls academic-reading-tabs" role="group" aria-label={t("Explore a reading approach")}>
      {lenses.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls="home-reading-note" onClick={() => setActive(index)}><span aria-hidden="true">0{index + 1}</span>{t(item.label)}</button>)}
      <Link to="/bookmarks" className="academic-text-link">{t("Open your reading library")}<ArrowUpRight aria-hidden="true" /></Link>
    </div>
    <div className="academic-reading-stage" id="home-reading-note">
      <div className="academic-reading-question">
        <span className="academic-reading-example">{t("Example workflow")} / {t("Language model evaluation")}</span>
        <div className="home-note-annotation" key={active} aria-live="polite" aria-atomic="true"><Quote aria-hidden="true" /><span>{t(lens.caption)}</span><blockquote>{t(lens.note)}</blockquote><p>{t(lens.description)}</p></div>
      </div>
      <div className="home-note-prompts academic-reading-prompts">{lenses.map((item, index) => <div key={item.label} className={active === index ? "is-focused" : ""}><span aria-hidden="true">0{index + 1}</span><div><strong>{t(item.label)}</strong><p>{t(item.note)}</p></div></div>)}</div>
    </div>
    <p className="home-reading-example-note">{t("An example reading approach, not a summary of a published paper.")}</p>
  </section>;
}
