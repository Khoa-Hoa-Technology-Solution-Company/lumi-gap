import { useSearchParams } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import {
  GraduationCap,
  Sparkles,
  Plus,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { canLeaveWorkspace } from "./workspace-common";
import type { ProjectTab } from "./project-section-nav";

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

  return (
    <section
      className="mb-5 rounded-2xl border border-border/80 bg-card/95 p-3.5 sm:p-4 shadow-xs"
      aria-label="Research Journey Workspace"
      data-no-i18n
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
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
    </section>
  );
}

