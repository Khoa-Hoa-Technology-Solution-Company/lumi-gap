import React from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { FolderPlus, Loader2, Folder, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { projectsApi } from "@/features/projects/api/projects.api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

export interface AddToProjectDropdownProps {
  paperId: string;
  children?: React.ReactNode;
}

export function AddToProjectDropdown({ paperId, children }: AddToProjectDropdownProps) {
  const currentUser = useAuthStore((state) => state.user);
  const { data: projects, isLoading } = useProjects({ enabled: Boolean(currentUser) });
  const queryClient = useQueryClient();
  
  const addMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.addPaper(projectId, { paperId }),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Added paper to project");
    },
    onError: () => {
      toast.error("Failed to add paper. It might already be in the project.");
    }
  });

  const availableProjects = projects?.filter(
    (p) => !p.papers?.some((paper) => {
      const id = typeof paper.targetId === 'object' && paper.targetId !== null ? (paper.targetId as any)._id : paper.targetId;
      return String(id) === String(paperId);
    })
  );

  if (!currentUser) return null;

  // If the user has projects but the paper is already in ALL of them, hide the button completely.
  if (!isLoading && projects && projects.length > 0 && availableProjects?.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" 
            title="Add to Project" 
            onClick={(e) => e.stopPropagation()}
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-white dark:bg-slate-950 p-2 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="flex items-center text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">
          <FolderPlus className="w-3.5 h-3.5 mr-2" />
          Add to Project
        </DropdownMenuLabel>
        
        {isLoading ? (
          <div className="py-4 text-sm text-center text-slate-500 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading projects...
          </div>
        ) : availableProjects && availableProjects.length > 0 ? (
          <div className="flex flex-col gap-1 mt-1">
            {availableProjects.map((project) => (
              <DropdownMenuItem 
                key={project._id} 
                onClick={(e) => {
                  e.stopPropagation();
                  addMutation.mutate(project._id as string);
                }}
                disabled={addMutation.isPending}
                className="cursor-pointer rounded-lg py-2.5 px-3 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 focus:bg-blue-50 focus:text-blue-700 dark:focus:bg-blue-900/30 dark:focus:text-blue-300 transition-colors border border-transparent"
              >
                <div className="flex items-center w-full gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Folder className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="font-semibold text-sm truncate text-slate-800 dark:text-slate-200">{project.title}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {project.papers?.length || 0} {(project.papers?.length === 1) ? 'paper' : 'papers'}
                    </span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        ) : (
          <div className="py-4 px-2 text-center flex flex-col items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No projects available.</p>
            <Link to="/projects">
              <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs font-semibold">
                <Plus className="w-3.5 h-3.5" />
                Create New Project
              </Button>
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
