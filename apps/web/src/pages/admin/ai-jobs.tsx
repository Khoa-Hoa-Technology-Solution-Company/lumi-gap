import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import {
  Cpu, Zap, Sparkles, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, Layers, FileText, Lightbulb
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils";

export function AdminAiJobsPage() {
  const { data: reports, isLoading: isReportsLoading } = useQuery({
    queryKey: ["admin", "ai-reports"],
    queryFn: async () => {
      const res = await api.get("/reports", { params: { pageSize: 20 } }).catch(() => ({ data: { data: [] } }));
      return (res.data.data ?? []) as Array<{
        id: string;
        topic?: string;
        query: string;
        status: string;
        modelVersion?: string;
        creditCost?: number;
        createdAt: string;
        completedAt?: string;
      }>;
    },
  });

  const { data: gaps, isLoading: isGapsLoading } = useQuery({
    queryKey: ["admin", "ai-gaps"],
    queryFn: async () => {
      const res = await api.get("/gaps", { params: { pageSize: 20 } }).catch(() => ({ data: { data: [] } }));
      return (res.data.data ?? []) as Array<{
        id: string;
        title: string;
        validationStatus?: string;
        confidenceScore?: number;
        createdAt: string;
      }>;
    },
  });

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">AI Operations & Jobs</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Monitor Gemini 2.5 synthesis runs, automated research gap validations, and LLM judge calibrations.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>RAG Synthesis Reports</span>
            <FileText className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {isReportsLoading ? <Skeleton className="h-7 w-12" /> : formatNumber(reports?.length ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Literature reviews synthesized with Gemini</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Validated Research Gaps</span>
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {isGapsLoading ? <Skeleton className="h-7 w-12" /> : formatNumber(gaps?.length ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Structured gap hypotheses extracted from literature</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Model Version</span>
            <Cpu className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-mono">gemini-2.5-flash</div>
          <p className="text-[11px] text-slate-400">Primary model for fast synthesis & grading</p>
        </div>
      </div>

      {/* Recent AI Runs List */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-purple-600" />
          Recent Literature Synthesis Runs
        </h2>
        {reports && reports.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reports.map((r) => (
              <div key={r.id} className="py-3.5 flex items-center justify-between text-xs">
                <div className="min-w-0 pr-4">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{r.query || r.topic || "Research Synthesis"}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Model: {r.modelVersion || "gemini-2.5-flash"} • {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                    {r.status || "completed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No recent AI synthesis runs recorded.</p>
        )}
      </div>
    </div>
  );
}
