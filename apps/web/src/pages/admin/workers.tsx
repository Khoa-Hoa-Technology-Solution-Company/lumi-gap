import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/features/admin";
import {
  Server, Activity, CheckCircle2, RefreshCw, Cpu,
  Layers, HardDrive, Clock, AlertCircle
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils";

export function AdminWorkersPage() {
  const { data: workers, isLoading, refetch } = useQuery({
    queryKey: ["admin", "workers"],
    queryFn: () => adminApi.getWorkers(),
  });

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Workers & Background Fleet</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time status of BullMQ job processors, worker heartbeats, and queue workloads.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Fleet
        </button>
      </div>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : (
          (workers || []).map((w: any) => (
            <div
              key={w.name}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3.5"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{w.name}</h3>
                  <span className="text-[11px] font-mono text-slate-400">Queue: {w.queue}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {w.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50/80 p-3 dark:bg-slate-800/40 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Active</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">{w.activeJobs}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Processed</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{formatNumber(w.completedJobs)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold">Failed</span>
                  <span className="text-sm font-bold text-slate-400 font-mono">{w.failedJobs}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Heartbeat</span>
                <span className="font-mono">{new Date(w.lastHeartbeat).toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
