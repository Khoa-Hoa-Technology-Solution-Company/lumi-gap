import React, { useMemo } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { FolderPlus, Loader2, Folder, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { projectsApi } from "@/features/projects/api/projects.api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";

export interface AddToProjectDropdownProps {
  paperId: string;
  paper?: { id?: string; _id?: string } | null;
  children?: React.ReactNode | ((props: { isAdded: boolean; addedCount: number }) => React.ReactNode);
}

export function AddToProjectDropdown({ paperId, paper, children }: AddToProjectDropdownProps) {
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const { data: projects, isLoading } = useProjects({ enabled: Boolean(currentUser) });
  const queryClient = useQueryClient();

  const paperIdsToCheck = useMemo(() => {
    const ids = new Set<string>();
    if (paperId) ids.add(String(paperId).trim().toLowerCase());
    if (paper?.id) ids.add(String(paper.id).trim().toLowerCase());
    if (paper?._id) ids.add(String(paper._id).trim().toLowerCase());
    return ids;
  }, [paperId, paper]);

  const checkProjectHasPaper = (proj: any) => {
    if (!proj?.papers || !Array.isArray(proj.papers)) return false;
    return proj.papers.some((p: any) => {
      if (!p) return false;
      const target = p.targetId;
      const directId = typeof target === "object" && target !== null
        ? (target._id || target.id)
        : target;
      if (directId && paperIdsToCheck.has(String(directId).trim().toLowerCase())) return true;
      if (p.paperId && paperIdsToCheck.has(String(p.paperId).trim().toLowerCase())) return true;
      if (p.id && paperIdsToCheck.has(String(p.id).trim().toLowerCase())) return true;
      if (typeof target === "object" && target !== null) {
        if (target.id && paperIdsToCheck.has(String(target.id).trim().toLowerCase())) return true;
        if (target._id && paperIdsToCheck.has(String(target._id).trim().toLowerCase())) return true;
      }
      return false;
    });
  };

  const addedProjects = useMemo(() => {
    if (!projects || !projects.length) return [];
    return projects.filter(checkProjectHasPaper);
  }, [projects, paperIdsToCheck]);

  const isAlreadyInAnyProject = addedProjects.length > 0;
  const addedCount = addedProjects.length;

  const addMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.addPaper(projectId, { paperId }),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("Added paper to project") || "Đã thêm bài báo vào dự án");
    },
    onError: () => {
      toast.error(t("Failed to add paper. It might already be in the project.") || "Không thể thêm bài báo. Có thể bài đã có trong dự án.");
    }
  });

  if (!currentUser) return null;

  let triggerContent: React.ReactNode;
  if (typeof children === "function") {
    triggerContent = children({ isAdded: isAlreadyInAnyProject, addedCount });
  } else if (children) {
    triggerContent = children;
  } else {
    triggerContent = (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 rounded-full transition-colors ${
          isAlreadyInAnyProject
            ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50"
            : "text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
        }`}
        title={isAlreadyInAnyProject ? (t("Đã thêm vào dự án") || "Đã thêm vào dự án") : (t("Add to Project") || "Thêm vào dự án")}
        onClick={(e) => e.stopPropagation()}
      >
        {isAlreadyInAnyProject ? (
          <Check className="w-4 h-4" />
        ) : (
          <FolderPlus className="w-4 h-4" />
        )}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {triggerContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-68 bg-white dark:bg-slate-950 p-2 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="flex items-center text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">
          <FolderPlus className="w-3.5 h-3.5 mr-2" />
          {t("Add to Project") || "Thêm vào dự án"}
        </DropdownMenuLabel>

        {isLoading ? (
          <div className="py-4 text-sm text-center text-slate-500 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t("Loading...") || "Đang tải dự án..."}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="flex flex-col gap-1 mt-1 max-h-72 overflow-y-auto">
            {projects.map((project) => {
              const isAlreadyIn = checkProjectHasPaper(project);
              const paperCount = project.paperCount ?? project.papers?.length ?? 0;
              return (
                <DropdownMenuItem
                  key={project._id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAlreadyIn) {
                      addMutation.mutate(project._id as string);
                    }
                  }}
                  disabled={addMutation.isPending || isAlreadyIn}
                  className={`rounded-lg py-2.5 px-3 transition-colors border border-transparent flex items-center justify-between gap-2 ${
                    isAlreadyIn
                      ? "opacity-90 bg-slate-50/70 dark:bg-slate-900/50 cursor-default"
                      : "cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-900/30 dark:focus:text-blue-300"
                  }`}
                >
                  <div className="flex items-center flex-1 min-w-0 gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isAlreadyIn
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      {isAlreadyIn ? <Check className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                    </div>
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="font-semibold text-sm truncate text-slate-800 dark:text-slate-200">{project.title}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        <span>{paperCount} {paperCount === 1 ? 'bài báo' : 'bài báo'}</span>
                      </div>
                    </div>
                  </div>
                  {isAlreadyIn && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0">
                      <Check className="w-3 h-3" />
                      {t("Đã thêm") || "Đã thêm"}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ) : (
          <div className="py-4 px-2 text-center flex flex-col items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t("No projects available.") || "Chưa có dự án nào."}</p>
            <Link to="/projects">
              <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs font-semibold">
                <Plus className="w-3.5 h-3.5" />
                {t("Create New Project") || "Tạo dự án mới"}
              </Button>
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
