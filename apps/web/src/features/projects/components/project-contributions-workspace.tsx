import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { ContributionActivityPanel } from "./contribution-activity";
import { WorkContributionsPanel } from "./work-contributions";
import { ContributionAllocationPanel } from "./contribution-allocation";
import { AdvisorContributionsPanel } from "./advisor-contributions-panel";
import { PersonalContributionEvidencePanel } from "./personal-contribution-evidence-panel";
import { canLeaveWorkspace } from "./workspace-common";
import "../project-contributions.css";

export function ProjectContributionsWorkspace({
  projectId,
  currentUserId,
  isOwner,
  readOnly,
}: {
  projectId: string;
  currentUserId: string;
  isOwner: boolean;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const value = params.get("contributionTab");
  const tab =
    value === "work" ||
    value === "activity" ||
    value === "advisors" ||
    value === "evidence" ||
    value === "allocation"
      ? value
      : "allocation";

  async function selectTab(nextKey: string) {
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params);
    next.set("contributionTab", nextKey);
    setParams(next);
  }

  return (
    <div className="contributions-workspace coord-panel" data-no-i18n>
      <header className="coord-heading">
        <h2>{t("Contributions")}</h2>
        <p>
          {t(
            "Manage agreed contribution percentages via the 4-category Contribution Matrix, supporting research evidence, and member confirmation.",
          )}
        </p>
      </header>
      <nav className="contribution-tabs" aria-label={t("Contribution sections")}>
        {[
          ["allocation", "Contribution allocation"],
          ["work", "Work contributions"],
          ["advisors", "Advisor contributions"],
          ["evidence", "My evidence & export"],
          ["activity", "Activity"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => void selectTab(key!)}
          >
            {t(label!)}
          </button>
        ))}
      </nav>
      {tab === "activity" ? (
        <ContributionActivityPanel projectId={projectId} />
      ) : tab === "work" ? (
        <WorkContributionsPanel projectId={projectId} currentUserId={currentUserId} readOnly={readOnly} />
      ) : tab === "advisors" ? (
        <AdvisorContributionsPanel projectId={projectId} />
      ) : tab === "evidence" ? (
        <PersonalContributionEvidencePanel projectId={projectId} />
      ) : (
        <ContributionAllocationPanel
          projectId={projectId}
          isOwner={isOwner}
          readOnly={readOnly}
          onOpenEvidenceTab={() => void selectTab("work")}
        />
      )}
    </div>
  );
}
