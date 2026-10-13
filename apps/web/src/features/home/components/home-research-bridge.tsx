import { ArrowDown } from "lucide-react";
import { useI18n } from "@/i18n";
import "../home-research-bridge.css";

const prompts = [
  { label: "The findings", question: "What does the evidence tell us?" },
  { label: "The limits", question: "Where do the answers stop?" },
  { label: "The possibility", question: "What could you investigate next?" },
] as const;

export function HomeResearchBridge() {
  const { t } = useI18n();

  return <section id="home-research-bridge" className="home-research-bridge" aria-labelledby="home-research-bridge-heading" data-home-reveal>
    <div className="home-width home-research-bridge-inner">
      <div className="home-research-bridge-intro">
        <div>
          <p className="home-research-bridge-eyebrow" data-home-animate>{t("From a paper to a possibility")}</p>
          <h2 id="home-research-bridge-heading" data-home-animate>{t("Read a paper.")}<br /><span>{t("Find your next question.")}</span></h2>
        </div>
        <div className="home-research-bridge-aside" data-home-animate>
          <p>{t("A finding, a limitation, an unanswered detail. Your next research idea can begin with what you notice while reading.")}</p>
          <a href="#home-question-space">{t("Find a question to explore")}<ArrowDown aria-hidden="true" /></a>
        </div>
      </div>
      <ol className="home-research-bridge-prompts">
        {prompts.map((prompt, index) => <li key={prompt.label} data-home-animate>
          <div className="home-research-bridge-marker"><span>{String(index + 1).padStart(2, "0")}</span><span>{t(prompt.label)}</span></div>
          <p>{t(prompt.question)}</p>
        </li>)}
      </ol>
    </div>
  </section>;
}
