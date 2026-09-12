import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth";
import { useAdminStats } from "@/features/admin";
import { useSyncRuns, useTriggerSync, useEmbedStatus, useTriggerEmbedding } from "@/features/admin/hooks/use-admin-sync";
import type { ApiSyncRun } from "@/features/admin/api/admin.api";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Play,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Ban,
  Database,
  Activity,
  FileText,
  Sparkles
} from "lucide-react";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";

export function AdminSyncPage() {
  const { t } = useI18n();
  const { data: currentUserData } = useCurrentUser();
  const isAdmin = currentUserData?.user?.role === "admin";

  const { data: adminStats, isLoading: isAdminStatsLoading, refetch: refetchAdminStats } = useAdminStats(isAdmin, 10000);
  const { data: runs, isLoading, isError, refetch } = useSyncRuns(isAdmin);
  const triggerSyncMutation = useTriggerSync();
  const { data: embedStatus, isLoading: isEmbedStatusLoading, refetch: refetchEmbedStatus } = useEmbedStatus(isAdmin);
  const triggerEmbedMutation = useTriggerEmbedding();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchText, setSearchText] = useState("large language model education");
  const [yearFrom, setYearFrom] = useState(2022);
  const [maxPages, setMaxPages] = useState(1);

  const handleTriggerEmbed = () => {
    triggerEmbedMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Embedding job queued successfully!");
        refetchEmbedStatus();
      },
      onError: (err: any) => {
        const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
        const errMsg = axiosErr?.response?.data?.error?.message ?? "Failed to trigger embedding.";
        toast.error(errMsg);
      }
    });
  };

  if (!isAdmin) {
    return (
      <main className="container py-16">
        <div className="mx-auto max-w-md text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500/80 stroke-[1.5]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] dark:text-white">Access denied</h1>
          <p className="text-sm text-[#787774] dark:text-slate-400 max-w-[40ch] mx-auto">
            Only administrators are allowed to access the Synchronization Pipeline.
          </p>
        </div>
      </main>
    );
  }

  const handleTriggerSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchText.trim()) {
      toast.error("Please enter a search query.");
      return;
    }

    triggerSyncMutation.mutate(
      {
        searchText: searchText.trim(),
        yearFrom,
        maxPages,
      },
      {
        onSuccess: () => {
          toast.success("Synchronization job queued successfully!", {
            description: "The worker process will process your sync run shortly.",
          });
          setIsDialogOpen(false);
        },
        onError: (err) => {
          const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
          const errMsg = axiosErr?.response?.data?.error?.message ?? "Failed to trigger sync.";
          toast.error(errMsg);
        },
      }
    );
  };

  // Calculate live statistics from the actual sync runs.
  const syncStats = adminStats?.sync;
  const totalRuns = syncStats?.totalRuns ?? runs?.length ?? 0;
  const totalFetched = syncStats?.totalFetched ?? runs?.reduce((acc, r) => acc + (r.totalFetched || 0), 0) ?? 0;
  const isPipelineRunning =
    syncStats?.latestRun?.status === "running" || (runs?.some(isFreshRunningSyncRun) ?? false);

  const renderStatusBadge = (run: ApiSyncRun) => {
    const status = run.runStatus;
    switch (status) {
      case "running":
        return (
          <Badge
            variant="outline"
            className="flex w-fit items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium tracking-wide rounded-full border bg-[#E1F3FE] text-[#1F6C9F] border-[#C4E6FD] dark:bg-[#1A2633] dark:text-[#93C5FD] dark:border-[#25394E] animate-pulse"
          >
            <RefreshCw className="h-3 w-3 animate-spin stroke-[1.5]" />
            <span className="capitalize">Running</span>
          </Badge>
        );
      case "succeeded":
        return (
          <Badge
            variant="outline"
            className="flex w-fit items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium tracking-wide rounded-full border bg-[#EDF3EC] text-[#346538] border-[#D5E3D2] dark:bg-[#1C2C20] dark:text-[#86EFAC] dark:border-[#2C402E]"
          >
            <CheckCircle2 className="h-3 w-3 stroke-[1.5]" />
            <span className="capitalize">Succeeded</span>
          </Badge>
        );
      case "failed":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="flex w-fit items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium tracking-wide rounded-full border bg-[#FDEBEC] text-[#9F2F2D] border-[#F9D5D6] dark:bg-[#2D1C1C] dark:text-[#FCA5A5] dark:border-[#452020] cursor-pointer"
              >
                <XCircle className="h-3 w-3 stroke-[1.5]" />
                <span className="capitalize">Failed</span>
              </Badge>
            </TooltipTrigger>
            {run.errorMessage && (
              <TooltipContent className="max-w-xs bg-popover text-popover-foreground border border-border shadow-sm">
                <p className="text-xs font-mono">{run.errorMessage}</p>
              </TooltipContent>
            )}
          </Tooltip>
        );
      case "cancelled":
        return (
          <Badge
            variant="outline"
            className="flex w-fit items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium tracking-wide rounded-full border bg-muted/50 text-muted-foreground border-border"
          >
            <Ban className="h-3 w-3 stroke-[1.5]" />
            <span className="capitalize">Cancelled</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="px-2.5 py-0.5 text-[11px] font-medium rounded-full">
            {status}
          </Badge>
        );
    }
  };

  const renderTableSkeleton = () => {
    return Array.from({ length: 5 }).map((_, idx) => (
      <TableRow key={`ske-${idx}`} className="hover:bg-transparent">
        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
        <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      </TableRow>
    ));
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <PageHeader
          title="Synchronization Management"
          description="Trigger and monitor academic API synchronisation from sources like OpenAlex."
        />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch();
              void refetchAdminStats();
            }}
            className="text-muted-foreground hover:text-foreground gap-2 active:scale-[0.98] transition-transform duration-100 rounded-lg border border-[#EAEAEA] dark:border-[#26334A] h-9"
          >
            <RefreshCw className="h-3.5 w-3.5 stroke-[1.5]" />
            Refresh Runs
          </Button>
        </div>
      </div>

      {/* Bento Stats & Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Card 1: Total Papers Fetched */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] grid min-h-[150px] grid-rows-[auto_1fr_auto]">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-xs font-semibold text-[#787774] dark:text-slate-400 uppercase tracking-wide leading-snug break-words">Papers Fetched</span>
            <div className="p-1.5 rounded-lg bg-[#EDF3EC] dark:bg-[#1C2C20] shrink-0">
              <Database className="h-4 w-4 text-[#346538] dark:text-[#86EFAC] stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-center self-center gap-1.5">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#111111] dark:text-white">
              {isLoading || isAdminStatsLoading ? "—" : formatNumber(totalFetched)}
            </span>
            <span className="text-xs text-[#787774] dark:text-slate-400">papers</span>
          </div>
          <p className="text-[10px] text-[#787774] dark:text-slate-500 leading-snug">
            All-time fetched across recorded sync runs.
          </p>
        </div>

        {/* Card 2: Total Runs */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] grid min-h-[150px] grid-rows-[auto_1fr_auto]">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-xs font-semibold text-[#787774] dark:text-slate-400 uppercase tracking-wide leading-snug break-words">Total Sync Runs</span>
            <div className="p-1.5 rounded-lg bg-[#E1F3FE] dark:bg-[#1A2633] shrink-0">
              <Activity className="h-4 w-4 text-[#1F6C9F] dark:text-[#93C5FD] stroke-[1.5]" />
            </div>
          </div>
          <div className="flex items-center self-center gap-1.5">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#111111] dark:text-white">
              {isLoading ? "—" : formatNumber(totalRuns)}
            </span>
            <span className="text-xs text-[#787774] dark:text-slate-400">runs</span>
          </div>
        </div>

        {/* Card 3: Pipeline Status */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] grid min-h-[150px] grid-rows-[auto_1fr_auto]">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-xs font-semibold text-[#787774] dark:text-slate-400 uppercase tracking-wide leading-snug break-words">Pipeline Status</span>
            <div className={`p-1.5 rounded-lg shrink-0 ${isPipelineRunning ? "bg-amber-500/10" : "bg-[#EDF3EC] dark:bg-[#1C2C20]"}`}>
              <Sparkles className={`h-4 w-4 stroke-[1.5] ${isPipelineRunning ? "text-amber-500 animate-pulse" : "text-[#346538] dark:text-[#86EFAC]"}`} />
            </div>
          </div>
          <div className="flex items-center self-center gap-2">
            {isPipelineRunning ? (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping absolute" />
                <span className="h-2 w-2 rounded-full bg-amber-500 relative" />
                <span className="text-sm font-semibold text-amber-500 ml-1">Sync Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#346538] dark:bg-[#86EFAC]" />
                <span className="text-sm font-semibold text-[#346538] dark:text-[#86EFAC]">System Idle</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Action Control Card */}
        <div className="bg-card dark:bg-[#111B27] border border-dashed border-[#EF4444]/30 dark:border-[#EF4444]/20 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] grid min-h-[150px] grid-rows-[auto_1fr_auto]">
          <div aria-hidden />
          <div className="flex min-w-0 items-center">
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="w-full min-w-0 max-w-full bg-[#111111] hover:bg-[#2F3437] dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black gap-1.5 px-2.5 py-2 text-[12px] font-bold h-11 active:scale-[0.98] transition-transform duration-100 rounded-lg shadow-sm"
            >
              <Play className="h-3.5 w-3.5 shrink-0 fill-current stroke-[1.5]" />
              <span className="min-w-0 truncate whitespace-nowrap text-center leading-5">
                {t("Trigger New Sync")}
              </span>
            </Button>
          </div>
          <p className="pb-1 text-center text-xs leading-5 text-[#787774] dark:text-slate-400 font-medium">
            {t("Authorized administrators only")}
          </p>
        </div>
      </div>

      {/* A1: Vector Embedding Status & Controls Card */}
      <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111] dark:text-white">Vector Embedding Pipeline</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Generate 768-dimensional embeddings using Gemini to make papers searchable by AI.
            </p>
          </div>
          <Button
            onClick={handleTriggerEmbed}
            disabled={triggerEmbedMutation.isPending || embedStatus?.pendingPapers === 0 || embedStatus?.isEmbeddingActive}
            className="bg-blue-700 hover:bg-blue-800 text-white font-bold h-9 px-4 gap-2 rounded-lg shadow-sm transition-all active:scale-[0.98] duration-100 text-xs"
          >
            {triggerEmbedMutation.isPending || embedStatus?.isEmbeddingActive ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {embedStatus?.isEmbeddingActive ? "Embedding Active..." : "Trigger Embedding"}
          </Button>
        </div>

              {isEmbedStatusLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
              ) : embedStatus ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI-Analyzable Papers</span>
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white block mt-1">
                {formatNumber(embedStatus.totalPapers)}
              </span>
              <span className="text-[10px] text-slate-400">Papers passing the quality gate</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Embedded Papers</span>
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 block mt-1">
                {formatNumber(embedStatus.embeddedPapers)}
              </span>
              <span className="text-[10px] text-slate-400">Vector representation active in search index</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Pending Embeddings</span>
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 block mt-1">
                {formatNumber(embedStatus.pendingPapers)}
              </span>
              <span className="text-[10px] text-slate-400">Papers awaiting embedding job</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-500">Failed to load embedding status.</p>
        )}

        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <Link
            to="/admin/pipeline"
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            View full pipeline health &rarr;
          </Link>
        </div>
      </div>

      {/* Run History List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-[#111111] dark:text-white">Run History Log</h2>

        {isError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center space-y-4">
            <AlertCircle className="mx-auto h-8 w-8 text-red-500 stroke-[1.5]" />
            <p className="text-sm font-semibold text-red-500">
              Failed to load synchronization runs from the server.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="active:scale-[0.98] transition-transform duration-100 border-red-500/30 text-red-500 hover:bg-red-500/10"
              onClick={() => refetch()}
            >
              Try Again
            </Button>
          </div>
        ) : !isLoading && (!runs || runs.length === 0) ? (
          <div className="rounded-xl border border-dashed border-[#EAEAEA] dark:border-[#26334A] p-20 text-center space-y-6">
            <RefreshCw className="mx-auto h-12 w-12 text-muted-foreground/30 stroke-[1.5]" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-[#111111] dark:text-white">No sync runs recorded</h3>
              <p className="text-sm text-[#787774] dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Start pulling papers by triggering a new synchronization job using the action controller card above.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#EAEAEA] dark:border-[#26334A] bg-card text-card-foreground shadow-[0_2px_12px_rgba(0,0,0,0.015)] overflow-hidden">
            <TooltipProvider>
              <Table>
                <TableHeader className="bg-[#FBFBFA] dark:bg-[#162235]/40 border-b border-[#EAEAEA] dark:border-[#26334A]">
                  <TableRow>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Search Query</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Status</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Fetched</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Inserted</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Updated</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Duplicates</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Started At</TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Finished At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#EAEAEA] dark:divide-[#26334A]">
                  {isLoading ? (
                    renderTableSkeleton()
                  ) : (
                    runs?.map((run) => (
                      <TableRow key={run._id} className="hover:bg-[#F9F9F8]/80 dark:hover:bg-[#162235]/30 border-b border-[#EAEAEA] dark:border-[#26334A] transition-colors duration-150">
                        <TableCell className="font-semibold text-sm max-w-[240px] truncate text-[#111111] dark:text-white py-3.5" title={run.searchText}>
                          {run.searchText ?? "N/A"}
                        </TableCell>
                        <TableCell className="py-3.5">{renderStatusBadge(run)}</TableCell>
                        <TableCell className="text-center font-mono text-xs font-semibold text-[#111111] dark:text-white py-3.5">{formatNumber(run.totalFetched)}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-[#346538] dark:text-[#86EFAC] font-bold py-3.5">+{formatNumber(run.totalInserted)}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-[#1F6C9F] dark:text-[#93C5FD] font-semibold py-3.5">{formatNumber(run.totalUpdated)}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-[#787774] dark:text-slate-500 py-3.5">{formatNumber(run.totalDuplicates)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3.5">
                          {new Date(run.startedAt).toLocaleString("en-US", { hour12: false })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3.5">
                          {run.finishedAt ? new Date(run.finishedAt).toLocaleString("en-US", { hour12: false }) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-xl border border-[#EAEAEA] dark:border-[#26334A] dark:bg-[#121E31] p-6 shadow-md">
          <form onSubmit={handleTriggerSync} className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-[#111111] dark:text-white">
                <RefreshCw className="h-5 w-5 text-primary stroke-[1.5]" />
                Trigger New Synchronization
              </DialogTitle>
              <DialogDescription className="text-sm text-[#787774] dark:text-slate-400">
                Synchronize academic papers from OpenAlex live directory using a custom search topic.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="searchText" className="font-semibold text-sm text-[#111111] dark:text-white">
                  Search Query Topic <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="searchText"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="e.g. large language model education"
                  required
                  className="w-full rounded-lg border-[#EAEAEA] dark:border-[#26334A] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="yearFrom" className="font-semibold text-sm text-[#111111] dark:text-white">
                    Publication Year From
                  </Label>
                  <Input
                    id="yearFrom"
                    type="number"
                    min={1900}
                    max={2100}
                    value={yearFrom}
                    onChange={(e) => setYearFrom(parseInt(e.target.value) || 2022)}
                    required
                    className="rounded-lg border-[#EAEAEA] dark:border-[#26334A] focus-visible:ring-1 focus-visible:ring-ring h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxPages" className="font-semibold text-sm text-[#111111] dark:text-white">
                    Max Pages (200 records/pg)
                  </Label>
                  <Input
                    id="maxPages"
                    type="number"
                    min={1}
                    max={50}
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value) || 1)}
                    required
                    className="rounded-lg border-[#EAEAEA] dark:border-[#26334A] focus-visible:ring-1 focus-visible:ring-ring h-10"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 border-t border-[#EAEAEA] dark:border-[#26334A] pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={triggerSyncMutation.isPending}
                className="active:scale-[0.98] transition-transform duration-100 rounded-lg border border-[#EAEAEA] dark:border-[#26334A] h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={triggerSyncMutation.isPending}
                className="bg-[#111111] hover:bg-[#2F3437] dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black active:scale-[0.98] transition-transform duration-100 min-w-[100px] gap-2 rounded-lg h-10"
              >
                {triggerSyncMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin stroke-[1.5]" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current stroke-[1.5]" />
                    Start Sync
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const FRESH_SYNC_RUN_MS = 2 * 60 * 60 * 1000;

function isFreshRunningSyncRun(run: ApiSyncRun): boolean {
  if (run.runStatus !== "running") return false;
  const startedAt = new Date(run.startedAt).getTime();
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt < FRESH_SYNC_RUN_MS;
}
