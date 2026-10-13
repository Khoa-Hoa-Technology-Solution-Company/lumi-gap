import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Atom, Brain, ChartNoAxesCombined, Cpu, GraduationCap, HeartPulse, Leaf, Microscope, Network, Orbit } from "lucide-react";
import { useI18n } from "@/i18n";
import "../home-question-space.css";

const prompts = [
  { field: "Artificial intelligence", question: "How can we make language models more reliable?", icon: Brain },
  { field: "Medicine", question: "How can earlier diagnosis improve patient outcomes?", icon: HeartPulse },
  { field: "Education", question: "How does AI change the way we learn?", icon: GraduationCap },
  { field: "Climate & environment", question: "Which materials could help us store clean energy?", icon: Leaf },
  { field: "Materials science", question: "What could carbon nanotubes make possible?", icon: Atom },
  { field: "Economics & innovation", question: "What drives innovation in emerging economies?", icon: ChartNoAxesCombined },
  { field: "Life sciences", question: "How do cells respond to a changing environment?", icon: Microscope },
  { field: "Computer science", question: "How can we build more energy-efficient computing?", icon: Cpu },
] as const;

export function HomeQuestionSpace() {
  const { t } = useI18n();
  return <section id="home-question-space" className="home-question-space" aria-labelledby="home-question-space-heading" data-home-reveal>
    <div className="home-question-space-panel">
      <svg className="home-question-space-map" viewBox="0 0 1440 900" preserveAspectRatio="none" fill="none" aria-hidden="true" data-home-animate>
        <ellipse className="home-question-space-orbit" cx="720" cy="438" rx="510" ry="325" />
        <ellipse className="home-question-space-orbit home-question-space-orbit-inner" cx="720" cy="438" rx="358" ry="260" />
        <g className="home-question-space-paths">
          <path pathLength="1" d="M 180 275 C 385 250 340 415 555 420 M 166 600 C 390 605 345 490 545 485 M 455 112 C 475 245 575 245 610 335 M 988 147 C 969 252 875 270 830 330 M 1280 275 C 1115 265 1100 407 900 415 M 1290 610 C 1090 590 1090 480 890 490 M 465 770 C 470 642 595 663 610 570 M 986 777 C 975 654 860 650 830 570" />
        </g>
        <g className="home-question-space-map-nodes"><circle cx="385" cy="356" r="5" /><circle cx="387" cy="554" r="5" /><circle cx="514" cy="258" r="4" /><circle cx="945" cy="259" r="4" /><circle cx="1070" cy="352" r="5" /><circle cx="1055" cy="547" r="5" /><circle cx="539" cy="653" r="4" /><circle cx="916" cy="662" r="4" /></g>
      </svg>
      <div className="home-question-space-copy">
        <p className="home-question-space-eyebrow" data-home-animate><Orbit aria-hidden="true" />{t("Where ideas begin")}</p>
        <h2 id="home-question-space-heading" data-home-animate>{t("One question.")}<br /><span>{t("A new direction.")}</span></h2>
        <p className="home-question-space-description" data-home-animate>{t("Every research journey starts with curiosity. Follow a question, connect the evidence and see where it takes you.")}</p>
        <div className="home-question-space-actions" data-home-animate>
          <a href="#home-research-heading" className="home-question-space-primary">{t("Ask your question")}<ArrowRight aria-hidden="true" /></a>
          <Link to="/research-gaps" className="home-question-space-secondary">{t("Explore research directions")}<ArrowUpRight aria-hidden="true" /></Link>
        </div>
        <p className="home-question-space-note">{t("Example questions to inspire your next search.")}</p>
      </div>

      <ul className="home-question-space-prompts" aria-label={t("Research questions to explore")}>
        {prompts.map((prompt, index) => <li key={prompt.field} className={`home-question-space-prompt home-question-space-prompt-${index + 1}`} data-home-animate>
          <Link to={`/literature?q=${encodeURIComponent(t(prompt.question))}`} className="home-question-space-card">
            <div className="home-question-space-card-heading"><span className="home-question-space-icon"><prompt.icon aria-hidden="true" /></span><span>{t(prompt.field)}</span><span className="home-question-space-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></div>
            <p>{t(prompt.question)}</p>
            <div className="home-question-space-card-footer"><span>{t("Explore this question")}</span><ArrowUpRight aria-hidden="true" /></div>
          </Link>
        </li>)}
      </ul>

      <div className="home-question-space-footnotes" aria-hidden="true">
        <span><Orbit />{t("Follow your curiosity")}</span><span><Network />{t("Connect the evidence")}</span>
      </div>
    </div>
  </section>;
}
