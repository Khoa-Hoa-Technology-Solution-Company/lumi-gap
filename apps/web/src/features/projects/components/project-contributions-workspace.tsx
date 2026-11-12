import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { ContributionActivityPanel } from "./contribution-activity";
import { WorkContributionsPanel } from "./work-contributions";
import { ContributionAllocationPanel } from "./contribution-allocation";
import { AdvisorContributionsPanel } from "./advisor-contributions-panel";
import { PersonalContributionEvidencePanel } from "./personal-contribution-evidence-panel";
import { SubmissionReadinessPackage } from "./submission-readiness-package";
import { canLeaveWorkspace } from "./workspace-common";
import { ContributionOverviewPanel } from "./contribution-overview";
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
    value === "work" || value === "pending" || value === "overview" ||
    value === "activity" ||
    value === "advisors" ||
    value === "evidence" ||
    value === "readiness" ||
    value === "allocation"
      ? value
      : "work";

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
            "Record research work and evidence first. CRediT roles, team allocation and manuscript authorship are separate decisions.",
          )}
        </p>
      </header>
      <Link className="inline-block text-sm text-primary underline" to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}>{t("Authorship and submission")}</Link>
      <nav className="contribution-tabs" aria-label={t("Contribution sections")}>
        {[
          ["work", "Work contributions"],
          ["pending", "Pending acknowledgements"],
          ["overview", "Research contribution overview"],
          ["allocation", "Contribution allocation"],
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
        <details open={["advisors", "evidence", "activity"].includes(tab)} className="px-3 py-2"><summary className="cursor-pointer text-sm text-muted-foreground">{t("More contribution tools")}</summary><div className="mt-2 flex flex-wrap gap-2">{[["advisors", "Advisor contributions"], ["evidence", "My evidence & export"], ["activity", "Activity"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => void selectTab(key!)}>{t(label!)}</button>)}</div></details>
      </nav>
      {tab === "overview" ? <ContributionOverviewPanel projectId={projectId} /> : tab === "pending" ? <WorkContributionsPanel key="pending" projectId={projectId} currentUserId={currentUserId} readOnly={readOnly} initialFilter="PENDING" /> : tab === "activity" ? (
        <ContributionActivityPanel projectId={projectId} />
      ) : tab === "readiness" ? (
        <SubmissionReadinessPackage
          projectId={projectId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          readOnly={readOnly}
        />
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
