import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth";
import { usePipelineStatus } from "@/features/admin/hooks/use-pipeline-status";
import { OpenAlexCampaignMonitor } from "@/features/admin/components/openalex-campaign-monitor";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Database,
  Sparkles,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Server,
  AlertTriangle,
  Info,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

export function AdminPipelinePage() {
  const { data: currentUserData } = useCurrentUser();
  const isAdmin = currentUserData?.user?.role === "admin";

  const { data: status, isLoading, isError, refetch, isFetching } = usePipelineStatus(isAdmin);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const handleRefresh = () => {
    refetch();
  };

  if (!isAdmin) {
    return (
      <main className="container py-16">
        <div className="mx-auto max-w-md text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500/80 stroke-[1.5]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] dark:text-white">Access denied</h1>
          <p className="text-sm text-[#787774] dark:text-slate-400 max-w-[40ch] mx-auto">
            Only administrators are allowed to access the Pipeline Health Dashboard.
          </p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <PageHeader
          title="Pipeline Health"
          description="Diagnose BullMQ queue status, worker performance, and corpus readiness."
        />
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center space-y-4">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 stroke-[1.5]" />
          <p className="text-sm font-semibold text-red-500">
            Failed to load pipeline operational status from the server.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="active:scale-[0.98] transition-transform duration-100 border-red-500/30 text-red-500 hover:bg-red-500/10"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Try Again"}
          </Button>
        </div>
      </main>
    );
  }

  // Calculate metrics
  const totalBacklog = status?.queues.reduce((acc, q) => acc + q.waiting + q.delayed, 0) ?? 0;
  const totalFailed = status?.queues.reduce((acc, q) => acc + q.failed, 0) ?? 0;
  const redisOk = status?.redis.ok ?? false;
  const workersAlive = status?.workers.alive ?? 0;
  const workersExpected = status?.workers.expected ?? 0;
  const workersAtRisk = (status?.workers.stale ?? 0) + (status?.workers.missing ?? 0);
  const ingestWorkerStatus = status?.workers.heartbeats.find(
    (worker) => worker.workerName === "worker:openalex-ingest",
  )?.status ?? "missing";
  const corpusValidationWorkerStatus = status?.workers.heartbeats.find(
    (worker) => worker.workerName === "worker:corpus-validation",
  )?.status ?? "missing";

  const renderHealthBadge = (queue: { isBacklogged: boolean; hasFailures: boolean }) => {
    if (!redisOk) {
      return (
        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
          Critical
        </Badge>
      );
    }
    if (queue.isBacklogged || queue.hasFailures) {
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
          Warning
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
        Healthy
      </Badge>
    );
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <PageHeader
          title="Pipeline Health"
          description="Queue, worker, and corpus readiness for large-scale paper analysis."
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-stretch md:self-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full bg-emerald-500",
              isFetching && "animate-ping"
            )} />
            Last updated: {status?.generatedAt ? new Date(status.generatedAt).toLocaleTimeString("vi-VN", { hour12: false }) : "—"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isFetching}
            className="text-muted-foreground hover:text-foreground gap-2 active:scale-[0.98] transition-transform duration-100 rounded-lg border border-[#EAEAEA] dark:border-[#26334A] h-9"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 stroke-[1.5]", isFetching && "animate-spin")} />
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Bento Stats Summary Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-5">
        {/* Redis Connection Status */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">Redis Broker</span>
            <div className={cn(
              "p-1.5 rounded-lg shrink-0",
              redisOk ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <Server className={cn(
                "h-4 w-4 stroke-[1.5]",
                redisOk ? "text-emerald-500" : "text-red-500"
              )} />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className={cn(
                "text-xl font-bold tracking-tight block",
                redisOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {isLoading ? "—" : (redisOk ? "Connected" : "Unavailable")}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-snug line-clamp-2" title={status?.redis.error ?? "Running BullMQ queues"}>
                {status?.redis.error ?? "Running BullMQ queues"}
              </span>
            </div>
          </div>
        </div>

        {/* Worker heartbeat status */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">Workers Alive</span>
            <div className={cn(
              "p-1.5 rounded-lg shrink-0",
              workersAtRisk > 0 ? "bg-red-500/10" : "bg-emerald-500/10"
            )}>
              <Activity className={cn(
                "h-4 w-4 stroke-[1.5]",
                workersAtRisk > 0 ? "text-red-500" : "text-emerald-500"
              )} />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className={cn(
                "text-3xl font-bold font-mono tracking-tight block",
                workersAtRisk > 0 ? "text-red-500" : "text-[#111111] dark:text-white"
              )}>
                {isLoading ? "—" : `${workersAlive}/${workersExpected}`}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                Heartbeat within 2 minutes
              </span>
            </div>
          </div>
        </div>

        {/* Total Queue Backlog */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">Queue Backlog</span>
            <div className={cn(
              "p-1.5 rounded-lg shrink-0",
              totalBacklog > 0 ? "bg-amber-500/10 animate-pulse" : "bg-[#E1F3FE] dark:bg-[#1A2633]"
            )}>
              <Clock className={cn(
                "h-4 w-4 stroke-[1.5]",
                totalBacklog > 0 ? "text-amber-500" : "text-[#1F6C9F] dark:text-[#93C5FD]"
              )} />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className="text-3xl font-bold font-mono tracking-tight text-[#111111] dark:text-white block">
                {isLoading ? "—" : formatNumber(totalBacklog)}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                Waiting & delayed jobs
              </span>
            </div>
          </div>
        </div>

        {/* Failed Jobs count */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">Failed Jobs</span>
            <div className={cn(
              "p-1.5 rounded-lg shrink-0",
              totalFailed > 0 ? "bg-red-500/10" : "bg-emerald-500/10"
            )}>
              <XCircle className={cn(
                "h-4 w-4 stroke-[1.5]",
                totalFailed > 0 ? "text-red-500" : "text-emerald-500"
              )} />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className={cn(
                "text-3xl font-bold font-mono tracking-tight block",
                totalFailed > 0 ? "text-red-500" : "text-[#111111] dark:text-white"
              )}>
                {isLoading ? "—" : formatNumber(totalFailed)}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                Exhausted all attempts
              </span>
            </div>
          </div>
        </div>

        {/* Embedding Coverage */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">Embedding Coverage</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 shrink-0">
              <Database className="h-4 w-4 text-blue-500 stroke-[1.5]" />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className="text-3xl font-bold font-mono tracking-tight text-[#111111] dark:text-white block">
                {isLoading ? "—" : `${status?.corpus.embeddingCoveragePct}%`}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                Embedded / analyzable papers
              </span>
            </div>
          </div>
        </div>

        {/* AI Analysis Coverage */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between min-h-[150px] h-auto">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-snug break-words">AI Analysis Coverage</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 shrink-0">
              <Sparkles className="h-4 w-4 text-purple-500 stroke-[1.5]" />
            </div>
          </div>
          <div className="mt-3 flex flex-col justify-end">
            <div className="min-h-9 flex items-center">
              <span className="text-3xl font-bold font-mono tracking-tight text-[#111111] dark:text-white block">
                {isLoading ? "—" : `${status?.corpus.aiAnalysisCoveragePct}%`}
              </span>
            </div>
            <div className="min-h-8 flex items-start mt-1">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                AI analyzed / analyzable papers
              </span>
            </div>
          </div>
        </div>
      </div>

      <OpenAlexCampaignMonitor
        enabled={isAdmin}
        ingestWorkerStatus={ingestWorkerStatus}
        corpusValidationWorkerStatus={corpusValidationWorkerStatus}
      />

      {/* Corpus Readiness Details Segment */}
      <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-6">
        <h2 className="text-base font-bold tracking-tight text-[#111111] dark:text-white">Corpus Scale Readiness</h2>
        
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : status ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Progress and coverage section */}
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Searchable via Embeddings</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatNumber(status.corpus.embeddedPapers)} / {formatNumber(status.corpus.analyzablePapers)} papers ({status.corpus.embeddingCoveragePct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${status.corpus.embeddingCoveragePct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">AI Knowledge Extracted</span>
                  <span className="font-mono text-purple-600 dark:text-purple-400">
                    {formatNumber(status.corpus.aiAnalyzedPapers)} / {formatNumber(status.corpus.analyzablePapers)} papers ({status.corpus.aiAnalysisCoveragePct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${status.corpus.aiAnalysisCoveragePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Numerical breakdown grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Papers</span>
                <span className="text-lg font-bold font-mono text-[#111111] dark:text-white block mt-1">
                  {formatNumber(status.corpus.totalPapers)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Active Status</span>
                <span className="text-lg font-bold font-mono text-[#111111] dark:text-white block mt-1">
                  {status.corpus.activePapers}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Analyzable Gate</span>
                <span className="text-lg font-bold font-mono text-[#111111] dark:text-white block mt-1">
                  {formatNumber(status.corpus.analyzablePapers)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending Embeds</span>
                <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 block mt-1">
                  {formatNumber(status.corpus.pendingEmbedding)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending AI Extraction</span>
                <span className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400 block mt-1">
                  {status.corpus.pendingAiAnalysis}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Queue Status Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-[#111111] dark:text-white">Active Queue Registry</h2>
        <div className="rounded-xl border border-[#EAEAEA] dark:border-[#26334A] bg-card text-card-foreground shadow-[0_2px_12px_rgba(0,0,0,0.015)] overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader className="bg-[#FBFBFA] dark:bg-[#162235]/40 border-b border-[#EAEAEA] dark:border-[#26334A]">
              <TableRow>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Queue Process</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Waiting</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Active</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Delayed</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Failed</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Oldest Waiting</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Completed</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Health Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EAEAEA] dark:divide-[#26334A]">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={`q-ske-${idx}`} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-14 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : status?.queues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground text-sm">
                    {!redisOk
                      ? "Queue data unavailable because Redis is unreachable."
                      : "No active queues found. Ensure workers are started."}
                  </TableCell>
                </TableRow>
              ) : (
                status?.queues.map((queue) => (
                  <TableRow key={queue.name} className="hover:bg-[#F9F9F8]/80 dark:hover:bg-[#162235]/30 border-b border-[#EAEAEA] dark:border-[#26334A] transition-colors duration-150">
                    <TableCell className="font-semibold text-sm text-[#111111] dark:text-white py-3.5">
                      {queue.label}
                      <span className="text-[10px] text-slate-400 block font-mono font-normal">{queue.name}</span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs py-3.5">{queue.waiting}</TableCell>
                    <TableCell className={cn(
                      "text-center font-mono text-xs font-semibold py-3.5",
                      queue.active > 0 && "text-blue-600 dark:text-blue-400 font-bold"
                    )}>{queue.active}</TableCell>
                    <TableCell className="text-center font-mono text-xs py-3.5 text-muted-foreground">{queue.delayed}</TableCell>
                    <TableCell className={cn(
                      "text-center font-mono text-xs py-3.5",
                      queue.failed > 0 ? "text-red-500 font-bold" : "text-muted-foreground"
                    )}>{queue.failed}</TableCell>
                    <TableCell className={cn(
                      "text-center font-mono text-xs py-3.5",
                      queue.oldestPendingJobAgeSeconds !== null && queue.oldestPendingJobAgeSeconds > 600
                        ? "text-amber-600 dark:text-amber-400 font-bold"
                        : "text-muted-foreground"
                    )}>
                      {formatAge(queue.oldestPendingJobAgeSeconds)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground py-3.5">{queue.completed}</TableCell>
                    <TableCell className="text-center py-3.5">{renderHealthBadge(queue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Worker Heartbeat Registry */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-[#111111] dark:text-white">Worker Heartbeats</h2>
        <div className="rounded-xl border border-[#EAEAEA] dark:border-[#26334A] bg-card text-card-foreground shadow-[0_2px_12px_rgba(0,0,0,0.015)] overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader className="bg-[#FBFBFA] dark:bg-[#162235]/40 border-b border-[#EAEAEA] dark:border-[#26334A]">
              <TableRow>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Worker</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Queue</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Status</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center">Last Seen</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Host / PID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EAEAEA] dark:divide-[#26334A]">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={`worker-ske-${idx}`} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  </TableRow>
                ))
              ) : status?.workers.heartbeats.map((worker) => (
                <TableRow key={worker.workerName} className="hover:bg-[#F9F9F8]/80 dark:hover:bg-[#162235]/30 transition-colors duration-150">
                  <TableCell className="font-semibold text-sm text-[#111111] dark:text-white py-3.5">
                    {worker.workerName}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground py-3.5">{worker.queueName}</TableCell>
                  <TableCell className="text-center py-3.5">
                    <WorkerStatusBadge status={worker.status} />
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground py-3.5">
                    {worker.lastSeenAt ? `${formatAge(worker.ageSeconds)} ago` : "never"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground py-3.5">
                    {worker.hostname ? `${worker.hostname} / ${worker.pid ?? "?"}` : "not reported"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Stale Work and Recommendations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stale work indicators */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.01)] space-y-4">
          <h2 className="text-base font-bold tracking-tight text-[#111111] dark:text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500 stroke-[1.5]" />
            Stale Pipeline Tasks
          </h2>
          <p className="text-xs text-muted-foreground">
            Tasks stuck in BullMQ state too long without update (30m queued, 5m active).
          </p>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : status ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium block">Reports waiting in Queue</span>
                  <span className="text-[10px] text-muted-foreground">Stuck in "queued" &gt; 30 minutes</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold px-2 py-0.5 rounded",
                  status.stale.reportsQueuedTooLong > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-slate-50 dark:bg-slate-900/60"
                )}>
                  {status.stale.reportsQueuedTooLong}
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium block">Reports currently Generating</span>
                  <span className="text-[10px] text-muted-foreground">Stuck in "generating" &gt; 5 minutes</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold px-2 py-0.5 rounded",
                  status.stale.reportsGeneratingTooLong > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-slate-50 dark:bg-slate-900/60"
                )}>
                  {status.stale.reportsGeneratingTooLong}
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium block">Gaps waiting in Queue</span>
                  <span className="text-[10px] text-muted-foreground">Stuck in "queued" &gt; 30 minutes</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold px-2 py-0.5 rounded",
                  status.stale.gapsQueuedTooLong > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-slate-50 dark:bg-slate-900/60"
                )}>
                  {status.stale.gapsQueuedTooLong}
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium block">Gaps currently Analyzing</span>
                  <span className="text-[10px] text-muted-foreground">Stuck in "analyzing" &gt; 5 minutes</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold px-2 py-0.5 rounded",
                  status.stale.gapsAnalyzingTooLong > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-slate-50 dark:bg-slate-900/60"
                )}>
                  {status.stale.gapsAnalyzingTooLong}
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-medium block">Sync runs marked Running</span>
                  <span className="text-[10px] text-muted-foreground">Stuck in "running" &gt; 2 hours</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold px-2 py-0.5 rounded",
                  status.stale.syncRunningTooLong > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-slate-50 dark:bg-slate-900/60"
                )}>
                  {status.stale.syncRunningTooLong}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Action Recommendations */}
        <div className="bg-card dark:bg-[#111B27] border border-[#EAEAEA] dark:border-[#26334A] rounded-xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.01)] flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-base font-bold tracking-tight text-[#111111] dark:text-white flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500 stroke-[1.5]" />
              Diagnostic Actions
            </h2>
            <p className="text-xs text-muted-foreground">
              Suggested next-steps generated automatically to resolve backend pipeline issues.
            </p>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !status || status.recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2 stroke-[1.5]" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Pipeline healthy</span>
                <span className="text-[10px] mt-0.5">No immediate interventions required.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {status.recommendations.map((rec, idx) => (
                  <div
                    key={`rec-${idx}`}
                    className={cn(
                      "p-3 rounded-lg border flex gap-2.5 text-xs",
                      rec.severity === "critical" && "bg-red-500/5 border-red-500/20 text-red-800 dark:text-red-400",
                      rec.severity === "warning" && "bg-amber-500/5 border-amber-500/20 text-amber-800 dark:text-amber-400",
                      rec.severity === "info" && "bg-blue-500/5 border-blue-500/20 text-blue-800 dark:text-blue-400"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {rec.severity === "critical" && <XCircle className="h-4 w-4 text-red-500" />}
                      {rec.severity === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      {rec.severity === "info" && <Info className="h-4 w-4 text-blue-500" />}
                    </div>
                    <div>
                      <span className="font-semibold block">{rec.title}</span>
                      <span className="text-muted-foreground mt-0.5 block leading-normal">{rec.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Failed Jobs log */}
      {status && status.recentFailedJobs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-[#111111] dark:text-white">Recent Failed Jobs</h2>
          <div className="rounded-xl border border-[#EAEAEA] dark:border-[#26334A] bg-card text-card-foreground shadow-[0_2px_12px_rgba(0,0,0,0.015)] overflow-hidden">
            <Table>
              <TableHeader className="bg-[#FBFBFA] dark:bg-[#162235]/40 border-b border-[#EAEAEA] dark:border-[#26334A]">
                <TableRow>
                  <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 w-44">Queue</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11">Job Details</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 text-center w-24">Attempts</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider uppercase text-[#787774] dark:text-slate-400 h-11 w-44">Timestamp</TableHead>
                  <TableHead className="w-16 h-11" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#EAEAEA] dark:divide-[#26334A]">
                {status.recentFailedJobs.map((job) => {
                  const isExpanded = expandedJobId === job.jobId;
                  return (
                    <TooltipProvider key={job.jobId}>
                      <TableRow 
                        onClick={() => setExpandedJobId(isExpanded ? null : job.jobId)}
                        className="hover:bg-[#F9F9F8]/80 dark:hover:bg-[#162235]/30 cursor-pointer border-b border-[#EAEAEA] dark:border-[#26334A] transition-colors"
                      >
                        <TableCell className="font-semibold text-sm text-red-600 dark:text-red-400 py-3.5">
                          {job.queue}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm text-[#111111] dark:text-white">
                              {job.name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-lg mt-0.5">
                              {job.failedReason}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                          <div className="flex flex-col items-center gap-1">
                            <span>{job.attemptsMade}/{job.maxAttempts}</span>
                            {job.isExhausted && (
                              <Badge variant="outline" className="border-red-200 bg-red-50 px-1.5 py-0 text-[9px] text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                                Exhausted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-3.5">
                          {job.timestamp ? new Date(job.timestamp).toLocaleString("en-US", { hour12: false }) : "—"}
                        </TableCell>
                        <TableCell className="py-3.5 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow className="bg-red-500/[0.01] hover:bg-red-500/[0.01] border-b border-[#EAEAEA] dark:border-[#26334A]">
                          <TableCell colSpan={5} className="py-4 px-6 bg-slate-50/50 dark:bg-slate-900/30">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-red-600 dark:text-red-400">Job ID: {job.jobId}</span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>Copy this ID to query logs / retry via backend shell</TooltipContent>
                                </Tooltip>
                              </div>
                              <pre className="text-xs font-mono bg-white dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-800/80 text-[#333333] dark:text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 shadow-inner leading-relaxed">
                                {job.failedReason}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TooltipProvider>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </main>
  );
}

function WorkerStatusBadge({ status }: { status: "alive" | "stale" | "missing" }) {
  if (status === "alive") {
    return (
      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
        Alive
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
        Stale
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900 rounded-full text-[10px] font-semibold px-2 py-0.5">
      Missing
    </Badge>
  );
}

function formatAge(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}
