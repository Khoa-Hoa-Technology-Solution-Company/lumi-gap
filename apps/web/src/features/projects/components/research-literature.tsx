import { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { canLeaveWorkspace } from "./workspace-common";
import { CollaborativeLibrary } from "./collaborative-library";
import { MyWorkView } from "./my-work-view";
import { ScreeningQueueView } from "./screening-queue-view";
import { MyProposalsView } from "./my-proposals-view";
import { ScreeningWorkspace } from "./screening-workspace";
import { ResearchEvidence } from "./research-evidence";
import { LiteratureMatrixView } from "./literature-matrix";
import { ResearchLimitations } from "./research-limitations";
import { LiteratureTopicClustersView } from "./literature-topic-clusters";
import { ReadingPaperModal } from "./reading-paper-modal";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Layers,
  UserCheck,
  BookOpen,
  FolderOpen,
  FolderKanban,
  Sliders,
} from "lucide-react";
import {
  buildLiteratureViewParams,
  resolvePrimaryLiteratureTab,
  type PrimaryLiteratureTab,
} from "../utils/literature-navigation";
import "../project-research.css";

const PRIMARY_TABS: Array<{
  id: PrimaryLiteratureTab;
  targetView: string;
  label: string;
  title?: string;
}> = [
  { id: "my-work", targetView: "my-work", label: "Việc của tôi" },
  { id: "queue", targetView: "queue", label: "Hàng đợi đánh giá" },
  { id: "library", targetView: "library", label: "Thư viện" },
  {
    id: "analysis",
    targetView: "clusters",
    label: "Phân tích tài liệu",
    title: "Phân cụm theo chủ đề, phương pháp và so sánh bài báo",
  },
];

const ANALYSIS_SUBTABS = [
  { view: "clusters", label: "Chủ đề & So sánh" },
  { view: "matrix", label: "Ma trận tài liệu" },
  { view: "limitations", label: "Hạn chế nghiên cứu" },
];

const QUEUE_SUBTABS = [
  { view: "queue" as const, label: "Hàng đợi chung" },
  { view: "my-proposals" as const, label: "Tôi đã đề xuất" },
];

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
  const primaryTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const analysisTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const queueTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Actual subview comes from the `view` URL search param (defaults to "my-work").
  const view = params.get("view") ?? "my-work";
  const primaryTab = resolvePrimaryLiteratureTab(view);
  const [activePaperId, setActivePaperId] = useState<string | null>(params.get("paper"));

  useEffect(() => {
    setActivePaperId(params.get("paper"));
  }, [params]);

  const change = async (value: string) => {
    if (!(await canLeaveWorkspace())) return;
    setParams(buildLiteratureViewParams(params, value), { replace: true });
  };

  const openPaper = (paperId: string, context?: { roundId: string; section: string }) => {
    setActivePaperId(paperId);
    const next = new URLSearchParams(params);
    next.delete("round"); next.delete("section");
    if (context) { next.set("round", context.roundId); next.set("section", context.section); }
    next.set("paper", paperId);
    setParams(next);
  };

  const closePaper = () => {
    setActivePaperId(null);
    const next = new URLSearchParams(params);
    next.delete("paper");
    next.delete("round"); next.delete("section");
    setParams(next);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    refs: Array<HTMLButtonElement | null>,
    items: Array<{ targetView: string }>,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    refs[nextIndex]?.focus();
    void change(items[nextIndex]!.targetView);
  };

  const renderPrimaryIcon = (id: PrimaryLiteratureTab) => {
    if (id === "my-work") return <Briefcase size={15} className="tab-icon" aria-hidden="true" />;
    if (id === "queue") return <Layers size={15} className="tab-icon" aria-hidden="true" />;
    if (id === "library") return <BookOpen size={15} className="tab-icon" aria-hidden="true" />;
    return <FolderKanban size={15} className="tab-icon" aria-hidden="true" />;
  };

  const activePrimaryTabButtonId = `literature-primary-tab-${primaryTab}`;

  return (
    <div className="research-workflow" data-no-i18n>
      {/* Unified 4-Tab Primary Navigation */}
      <div className="papers-workspace-nav-bar">
        <nav
          className="papers-primary-tabs"
          role="tablist"
          aria-label="Không gian làm việc tài liệu nghiên cứu"
        >
          {PRIMARY_TABS.map((tab, index) => {
            const active = primaryTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => { primaryTabRefs.current[index] = el; }}
                id={`literature-primary-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="research-literature-tabpanel"
                tabIndex={active ? 0 : -1}
                className={`papers-nav-tab ${active ? "active" : ""}`}
                title={tab.title}
                onClick={() => void change(tab.targetView)}
                onKeyDown={(e) =>
                  handleTabKeyDown(
                    e,
                    index,
                    primaryTabRefs.current,
                    PRIMARY_TABS.map((item) => ({ targetView: item.targetView })),
                  )
                }
              >
                {renderPrimaryIcon(tab.id)}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Preserve hidden legacy Notes & Sources entry for compatibility */}
        <Button
          variant={view === "organize" ? "default" : "ghost"}
          size="sm"
          className="sr-only"
          tabIndex={-1}
          onClick={() => void change("organize")}
        >
          <FolderOpen size={13} className="mr-1.5" aria-hidden="true" />
          {t("Notes & Sources")}
        </Button>
      </div>

      {/* Queue Secondary Navigation */}
      {primaryTab === "queue" && (
        <div className="papers-subnav-bar" aria-label="Điều hướng hàng đợi đánh giá">
          <div
            className="papers-subnav-tabs"
            role="tablist"
            aria-label="Phân loại hàng đợi đánh giá"
          >
            {QUEUE_SUBTABS.map((sub, index) => {
              const active = view === sub.view;
              return (
                <button
                  key={sub.view}
                  ref={(el) => { queueTabRefs.current[index] = el; }}
                  id={`literature-queue-tab-${sub.view}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="research-literature-tabpanel"
                  tabIndex={active || (view === "screening" && index === 0) ? 0 : -1}
                  className={`papers-subnav-tab ${active ? "active" : ""}`}
                  onClick={() => void change(sub.view)}
                  onKeyDown={(e) =>
                    handleTabKeyDown(
                      e,
                      index,
                      queueTabRefs.current,
                      QUEUE_SUBTABS.map((item) => ({ targetView: item.view })),
                    )
                  }
                >
                  {sub.view === "queue" ? (
                    <Layers size={14} className="tab-icon" aria-hidden="true" />
                  ) : (
                    <UserCheck size={14} className="tab-icon" aria-hidden="true" />
                  )}
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant={view === "screening" ? "secondary" : "outline"}
            size="sm"
            aria-pressed={view === "screening"}
            className={`papers-queue-workflow-btn ${view === "screening" ? "active" : ""}`}
            onClick={() => void change("screening")}
            title="Quy trình và kiểm soát sàng lọc nâng cao"
          >
            <Sliders size={13} className="mr-1.5" aria-hidden="true" />
            <span>Quy trình sàng lọc</span>
          </Button>
        </div>
      )}

      {/* Analysis Workspace Header */}
      {primaryTab === "analysis" && (
        <div className="analysis-workspace-chrome">
          <header className="analysis-workspace-header">
            <h2 className="analysis-workspace-title">Phân tích tài liệu</h2>
            <p className="analysis-workspace-subtitle">
              So sánh các công trình, tổng hợp bằng chứng và xác định hạn chế để phát triển hướng nghiên cứu.
            </p>
          </header>
          <div className="analysis-subnav-bar papers-subnav-bar">
            <nav role="tablist" aria-label="Phân tích tài liệu" className="papers-subnav-tabs">
              {ANALYSIS_SUBTABS.map((tab, index) => (
                <button key={tab.view} ref={el => { analysisTabRefs.current[index] = el; }}
                  type="button" role="tab" aria-selected={view === tab.view}
                  aria-controls="research-literature-tabpanel" tabIndex={view === tab.view ? 0 : -1}
                  className={`papers-subnav-tab ${view === tab.view ? "active" : ""}`}
                  onClick={() => void change(tab.view)}
                  onKeyDown={event => handleTabKeyDown(event, index, analysisTabRefs.current, ANALYSIS_SUBTABS.map(item => ({ targetView: item.view })))}>{tab.label}</button>
              ))}
            </nav>
          </div>
        </div>
      )}

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
      <div
        id="research-literature-tabpanel"
        role="tabpanel"
        aria-labelledby={activePrimaryTabButtonId}
        className="min-w-0"
      >
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
        ) : view === "matrix" ? (
          <LiteratureMatrixView projectId={projectId} readOnly={readOnly} />
        ) : view === "limitations" ? (
          <ResearchLimitations projectId={projectId} readOnly={readOnly} />
        ) : primaryTab === "analysis" ? (
          <LiteratureTopicClustersView
            key={`clusters-${projectId}`}
            projectId={projectId}
            readOnly={readOnly}
            onOpenPaper={openPaper}
          />
        ) : (
          children
        )}
      </div>

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
