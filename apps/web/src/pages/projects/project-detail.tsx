import { AnalysisSetDiscovery } from "@/features/projects/components/analysis-set-discovery";
import { lazy, Suspense, useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useGaps } from "@/features/gaps";
import { GapDetailDrawer } from "@/features/gaps/components/gap-detail-drawer";
import { ProjectGapDiscovery } from "@/features/projects/components/project-gap-discovery";
import { ProjectResearchWorkspace } from "@/features/projects/components/project-research-workspace";
import { ProjectGapResults } from "@/features/projects/components/project-gap-results";
import { ProjectDiscussionPanel } from "@/features/projects/components/project-discussion-panel";
import { Link } from "react-router-dom";
import type { GapAnalysisResult, ResearchGapItem } from "@trend/shared-types";
import { ProjectLiteratureWorkspace } from "@/features/projects/components/project-literature-workspace";
import { ResearchLiterature } from "@/features/projects/components/research-literature";
import { resolveProjectTab, type ProjectTab } from "@/features/projects/components/project-section-nav";
import { WorkspaceOverviewPanel } from "@/features/projects/components/workspace-overview";
import { WorkspacePlanPanel } from "@/features/projects/components/workspace-plan";
import { WorkspaceTasksPanel } from "@/features/projects/components/workspace-tasks";
import { WorkspaceDiscussionsPanel } from "@/features/projects/components/workspace-discussions";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";
import { ProjectSectionContent } from "@/features/projects/components/project-section-content";
import "@/features/projects/project-workspace.css";
import { ProjectPaperPickerDialog, type PaperPickerSource } from "@/features/projects/components/project-paper-picker-dialog";

import { Archive, Loader2, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { MentorProjectPanel } from "@/pages/academics/academic-support";
import { ProjectTeamSettings } from "@/features/projects/components/project-team-settings";
import { ProjectNextSteps } from "@/features/projects/components/project-next-steps";
import { ProjectContributionsWorkspace } from "@/features/projects/components/project-contributions-workspace";
import { ManuscriptsPanel, type ManuscriptCreationDraft } from "@/features/manuscripts/manuscripts-panel";
import { useI18n } from "@/i18n";

const ProjectSubmissionsPanel = lazy(() => import("@/features/projects/components/project-submissions-panel").then(m => ({ default: m.ProjectSubmissionsPanel })));

export function ProjectDetailPage() {
  const currentUser = useAuthStore(s => s.user);
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError, error, isFetching, refetch } = useProject(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = resolveProjectTab(tabParam);
  useEffect(() => {
    if (tabParam !== "reports") return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", "manuscripts");
    setSearchParams(params, { replace: true });
  }, [tabParam, searchParams, setSearchParams]);
  const setActiveTab = async (tab: ProjectTab, settings = false) => {
    if (!(await canLeaveWorkspace())) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    params.delete("submission");
    if (settings) params.set("team", "settings"); else params.delete("team");
    setSearchParams(params, { replace: true });
  };
  const [autoOpenGap, setAutoOpenGap] = useState(false);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperPickerSource, setPaperPickerSource] = useState<PaperPickerSource>("search");
  const [manuscriptDraft, setManuscriptDraft] = useState<ManuscriptCreationDraft>();

  if (isLoading) {
    return (
      <div className="project-workspace" role="status" aria-busy="true">
        <span className="sr-only">{t("Loading projects...")}</span>
        <div className="project-page-width project-detail-page" aria-hidden="true">
          <Skeleton className="mb-[26px] h-5 w-40 rounded" />
          <div className="flex items-start gap-4">
            <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-md" />
            <div className="w-full max-w-lg space-y-3"><Skeleton className="h-4 w-32 rounded" /><Skeleton className="h-10 w-3/4 rounded" /></div>
          </div>
          <Skeleton className="mt-[22px] h-9 w-64 max-w-full rounded" />
          <div className="project-workspace-shell">
            <Skeleton className="h-[62px] w-full rounded-none" />
            <Skeleton className="mt-7 h-8 w-52 rounded" />
            <Skeleton className="mt-6 h-[310px] w-full rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    const unavailable = status === 403 || status === 404;
    return (
      <div className="project-workspace">
        <div className="project-page-width">
          <Link to="/projects" className="project-breadcrumb hover:text-primary">{t("Back to projects")}</Link>
          <div className="border-y py-12 text-center text-muted-foreground" role="status">
            <p>{isError && !unavailable ? t("The project could not be loaded. Refresh and try again.") : t("Project not found or you do not have access.")}</p>
            {isError && !unavailable ? <Button variant="outline" className="mt-4" disabled={isFetching} onClick={() => void refetch()}>{t("Try again")}</Button> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-workspace">
      <div className="project-page-width project-detail-page">

        {project.status === "ARCHIVED" ? (
          <p role="status" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground mb-4">
            <Archive className="h-4 w-4 shrink-0" />
            {t("Archived projects are read-only.")}
          </p>
        ) : null}

        {project.isPublicSummary ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-lg font-semibold">{project.title}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{t("Public project summary")}</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("Papers, member details, reports, candidate gaps, contributions and chat are available only to current project members.")}</p>
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <ProjectNextSteps
                key={project._id}
                project={project}
                onAddPaper={() => {
                  setPaperPickerSource("search");
                  setPaperPickerOpen(true);
                }}
                onNavigate={(tab, settings) => setActiveTab(tab, settings)}
              />
            )}
            <div className="project-workspace-shell">
        <ProjectSectionContent activeTab={activeTab}>
          {activeTab === "overview" && <section id="project-panel-overview" role="tabpanel" aria-labelledby="project-tab-overview"><WorkspaceOverviewPanel project={project} /></section>}
          {activeTab === "manuscripts" && <section id="project-panel-manuscripts" role="tabpanel" aria-labelledby="project-tab-manuscripts"><ManuscriptsPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} draft={manuscriptDraft} onDraftConsumed={() => setManuscriptDraft(undefined)} /></section>}
          {activeTab === "plan" && <section id="project-panel-plan" role="tabpanel" aria-labelledby="project-tab-plan"><WorkspacePlanPanel projectId={project._id} /></section>}
          {activeTab === "tasks" && <section id="project-panel-tasks" role="tabpanel" aria-labelledby="project-tab-tasks"><WorkspaceTasksPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></section>}
          {activeTab === "submissions" && <section id="project-panel-submissions" role="tabpanel" aria-labelledby="project-tab-submissions">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}><ProjectSubmissionsPanel projectId={project._id} projectTitle={project.title} readOnly={project.status === "ARCHIVED" || !project.accessRole} /></Suspense>
          </section>}
          {activeTab === "papers" && (
            <section id="project-panel-papers" role="tabpanel" aria-labelledby="project-tab-papers">
              <ResearchLiterature onAddPaper={() => { setPaperPickerSource("search"); setPaperPickerOpen(true); }} projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole}>
              <ProjectLiteratureWorkspace
                projectId={project._id}
                papers={project.papers}
                screeningMode={project.screeningMode}
                readOnly={project.status === "ARCHIVED" || !project.accessRole}
                onRequestAddPaper={(source = "search") => { setPaperPickerSource(source); setPaperPickerOpen(true); }}
                onViewEvidence={() => { setAutoOpenGap(false); setActiveTab("gaps"); }}
              />
              </ResearchLiterature>
            </section>
          )}
          {activeTab === "members" && (
            <section id="project-panel-members" role="tabpanel" aria-labelledby="project-tab-members">
              <ProjectTeamSettings key={project._id} project={project} />
            </section>
          )}
          {activeTab === "support" && <div role="tabpanel" id="project-panel-support" aria-labelledby="project-tab-support"><MentorProjectPanel projectId={id!} /></div>}
          {activeTab === "contributions" && (
            <section id="project-panel-contributions" role="tabpanel" aria-labelledby="project-tab-contributions">
              <ProjectContributionsWorkspace
                projectId={project._id}
                currentUserId={currentUser?.id ?? ""}
                isOwner={project.accessRole === "OWNER"}
                readOnly={project.status === "ARCHIVED"}
              />
            </section>
          )}
          {activeTab === "gaps" && (
            <section id="project-panel-gaps" role="tabpanel" aria-labelledby="project-tab-gaps">
              <ProjectResearchWorkspace projectId={project._id} readOnly={project.status === "ARCHIVED"}>
              <GapsTab
                projectId={project._id}
                defaultTopic={project.title}
                openOnInit={autoOpenGap}
                onOpenChange={setAutoOpenGap}
                onDraftProposal={project.status === "ARCHIVED" || !project.accessRole ? undefined : async (gap) => {
                  if (!(await canLeaveWorkspace())) return;
                  setManuscriptDraft({
                    title: `${t("Research proposal")}: ${gap.title}`.slice(0, 160),
                    description: (gap.suggestedResearchQuestion || gap.description || "").slice(0, 2000),
                    documentType: "RESEARCH_PROPOSAL",
                    template: "PROPOSAL",
                    researchLink: { kind: "GAP", id: gap.id },
                  });
                  const params = new URLSearchParams(searchParams);
                  params.set("tab", "manuscripts");
                  params.delete("submission");
                  params.delete("team");
                  setSearchParams(params, { replace: true });
                }}
              />
              </ProjectResearchWorkspace>
            </section>
          )}
          {activeTab === "chat" && (
            <section id="project-panel-chat" role="tabpanel" aria-labelledby="project-tab-chat">
              <WorkspaceDiscussionsPanel projectId={project._id} readOnly={project.status === "ARCHIVED" || !project.accessRole} owner={project.accessRole === "OWNER"} legacyChat={<ProjectDiscussionPanel
                projectId={project._id}
                paperCount={project.papers?.length || 0}
                ownerId={project.ownerId}
                onAddPapers={() => { if (project.status !== "ARCHIVED") { setPaperPickerSource("search"); setPaperPickerOpen(true); } }}
              />} />
            </section>
          )}
        </ProjectSectionContent>
        </div>
        <ProjectPaperPickerDialog
          initialSource={paperPickerSource}
          readOnly={project.status === "ARCHIVED" || !project.accessRole}
          projectId={project._id}
          papers={project.papers ?? []}
          open={paperPickerOpen}
          onOpenChange={setPaperPickerOpen}
        />
      </>)}
      </div>
    </div>
  );
}

function GapsTab({
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange,
  onDraftProposal
}: {
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDraftProposal?: (gap: ResearchGapItem) => void;
}) {
  const [page, setPage] = useState(1);
  const [gapParams] = useSearchParams();
  const analysisSetId = gapParams.get("analysisSet");
  const [latestAnalysis, setLatestAnalysis] = useState<GapAnalysisResult | null>(null);
  const { data: currentProject } = useProject(projectId);
  const readOnly = currentProject?.status === "ARCHIVED";
  const { data: gapsData, isLoading, isError, refetch } = useGaps({ projectId, analysisId: latestAnalysis?.id, status: "active", page, pageSize: 20, sortBy: "newest" }, latestAnalysis?.status === "ready");

  const [selectedGap, setSelectedGap] = useState<ResearchGapItem | null>(null);
  const { t } = useI18n();

  useEffect(() => { if (openOnInit) onOpenChange?.(false); }, [openOnInit, onOpenChange]);
  useEffect(() => { setPage(1); }, [latestAnalysis?.id]);

  return (
    <div className="space-y-4 mt-2">
      {analysisSetId ? <AnalysisSetDiscovery key={`${projectId}:${analysisSetId}`} projectId={projectId} setId={analysisSetId} readOnly={readOnly} onAnalysisChange={setLatestAnalysis} /> : <ProjectGapDiscovery key={projectId} projectId={projectId} defaultTopic={defaultTopic} readOnly={readOnly} onAnalysisChange={setLatestAnalysis} />}
      {latestAnalysis?.analysisMode === "DRAFT" && latestAnalysis.status === "ready" && <p className="screening-notice" data-no-i18n>Kết quả sơ bộ từ bộ bài nháp — cần kiểm chứng trước khi sử dụng trong nghiên cứu.</p>}
      {latestAnalysis?.status !== "ready" ? null : isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /></div>
      ) : isError ? (<section className="gap-discovery-results-error" role="alert" data-no-i18n><h3>{t("Could not load research directions")}</h3><p>{t("Your analysis is saved. Reload the results without starting another analysis.")}</p><Button type="button" variant="outline" onClick={() => void refetch()}>{t("Reload results")}</Button></section>) : gapsData?.data && gapsData.data.length > 0 ? (
        <>
          <ProjectGapResults projectId={projectId} gaps={gapsData.data} onOpen={setSelectedGap} />
          {gapsData.meta && gapsData.meta.totalPages > 1 && <div className="research-pagination"><Button variant="ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("Previous")}</Button><span>{t("Page {{page}}", { page })}</span><Button variant="ghost" disabled={page >= gapsData.meta.totalPages} onClick={() => setPage(value => value + 1)}>{t("Next")}</Button></div>}
        </>
      ) : (
        null
      )}

      <GapDetailDrawer
        researchProjectId={projectId}
        gap={gapsData?.data.find(item => item.id === selectedGap?.id) ?? selectedGap}
        isOpen={selectedGap !== null}
        onClose={() => setSelectedGap(null)}
        onDraftProposal={onDraftProposal ? (gap) => { setSelectedGap(null); onDraftProposal(gap); } : undefined}
      />
    </div>
  );
}
