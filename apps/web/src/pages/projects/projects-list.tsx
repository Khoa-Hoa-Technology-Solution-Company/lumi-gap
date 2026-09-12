import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects, useCreateProject } from "@/features/projects/hooks/use-projects";
import { FolderGit2, Users, FileText, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function ProjectsListPage() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const navigate = useNavigate();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const newProject = await createProject.mutateAsync({ title, description });
      toast.success("Project created successfully");
      setIsDialogOpen(false);
      setTitle("");
      setDescription("");
      navigate(`/projects/${newProject._id}`);
    } catch (err) {
      toast.error("Failed to create project");
    }
  };

  return (
    <main className="container max-w-7xl py-12 md:py-16">
      <PageHeader
        title="Research Projects"
        description="Organise papers, members, and analytical reports under unified workspaces."
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full px-6 shadow-sm">
                <Sparkles className="mr-2 h-4 w-4" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-xl tracking-tight">Create workspace</DialogTitle>
                <DialogDescription>
                  Give your new research project a clear focus.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Project Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. LLM in Education"
                    className="h-11 rounded-lg"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description <span className="opacity-50">(optional)</span></Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the goals"
                    className="h-11 rounded-lg"
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-full">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createProject.isPending || !title.trim()} className="rounded-full px-8">
                    {createProject.isPending ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/30 px-6 py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm mb-6">
            <FolderGit2 className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-2xl font-semibold tracking-tight mb-2">No projects yet</h3>
          <p className="max-w-md text-muted-foreground mb-8">
            Workspaces are where you collect papers, collaborate with members, and generate deep AI research gaps.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="rounded-full px-8 bg-background shadow-sm hover:shadow-md transition-all">
            Start your first project
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-8">
          {projects?.map((project) => (
            <Link key={project._id} to={`/projects/${project._id}`} className="group block h-full">
              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/10 bg-gradient-to-b from-white to-slate-50/50 dark:from-zinc-900 dark:to-zinc-950 p-7 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/30">
                {/* Vibrant top accent line on hover */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                
                <div className="relative z-10 flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-colors group-hover:scale-105 duration-500">
                    <FolderGit2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1 pt-1 min-w-0">
                    <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white line-clamp-1 mb-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {project.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[2.5rem] leading-relaxed">
                      {project.description || "No description provided."}
                    </p>
                  </div>
                </div>
                
                <div className="relative z-10 mt-8 flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-5">
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-white/5">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span>{project.papers?.length || 0}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-white/5">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span>{project.members?.length || 0}</span>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 transition-colors group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20">
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

