import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/features/admin";
import {
  History, Search, Shield, Clock, Zap,
  User, Database, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminAuditLogsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "audit-logs", search, page],
    queryFn: () => adminApi.getAuditLogs({ search: search || undefined, page, pageSize: 20 }),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, pageSize: 20, totalPages: 1 };

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Audit Logs & Security Trail</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Immutable log of all user role updates, capability grants, status revocations, and system actions.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search action name, target table, or user..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800/50 dark:text-white"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Action</th>
                <th className="px-5 py-3.5">Actor</th>
                <th className="px-5 py-3.5">Target Entity</th>
                <th className="px-5 py-3.5">Details</th>
                <th className="px-5 py-3.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-36" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-5 py-4 text-right"><Skeleton className="h-4 w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    No audit records found matching the search.
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    {/* Action Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                          <Zap className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                          {log.actionName}
                        </span>
                      </div>
                    </td>

                    {/* Actor */}
                    <td className="px-5 py-4">
                      {log.user ? (
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{log.user.fullName}</p>
                          <p className="text-[10px] text-slate-400">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 italic">
                          <Shield className="h-3 w-3" /> System Policy
                        </span>
                      )}
                    </td>

                    {/* Target Table */}
                    <td className="px-5 py-4">
                      {log.targetTableName ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {log.targetTableName}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Details */}
                    <td className="px-5 py-4 max-w-xs truncate text-[11px] text-slate-500 font-mono">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>

                    {/* Timestamp */}
                    <td className="px-5 py-4 text-right text-slate-500 tabular-nums">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200/80 px-5 py-3 text-xs dark:border-slate-800">
            <span className="text-slate-500">
              Page {meta.page} of {meta.totalPages} ({meta.total} records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
