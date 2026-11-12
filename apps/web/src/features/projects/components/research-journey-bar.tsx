import { Link, useSearchParams } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import {
  Compass,
  BookOpen,
  Layers,
  FileCode2,
  ClipboardCheck,
  GraduationCap,
  ArrowRight,
  Sparkles,
  Plus,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { canLeaveWorkspace } from "./workspace-common";
import type { ProjectTab } from "./project-section-nav";

export interface ResearchJourneyStage {
  key: "overview" | "discover" | "literature" | "manuscript" | "review";
  title: string;
  subtitle: string;
  tab: ProjectTab;
  query?: Record<string, string>;
  icon: typeof Compass;
  badge?: string | number;
}

export function ResearchJourneyBar({
  project,
  activeTab,
  onAddPaper,
}: {
  project: IProject;
  activeTab: ProjectTab;
  onAddPaper?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paperView = searchParams.get("view") ?? "";
  const paperCount = project.paperCount ?? project.papers?.length ?? 0;

  const isDiscoverActive =
    activeTab === "papers" &&
    !["matrix", "limitations", "evidence", "clusters"].includes(paperView);
  const isLiteratureActive =
    activeTab === "gaps" ||
    (activeTab === "papers" &&
      ["matrix", "limitations", "evidence", "clusters"].includes(paperView));
  const isManuscriptActive = activeTab === "manuscripts";
  const isReviewActive = activeTab === "submissions" || activeTab === "contributions";
  const isOverviewActive =
    activeTab === "overview" || activeTab === "plan" || activeTab === "tasks";

  const activeStageKey: ResearchJourneyStage["key"] = isDiscoverActive
    ? "discover"
    : isLiteratureActive
    ? "literature"
    : isManuscriptActive
    ? "manuscript"
    : isReviewActive
    ? "review"
    : "overview";

  const stages: ResearchJourneyStage[] = [
    {
      key: "overview",
      title: "Overview",
      subtitle: "Plan, RQs & Progress",
      tab: "overview",
      icon: Compass,
    },
    {
      key: "discover",
      title: "Discover Papers",
      subtitle: "Search, Screen & Read",
      tab: "papers",
      query: { view: "library" },
      icon: BookOpen,
      badge: paperCount > 0 ? paperCount : undefined,
    },
    {
      key: "literature",
      title: "Literature Review",
      subtitle: "Clusters, Matrix & Synthesis",
      tab: "papers",
      query: { view: "clusters" },
      icon: Layers,
    },
    {
      key: "manuscript",
      title: "Manuscript",
      subtitle: "Write LaTeX & Cite",
      tab: "manuscripts",
      icon: FileCode2,
    },
    {
      key: "review",
      title: "Review & Submit",
      subtitle: "AI Pre-Review, Rubric & CRediT",
      tab: "submissions",
      icon: ClipboardCheck,
    },
  ];

  const navigateTo = async (tab: ProjectTab, query?: Record<string, string>) => {
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams();
    const currentQ = searchParams.get("q");
    if (currentQ) next.set("q", currentQ);
    next.set("tab", tab);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        next.set(k, v);
      }
    }
    setSearchParams(next, { replace: true });
  };

  // Non-rigid next-action recommendation based on current state
  const nextRecommendation = (() => {
    if (paperCount === 0) {
      return {
        label: "Start by discovering and adding papers to your project library",
        cta: "Discover Papers",
        action: () => (onAddPaper ? onAddPaper() : void navigateTo("papers", { view: "library" })),
      };
    }
    if (activeStageKey === "discover") {
      return {
        label: "Group papers by topic & methodology or extract evidence for your synthesis",
        cta: "Open Topic Literature Review",
        action: () => void navigateTo("papers", { view: "clusters" }),
      };
    }
    if (activeStageKey === "literature") {
      return {
        label: "Synthesize evidence across studies or draft your LaTeX manuscript with traceable citations",
        cta: "Open Synthesis & Gaps",
        action: () => void navigateTo("gaps", { research: "synthesis" }),
      };
    }
    if (activeStageKey === "manuscript") {
      return {
        label: "Create an immutable manuscript snapshot for AI Pre-Review and Lecturer Rubric Feedback",
        cta: "Go to Review & Submit",
        action: () => void navigateTo("submissions"),
      };
    }
    if (activeStageKey === "review") {
      return {
        label: "Confirm CRediT contributions, author order, and research integrity checks before final package export",
        cta: "Authorship & Integrity",
        action: () => void navigateTo("contributions"),
      };
    }
    return {
      label: `${paperCount} paper${paperCount === 1 ? "" : "s"} in library — continue screening, synthesizing literature, or drafting your manuscript`,
      cta: "Literature Review",
      action: () => void navigateTo("papers", { view: "clusters" }),
    };
  })();

  return (
    <section
      className="mb-5 rounded-2xl border border-border/80 bg-card/95 p-3.5 sm:p-4 shadow-xs"
      aria-label="Research Journey Workspace"
      data-no-i18n
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" />
            Research Journey
          </span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Discover → Understand → Synthesize → Write → Review → Submit
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onAddPaper && project.status !== "ARCHIVED" && project.accessRole && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold gap-1"
              onClick={onAddPaper}
            >
              <Plus className="h-3.5 w-3.5" />
              Discover / Add Paper
            </Button>
          )}
          <Button
            type="button"
            variant={activeTab === "contributions" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs font-semibold gap-1.5"
            onClick={() => void navigateTo("contributions")}
          >
            <Award className="h-3.5 w-3.5 text-amber-500" />
            <span>Authorship & CRediT</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === "support" ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs font-semibold gap-1.5 border-purple-500/30 hover:border-purple-500/60"
            onClick={() => void navigateTo("support")}
          >
            <GraduationCap className="h-3.5 w-3.5 text-purple-500" />
            <span>Mentorship</span>
          </Button>
        </div>
      </div>

      {/* 5 Core Journey Stages — Non-rigid free navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const active = activeStageKey === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => void navigateTo(stage.tab, stage.query)}
              aria-current={active ? "step" : undefined}
              className={`group flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                active
                  ? "border-primary bg-primary/8 shadow-2xs ring-1 ring-primary/25"
                  : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    0{index + 1}
                  </span>
                  {stage.badge !== undefined && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-bold text-primary tabular-nums">
                      {stage.badge}
                    </span>
                  )}
                </div>
                <div
                  className={`truncate text-xs font-bold ${
                    active ? "text-primary" : "text-foreground"
                  }`}
                >
                  {stage.title}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {stage.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Contextual Next Action & Quick Sub-Navigation */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
          <span className="font-semibold text-foreground shrink-0">Suggested next action:</span>
          <span className="truncate">{nextRecommendation.label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeStageKey === "literature" && (
            <>
              <Link
                to={`/projects/${encodeURIComponent(project._id)}?tab=papers&view=clusters`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Topic Clusters
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link
                to={`/projects/${encodeURIComponent(project._id)}?tab=papers&view=matrix`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Evidence Matrix
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link
                to={`/projects/${encodeURIComponent(project._id)}?tab=gaps&research=synthesis`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                AI Synthesis
              </Link>
              <span className="text-muted-foreground">·</span>
            </>
          )}
          <button
            type="button"
            onClick={nextRecommendation.action}
            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            <span>{nextRecommendation.cta}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
