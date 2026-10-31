import { useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { canLeaveWorkspace } from "./workspace-common";
import { CollaborativeLibrary } from "./collaborative-library";
import { MyWorkView } from "./my-work-view";
import { ScreeningQueueView } from "./screening-queue-view";
import { MyProposalsView } from "./my-proposals-view";
import { ScreeningWorkspace } from "./screening-workspace";
import { ResearchEvidence } from "./research-evidence";
import { ReadingPaperModal } from "./reading-paper-modal";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Layers,
  UserCheck,
  BookOpen,
  Table,
  FolderOpen,
  Sliders,
} from "lucide-react";
import "../project-research.css";

export function ResearchLiterature({
  projectId,
  readOnly,
  children,
  onAddPaper,
}: {
  projectId: string;
  readOnly: boolean;
  children: ReactNode;
  onAddPaper?: () => void;
}) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();

  // Primary view: defaults to "my-work"
  const view = params.get("view") ?? "my-work";
  const [activePaperId, setActivePaperId] = useState<string | null>(params.get("paper"));

  useEffect(() => {
    setActivePaperId(params.get("paper"));
  }, [params]);

  const change = async (value: string) => {
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params);
    next.set("view", value);
    setParams(next, { replace: true });
  };

  const openPaper = (paperId: string) => {
    setActivePaperId(paperId);
    const next = new URLSearchParams(params);
    next.set("paper", paperId);
    setParams(next);
  };

  const closePaper = () => {
    setActivePaperId(null);
    const next = new URLSearchParams(params);
    next.delete("paper");
    setParams(next);
  };

  return (
    <div className="research-workflow" data-no-i18n>
      {/* Task-Oriented Redesigned Papers Navigation */}
      <div className="papers-workspace-nav-bar">
        <nav className="papers-primary-tabs" aria-label="Không gian làm việc bài báo">
          <button
            type="button"
            className={`papers-nav-tab ${view === "my-work" ? "active" : ""}`}
            onClick={() => void change("my-work")}
          >
            <Briefcase size={15} className="tab-icon" />
            <span>Việc của tôi</span>
          </button>

          <button
            type="button"
            className={`papers-nav-tab ${view === "queue" ? "active" : ""}`}
            onClick={() => void change("queue")}
          >
            <Layers size={15} className="tab-icon" />
            <span>Hàng đợi đánh giá</span>
          </button>

          <button
            type="button"
            className={`papers-nav-tab ${view === "my-proposals" ? "active" : ""}`}
            onClick={() => void change("my-proposals")}
          >
            <UserCheck size={15} className="tab-icon" />
            <span>Tôi đã đề xuất</span>
          </button>

          <button
            type="button"
            className={`papers-nav-tab ${view === "library" ? "active" : ""}`}
            onClick={() => void change("library")}
          >
            <BookOpen size={15} className="tab-icon" />
            <span>Thư viện</span>
          </button>
        </nav>

        {/* Secondary Navigation Tools */}
        <div className="papers-secondary-tools">
          <Button
            variant={view === "evidence" ? "default" : "ghost"}
            size="sm"
            className="secondary-tool-btn"
            onClick={() => void change("evidence")}
          >
            <Table size={13} className="mr-1.5" />
            {t("Evidence Matrix")}
          </Button>

          <Button
            variant={view === "organize" ? "default" : "ghost"}
            size="sm"
            className="secondary-tool-btn"
            onClick={() => void change("organize")}
          >
            <FolderOpen size={13} className="mr-1.5" />
            {t("Notes & Sources")}
          </Button>

          <Button
            variant={view === "screening" ? "default" : "ghost"}
            size="sm"
            className="secondary-tool-btn text-muted-foreground"
            onClick={() => void change("screening")}
            title="Quy trình và kiểm soát sàng lọc nâng cao"
          >
            <Sliders size={13} className="mr-1.5" />
            {t("Review Workflow")}
          </Button>
        </div>
      </div>

      {view === "evidence" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => void change("my-work")}
        >
          ← Quay lại Việc của tôi
        </Button>
      )}

      {/* Main View Renderer */}
      {view === "my-work" ? (
        <MyWorkView
          key={`my-work-${projectId}`}
          projectId={projectId}
          readOnly={readOnly}
          onOpenPaper={openPaper}
          onSwitchView={change}
          onAddPaper={onAddPaper}
        />
      ) : view === "queue" ? (
        <ScreeningQueueView
          key={`queue-${projectId}`}
          projectId={projectId}
          readOnly={readOnly}
          onOpenPaper={openPaper}
          onAddPaper={onAddPaper}
        />
      ) : view === "my-proposals" ? (
        <MyProposalsView
          key={`my-proposals-${projectId}`}
          projectId={projectId}
          readOnly={readOnly}
          onOpenPaper={openPaper}
          onAddPaper={onAddPaper}
        />
      ) : view === "library" ? (
        <CollaborativeLibrary
          key={`library-${projectId}`}
          projectId={projectId}
          readOnly={readOnly}
          onAdd={onAddPaper}
        />
      ) : view === "screening" ? (
        <ScreeningWorkspace key={`screening-${projectId}`} projectId={projectId} readOnly={readOnly} />
      ) : view === "evidence" ? (
        <ResearchEvidence projectId={projectId} readOnly={readOnly} />
      ) : (
        children
      )}

      {/* Shared Reading & Assessment Dialog for any view outside library */}
      {activePaperId && view !== "library" && (
        <ReadingPaperModal
          projectId={projectId}
          paperId={activePaperId}
          readOnly={readOnly}
          onClose={closePaper}
        />
      )}
    </div>
  );
}
