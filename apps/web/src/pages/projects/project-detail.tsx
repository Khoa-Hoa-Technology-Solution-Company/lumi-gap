import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useProject, useAddPaperToProject, useRemovePaperFromProject, useAddMemberToProject, useRemoveMemberFromProject } from "@/features/projects/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import { useReports, useCreateReport } from "@/features/reports/hooks/use-reports";
import { useGaps, useAnalyzeGap, useGapAnalysisStatus } from "@/features/gaps";
import { ProjectDiscussionPanel } from "@/features/projects/components/project-discussion-panel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { ReportLanguage } from "@trend/shared-types";
import { CompareTable } from "@/features/compare/components/compare-table";
import { useComparePapers } from "@/features/compare/hooks/use-compare";
function useSearchUsers(email: string) {
  return useQuery({
    queryKey: ["searchUsers", email],
    queryFn: async () => {
      if (!email || email.length < 2) return [];
      const res = await api.get<{ success: boolean; data: any[] }>(`/auth/search?email=${encodeURIComponent(email)}`);
      return res.data.data;
    },
    enabled: email.length >= 2,
  });
}

function useSearchPapers(query: string) {
  return useQuery({
    queryKey: ["searchPapers", query],
    queryFn: async () => {
      if (!query || query.length < 3) return [];
      const res = await api.get<{ success: boolean; data: any[] }>(`/papers?q=${encodeURIComponent(query)}&pageSize=10`);
      return res.data.data;
    },
    enabled: query.length >= 3,
  });
}
import { toast } from "sonner";
import { FileText, Users, Trash2, Plus, Loader2, CheckCircle2, XCircle, Sparkles, Zap, Search, ListFilter, MessageSquare } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function ProjectDetailPage() {
  const currentUser = useAuthStore(s => s.user);
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id);
  const [activeTab, setActiveTab] = useState<"papers" | "members" | "reports" | "gaps" | "chat">("papers");
  const [autoOpenReport, setAutoOpenReport] = useState(false);
  const [autoOpenGap, setAutoOpenGap] = useState(false);

  if (isLoading) {
    return (
      <main className="container py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </main>
    );
  }

  if (!project) {
    return (
      <main className="container py-8">
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Project not found or you do not have access.
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0a0a0a]">
      <main className="container max-w-6xl py-10 space-y-10">

        {/* Overview Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">{project.title}</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl text-lg leading-relaxed">{project.description || "No description provided."}</p>
          </div>

          <div className="flex gap-4 items-center shrink-0">
            <div className="flex flex-col items-center bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 rounded-2xl p-4 min-w-[120px] shadow-sm transition-transform hover:-translate-y-1 duration-300">
              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{project.papers?.length || 0}</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Papers</span>
            </div>
            <div className="flex flex-col items-center bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 rounded-2xl p-4 min-w-[120px] shadow-sm transition-transform hover:-translate-y-1 duration-300">
              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{project.members?.length || 0}</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Members</span>
            </div>
          </div>
        </div>

        {/* Underline Tabs */}
        <div className="border-b border-slate-200 dark:border-white/10 overflow-x-auto">
          <div className="flex gap-6 sm:gap-8 min-w-max pb-1" role="tablist" aria-label="Project sections">
            <button
              id="project-tab-papers"
              role="tab"
              aria-selected={activeTab === "papers"}
              aria-controls="project-panel-papers"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "papers" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("papers")}
            >
              Papers
              <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">{project.papers?.length || 0}</Badge>
              {activeTab === "papers" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-members"
              role="tab"
              aria-selected={activeTab === "members"}
              aria-controls="project-panel-members"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "members" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("members")}
            >
              Members
              <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">{project.members?.length || 0}</Badge>
              {activeTab === "members" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-reports"
              role="tab"
              aria-selected={activeTab === "reports"}
              aria-controls="project-panel-reports"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "reports" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("reports")}
            >
              Reports
              {activeTab === "reports" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-gaps"
              role="tab"
              aria-selected={activeTab === "gaps"}
              aria-controls="project-panel-gaps"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "gaps" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("gaps")}
            >
              Gaps
              {activeTab === "gaps" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

            <button
              id="project-tab-chat"
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-controls="project-panel-chat"
              className={`pb-3 text-sm font-semibold transition-all relative whitespace-nowrap shrink-0 ${
                activeTab === "chat" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              onClick={() => setActiveTab("chat")}
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                Chat
              </span>
              {activeTab === "chat" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />}
            </button>

          </div>
        </div>

        <div>
          {activeTab === "papers" && (
            <section id="project-panel-papers" role="tabpanel" aria-labelledby="project-tab-papers">
              <PapersTab
                projectId={project._id}
                papers={project.papers}
                currentUserId={currentUser?.id}
                ownerId={project.ownerId}
                onNavigateToReports={() => {
                  setActiveTab("reports");
                  setAutoOpenReport(true);
                }}
                onNavigateToGaps={() => {
                  setActiveTab("gaps");
                  setAutoOpenGap(true);
                }}
              />
            </section>
          )}
          {activeTab === "members" && (
            <section id="project-panel-members" role="tabpanel" aria-labelledby="project-tab-members">
              <MembersTab projectId={project._id} members={project.members} ownerId={project.ownerId} currentUserId={currentUser?.id} />
            </section>
          )}
          {activeTab === "reports" && (
            <section id="project-panel-reports" role="tabpanel" aria-labelledby="project-tab-reports">
              <ReportsTab
                projectId={project._id}
                defaultTopic={project.title}
                openOnInit={autoOpenReport}
                onOpenChange={setAutoOpenReport}
              />
            </section>
          )}
          {activeTab === "gaps" && (
            <section id="project-panel-gaps" role="tabpanel" aria-labelledby="project-tab-gaps">
              <GapsTab
                projectId={project._id}
                defaultTopic={project.title}
                openOnInit={autoOpenGap}
                onOpenChange={setAutoOpenGap}
              />
            </section>
          )}
          {activeTab === "chat" && (
            <section id="project-panel-chat" role="tabpanel" aria-labelledby="project-tab-chat">
              <ProjectDiscussionPanel
                projectId={project._id}
                paperCount={project.papers?.length || 0}
                ownerId={project.ownerId}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function ReportsTab({
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange
}: {
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void
}) {
  const { data: reports, isLoading } = useReports(projectId);
  const createReport = useCreateReport();

  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(defaultTopic || "");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<ReportLanguage>("auto");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [fast, setFast] = useState(true);

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Sync defaultTopic when dialog opens
  useEffect(() => {
    if (open && defaultTopic) {
      setTopic(defaultTopic);
    }
  }, [open, defaultTopic]);

  const handleGenerate = async () => {
    if (!query.trim()) {
      toast.error("Please enter a question for the AI to analyze");
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    if (fromYear && toYear && fromYear > toYear) {
      toast.error("Year From must be less than or equal to Year To");
      return;
    }

    try {
      await createReport.mutateAsync({
        query: query.trim(),
        topic: topic.trim() || undefined,
        language,
        deepAnalysis,
        fast,
        projectId,
        yearFrom: fromYear,
        yearTo: toYear
      });
      setOpen(false);
      setTopic(defaultTopic || "");
      setQuery("");
      setYearFrom("");
      setYearTo("");
      setLanguage("auto");
      setDeepAnalysis(false);
      setFast(true);
      toast.success("Report generation started");
    } catch (error: any) {
      console.error("Failed to create report:", error);
      const errMsg = error.response?.data?.error?.message || "Failed to create report. Please try again.";
      toast.error(errMsg);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Project Reports</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> New Report</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create AI Report</DialogTitle>
              <DialogDescription>
                Generate a comprehensive analysis report for this project.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="topic">Topic / Keyword</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. LLM in Education"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="query">Question</Label>
                <textarea
                  id="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What should the AI analyze?"
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-medium"
                />

                {/* PR1: Template query actions */}
                <div className="flex flex-wrap gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => setQuery("Summarize the key trends and methodologies in these papers.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Summarize Trends
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("Identify the major research gaps and literature scarcity in this project.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Find Gaps
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("Suggest future research directions and potential next steps based on these findings.")}
                    className="text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded transition-colors"
                  >
                    Next Steps
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="project-year-from">Year From</Label>
                  <Input
                    id="project-year-from"
                    type="number"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="2020"
                    className="h-10 text-center"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="project-year-to">Year To</Label>
                  <Input
                    id="project-year-to"
                    type="number"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="2026"
                    className="h-10 text-center"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="project-report-language">Report language</Label>
                <select
                  id="project-report-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as ReportLanguage)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="auto">Auto-detect from topic and question</option>
                  <option value="en">English</option>
                  <option value="vi">Vietnamese</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Choose English to force all report sections and research gaps to English.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} className="rounded border-gray-300" />
                <span className="font-semibold">Fast Mode</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deepAnalysis} onChange={(e) => setDeepAnalysis(e.target.checked)} className="rounded border-gray-300" />
                <span className="font-semibold">Deep Analysis</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={createReport.isPending}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={createReport.isPending}>
                {createReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /></div>
      ) : reports && reports.length > 0 ? (
        <div className="rounded-2xl border bg-card divide-y divide-border/50">
          {reports.map(report => (
            <div key={report.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-4 w-full sm:w-auto">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <Link to={`/reports/${report.id}`} className="font-semibold hover:text-primary transition-colors block truncate">
                    {report.topic || 'AI Report'}
                  </Link>
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-1 max-w-xl">{report.query}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 w-full sm:w-auto sm:justify-end ml-14 sm:ml-0">
                <Badge
                  variant={report.status === 'ready' ? 'default' : report.status === 'failed' ? 'destructive' : 'secondary'}
                  className={`rounded-full ${report.status === 'ready' ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' : ''}`}
                >
                  {report.status}
                </Badge>
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <FileText className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">No reports yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Generate an AI report to analyze papers and extract useful insights for this project.
          </p>
          <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Generate first report
          </Button>
        </div>
      )}
    </div>
  );
}

function AnalysisPoller({ analysisId, onDone }: { analysisId: string; onDone: () => void }) {
  const { data } = useGapAnalysisStatus(analysisId);

  useEffect(() => {
    if (data?.status === "ready") {
      onDone();
    }
  }, [data?.status, onDone]);

  if (data?.status === "failed") {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-sm flex items-center gap-2 mb-4">
        <XCircle className="w-4 h-4" />
        {data.errorMessage ?? "Analysis failed."}
      </div>
    );
  }
  if (data?.status === "ready") return null;
  return (
    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 p-4 rounded-lg flex items-center gap-3 mb-4 shadow-sm">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {data?.status === "analyzing" ? "Analyzing documents with AI..." : "Queued for analysis..."}
      </p>
    </div>
  );
}

function GapsTab({
  projectId,
  defaultTopic,
  openOnInit,
  onOpenChange
}: {
  projectId: string;
  defaultTopic?: string;
  openOnInit?: boolean;
  onOpenChange?: (open: boolean) => void
}) {
  const [minConfidence, setMinConfidence] = useState(0);
  const [debouncedConfidence, setDebouncedConfidence] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedConfidence(minConfidence), 300);
    return () => clearTimeout(timer);
  }, [minConfidence]);

  const { data: gapsData, isLoading, refetch } = useGaps({ projectId, pageSize: 50, minConfidence: debouncedConfidence });
  const analyze = useAnalyzeGap();

  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(defaultTopic || "");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  // Sync openOnInit
  useEffect(() => {
    if (openOnInit) {
      setOpen(true);
      onOpenChange?.(false);
    }
  }, [openOnInit, onOpenChange]);

  // Sync defaultTopic when dialog opens
  useEffect(() => {
    if (open && defaultTopic) {
      setTopic(defaultTopic);
    }
  }, [open, defaultTopic]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic for gap analysis");
      return;
    }
    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    if (fromYear && toYear && fromYear > toYear) {
      toast.error("Year From must be less than or equal to Year To");
      return;
    }

    analyze.mutate({
      topic: topic.trim(),
      projectId,
      yearFrom: fromYear,
      yearTo: toYear
    }, {
      onSuccess: ({ analysisId }) => {
        setOpen(false);
        setTopic(defaultTopic || "");
        setYearFrom("");
        setYearTo("");
        setActiveAnalysisId(analysisId);
        toast.success("Gap analysis queued");
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error?.message || "Failed to start gap analysis");
      }
    });
  };

  const handleDone = useCallback(() => {
    setActiveAnalysisId(null);
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Research Gaps</h3>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-white/10 shadow-sm">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-[140px]">Min Confidence: {Math.round(minConfidence * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-24 accent-emerald-500 cursor-pointer"
            />
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full shadow-sm shrink-0"><Sparkles className="w-4 h-4 mr-2" /> New Gap Analysis</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gap Analysis</DialogTitle>
              <DialogDescription>
                Discover research opportunities and missing literature for the project.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gap-topic">Topic</Label>
                <Input
                  id="gap-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. AI in Healthcare"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="gap-year-from">Year From</Label>
                  <Input
                    id="gap-year-from"
                    type="number"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="2020"
                    className="h-10 text-center"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <Label htmlFor="gap-year-to">Year To</Label>
                  <Input
                    id="gap-year-to"
                    type="number"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="2026"
                    className="h-10 text-center"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={analyze.isPending}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={analyze.isPending}>
                {analyze.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Analyze
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {activeAnalysisId && (
        <AnalysisPoller
          analysisId={activeAnalysisId}
          onDone={handleDone}
        />
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /></div>
      ) : gapsData?.data && gapsData.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gapsData.data.map(gap => (
            <div key={gap.id} className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-cyan-500/10 hover:border-cyan-500/30 group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative z-10 mb-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 transition-transform group-hover:scale-110 duration-500">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <Badge
                    variant={gap.status === 'dismissed' ? 'secondary' : 'outline'}
                    className={`text-[10px] rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider shrink-0 shadow-sm ${gap.status === 'active' ? 'text-slate-500 border-slate-200 dark:border-zinc-700' : gap.status === 'resolved' ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' : 'text-slate-500 border-slate-200 dark:border-zinc-700'}`}
                  >
                    {gap.status}
                  </Badge>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mb-2">
                  {gap.title}
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {gap.description}
                </p>
              </div>

              {gap.evidenceConfidence !== undefined && (
                <div className="relative z-10 pt-5 border-t border-slate-100 dark:border-zinc-800/50 mt-auto">
                  <div className="flex justify-between items-center mb-2">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-500" /> Confidence
                     </span>
                    <span className="text-sm font-black text-slate-700 dark:text-slate-300">{Math.round(gap.evidenceConfidence * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-emerald-400 to-teal-500 h-2 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.round(gap.evidenceConfidence * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">No research gaps yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Run gap analysis to discover research opportunities and missing literature.
          </p>
          <Button onClick={() => setOpen(true)} variant="outline" className="rounded-full shadow-sm">
            <Sparkles className="w-4 h-4 mr-2 text-cyan-500" />
            Run first analysis
          </Button>
        </div>
      )}
    </div>
  );
}

function PapersTab({
  projectId,
  papers,
  currentUserId,
  ownerId,
  onNavigateToReports,
  onNavigateToGaps
}: {
  projectId: string;
  papers: any[];
  currentUserId?: string;
  ownerId: string;
  onNavigateToReports: () => void;
  onNavigateToGaps: () => void;
}) {
  const isCurrentUserOwner = currentUserId === ownerId;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [selectedPaper, setSelectedPaper] = useState<{ id: string; title: string; year?: number; score?: number } | null>(null);

  const { data: searchResults, isLoading: isSearching } = useSearchPapers(searchTitle);
  const getPaperScore = (p: any) => p.score ?? p.aiScore?.finalScore ?? p.dataQualityScore ?? 0;
  const sortedSearchResults = searchResults ? [...searchResults].sort((a, b) => getPaperScore(b) - getPaperScore(a)) : [];
  const addPaper = useAddPaperToProject(projectId);
  const removePaper = useRemovePaperFromProject(projectId);

  // PR2: Checkbox selection states
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);

  // PR2: Paper comparison states
  const [comparePaperIds, setComparePaperIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const { data: comparisonData, isLoading: isComparing, isError: isCompareError } = useComparePapers(isCompareOpen ? comparePaperIds : []);

  // Clear selections when papers change
  useEffect(() => {
    setSelectedPaperIds([]);
  }, [papers]);

  const toggleSelectPaper = (paperId: string) => {
    setSelectedPaperIds(prev =>
      prev.includes(paperId) ? prev.filter(id => id !== paperId) : [...prev, paperId]
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaper) return toast.error("Please select a paper");
    try {
      await addPaper.mutateAsync({ paperId: selectedPaper.id });
      toast.success("Paper added successfully");
      setIsDialogOpen(false);
      setSelectedPaper(null);
      setSearchTitle("");
    } catch (err) {
      toast.error("Failed to add paper. It may already exist in the project.");
    }
  };

  const [paperToDelete, setPaperToDelete] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!paperToDelete) return;
    try {
      await removePaper.mutateAsync(paperToDelete);
      toast.success("Paper removed");
    } catch (err) {
      toast.error("Failed to remove paper");
    } finally {
      setPaperToDelete(null);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Collected Papers</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full shadow-sm"><Plus className="w-4 h-4 mr-2" /> Add Paper</Button>
          </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Paper</DialogTitle>
                <DialogDescription>Search and add papers to this project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 pt-4">
                <div className="space-y-2 relative">
                  <Label>Search paper by title</Label>
                  {selectedPaper ? (
                    <div className="flex items-center justify-between p-2 border rounded-md bg-secondary/20">
                      <div className="text-sm">
                        <p className="font-medium line-clamp-2">{selectedPaper.title}</p>
                        <div className="flex gap-4 mt-1">
                          <p className="text-muted-foreground text-xs">Year: {selectedPaper.year ?? "N/A"}</p>
                          <p className="text-cyan-600 dark:text-cyan-400 text-xs font-semibold">Score: {selectedPaper.score?.toFixed(2) ?? "N/A"}</p>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPaper(null)}>Change</Button>
                    </div>
                  ) : (
                    <div>
                      <Input
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        placeholder="e.g. LLM in education..."
                        autoComplete="off"
                      />
                      {searchTitle.length > 2 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                          {isSearching ? (
                            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                          ) : sortedSearchResults.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground">Paper not found.</div>
                          ) : (
                            sortedSearchResults.map((p: any) => {
                               const score = getPaperScore(p);
                               return (
                                 <div
                                   key={p.id}
                                   className="p-3 hover:bg-secondary cursor-pointer border-b last:border-0 flex justify-between items-start"
                                   onClick={() => setSelectedPaper({ id: p.id, title: p.title, year: p.publicationYear ?? p.year, score })}
                                 >
                                   <div>
                                     <p className="font-medium text-sm line-clamp-2">{p.title}</p>
                                     <p className="text-muted-foreground text-xs mt-1">Year: {p.publicationYear ?? p.year ?? "N/A"}</p>
                                   </div>
                                   <div className="text-xs font-bold text-cyan-600 dark:text-cyan-400 shrink-0 ml-2 bg-cyan-50 dark:bg-cyan-900/30 px-2 py-1 rounded">
                                     Score: {score.toFixed(2)}
                                   </div>
                                 </div>
                               );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setSelectedPaper(null); setSearchTitle(""); }}>Cancel</Button>
                  <Button type="submit" disabled={addPaper.isPending || !selectedPaper}>
                    {addPaper.isPending ? "Adding..." : "Add"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      {/* PR2: Bulk Action Bar */}
      {selectedPaperIds.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 p-4 rounded-xl shadow-sm gap-4 transition-all duration-200">
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 tracking-wider uppercase font-mono">
            {selectedPaperIds.length} paper{selectedPaperIds.length > 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={selectedPaperIds.length < 2 || selectedPaperIds.length > 4}
              onClick={() => {
                setComparePaperIds(selectedPaperIds);
                setIsCompareOpen(true);
              }}
              className="h-8 text-xs font-bold gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            >
              <Sparkles className="w-3.5 h-3.5" /> Compare Selected
            </Button>
            <Button
              size="sm"
              onClick={onNavigateToReports}
              className="h-8 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <FileText className="w-3.5 h-3.5" /> Generate Report
            </Button>
            <Button
              size="sm"
              onClick={onNavigateToGaps}
              className="h-8 text-xs font-bold gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white border-0"
            >
              <Zap className="w-3.5 h-3.5" /> Analyze Gaps
            </Button>
          </div>
        </div>
      )}

      {/* PR2: Paper Comparison Dialog */}
      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              Cross-Paper AI Comparison
            </DialogTitle>
            <DialogDescription>
              AI-generated comparison of key research findings, methodologies, and outcomes.
            </DialogDescription>
          </DialogHeader>

          {isComparing ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-slate-500 font-medium">Gemini is analyzing and cross-comparing papers...</p>
            </div>
          ) : isCompareError ? (
            <div className="py-12 text-center text-red-500 font-medium">
              Failed to load paper comparison. Please try again.
            </div>
          ) : comparisonData ? (
            <div className="mt-4">
              <CompareTable comparison={comparisonData} />
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setIsCompareOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paperToDelete} onOpenChange={(open) => !open && setPaperToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Paper</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this paper from the project?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaperToDelete(null)} disabled={removePaper.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removePaper.isPending}>
              {removePaper.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {papers?.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <FileText className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">No papers yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm">
            Add relevant papers to the project for AI analysis and reference.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {papers.map((p) => {
            const paperObj = typeof p.targetId === 'object' && p.targetId !== null ? p.targetId : null;
            const paperId = paperObj ? paperObj._id : p.targetId;
            const isSelected = selectedPaperIds.includes(paperId);
            return (
              <div
                key={paperId}
                className={`flex flex-row justify-between items-center rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/5 group relative overflow-hidden ${
                  isSelected ? "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5 ring-1 ring-indigo-500" : "border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 hover:border-indigo-500/30"
                }`}
              >
                {/* Checkbox Selector */}
                <div className="flex items-center pr-2 relative z-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectPaper(paperId)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-start gap-4 flex-1 min-w-0 pr-4 ml-2">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 transition-colors group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    {paperObj ? (
                      <>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          <Link to={`/papers/${paperId}`} className="hover:underline decoration-indigo-300 underline-offset-2">{paperObj.title}</Link>
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-2">
                           <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded text-xs font-semibold">{paperObj.publicationYear || "N/A"}</span>
                           <span className="opacity-50">•</span>
                           <span className="truncate">{paperObj.authors?.map((a: any) => a.displayName).slice(0, 2).join(", ")}{paperObj.authors?.length > 2 ? " et al." : ""}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                          Unknown Paper (ID: <span className="font-mono text-slate-400 text-sm">{paperId}</span>)
                        </h4>
                      </>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="relative z-10 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0 h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300" onClick={() => setPaperToDelete(paperId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MembersTab({ projectId, members, ownerId, currentUserId }: { projectId: string; members: any[]; ownerId: string; currentUserId?: string }) {
  const isCurrentUserOwner = currentUserId === ownerId;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const [role, setRole] = useState<"owner" | "member">("member");

  const { data: searchResults, isLoading: isSearching } = useSearchUsers(searchEmail);
  const addMember = useAddMemberToProject(projectId);
  const removeMember = useRemoveMemberFromProject(projectId);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return toast.error("Please select a user");
    try {
      await addMember.mutateAsync({ targetId: selectedUser.id, targetKind: "User", role });
      toast.success("Member added successfully");
      setIsDialogOpen(false);
      setSelectedUser(null);
      setSearchEmail("");
    } catch (err) {
      toast.error("Failed to add member.");
    }
  };

  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!memberToDelete) return;
    try {
      await removeMember.mutateAsync(memberToDelete);
      toast.success("Member removed");
    } catch (err) {
      toast.error("Failed to remove member");
    } finally {
      setMemberToDelete(null);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Project Members</h3>
        {isCurrentUserOwner && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full shadow-sm"><Plus className="w-4 h-4 mr-2" /> Add Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Member</DialogTitle>
                <DialogDescription>Add a user or expert to the project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <select
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                    >
                      <option value="member">Member</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <Label>Search user by email</Label>
                  {selectedUser ? (
                    <div className="flex items-center justify-between p-2 border rounded-md bg-secondary/20">
                      <div className="text-sm">
                        <p className="font-medium">{selectedUser.fullName}</p>
                        <p className="text-muted-foreground text-xs">{selectedUser.email}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>Change</Button>
                    </div>
                  ) : (
                    <div>
                      <Input
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        placeholder="e.g. user@example.com..."
                        autoComplete="off"
                      />
                      {searchEmail.length > 1 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                          {isSearching ? (
                            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                          ) : searchResults?.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground">User not found.</div>
                          ) : (
                            searchResults?.map((u: any) => (
                              <div
                                key={u.id}
                                className="p-3 hover:bg-secondary cursor-pointer border-b last:border-0"
                                onClick={() => setSelectedUser(u)}
                              >
                                <p className="font-medium text-sm">{u.fullName}</p>
                                <p className="text-muted-foreground text-xs">{u.email}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setSelectedUser(null); setSearchEmail(""); }}>Cancel</Button>
                  <Button type="submit" disabled={addMember.isPending || !selectedUser}>
                    {addMember.isPending ? "Adding..." : "Add"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Dialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member? They will lose permissions to add papers and generate reports.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToDelete(null)} disabled={removeMember.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removeMember.isPending}>
              {removeMember.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {members?.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm mb-4">
            <Users className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h4 className="text-lg font-semibold tracking-tight mb-2">No members yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm">
            Invite colleagues or experts to collaborate on the project.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          {members.map((m) => {
            const memberObj = typeof m.targetId === 'object' && m.targetId !== null ? m.targetId : null;
            const memberId = memberObj ? memberObj._id : m.targetId;
            const isPrimaryOwner = memberId === ownerId;
            return (
              <div key={memberId} className="group relative flex flex-row justify-between items-center rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/10 hover:border-purple-500/30 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 dark:bg-purple-900/10 rounded-bl-full -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="flex items-center gap-5 flex-1 overflow-hidden z-10">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-bold text-lg uppercase transition-all duration-500 group-hover:scale-110 shadow-sm border border-purple-200 dark:border-purple-500/20">
                    {memberObj ? memberObj.fullName.charAt(0) : <Users className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    {memberObj ? (
                      <>
                        <h4 className="text-[16px] font-bold truncate text-slate-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors leading-tight mb-1">{memberObj.fullName || 'Unknown User'}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className="truncate max-w-full">{memberObj.email}</span>
                          <span className="opacity-30 text-xs hidden sm:inline">•</span>
                          <span className={`capitalize font-bold text-xs px-2 py-0.5 rounded-md shrink-0 ${m.role === 'owner' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50' : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50'}`}>
                            {m.role === 'owner' ? 'Owner' : 'Member'}
                          </span>
                          {isPrimaryOwner && <span className="text-[10px] uppercase font-black shrink-0 bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">Creator</span>}
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className="text-[16px] font-bold truncate text-slate-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors leading-tight mb-1">
                          {m.targetKind} <span className="font-mono text-slate-400 text-xs font-normal ml-2">(ID: {memberId})</span>
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className={`capitalize font-bold text-xs px-2 py-0.5 rounded-md shrink-0 ${m.role === 'owner' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50' : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50'}`}>
                            {m.role === 'owner' ? 'Owner' : 'Member'}
                          </span>
                          {isPrimaryOwner && <span className="text-[10px] uppercase font-black shrink-0 bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">Creator</span>}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                {isCurrentUserOwner && !isPrimaryOwner && (
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8 w-8 rounded-full ml-4" onClick={() => setMemberToDelete(memberId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
