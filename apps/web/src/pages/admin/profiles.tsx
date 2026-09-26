import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import {
  UserCheck, Search, Filter, ExternalLink, BadgeCheck,
  Building2, GraduationCap, Mail, ShieldAlert, Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface AcademicProfileItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  publicHandle?: string;
  primaryPosition?: string;
  positionTitle?: string;
  institution?: string;
  department?: string;
  institutionalEmail?: string;
  identityStatus: string;
  positionStatus: string;
  affiliationStatus: string;
  expertiseAreas: string[];
  createdAt: string;
}

export function AdminProfilesPage() {
  const [search, setSearch] = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "academic-profiles", search, filterPosition],
    queryFn: async () => {
      // In production /admin/users lists all users with their academic profile details
      const res = await api.get("/admin/users", {
        params: { search: search || undefined, pageSize: 50 },
      });
      return res.data.data as Array<{
        id: string;
        email: string;
        fullName: string;
        role: string;
        academicProfileType?: string;
        primaryPosition?: string;
        accountStatus: string;
        institution?: string;
        createdAt: string;
      }>;
    },
  });

  const filtered = (data || []).filter((u) => {
    if (filterPosition !== "ALL" && u.primaryPosition !== filterPosition) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Academic Profiles</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage public researcher profiles, handles, academic positions, and institutional affiliations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/academic-verifications"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            Verification Queue
          </Link>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, handle or institution..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800/50 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Positions</option>
            <option value="STUDENT">Students</option>
            <option value="LECTURER">Lecturers</option>
            <option value="RESEARCH_STAFF">Research Staff</option>
            <option value="OTHER">Other Positions</option>
          </select>
        </div>
      </div>

      {/* Table Card (Shadcn / TailAdmin Table Style) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Researcher</th>
                <th className="px-5 py-3.5">Position</th>
                <th className="px-5 py-3.5">Institution</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Joined Date</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-5 py-4 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    No academic profiles match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    {/* User info */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold dark:bg-blue-950/40 dark:text-blue-400">
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{user.fullName}</p>
                          <p className="text-[11px] text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Position badge */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <GraduationCap className="h-3 w-3 text-blue-500" />
                        {user.primaryPosition || "Unspecified"}
                      </span>
                    </td>

                    {/* Institution */}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300 font-medium">
                      {user.institution ? (
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{user.institution}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No affiliation</span>
                      )}
                    </td>

                    {/* System Role */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        user.role === "ADMIN"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                      }`}>
                        {user.role}
                      </span>
                    </td>

                    {/* Joined Date */}
                    <td className="px-5 py-4 text-slate-500 tabular-nums">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/settings?tab=profile`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Inspect <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
