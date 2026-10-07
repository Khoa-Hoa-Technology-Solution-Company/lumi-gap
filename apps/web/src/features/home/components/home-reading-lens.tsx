import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check, Quote } from "lucide-react";
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

  return <section id="home-reading" className="home-reading-section" aria-labelledby="home-reading-heading" data-home-section="reading">
    <div className="home-width home-reading-layout" data-home-reveal>
      <div className="home-reading-copy">
        <p className="home-section-kicker">{t("From reading to understanding")}</p>
        <h2 id="home-reading-heading">{t("Read with a question in mind.")}</h2>
        <p>{t("A useful reading session leaves more than a saved paper. It gives your next idea something to stand on.")}</p>
        <div className="home-lens-controls" role="group" aria-label={t("Explore a reading approach")}>
          {lenses.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls="home-reading-note" onClick={() => setActive(index)}>
            <span className="home-lens-number" aria-hidden="true">0{index + 1}</span>
            <span><strong>{t(item.label)}</strong>{active === index ? <span className="home-lens-description">{t(item.description)}</span> : null}</span>
            <ArrowRight aria-hidden="true" />
          </button>)}
        </div>
        <Link to="/bookmarks" className="home-text-link">{t("Open your reading library")}<ArrowUpRight aria-hidden="true" /></Link>
      </div>

      <div className="home-reading-desk" id="home-reading-note">
        <div className="home-reading-desk-header"><span><BookOpen aria-hidden="true" />{t("A literature note")}</span><span className="home-example-label">{t("Example workflow")}</span></div>
        <div className="home-reading-sheet">
          <div className="home-note-meta"><span>{t("Language model evaluation")}</span><Bookmark aria-hidden="true" /></div>
          <p className="home-note-title">{t("Beyond the benchmark")}</p>
          <p className="home-note-intro">{t("One topic. A few questions worth keeping close as you read.")}</p>
          <div className="home-note-prompts">{lenses.map((item, index) => <div key={item.label} className={active === index ? "is-focused" : ""}><span aria-hidden="true">0{index + 1}</span><p>{t(item.note)}</p>{active === index ? <Check aria-hidden="true" /> : null}</div>)}</div>
          <div className="home-note-annotation" key={active} aria-live="polite" aria-atomic="true"><Quote aria-hidden="true" /><div><span>{t(lens.caption)}</span><p>{t(lens.note)}</p></div></div>
          <div className="home-note-footer"><span className="home-note-dot" aria-hidden="true" />{t("Keep the question connected to the source.")}</div>
        </div>
        <p className="home-reading-example-note">{t("An example reading approach, not a summary of a published paper.")}</p>
      </div>
    </div>
  </section>;
}
