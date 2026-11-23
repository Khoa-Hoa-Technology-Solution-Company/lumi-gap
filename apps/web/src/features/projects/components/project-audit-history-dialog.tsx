import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProjectAuditEventCategory, ProjectSecurityEventView } from "@trend/shared-types";
import { ArrowLeft, Check, ChevronRight, Copy, Filter, History, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { projectsApi } from "../api/projects.api";
import {
  AUDIT_CATEGORY_OPTIONS,
  formatAuditMetadataValue,
  getAuditCategoryLabel,
  getAuditEventLabel,
  getAuditResourceLabel,
} from "./project-audit-log-labels";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 20;

export function ProjectAuditHistoryDialog({ projectId, open, onOpenChange }: Props) {
  const { t, language } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<ProjectAuditEventCategory | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<ProjectSecurityEventView | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setSelectedEvent(null);
      setCopiedField(null);
    }
  }, [open]);

  const hasFilters = Boolean(debouncedQuery || category || fromDate || toDate);

  const eventsQuery = useQuery({
    queryKey: ["project-audit-events", projectId, page, debouncedQuery, category, fromDate, toDate],
    queryFn: () =>
      projectsApi.auditEvents(projectId, {
        page,
        pageSize: PAGE_SIZE,
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(category ? { category } : {}),
        ...(fromDate ? { from: fromDate } : {}),
        ...(toDate ? { to: toDate } : {}),
      }),
    enabled: open,
  });

  const dateTimeFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const formatTimestamp = (iso: string) => {
    const parsed = new Date(iso);
    return Number.isFinite(parsed.getTime()) ? dateTimeFormatter.format(parsed) : iso;
  };

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setCategory("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      toast.success(t("Copied to clipboard"));
      window.setTimeout(() => setCopiedField(current => (current === label ? null : current)), 1800);
    } catch {
      toast.error(t("Could not copy value"));
    }
  };

  const items = eventsQuery.data?.items ?? [];
  const meta = eventsQuery.data?.meta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[88dvh] flex flex-col gap-4 overflow-hidden p-5 sm:p-6"
        closeLabel={t("Close")}
        data-no-i18n
      >
        <DialogHeader className="shrink-0 space-y-1.5 pr-6">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span>{selectedEvent ? t("Audit event details") : t("Audit history")}</span>
          </DialogTitle>
          <DialogDescription>
            {selectedEvent
              ? t("Read-only verification record for this project event.")
              : t("Chronological record of key project actions, access, and policy changes. Events are read-only and preserved for research integrity.")}
          </DialogDescription>
        </DialogHeader>

        {selectedEvent ? (
          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 pr-1">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1.5 text-muted-foreground"
                onClick={() => setSelectedEvent(null)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t("Back to audit history")}
              </Button>
              <Badge variant="secondary">{t(getAuditCategoryLabel(selectedEvent.category))}</Badge>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-foreground">
                  {t(getAuditEventLabel(selectedEvent.type))}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(selectedEvent.createdAt)}
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 text-sm border-t pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Performed by")}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {selectedEvent.actor?.name || t("System")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Related resource")}</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {t(getAuditResourceLabel(selectedEvent.entityKind))}
                  </dd>
                </div>
                {selectedEvent.artifactVersion !== null ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Version")}</dt>
                    <dd className="font-medium text-foreground mt-0.5">v{selectedEvent.artifactVersion}</dd>
                  </div>
                ) : null}
                {selectedEvent.reason ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t("Note / reason")}</dt>
                    <dd className="text-foreground mt-0.5 whitespace-pre-wrap">{selectedEvent.reason}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 ? (
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Event metadata")}
                </h5>
                <dl className="grid gap-2 sm:grid-cols-2 text-xs">
                  {Object.entries(selectedEvent.metadata).map(([key, value]) => (
                    <div key={key} className="min-w-0 rounded-md bg-background/80 border px-2.5 py-2">
                      <dt className="text-muted-foreground font-mono text-[11px] truncate">{key}</dt>
                      <dd className="text-foreground font-medium mt-0.5 break-all">
                        {formatAuditMetadataValue(key, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{t("Technical verification details")}</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-muted-foreground">{t("Raw event code")}</span>
                    <code className="font-mono text-foreground break-all">{selectedEvent.type}</code>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-muted-foreground">{t("Event ID")}</span>
                    <code className="font-mono text-foreground break-all">{selectedEvent.id}</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 shrink-0 gap-1"
                    onClick={() => void handleCopy("id", selectedEvent.id)}
                  >
                    {copiedField === "id" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{t(copiedField === "id" ? "Copied" : "Copy")}</span>
                  </Button>
                </div>

                {selectedEvent.entityId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <span className="block text-muted-foreground">{t("Resource ID")}</span>
                      <code className="font-mono text-foreground break-all">{selectedEvent.entityId}</code>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 shrink-0 gap-1"
                      onClick={() => void handleCopy("entityId", selectedEvent.entityId!)}
                    >
                      {copiedField === "entityId" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{t(copiedField === "entityId" ? "Copied" : "Copy")}</span>
                    </Button>
                  </div>
                ) : null}

                {selectedEvent.checksumSha256 ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <span className="block text-muted-foreground">{t("Integrity checksum (SHA-256)")}</span>
                      <code className="font-mono text-foreground break-all">{selectedEvent.checksumSha256}</code>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 shrink-0 gap-1"
                      onClick={() => void handleCopy("sha256", selectedEvent.checksumSha256!)}
                    >
                      {copiedField === "sha256" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{t(copiedField === "sha256" ? "Copied" : "Copy")}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-3 rounded-xl border bg-muted/25 p-3.5">
              <div className="grid gap-2.5 sm:grid-cols-12">
                <div className="relative sm:col-span-6">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    aria-label={t("Search audit history")}
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder={t("Search by actor, resource, or note…")}
                    className="pl-9 h-9 text-sm bg-background"
                  />
                </div>
                <div className="sm:col-span-6">
                  <select
                    aria-label={t("Event category")}
                    value={category}
                    onChange={event => {
                      setCategory(event.target.value as ProjectAuditEventCategory | "");
                      setPage(1);
                    }}
                    className="project-form-select h-9 min-h-0 py-1.5 text-sm bg-background"
                  >
                    <option value="">{t("All categories")}</option>
                    {AUDIT_CATEGORY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {t(option.label)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-2.5">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="audit-from-date" className="text-[11px] text-muted-foreground">
                      {t("From date")}
                    </Label>
                    <Input
                      id="audit-from-date"
                      type="date"
                      value={fromDate}
                      onChange={event => {
                        setFromDate(event.target.value);
                        setPage(1);
                      }}
                      className="h-8 w-auto text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="audit-to-date" className="text-[11px] text-muted-foreground">
                      {t("To date")}
                    </Label>
                    <Input
                      id="audit-to-date"
                      type="date"
                      value={toDate}
                      onChange={event => {
                        setToDate(event.target.value);
                        setPage(1);
                      }}
                      className="h-8 w-auto text-xs bg-background"
                    />
                  </div>
                </div>

                {hasFilters ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={resetFilters}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("Clear filters")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card">
              {eventsQuery.isLoading ? (
                <div className="divide-y p-4 space-y-3" role="status" aria-label={t("Loading audit history…")}>
                  {[0, 1, 2, 3, 4].map(idx => (
                    <div key={idx} className="pt-3 first:pt-0 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : eventsQuery.isError ? (
                <div role="alert" className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">{t("Could not load audit history.")}</p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void eventsQuery.refetch()}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("Try again")}
                  </Button>
                </div>
              ) : items.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Filter className="h-7 w-7 mx-auto text-muted-foreground/60" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">
                    {hasFilters ? t("No matching audit events") : t("No audit events recorded yet.")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hasFilters
                      ? t("Try adjusting your search keywords, category, or date range.")
                      : t("Important project actions will appear here automatically.")}
                  </p>
                  {hasFilters ? (
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={resetFilters}>
                      {t("Clear filters")}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {items.map(evt => (
                    <li key={evt.id}>
                      <button
                        type="button"
                        data-testid="audit-event-row"
                        onClick={() => setSelectedEvent(evt)}
                        className="w-full text-left px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {t(getAuditEventLabel(evt.type))}
                            </span>
                            <Badge variant="outline" className="text-[11px] font-normal px-2 py-0">
                              {t(getAuditCategoryLabel(evt.category))}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{evt.actor?.name || t("System")}</span>
                            <span aria-hidden="true">·</span>
                            <span>{t(getAuditResourceLabel(evt.entityKind))}</span>
                            <span aria-hidden="true">·</span>
                            <time dateTime={evt.createdAt}>{formatTimestamp(evt.createdAt)}</time>
                          </div>
                          {evt.reason ? (
                            <p className="text-xs text-muted-foreground line-clamp-1">{evt.reason}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {meta && meta.total > 0 ? (
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
                <span>
                  {t("Showing {{count}} of {{total}} events · Page {{page}} of {{totalPages}}", {
                    count: items.length,
                    total: meta.total,
                    page: meta.page,
                    totalPages: meta.totalPages,
                  })}
                </span>
                {meta.totalPages > 1 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={page <= 1 || eventsQuery.isFetching}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      {t("Previous")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!meta.hasNext || eventsQuery.isFetching}
                      onClick={() => setPage(p => p + 1)}
                    >
                      {t("Next")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
