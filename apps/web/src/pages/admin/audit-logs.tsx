import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Zap,
} from "lucide-react";
import { isAdminSystemRole, type AdminAuditLogItem } from "@trend/shared-types";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
  AdminEmptyPanel,
  AdminErrorPanel,
  AdminPaginationBar,
  adminApi,
} from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

function formatDateTime(value: string, isVi: boolean): string {
  return new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function summarizeDetails(details: unknown): string {
  if (!details) return "—";
  if (typeof details === "string") return details;
  try {
    const raw = JSON.stringify(details);
    return raw.length > 96 ? `${raw.slice(0, 96)}…` : raw;
  } catch {
    return "—";
  }
}

export function AdminAuditLogsPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me } = useCurrentUser();
  const viewerId = me?.user?.id ?? "anonymous";
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [targetTable, setTargetTable] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, targetTable, fromDate, toDate, pageSize]);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", viewerId, "audit-logs", deferredSearch, targetTable, fromDate, toDate, page, pageSize],
    queryFn: () =>
      adminApi.getAuditLogs({
        search: deferredSearch || undefined,
        targetTableName: targetTable === "all" ? undefined : targetTable,
        from: fromDate ? new Date(`${fromDate}T00:00:00.000Z`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : undefined,
        page,
        pageSize,
      }),
    enabled: isAdmin,
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const tableFacets = meta?.facets?.targetTables ?? [];
  const hasActiveFilters = Boolean(search) || targetTable !== "all" || Boolean(fromDate) || Boolean(toDate);

  const clearFilters = () => {
    setSearch("");
    setTargetTable("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Nhật ký kiểm toán & bảo mật" : "Audit Logs & Security Trail"}
        description={
          isVi
            ? "Lịch sử không thay đổi của các thao tác quản trị, phân quyền, xác minh, cấu hình và phiên đăng nhập. Mọi bí mật và nội dung nghiên cứu riêng tư được ẩn tự động ở máy chủ."
            : "Immutable trail of administrative mutations, role updates, verifications, and settings changes. Secrets and private research payloads are redacted server-side."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isVi ? "Làm mới" : "Refresh"}
          </Button>
        }
      />

      <section className="rounded-xl border bg-card">
        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={isVi ? "Tìm kiếm nhật ký kiểm toán" : "Search audit logs"}
              placeholder={
                isVi
                  ? "Tìm theo hành động, bảng dữ liệu, mã bản ghi hoặc tên/email người thực hiện…"
                  : "Search action, target table, record ID, or actor name/email…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={isVi ? "Lọc theo bảng đích" : "Filter by target table"}
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
            >
              <option value="all">{isVi ? "Mọi bảng dữ liệu" : "All target tables"}</option>
              {tableFacets.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>

            <Input
              type="date"
              aria-label={isVi ? "Từ ngày" : "From date"}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-auto text-xs"
            />
            <Input
              type="date"
              aria-label={isVi ? "Đến ngày" : "To date"}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-auto text-xs"
            />

            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs">
                {isVi ? "Xóa bộ lọc" : "Clear filters"}
              </Button>
            ) : null}
          </div>
        </div>

        {isError ? (
          <div className="p-4">
            <AdminErrorPanel
              title={isVi ? "Không thể tải nhật ký kiểm toán" : "Unable to load audit logs"}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isVi ? "Hành động" : "Action"}</TableHead>
                    <TableHead>{isVi ? "Người thực hiện" : "Actor"}</TableHead>
                    <TableHead>{isVi ? "Đối tượng" : "Target"}</TableHead>
                    <TableHead>{isVi ? "Chi tiết (đã ẩn dữ liệu nhạy cảm)" : "Redacted Summary"}</TableHead>
                    <TableHead>{isVi ? "Thời điểm" : "Timestamp"}</TableHead>
                    <TableHead className="w-[84px] text-right">{isVi ? "Xem" : "Inspect"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6">
                        <AdminEmptyPanel
                          title={isVi ? "Không có bản ghi kiểm toán nào phù hợp" : "No audit logs match the current filters"}
                          action={
                            hasActiveFilters ? (
                              <Button variant="outline" size="sm" onClick={clearFilters}>
                                {isVi ? "Xóa bộ lọc" : "Clear filters"}
                              </Button>
                            ) : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <Zap className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-mono text-xs font-semibold text-foreground">{log.actionName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.user ? (
                            <div>
                              <div className="font-medium text-foreground">{log.user.fullName}</div>
                              <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                                {log.user.email}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Shield className="h-3 w-3" />
                              {isVi ? "Hệ thống" : "System"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.targetTableName ? (
                            <div className="space-y-0.5">
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {log.targetTableName}
                              </Badge>
                              {log.targetRecordId ? (
                                <div className="max-w-[140px] truncate font-mono text-[10px] text-muted-foreground">
                                  {log.targetRecordId}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate font-mono text-[11px] text-muted-foreground">
                          {summarizeDetails(log.details)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(log.createdAt, isVi)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${isVi ? "Xem chi tiết nhật ký" : "Inspect audit log"} ${log.actionName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {meta ? (
              <AdminPaginationBar
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                isFetching={isFetching && !isLoading}
                noun={isVi ? "bản ghi" : "records"}
              />
            ) : null}
          </>
        )}
      </section>

      {/* Detail Inspection Drawer */}
      <Sheet open={Boolean(selectedLog)} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <SheetContent>
          {selectedLog ? (
            <div className="flex h-full flex-col">
              <header className="shrink-0 border-b px-6 py-5 pr-12">
                <SheetTitle className="font-mono text-base">{selectedLog.actionName}</SheetTitle>
                <SheetDescription className="mt-1">
                  {formatDateTime(selectedLog.createdAt, isVi)}
                </SheetDescription>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
                <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">{isVi ? "Mã bản ghi nhật ký" : "Audit Log ID"}</dt>
                    <dd className="mt-1 break-all font-mono text-xs">{selectedLog.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{isVi ? "Người thực hiện" : "Actor"}</dt>
                    <dd className="mt-1 text-xs font-medium">
                      {selectedLog.user ? `${selectedLog.user.fullName} (${selectedLog.user.email})` : isVi ? "Hệ thống" : "System"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{isVi ? "Bảng đích" : "Target Table"}</dt>
                    <dd className="mt-1 font-mono text-xs">{selectedLog.targetTableName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{isVi ? "Mã đối tượng đích" : "Target Record ID"}</dt>
                    <dd className="mt-1 break-all font-mono text-xs">{selectedLog.targetRecordId ?? "—"}</dd>
                  </div>
                </dl>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Dữ liệu chi tiết (đã lọc bảo mật)" : "Redacted Metadata Payload"}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {isVi ? "Ẩn bí mật & nội dung riêng tư" : "Secrets & private content redacted"}
                    </span>
                  </div>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground">
                    {selectedLog.details ? JSON.stringify(selectedLog.details, null, 2) : "{}"}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}
