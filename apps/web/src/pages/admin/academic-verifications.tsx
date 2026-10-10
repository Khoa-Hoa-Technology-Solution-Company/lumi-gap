import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  ExternalLink,
  ShieldCheck,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  HelpCircle,
  ShieldAlert,
  UserCheck,
  Mail,
  Building2,
  Briefcase,
  Award,
  CheckCheck,
  FileText,
  Search,
  History,
  X,
  Sparkles,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Info,
  GraduationCap,
  FileCheck2,
  AtSign,
  User,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { EvidenceBlobPreview } from "@/features/academic-profile/components/evidence-blob-preview";
import type {
  LecturerReviewChecklist,
  AcademicVerificationSource,
  AdminAcademicVerificationItem,
  AcademicProfile,
  AcademicVerificationRequest,
} from "@trend/shared-types";
import {
  useAcademicVerificationDetails,
  useAcademicVerificationEvidenceFile,
  useAcademicVerifications,
  useDecideAcademicVerification,
} from "@/features/academic-profile";

const loadPdfPreviewComponent = () =>
  import("@/features/academic-profile/components/private-evidence-pdf-preview");

const PrivateEvidencePdfPreview = lazy(loadPdfPreviewComponent);

const STATUS_FILTERS = [
  { value: "ALL", label: "All Requests", countKey: "ALL", color: "slate" },
  { value: "PENDING", label: "Pending", countKey: "PENDING", color: "amber" },
  { value: "NEEDS_MORE_INFORMATION", label: "Needs Info", countKey: "NEEDS_MORE_INFORMATION", color: "purple" },
  { value: "VERIFIED", label: "Verified", countKey: "VERIFIED", color: "emerald" },
  { value: "REJECTED", label: "Rejected", countKey: "REJECTED", color: "rose" },
  { value: "EXPIRED", label: "Expired", countKey: "EXPIRED", color: "zinc" },
  { value: "INVALIDATED", label: "Invalidated", countKey: "INVALIDATED", color: "zinc" },
] as const;

function VerificationStatusCell({ item }: { item: AdminAcademicVerificationItem }) {
  const { t } = useI18n();
  const { request } = item;
  const statusConf = getStatusBadgeConfig(request.status);
  const StatusIcon = statusConf.icon;

  const evidenceSources = request.sources?.filter(source => source.slot !== 0) ?? [];
  const hasEvidence = evidenceSources.length > 0 && evidenceSources.every(source => source.status === "VALID");

  const hasOrgBinding = Boolean(
    request.reviewChecklist?.institutionMatches && request.reviewChecklist?.institutionControlled ||
    request.status === "VERIFIED"
  );

  const hasIdentityMatch = Boolean(
    request.reviewChecklist?.identityMatches && request.reviewChecklist?.identityBound ||
    request.status === "VERIFIED"
  );

  const isFinalVerified = request.status === "VERIFIED";
  const isPending = request.status === "PENDING";
  const isNeedsInfo = request.status === "NEEDS_MORE_INFORMATION";
  const isRejected = request.status === "REJECTED";

  const steps = [
    { label: "1. Đã gửi hồ sơ", done: true, color: "emerald" },
    { label: "2. Minh chứng hợp lệ", done: hasEvidence || isFinalVerified, color: (hasEvidence || isFinalVerified) ? "emerald" : "amber" },
    { label: "3. Xác thực email / tổ chức", done: hasOrgBinding || isFinalVerified, color: (hasOrgBinding || isFinalVerified) ? "emerald" : "amber" },
    { label: "4. Đối chiếu định danh nhân sự", done: hasIdentityMatch || isFinalVerified, color: (hasIdentityMatch || isFinalVerified) ? "emerald" : "amber" },
    {
      label: `5. Thẩm định: ${request.status}`,
      done: isFinalVerified,
      pending: isPending,
      needsInfo: isNeedsInfo,
      rejected: isRejected,
      color: isFinalVerified ? "emerald" : isPending ? "amber" : isNeedsInfo ? "purple" : isRejected ? "rose" : "slate",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const summaryTitle = `Tiến trình thẩm định (${completedCount}/5):\n` +
    steps.map((s) => `• ${s.label} (${s.done ? "Hoàn tất" : s.pending ? "Đang chờ duyệt" : s.needsInfo ? "Cần bổ sung" : s.rejected ? "Từ chối" : "Chưa hoàn tất"})`).join("\n");

  return (
    <div className="flex flex-col items-start gap-1.5 whitespace-nowrap">
      {/* Sleek Modern Status Capsule */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all shadow-2xs whitespace-nowrap",
          request.status === "VERIFIED" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25",
          request.status === "PENDING" && "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25",
          request.status === "NEEDS_MORE_INFORMATION" && "bg-purple-500/12 text-purple-700 dark:text-purple-300 border border-purple-500/25",
          request.status === "REJECTED" && "bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/25",
          (request.status === "EXPIRED" || request.status === "INVALIDATED" || !request.status || request.status === "NOT_SUBMITTED") &&
            "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
        )}
      >
        <StatusIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{t(statusConf.label)}</span>
      </span>

      {/* 5-Step Micro Pipeline Stepper */}
      <div
        className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 px-2 py-0.5 dark:bg-slate-800/80 cursor-help transition-all hover:bg-slate-200/90 dark:hover:bg-slate-700/80 border border-slate-200/50 dark:border-slate-700/50"
        title={summaryTitle}
      >
        {steps.map((step, idx) => (
          <span
            key={idx}
            className={cn(
              "h-1.5 rounded-full transition-all",
              step.color === "emerald" && "w-2.5 bg-emerald-500 shadow-2xs shadow-emerald-500/50",
              step.color === "amber" && (step.pending ? "w-2.5 bg-amber-400 animate-pulse ring-1 ring-amber-400/40" : "w-2.5 bg-amber-400"),
              step.color === "purple" && "w-2.5 bg-purple-500 ring-1 ring-purple-400/40",
              step.color === "rose" && "w-2.5 bg-rose-500",
              step.color === "slate" && "w-1.5 bg-slate-300 dark:bg-slate-600",
            )}
          />
        ))}
        <span className="ml-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
          {completedCount}/5
        </span>
      </div>
    </div>
  );
}

export function AdminAcademicVerificationsPage() {
  const { t, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("requestId");
  function setSelectedId(id: string | null) {
    setParams(previous => { const next = new URLSearchParams(previous); if (id) next.set("requestId", id); else next.delete("requestId"); return next; }, { replace: true });
  }
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useAcademicVerifications(status, page, pageSize);
  const detail = useAcademicVerificationDetails(selectedId);

  const rawRequests = data?.data ?? [];
  const statusCounts = data?.meta?.statusCounts ?? {};

  const requests = useMemo(() => {
    if (!searchQuery.trim()) return rawRequests;
    const query = searchQuery.toLowerCase().trim();
    return rawRequests.filter(({ profile, request, accountEmail }) => {
      const name = (profile.displayName || "").toLowerCase();
      const email = (accountEmail || profile.affiliation?.institutionalEmail || "").toLowerCase();
      const institution = String(request.metadata?.institutionName || profile.affiliation?.institutionName || "").toLowerCase();
      const position = (request.targetValue || profile.positionTitle || "").toLowerCase();
      return name.includes(query) || email.includes(query) || institution.includes(query) || position.includes(query);
    });
  }, [rawRequests, searchQuery]);

  const totalItems = searchQuery.trim() ? requests.length : (data?.meta?.total ?? requests.length);
  const totalPages = Math.max(1, searchQuery.trim() ? Math.ceil(requests.length / pageSize) : (data?.meta?.totalPages ?? Math.ceil(totalItems / pageSize)));
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
        <p className="font-semibold">Could not load verification requests.</p>
        <p className="mt-1 text-xs">Please check your network connection or administrator permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Trust Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
            Affiliation & Academic Verification
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review declared academic positions and institution credentials against private supporting evidence.
          </p>
        </div>
      </header>

      {/* Status Overview Metric Cards / Filter Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {STATUS_FILTERS.map((filter) => {
          const isActive = status === filter.value;
          const count = statusCounts[filter.countKey] ?? (filter.value === "ALL" ? data?.meta?.total : undefined);
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={cn(
                "group relative flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all",
                isActive
                  ? "border-blue-600 bg-blue-50/70 shadow-xs ring-2 ring-blue-600/20 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/40",
              )}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {filter.label}
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={cn(
                  "text-lg font-black tracking-tight",
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-900 dark:text-white",
                )}>
                  {count !== undefined ? count : "—"}
                </span>
                <span className="text-[10px] text-slate-400">requests</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls & Search Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/60">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, email, institution, position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Filter:</span>
            <select
              aria-label="Filter status"
              className="h-9 rounded-lg border border-slate-200 bg-background px-3 text-xs font-semibold text-slate-800 shadow-2xs dark:border-slate-700 dark:text-slate-200"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({statusCounts[item.countKey] ?? (item.value === "ALL" ? data?.meta?.total : 0) ?? 0})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs font-medium text-amber-900 dark:text-amber-300">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p>
          Evidence documents and applicant details are private. Access is audited and restricted to authorized administrators.
        </p>
      </div>

      {/* Main Table */}
      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
          <ShieldAlert className="mx-auto h-8 w-8 text-slate-400 opacity-60" />
          <p className="mt-2 font-semibold">No verification requests found</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {searchQuery
              ? t('No requests match "{{query}}". Try clearing the search query.', { query: searchQuery })
              : t('There are currently no verification requests under status "{{status}}".', { status: t(status) })}
          </p>
          {status !== "ALL" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => {
                setStatus("ALL");
                setSearchQuery("");
              }}
            >
              View All Statuses
            </Button>
          )}
        </div>
      ) : (
        <div className="w-full overflow-x-auto lg:overflow-x-visible rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-left text-xs sm:text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">Applicant & Role</th>
                <th className="px-4 py-3">Position & Claim</th>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Method & Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {requests.map((item) => {
                const { profile, request, accountEmail } = item;
                const statusConf = getStatusBadgeConfig(request.status);
                const roleBadge = getRoleBadge(profile.academicRole);
                const StatusIcon = statusConf.icon;
                const instName = String(request.metadata?.institutionName || profile.affiliation?.institutionName || "Not provided");
                const claimText = request.type === "POSITION"
                  ? (request.targetValue || profile.positionTitle || "Position claim")
                  : (request.targetValue || profile.affiliation?.institutionName || "Affiliation claim");

                return (
                  <tr
                    key={request.id}
                    className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                  >
                    {/* 1. Applicant & Role */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <a
                          href={profile.publicHandle ? `/u/${encodeURIComponent(profile.publicHandle)}` : `/academics/${encodeURIComponent(profile.userId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600 ring-1 ring-blue-500/20 hover:ring-blue-500/40 dark:bg-blue-500/20 dark:text-blue-400 transition-all"
                          title={t("View public academic profile")}
                        >
                          {profile.displayName?.charAt(0) || "U"}
                        </a>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <a
                              href={profile.publicHandle ? `/u/${encodeURIComponent(profile.publicHandle)}` : `/academics/${encodeURIComponent(profile.userId)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 truncate max-w-[160px] inline-flex items-center gap-1 group"
                              title={profile.displayName}
                            >
                              <span className="truncate">{profile.displayName}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                            {roleBadge && (
                              <span className={cn("rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider", roleBadge.className)}>
                                {roleBadge.label}
                              </span>
                            )}
                          </div>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400 max-w-[210px]" title={accountEmail || profile.affiliation?.institutionalEmail || ""}>
                            {accountEmail || profile.affiliation?.institutionalEmail || "No email available"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Position & Claim */}
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]" title={claimText}>
                        {claimText}
                      </p>
                      <span className={cn(
                        "inline-flex items-center mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider",
                        request.type === "POSITION"
                          ? "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                      )}>
                        {request.type === "POSITION" ? "Position" : "Affiliation"}
                      </span>
                    </td>

                    {/* 3. Institution */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="font-semibold truncate max-w-[170px]" title={instName}>
                          {instName}
                        </span>
                      </div>
                      {profile.affiliation?.department && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]" title={profile.affiliation.department}>
                          {profile.affiliation.department}
                        </p>
                      )}
                    </td>

                    {/* 4. Method & Submitted */}
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px]" title={evidenceMethod(request.verificationMethod ?? request.evidenceType)}>
                        {evidenceMethod(request.verificationMethod ?? request.evidenceType)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                        {new Date(request.submittedAt).toLocaleDateString()} · {new Date(request.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </td>

                    {/* 5. Status Pill & Pipeline Micro Stepper */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <VerificationStatusCell item={item} />
                    </td>

                    {/* 6. Unified Action Button */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={request.status === "PENDING" ? "default" : "outline"}
                        onClick={() => setSelectedId(request.id)}
                        className={cn(
                          "h-8 rounded-lg px-3 text-xs font-bold shadow-2xs gap-1.5 transition-all",
                          request.status === "PENDING"
                            ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20"
                            : "border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                        title={request.status === "PENDING" ? "Thẩm định và xét duyệt hồ sơ" : "Xem chi tiết hồ sơ và ma trận xác minh"}
                      >
                        {request.status === "PENDING" ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            <span>{language === "vi" ? "Thẩm định" : t("Review")}</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-blue-600" />
                            <span>{language === "vi" ? "Chi tiết" : t("Details")}</span>
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls - Always Visible */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t("Showing")}{" "}
            <strong className="font-bold text-slate-900 dark:text-white">
              {startItem}–{endItem}
            </strong>{" "}
            {t("of")}{" "}
            <strong className="font-bold text-slate-900 dark:text-white">{totalItems}</strong>{" "}
            {t("requests")}
          </span>
          <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-700" />
          <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
            <span>{t("Per page")}:</span>
            <select
              aria-label="Items per page"
              className="h-8 rounded-lg border border-slate-200 bg-background px-2 text-xs font-semibold text-slate-800 shadow-2xs dark:border-slate-700 dark:text-slate-200"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-semibold"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("Previous")}
          </Button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<Array<number | string>>((acc, p, idx, arr) => {
              if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                acc.push("...");
              }
              acc.push(p);
              return acc;
            }, [])
            .map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">
                  …
                </span>
              ) : (
                <button
                  key={`page-${item}`}
                  type="button"
                  onClick={() => setPage(item as number)}
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-colors",
                    page === item
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {item}
                </button>
              ),
            )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-semibold"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("Next")}
          </Button>
        </div>
      </div>

      {/* Unified Verification Dossier & Review Dialog */}
      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="flex h-[88vh] max-h-[88vh] w-[94vw] max-w-5xl flex-col overflow-hidden overscroll-contain p-0 md:left-[calc(50%+8rem)]"
          overlayClassName="md:left-64 bg-slate-950/45 backdrop-blur-xs"
        >
          {detail.isLoading ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="h-48 w-full max-w-md animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
            </div>
          ) : detail.error || !detail.data ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <p role="alert" className="text-sm font-semibold text-red-600">
                Could not load this request.
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          ) : (
            <ReviewDetail
              key={detail.data.request.id}
              item={detail.data}
              onDone={() => setSelectedId(null)}
              onInspectRequest={(id) => setSelectedId(id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

{/* ========================================================================= */}
{/* FULL STATUS COMPREHENSIVE MODAL & WORKFLOW COMPONENTS                      */}
{/* ========================================================================= */}

type VerificationTab = "request" | "identity" | "decision";

const TABS_CONFIG = [
  { id: "request" as const, label: "Yêu cầu & Minh chứng", enLabel: "Request & Evidence", icon: FileText, step: 1 },
  { id: "identity" as const, label: "Tài khoản & tư cách", enLabel: "Identity & credentials", icon: UserCheck, step: 2 },
  { id: "decision" as const, label: "Quyết định & Lịch sử", enLabel: "Decision & History", icon: Sparkles, step: 3 },
];

function VerificationTabs({
  active,
  onChange,
  prefix,
  evidenceCount,
  historyCount,
}: {
  active: VerificationTab;
  onChange: (tab: VerificationTab) => void;
  prefix: string;
  evidenceCount: number;
  historyCount: number;
}) {
  const { t, language } = useI18n();
  const tabs = TABS_CONFIG;

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    let nextIndex = -1;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex >= 0) {
      event.preventDefault();
      const nextTab = tabs[nextIndex]!;
      onChange(nextTab.id);
      const nextEl = document.getElementById(`${prefix}-${nextTab.id}`);
      nextEl?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={t("Verification review sections")}
      className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200/80 bg-slate-50/60 px-4 py-2.5 [scrollbar-width:thin] dark:border-slate-800 dark:bg-slate-900/60"
      data-no-i18n
    >
      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        const count = tab.id === "request" ? (evidenceCount > 0 ? evidenceCount : undefined) : tab.id === "decision" ? (historyCount > 0 ? historyCount : undefined) : undefined;
        const tabLabel = language === "vi" ? tab.label : (t(tab.enLabel) || tab.label);

        return (
          <button
            key={tab.id}
            id={`${prefix}-${tab.id}`}
            type="button"
            role="tab"
            aria-label={tabLabel}
            aria-selected={isActive}
            aria-controls={`${prefix}-panel`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              "group relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              isActive
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-slate-200/80 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[10px] font-black transition-colors",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300",
              )}
            >
              {tab.step}
            </span>
            <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            <span>{tabLabel}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config = getStatusBadgeConfig(status);
  return (
    <Badge variant={config.variant} className={cn("shrink-0 gap-1.5 text-xs font-semibold py-1 px-2.5 rounded-md shadow-2xs whitespace-nowrap", config.className)}>
      <config.icon className="h-3.5 w-3.5 shrink-0" />
      <span>{t(status === "UNCHECKED" ? "Not checked" : config.label)}</span>
    </Badge>
  );
}

function VerificationModalHeader({
  item,
}: {
  item: AdminAcademicVerificationItem;
}) {
  const { t, language } = useI18n();
  const { profile, request } = item;
  const roleBadge = getRoleBadge(profile.academicRole);
  const isPending = request.status === "PENDING";
  const profilePath = profile.publicHandle
    ? `/u/${encodeURIComponent(profile.publicHandle)}`
    : `/academics/${encodeURIComponent(profile.userId)}`;

  const modeBadge = isPending
    ? {
        label: language === "vi" ? "Không gian thẩm định hồ sơ" : "Review Workspace",
        className: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      }
    : {
        label: language === "vi" ? "Hồ sơ xác minh học thuật" : "Academic Verification Dossier",
        className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      };

  return (
    <DialogHeader className="shrink-0 border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 pr-12 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <a
            href={profilePath}
            target="_blank"
            rel="noopener noreferrer"
            title={language === "vi" ? `Xem hồ sơ cá nhân của ${profile.displayName}` : `View ${profile.displayName}'s profile`}
            className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-black text-white shadow-xs ring-4 ring-blue-500/10 hover:ring-blue-500/30 transition-all"
          >
            {profile.displayName?.charAt(0) || "U"}
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={profilePath}
                target="_blank"
                rel="noopener noreferrer"
                title={language === "vi" ? `Xem hồ sơ cá nhân của ${profile.displayName}` : `View ${profile.displayName}'s profile`}
                className="group inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors"
              >
                <DialogTitle className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white group-hover:text-blue-600 truncate cursor-pointer">
                  {profile.displayName}
                </DialogTitle>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600 shrink-0" />
              </a>
              {roleBadge && (
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", roleBadge.className)}>
                  {t(roleBadge.label)}
                </span>
              )}
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", modeBadge.className)}>
                {modeBadge.label}
              </span>
            </div>
            <DialogDescription className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate max-w-[200px]">{String(request.metadata?.institutionName || profile.affiliation?.institutionName || t("Not provided"))}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate max-w-[180px]">{request.targetValue || profile.positionTitle || t("Not provided")}</span>
              </span>
            </DialogDescription>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <a
            href={profilePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-blue-400 transition-colors"
            title={language === "vi" ? "Mở trang hồ sơ người dùng" : "Open user profile"}
          >
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span>{language === "vi" ? "Hồ sơ" : "Profile"}</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
          <VerificationBadge status={request.status} />
        </div>
      </div>
    </DialogHeader>
  );
}

function RequestSummary({ item }: { item: AdminAcademicVerificationItem }) {
  const { t, language } = useI18n();
  const { request, profile, accountEmail, accountEmailVerified } = item;
  const roleBadge = getRoleBadge(profile.academicRole);
  const claimText = request.type === "POSITION"
    ? (request.targetValue || profile.positionTitle || "Position claim")
    : (request.targetValue || profile.affiliation?.institutionName || "Affiliation claim");
  const instName = String(request.metadata?.institutionName || profile.affiliation?.institutionName || "Not provided");

  return (
    <div className="space-y-6" data-no-i18n>
      {/* Top Banner Card: Overview */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-blue-50/60 via-indigo-50/30 to-white p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:from-blue-950/30 dark:via-indigo-950/10 dark:to-slate-900">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white shadow-sm ring-4 ring-blue-500/20">
            {profile.displayName?.charAt(0) || "U"}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                {String(request.metadata?.claimedName || profile.displayName)}
              </h3>
              {roleBadge && (
                <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider", roleBadge.className)}>
                  {t(roleBadge.label)}
                </span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{instName}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{claimText}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:self-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const el = document.getElementById("submitted-evidence-section");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="h-8 gap-1.5 text-xs font-semibold text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100/80 hover:text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300"
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>{language === "vi" ? "Xem minh chứng" : "Jump to evidence"}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <VerificationBadge status={request.status} />
        </div>
      </div>

      {/* Grid of Two Distinct Information Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card 1: Khai báo học thuật đề nghị thẩm định */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                {t("Declared Academic Claim")}
              </h4>
              <p className="text-[11px] text-slate-400">Candidate declared credentials</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("Declared Claim")}
              </span>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                <Briefcase className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-sm font-extrabold text-indigo-950 dark:text-indigo-200">
                  {claimText}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Institution")}</span>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate" title={instName}>{instName}</span>
                </p>
                {profile.affiliation?.department && (
                  <p className="mt-0.5 text-[11px] text-slate-500">{profile.affiliation.department}</p>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Request type")}</span>
                <p className="mt-1">
                  <span className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
                    request.type === "POSITION"
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300"
                  )}>
                    {t(request.type === "POSITION" ? "Position verification" : "Affiliation verification")}
                  </span>
                </p>
              </div>
            </div>

            {Boolean(request.metadata?.studentId || request.metadata?.staffId) && (
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                {Boolean(request.metadata?.staffId) && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Staff ID")}</span>
                    <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-slate-100">{String(request.metadata?.staffId)}</p>
                  </div>
                )}
                {Boolean(request.metadata?.studentId) && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Student ID")}</span>
                    <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-slate-100">{String(request.metadata?.studentId)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Quy trình thẩm định & Mốc thời gian */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                {t("Method & Timestamps")}
              </h4>
              <p className="text-[11px] text-slate-400">Audit trail & submission metadata</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Verification method")}</span>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span>{t(evidenceMethod(request.verificationMethod ?? request.evidenceType))}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Submitted evidence")}</span>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <FolderOpen className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{t("{{count}} evidence sources", { count: request.sources?.length || (request.evidenceFileName || request.reference ? 1 : 0) })}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Submitted on")}</span>
                <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                  {new Date(request.submittedAt).toLocaleString(language)}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Decision date")}</span>
                <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                  {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString(language) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("Pending evaluation")}</span>
                  )}
                </p>
              </div>
            </div>

            {Boolean(request.metadata?.proofType) && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Proof Type")}</span>
                <p className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{String(request.metadata?.proofType)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Applicant Note Callout if provided */}
      {Boolean(request.metadata?.additionalNote) && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 dark:border-amber-500/30">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
            <Info className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{t("Applicant Note")}</span>
          </div>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200 pl-6">
            {String(request.metadata?.additionalNote)}
          </p>
        </div>
      )}

      {/* Rejection / Reviewer Reason if present */}
      {request.rejectionReason && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 dark:border-rose-900">
          <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300">{t("Reviewer Reason")}</h4>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-200 whitespace-pre-wrap">{request.rejectionReason}</p>
        </div>
      )}

      {/* Technical details collapsed */}
      <details className="group rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40">
        <summary className="cursor-pointer font-bold text-slate-600 dark:text-slate-400 list-none flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {t("Technical details")}
          </span>
          <span className="font-mono text-[10px] text-slate-400">{request.id}</span>
        </summary>
        <div className="mt-3 border-t border-slate-200/60 pt-2 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400 space-y-1">
          <p>Request ID: {request.id}</p>
          <p>Profile ID: {profile.id}</p>
          <p>Method: {request.verificationMethod ?? request.evidenceType}</p>
        </div>
      </details>
    </div>
  );
}

function VerificationHistory({
  history,
  currentRequestId,
  onInspect,
}: {
  history: AcademicVerificationRequest[];
  currentRequestId?: string;
  onInspect?: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const entries = [...history].sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt));

  return (
    <section className="space-y-4" data-no-i18n>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
          {t("Verification history")}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t("Most recent requests appear first.")}
        </p>
      </div>

      {!entries.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-slate-800">
          {t("No verification history yet.")}
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 pl-4 space-y-4 ml-2 dark:border-slate-800">
          {entries.map((entry) => {
            const statusConfig = getStatusBadgeConfig(entry.status);
            const StatusIcon = statusConfig.icon;
            const isCurrent = entry.id === currentRequestId;

            return (
              <div key={entry.id} className="relative group">
                <div className="absolute -left-[23px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-4 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    entry.status === "VERIFIED" ? "bg-emerald-500" : entry.status === "PENDING" ? "bg-amber-400" : "bg-rose-500"
                  )} />
                </div>
                <div className={cn(
                  "rounded-2xl border p-4 shadow-2xs transition-all",
                  isCurrent
                    ? "border-blue-300 bg-blue-50/20 dark:border-blue-800 dark:bg-blue-950/20"
                    : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60"
                )}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {t(entry.type === "POSITION" ? "Position verification" : "Affiliation verification")}
                        {entry.targetValue ? ` · ${entry.targetValue}` : ""}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {t("Current Request")}
                        </span>
                      )}
                    </div>
                    <Badge variant={statusConfig.variant} className={cn("text-xs font-semibold gap-1", statusConfig.className)}>
                      <StatusIcon className="h-3 w-3" />
                      <span>{t(statusConfig.label)}</span>
                    </Badge>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      {t("Submitted on")}: {new Date(entry.submittedAt).toLocaleString(language)}
                      {entry.reviewedAt && ` · ${t("Decision date")}: ${new Date(entry.reviewedAt).toLocaleString(language)}`}
                    </span>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                        <CheckCheck className="h-3 w-3" />
                        <span>{t("Current Request")}</span>
                      </span>
                    ) : onInspect ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs font-semibold gap-1 hover:text-blue-600" onClick={() => onInspect(entry.id)}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("Inspect Review")}
                      </Button>
                    ) : null}
                  </div>

                  {entry.rejectionReason && (
                    <div className="mt-2 rounded-xl bg-rose-50/70 p-2.5 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                      <span className="font-bold">Lý do từ chối:</span> {entry.rejectionReason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

{/* ========================================================================= */}
{/* STATUS MATRIX COMPONENT (6 CREDENTIALS - NO TRUNCATION)                    */}
{/* ========================================================================= */}

function FullStatusMatrix({
  profile,
  request: _request,
  accountEmail,
  accountEmailVerified,
}: {
  profile: AcademicProfile;
  request?: AcademicVerificationRequest;
  accountEmail?: string;
  accountEmailVerified?: boolean;
}) {
  const { t } = useI18n();
  const orcid = profile.academicIdentityLinks?.find(link => link.provider === "ORCID" && link.status !== "INVALID");
  const statuses = profile.verificationStatuses ?? {
    identity: "NOT_SUBMITTED",
    email: "NOT_SUBMITTED",
    affiliation: "NOT_SUBMITTED",
    position: "NOT_SUBMITTED",
    orcid: "NOT_SUBMITTED",
  };

  const institutionalEmail = profile.affiliation?.institutionalEmail || profile.institutionalEmail;
  const isInstitutionalEmailPresent = Boolean(institutionalEmail?.trim());

  // Institutional email cannot be VERIFIED if no email exists on the profile
  const computedEmailStatus = !isInstitutionalEmailPresent
    ? "NOT_SUBMITTED"
    : (statuses.email ?? "UNVERIFIED");

  const credentials = [
    {
      key: "affiliation",
      title: "Academic Affiliation",
      subtitle: "University / Institution membership",
      value: profile.affiliation?.institutionName || profile.institution || "Not Affiliated",
      status: statuses.affiliation,
      icon: Building2,
    },
    {
      key: "position",
      title: "Academic Position",
      subtitle: "Faculty / Student / Researcher rank",
      value: profile.positionTitle || profile.primaryPosition || "Student",
      status: statuses.position,
      icon: Briefcase,
    },
    {
      key: "email",
      title: "Institutional Mailbox",
      subtitle: "Verified domain mailbox challenge",
      value: institutionalEmail || "No institutional email registered",
      status: computedEmailStatus,
      icon: Mail,
    },
    {
      key: "identity",
      title: "Claimed Identity",
      subtitle: "Legal name matching applicant",
      value: profile.displayName || "Not declared",
      status: statuses.identity,
      icon: UserCheck,
    },
    {
      key: "accountEmail",
      title: "Account Email Ownership",
      subtitle: "LumiGap account credentials",
      value: accountEmail || "Account email unavailable",
      status: accountEmailVerified ? "VERIFIED" : "UNVERIFIED",
      icon: AtSign,
    },
    {
      key: "orcid",
      title: "ORCID Researcher ID",
      subtitle: "Scholarly record & publications",
      value: orcid?.identifier || orcid?.profileUrl || "Not connected to ORCID",
      status: statuses.orcid,
      icon: Award,
    },
  ];

  const credentialOrder = ["accountEmail", "identity", "email", "affiliation", "position", "orcid"];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5" data-no-i18n>
      {credentials
        .sort((left, right) => credentialOrder.indexOf(left.key) - credentialOrder.indexOf(right.key))
        .map((credential) => {
          const Icon = credential.icon;
          return (
            <div
              key={credential.key}
              className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white break-words" title={t(credential.title)}>
                        {t(credential.title)}
                      </h4>
                      <p className="text-[10px] text-slate-400 break-words" title={t(credential.subtitle)}>
                        {t(credential.subtitle)}
                      </p>
                    </div>
                  </div>
                  <VerificationBadge status={credential.status ?? "NOT_SUBMITTED"} />
                </div>
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Value</span>
                <p className="mt-0.5 text-xs font-extrabold text-slate-900 dark:text-slate-100 break-words [overflow-wrap:anywhere]">
                  {t(credential.value)}
                </p>
              </div>
            </div>
          );
        })}
    </div>
  );
}

{/* ========================================================================= */}
{/* REVIEW DETAIL MODAL BODY                                                  */}
{/* ========================================================================= */}

function ReviewDetail({
  item,
  onDone,
  onInspectRequest,
}: {
  item: NonNullable<ReturnType<typeof useAcademicVerificationDetails>["data"]>;
  onDone: () => void;
  onInspectRequest?: (id: string) => void;
}) {
  const { t, language } = useI18n(), [tab, setTab] = useState<VerificationTab>("request"), prefix = useId();
  const reviewTabs = TABS_CONFIG;
  const nextTab = reviewTabs[reviewTabs.findIndex((entry) => entry.id === tab) + 1];
  const decide = useDecideAcademicVerification();
  const evidenceFile = useAcademicVerificationEvidenceFile();
  const [mode, setMode] = useState<"approve" | "reject" | "more_info">("approve");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [bindingMethod, setBindingMethod] = useState<"INSTITUTION_CONTACT" | "TRUSTED_INSTITUTION_RECORD">("INSTITUTION_CONTACT");
  const [bindingReference, setBindingReference] = useState("");
  const [error, setError] = useState("");
  const { profile, request, history, accountEmail, accountEmailVerified } = item;
  const lecturer = request.type === "POSITION" && (request.metadata?.academicRole === "LECTURER" || profile.academicRole === "LECTURER");
  const manual = request.verificationMethod === "MANUAL_INSTITUTIONAL_EVIDENCE";
  const adaptive = Boolean(request.verificationMethod);

  const [checklist, setChecklist] = useState<LecturerReviewChecklist>(
    request.reviewChecklist ?? {
      identityMatches: false,
      institutionMatches: false,
      currentPositionConfirmed: false,
      institutionControlled: false,
      noConflicts: false,
      identityBound: false,
      independentEvidence: false,
    },
  );

  const [checks, setChecks] = useState<Record<string, AcademicVerificationSource["status"]>>(
    Object.fromEntries((request.sources ?? []).map((source) => [source.id, source.status])),
  );
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>(
    Object.fromEntries((request.sources ?? []).map((source) => [source.id, source.reviewerNote ?? ""])),
  );
  const [domainConfirmed, setDomainConfirmed] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ url: string; blob: Blob; mimeType: string; name: string }>();
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const blobCacheRef = useRef<Record<string, { blob: Blob; url: string }>>({});

  useEffect(() => {
    // Preload PDF reader component immediately when review modal opens
    void loadPdfPreviewComponent();
    const cache = blobCacheRef.current;
    return () => {
      Object.values(cache).forEach((entry) => URL.revokeObjectURL(entry.url));
    };
  }, []);

  const sourceCount = request.sources?.filter((source) => source.slot !== 0).length ?? 0;
  const singleManual = manual && sourceCount === 1;

  const reviewLabels: Array<[keyof LecturerReviewChecklist, string]> = [
    ["identityMatches", "Identity/name matches the applicant"],
    ["institutionMatches", "Institution matches the claim"],
    ["currentPositionConfirmed", "Current Lecturer/faculty position confirmed"],
    ["institutionControlled", "Evidence is controlled or issued by the institution"],
    ["noConflicts", "No material conflict between evidence"],
    ["identityBound", "Evidence binds this LumiGap account to the claimed person"],
    ...(manual && sourceCount > 1
      ? [["independentEvidence", "Sources independently corroborate the institutional claim"]] as Array<[keyof LecturerReviewChecklist, string]>
      : []),
  ];

  const approvalReady =
    !lecturer ||
    (adaptive &&
      sourceCount > 0 &&
      reviewLabels.every(([key]) => checklist[key]) &&
      (!singleManual || note.trim().length >= 20) &&
      (!request.requiresIndependentIdentityBinding ||
        (bindingReference.trim().length >= 10 && note.trim().length >= 20)) &&
      Boolean(request.sources?.length) &&
      request.sources!.every(
        (source) =>
          checks[source.id] === "VALID" &&
          (!(source.sourceKind === "DOCUMENT" || source.fileName) || source.documentAvailable) &&
          (source.urlTrustStatus !== "PENDING_ADMIN_VALIDATION" || domainConfirmed[source.id]),
      ));

  const subject = request.type === "POSITION" ? "position" : "affiliation";

  async function submit() {
    setError("");
    if (mode !== "approve" && reason.trim().length < (lecturer ? 10 : 1)) {
      setError(lecturer ? "Explain the required changes or rejection reason in at least 10 characters." : "A reason for the applicant is required.");
      return;
    }
    if (mode === "approve" && !approvalReady) {
      setError("Complete the Lecturer checklist and validate every required source. Legacy requests need updated evidence.");
      return;
    }
    try {
      const review = lecturer
        ? {
            checklist,
            evidenceChecks: (request.sources ?? []).map((source) => ({
              id: source.id,
              status: checks[source.id] ?? "UNCHECKED",
              note: sourceNotes[source.id]?.trim() || undefined,
              ...(source.urlTrustStatus === "PENDING_ADMIN_VALIDATION"
                ? { institutionDomainConfirmed: Boolean(domainConfirmed[source.id]) }
                : {}),
            })),
          }
        : {};

      await decide.mutateAsync({
        requestId: request.id,
        input:
          mode === "approve"
            ? {
                decision: "approve",
                method: lecturer ? undefined : "ADMIN_REVIEW",
                note: note.trim() || undefined,
                ...(request.requiresIndependentIdentityBinding
                  ? { identityBindingMethod: bindingMethod, identityBindingReference: bindingReference.trim() }
                  : {}),
                ...review,
              }
            : mode === "more_info"
            ? { decision: "more_info", reason: reason.trim(), note: note.trim() || undefined, ...review }
            : { decision: "reject", reason: reason.trim(), note: note.trim() || undefined, ...review },
      });
      onDone();
    } catch (failure) {
      setError(
        (failure as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ||
          "Could not save this decision. The position may have changed or another administrator may have reviewed it.",
      );
    }
  }

  async function downloadEvidence(source?: AcademicVerificationSource, previewOnly = false) {
    setError("");
    const cacheKey = source ? source.id : "legacy";
    if (previewOnly && source) {
      setLoadingSourceId(source.id);
    }
    try {
      if (previewOnly) {
        void loadPdfPreviewComponent();
      }
      let entry = blobCacheRef.current[cacheKey];
      if (!entry) {
        const blob = await evidenceFile.mutateAsync(
          source ? { requestId: request.id, sourceId: source.id } : request.id,
        );
        const url = URL.createObjectURL(blob);
        entry = { blob, url };
        blobCacheRef.current[cacheKey] = entry;
      }
      if (previewOnly) {
        setPreview({
          url: entry.url,
          blob: entry.blob,
          mimeType: source?.mimeType ?? "application/pdf",
          name: source?.fileName ?? "Evidence",
        });
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = entry.url;
      anchor.download = source?.fileName || request.evidenceFileName || "position-evidence.pdf";
      anchor.click();
    } catch {
      setError("Could not retrieve private evidence.");
    } finally {
      setLoadingSourceId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <VerificationModalHeader item={item} />
      <VerificationTabs
        active={tab}
        onChange={setTab}
        prefix={prefix}
        evidenceCount={request.sources?.length || (request.evidenceFileName || request.reference ? 1 : 0)}
        historyCount={history.length}
      />
      <div
        id={`${prefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${prefix}-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth p-6 pb-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        {tab === "request" && (
          <div className="space-y-8">
            <RequestSummary item={item} />

            <section
              id="submitted-evidence-section"
              className="space-y-4 border-t border-slate-200/80 pt-6 pb-16 scroll-mt-4 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    {t("Submitted evidence")}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t("Compare each source with the person's name, institution and declared position.")}
                  </p>
                </div>
                {request.sources && request.sources.length > 0 && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900">
                    {request.sources.length} {language === "vi" ? "nguồn đối chiếu" : "evidence sources"}
                  </span>
                )}
              </div>

              {lecturer && !adaptive && request.status === "PENDING" && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Legacy evidence is preserved. Request updated adaptive evidence before approving Lecturer status.
                </div>
              )}

              {adaptive &&
                request.sources?.map((source, index) => (
                  <article
                    key={source.id}
                    className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                          <FileCheck2 className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            {t("Evidence {{number}}", { number: index + 1 })} · {t(evidenceMethod(source.type))}
                          </h4>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            {source.slot === 0 ? "Nguồn chính" : `Nguồn đối chiếu #${source.slot}`}
                          </span>
                        </div>
                      </div>
                      <VerificationBadge status={source.status} />
                    </div>

                    {source.customEvidenceName && (
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {source.customEvidenceName}{" "}
                        <span className="text-[11px] font-normal text-slate-400">(Applicant description)</span>
                      </p>
                    )}

                    {source.additionalExplanation && (
                      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                        <p className="font-semibold text-slate-400 text-[10px] uppercase">Ghi chú kèm theo:</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{source.additionalExplanation}</p>
                      </div>
                    )}

                    {source.fileName && (
                      <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300" data-no-i18n>
                        📄 {source.fileName}
                      </p>
                    )}

                    {source.reference && <EvidenceReference value={source.reference} />}

                    {source.urlTrustStatus === "PENDING_ADMIN_VALIDATION" && (
                      <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <p className="font-semibold">This website domain is not registered as trusted. Independently confirm that the institution controls this domain.</p>
                        {request.status === "PENDING" && (
                          <label className="flex items-start gap-2 cursor-pointer font-medium">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                              checked={Boolean(domainConfirmed[source.id])}
                              onChange={(e) => setDomainConfirmed((previous) => ({ ...previous, [source.id]: e.target.checked }))}
                            />
                            <span>Institution ownership of this domain independently confirmed</span>
                          </label>
                        )}
                      </div>
                    )}

                    {source.documentAvailable ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs font-semibold gap-1.5"
                          disabled={evidenceFile.isPending && loadingSourceId === source.id}
                          onMouseEnter={() => void loadPdfPreviewComponent()}
                          onFocus={() => void loadPdfPreviewComponent()}
                          onClick={() => void downloadEvidence(source, true)}
                        >
                          {loadingSourceId === source.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                              <span>{language === "vi" ? "Đang mở tài liệu…" : "Opening…"}</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              <span>{language === "vi" ? "Xem trước tài liệu" : "Preview document"}</span>
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs font-semibold gap-1.5"
                          disabled={evidenceFile.isPending}
                          onClick={() => void downloadEvidence(source)}
                        >
                          <Download className="h-3.5 w-3.5 text-slate-600" />
                          <span>{t("Download Private Document")}</span>
                        </Button>
                      </div>
                    ) : (
                      !source.reference && (
                        <p className="text-xs text-slate-400">{t("This document is no longer stored.")}</p>
                      )
                    )}

                    {request.status === "PENDING" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>Đánh giá nguồn này:</span>
                          <select
                            aria-label={`Assessment: ${source.type}`}
                            className="h-8 rounded-lg border border-slate-200 bg-background px-2.5 text-xs font-medium dark:border-slate-700"
                            value={checks[source.id] ?? "UNCHECKED"}
                            onChange={(e) => setChecks((previous) => ({ ...previous, [source.id]: e.target.value as AcademicVerificationSource["status"] }))}
                          >
                            {["UNCHECKED", "VALID", "INVALID", "INCONCLUSIVE"].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>Ghi chú nội bộ cho nguồn này:</span>
                          <Input
                            aria-label={`Private source note: ${source.type}`}
                            placeholder="Ghi chú thẩm định (tùy chọn)"
                            value={sourceNotes[source.id] ?? ""}
                            maxLength={1000}
                            onChange={(e) => setSourceNotes((previous) => ({ ...previous, [source.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </label>
                      </div>
                    ) : (
                      source.reviewerNote && (
                        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800">
                          <span className="font-semibold text-slate-400">Ghi chú người duyệt:</span> {source.reviewerNote}
                        </div>
                      )
                    )}
                  </article>
                ))}

              {!adaptive && request.reference && request.evidenceType !== "OTHER" && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <EvidenceReference value={request.reference} />
                </div>
              )}

              {request.evidenceFileName && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={request.evidenceFileName}>
                        {request.evidenceFileName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {request.evidenceSizeBytes ? t("{{size}} MB · Private PDF", { size: (request.evidenceSizeBytes / 1024 / 1024).toFixed(1) }) : t("Private PDF")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 font-semibold text-xs"
                    disabled={evidenceFile.isPending}
                    onClick={() => void downloadEvidence()}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{evidenceFile.isPending ? "Đang tải…" : "Tải xuống PDF"}</span>
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "identity" && (
          <section className="space-y-6">
            <div data-no-i18n>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{t("Identity & credentials")}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t("These are the account's current credentials. They may differ from the submitted claim.")}
              </p>
            </div>
            <FullStatusMatrix profile={profile} accountEmail={accountEmail} accountEmailVerified={accountEmailVerified} />
            {Boolean(request.metadata?.institutionalEmail) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <Detail label={t("Institutional email in this request")} value={String(request.metadata?.institutionalEmail)} />
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <Detail label={t("Institutional Identity Provenance")} value={t(request.metadata?.identitySource === "ACCOUNT" ? "Reused verified account email" : "Verified email linked to the same User")} />
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "decision" && (
          <div className="space-y-8">
            <section className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {language === "vi" ? "Quyết định xét duyệt" : t("Review decision")}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t("Review the evidence before recording a decision.")}
                </p>
              </div>

              {lecturer && adaptive && (
                <fieldset className="space-y-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/20 p-5 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <legend className="px-2 font-black text-indigo-950 uppercase tracking-wider dark:text-indigo-300">
                    {t("Verification Checklist")}
                  </legend>
                  <div className="space-y-2 mt-2">
                    {reviewLabels.map(([key, label]) => (
                      <label
                        key={key}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer",
                          checklist[key]
                            ? "border-emerald-300 bg-emerald-50/50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={Boolean(checklist[key])}
                          disabled={request.status !== "PENDING"}
                          onChange={(e) => setChecklist((previous) => ({ ...previous, [key]: e.target.checked }))}
                        />
                        <span className="font-semibold">{t(label)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {request.status === "PENDING" ? (
                <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Lựa chọn hành động quyết định
                    </Label>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setMode("approve")}
                        aria-pressed={mode === "approve"}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all",
                          mode === "approve"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{t("Approve")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("more_info")}
                        aria-pressed={mode === "more_info"}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all",
                          mode === "more_info"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                        )}
                      >
                        <AlertCircle className="h-4 w-4" />
                        <span>{t("Request more information")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("reject")}
                        aria-pressed={mode === "reject"}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all",
                          mode === "reject"
                            ? "bg-rose-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                        )}
                      >
                        <XCircle className="h-4 w-4" />
                        <span>{t("Reject")}</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{t(mode === "approve" ? "Approval verifies the declared Lecturer position. The applicant will receive an in-app notification and email." : mode === "more_info" ? "Review pauses until the applicant submits supplementary evidence. A new revision returns to the review queue." : "Rejection closes this request. The applicant can submit a new request with corrected information or new evidence.")}</p>
                  {mode !== "approve" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="verification-rejection-reason" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t(mode === "more_info" ? "Required updates for applicant" : "Reason for applicant")} <span className="text-red-500">*</span>
                      </Label>
                      <textarea
                        id="verification-rejection-reason"
                        value={reason}
                        maxLength={1000}
                        minLength={lecturer ? 10 : 1}
                        aria-describedby="verification-feedback-help"
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t(mode === "more_info" ? "List the missing evidence and explain how the applicant can address it." : "Explain why the evidence does not establish the current Lecturer position.")}
                        className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p id="verification-feedback-help" className="text-xs leading-5 text-slate-500">{t("The applicant will see this message in verification tracking and email. Internal notes stay private.")}</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="verification-admin-note" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {t("Internal admin note")}
                    </Label>
                    <textarea
                      id="verification-admin-note"
                      className="min-h-20 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 dark:border-slate-700"
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Private, not shown on the public profile"
                    />
                  </div>

                  {request.requiresIndependentIdentityBinding && (
                    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 text-xs dark:border-slate-800">
                      <legend className="px-1 font-bold">{t("Independent identity binding")}</legend>
                      <Label htmlFor="binding-method">{t("Method")}</Label>
                      <select
                        id="binding-method"
                        className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
                        value={bindingMethod}
                        onChange={(e) => setBindingMethod(e.target.value as typeof bindingMethod)}
                      >
                        <option value="INSTITUTION_CONTACT">Confirmation through an independently established institution contact</option>
                        <option value="TRUSTED_INSTITUTION_RECORD">Independently obtained trusted institution record</option>
                      </select>
                      <Label htmlFor="binding-reference">{t("Provenance / independently established channel")}</Label>
                      <Input
                        id="binding-reference"
                        minLength={10}
                        maxLength={500}
                        value={bindingReference}
                        onChange={(e) => setBindingReference(e.target.value)}
                        placeholder="Enter verification reference channel..."
                      />
                    </fieldset>
                  )}

                  {error && <p role="alert" className="text-xs font-bold text-red-600">{error}</p>}

                  <Button
                    className={cn(
                      "w-full text-xs font-bold py-2.5 h-10 shadow-xs",
                      mode === "approve"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : mode === "more_info"
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "bg-rose-600 hover:bg-rose-700 text-white",
                    )}
                    disabled={decide.isPending || evidenceFile.isPending || (mode === "approve" ? !approvalReady : reason.trim().length < (lecturer ? 10 : 1))}
                    onClick={() => void submit()}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t(decide.isPending
                      ? "Saving decision…"
                      : mode === "approve"
                      ? `Approve ${subject}`
                      : mode === "more_info"
                      ? "Request more information"
                      : `Reject ${subject} request`)}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      request.status === "VERIFIED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    )}>
                      {request.status === "VERIFIED" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {request.status === "VERIFIED" ? t("Request Approved & Credential Issued") : t("Request Rejected")}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {request.reviewedAt ? `${t("Decision recorded on")} ${new Date(request.reviewedAt).toLocaleString(language)}` : t("Decision finalized")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <Detail label={t("Verification method")} value={evidenceMethod(request.verificationMethod ?? request.evidenceType)} />
                    <Detail label={t("Target claim")} value={request.targetValue || "N/A"} />
                  </div>

                  {request.rejectionReason && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                      <span className="font-bold">Lý do từ chối:</span> {request.rejectionReason}
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="border-t border-slate-200/80 pt-6 dark:border-slate-800">
              <VerificationHistory history={history} currentRequestId={request.id} onInspect={onInspectRequest} />
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-slate-50/70 px-6 py-3.5 dark:bg-slate-900/60" data-no-i18n>
        <Button
          size="sm"
          variant="ghost"
          disabled={tab === "request" || decide.isPending}
          onClick={() => setTab(reviewTabs[reviewTabs.findIndex((entry) => entry.id === tab) - 1]!.id)}
        >
          {t("Previous section")}
        </Button>
        {nextTab ? (
          <div className="flex items-center gap-2">
            {request.status === "PENDING" && tab !== "decision" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setTab("decision")}
                className="font-bold text-xs bg-blue-600 hover:bg-blue-700 shadow-xs"
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                {language === "vi" ? "Xét duyệt & Quyết định" : "Review Decision"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              onClick={() => setTab(nextTab.id)}
              className="font-semibold text-xs"
            >
              {t("Next section")}: {language === "vi" ? nextTab.label : (t(nextTab.enLabel) || nextTab.label)}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("Review the evidence before recording a decision.")}
          </span>
        )}
      </footer>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(undefined)}>
        <DialogContent
          className="sm:max-w-3xl md:left-[calc(50%+8rem)]"
          overlayClassName="md:left-64 bg-slate-950/45 backdrop-blur-xs"
        >
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>Private evidence preview. Do not copy it into public profile fields.</DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.mimeType.startsWith("image/") ? (
              <img src={preview.url} alt="Private institutional evidence" className="max-h-[65dvh] w-full object-contain" />
            ) : (
              <Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center gap-2.5 py-16">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                    <p role="status" className="text-xs font-semibold text-slate-500">
                      {language === "vi" ? "Đang tải bộ đọc tài liệu PDF…" : "Loading PDF reader…"}
                    </p>
                  </div>
                }
              >
                <PrivateEvidencePdfPreview blob={preview.blob} />
              </Suspense>
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

{/* ========================================================================= */}
{/* UTILITY HELPERS                                                           */}
{/* ========================================================================= */}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-extrabold text-xs text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function EvidenceReference({ value }: { value: string }) {
  let url: URL | null = null;
  try {
    const parsed = new URL(value);
    if (["https:", "http:"].includes(parsed.protocol)) url = parsed;
  } catch {
    /* Render non-URL evidence as text. */
  }
  return url ? (
    <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs font-medium text-blue-600 underline dark:text-blue-400">
      {url.toString()}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : (
    <p className="whitespace-pre-wrap break-all text-xs text-slate-700 dark:text-slate-300">{value}</p>
  );
}

function evidenceMethod(value: string) {
  return (
    ({
      INSTITUTIONAL_EMAIL: "Institutional email",
      INSTITUTIONAL_PROFILE: "Institutional profile",
      DOCUMENT: "Supporting document",
      ORCID: "ORCID",
      EXTERNAL_ACADEMIC_PROFILE: "Academic profile",
      OTHER: "Other evidence",
      OTHER_INSTITUTION_SOURCE: "Other — custom institutional evidence",
      OFFICIAL_FACULTY_PROFILE: "Official faculty/staff profile",
      OFFICIAL_STAFF_DIRECTORY: "Official staff directory",
      DEPARTMENT_DIRECTORY: "Department/faculty directory",
      EMPLOYMENT_DOCUMENT: "Employment confirmation",
      APPOINTMENT_DOCUMENT: "Appointment letter",
      STAFF_ID: "Staff/Lecturer ID card",
      MANUAL_INSTITUTIONAL_EVIDENCE: "Manual institutional evidence",
      INSTITUTIONAL_EMAIL_AND_PROFILE: "Institutional email and official profile",
      INSTITUTION_ISSUED_PROFILE: "Institution-issued faculty/staff profile",
      TRUSTED_INSTITUTION_SOURCE: "Trusted institution source",
      ADMIN_REVIEW: "Admin review",
    } as Record<string, string>)[value] ?? value.replaceAll("_", " ")
  );
}

function getRoleBadge(role?: string | null) {
  switch (role) {
    case "LECTURER":
      return { label: "Lecturer", className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" };
    case "RESEARCHER":
      return { label: "Researcher", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
    case "STUDENT":
      return { label: "Student", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    default:
      return null;
  }
}

function getStatusBadgeConfig(status: string = "NOT_SUBMITTED") {
  switch (status.toUpperCase()) {
    case "VERIFIED":
    case "VALID":
      return {
        variant: "default" as const,
        className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
        label: "Verified",
        icon: CheckCircle2,
      };
    case "PENDING":
    case "UNCHECKED":
      return {
        variant: "outline" as const,
        className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
        label: "Pending",
        icon: Clock,
      };
    case "NEEDS_MORE_INFORMATION":
      return {
        variant: "outline" as const,
        className: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
        label: "Needs Info",
        icon: AlertCircle,
      };
    case "REJECTED":
    case "INVALID":
      return {
        variant: "destructive" as const,
        className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
        label: "Rejected",
        icon: XCircle,
      };
    case "SELF_DECLARED":
      return {
        variant: "outline" as const,
        className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
        label: "Self Declared",
        icon: HelpCircle,
      };
    case "INCONCLUSIVE":
      return {
        variant: "outline" as const,
        className: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
        label: "Inconclusive",
        icon: HelpCircle,
      };
    case "EXPIRED":
    case "INVALIDATED":
      return {
        variant: "outline" as const,
        className: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border-zinc-500/30",
        label: status.replaceAll("_", " "),
        icon: AlertCircle,
      };
    case "NOT_SUBMITTED":
    case "UNVERIFIED":
    default:
      return {
        variant: "outline" as const,
        className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
        label: "Not Submitted",
        icon: ShieldAlert,
      };
  }
}
