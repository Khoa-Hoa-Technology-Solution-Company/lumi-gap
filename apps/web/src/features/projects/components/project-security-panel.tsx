import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  IProject,
  IntegrityCaseKind,
  IntegrityContainmentAction,
  IntegrityTargetKind,
  ProjectAiDataPolicy,
  ProjectExportPolicy,
  ProjectExternalLookupPolicy,
  ProjectStatus,
  UpdateProjectRequest,
} from "@trend/shared-types";
import { AlertTriangle, ChevronDown, History, Shield, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { projectsApi } from "../api/projects.api";
import { useUpdateProject } from "../hooks/use-projects";
import { ProjectAuditHistoryDialog } from "./project-audit-history-dialog";
import { ChangedNotice, settingsSaveError, useSettingsDraft } from "./project-settings-form";
import { projectSectionHref } from "./workspace-common";

interface Props {
  project: IProject;
}

const advancedValue = (p: IProject) => ({
  aiDataPolicy: (p.aiDataPolicy ?? "ALLOW_PERSONAL_AI") as ProjectAiDataPolicy,
  externalLookupPolicy: (p.externalLookupPolicy ?? "ALLOW_PUBLIC_INDEX") as ProjectExternalLookupPolicy,
  exportPolicy: (p.exportPolicy ?? "ALL_MEMBERS") as ProjectExportPolicy,
  status: p.status,
});

export function ProjectSecurityPanel({ project }: Props) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const isOwner = project.accessRole === "OWNER";
  const isArchived = project.status === "ARCHIVED";
  const writable = isOwner && !isArchived;
  const updateProject = useUpdateProject(project._id);
  const saveLock = useRef(false);

  const advancedState = useSettingsDraft(project, advancedValue);
  const { draft, setDraft, baseline } = advancedState;
  const [advancedError, setAdvancedError] = useState("");
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);

  // Lightweight summary fetch (limit=0): never loads full audit rows when rendering Settings.
  const securitySummary = useQuery({
    queryKey: ["project-security-summary", project._id],
    queryFn: () => projectsApi.securityOverview(project._id, { limit: 0 }),
  });

  const cases = useQuery({
    queryKey: ["project-integrity-cases", project._id],
    queryFn: () => projectsApi.integrityCases(project._id),
  });

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportKind, setReportKind] = useState<IntegrityCaseKind>("DATA_LEAK_INCIDENT");
  const [reportTargetKind, setReportTargetKind] = useState<IntegrityTargetKind>("PROJECT");
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");

  const [escalatingCaseId, setEscalatingCaseId] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState("");

  const [resolvingCaseId, setResolvingCaseId] = useState<string | null>(null);
  const [resolutionSummary, setResolutionSummary] = useState("");

  const createCaseMutation = useMutation({
    mutationFn: (data: {
      kind: IntegrityCaseKind;
      targetKind: IntegrityTargetKind;
      title: string;
      description: string;
    }) => projectsApi.createIntegrityCase(project._id, data),
    onSuccess: () => {
      toast.success(t("Integrity case recorded"));
      setReportModalOpen(false);
      setReportTitle("");
      setReportDescription("");
      void cases.refetch();
      void securitySummary.refetch();
    },
    onError: () => toast.error(t("Could not record integrity case")),
  });

  const containMutation = useMutation({
    mutationFn: ({ caseId, actions }: { caseId: string; actions: IntegrityContainmentAction[] }) =>
      projectsApi.containLeakIncident(project._id, caseId, actions),
    onSuccess: () => {
      toast.success(t("Containment actions applied"));
      void cases.refetch();
      void securitySummary.refetch();
      void queryClient.invalidateQueries({ queryKey: ["project", project._id] });
    },
    onError: () => toast.error(t("Could not apply containment")),
  });

  const escalateMutation = useMutation({
    mutationFn: ({ caseId, reason }: { caseId: string; reason: string }) =>
      projectsApi.escalateIntegrityCase(project._id, caseId, reason),
    onSuccess: () => {
      toast.success(t("Case escalated for institutional review"));
      setEscalatingCaseId(null);
      setEscalateReason("");
      void cases.refetch();
      void securitySummary.refetch();
    },
    onError: () => toast.error(t("Could not escalate case")),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ caseId, summary }: { caseId: string; summary: string }) =>
      projectsApi.resolveIntegrityCase(project._id, caseId, summary, "RESOLVED"),
    onSuccess: () => {
      toast.success(t("Case resolved"));
      setResolvingCaseId(null);
      setResolutionSummary("");
      void cases.refetch();
      void securitySummary.refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || t("Could not resolve case")),
  });

  const handleSaveAdvanced = async (event: FormEvent) => {
    event.preventDefault();
    if (!writable || saveLock.current || !advancedState.dirty) return;
    const original = advancedValue(baseline);
    const patch: UpdateProjectRequest = { expectedVersion: baseline.version };
    if (draft.aiDataPolicy !== original.aiDataPolicy) patch.aiDataPolicy = draft.aiDataPolicy;
    if (draft.externalLookupPolicy !== original.externalLookupPolicy) patch.externalLookupPolicy = draft.externalLookupPolicy;
    if (draft.exportPolicy !== original.exportPolicy) patch.exportPolicy = draft.exportPolicy;
    if (!isArchived && draft.status !== original.status && draft.status !== "ARCHIVED") {
      patch.status = draft.status;
    }
    saveLock.current = true;
    setAdvancedError("");
    try {
      const saved = await updateProject.mutateAsync(patch);
      advancedState.accept(saved);
      toast.success(t("Advanced settings saved"));
      void securitySummary.refetch();
    } catch (failure) {
      const status = (failure as { response?: { status?: number } }).response?.status;
      setAdvancedError(
        t(status === 409 ? settingsSaveError(failure) : "Could not save advanced settings. Your changes are still here."),
      );
    } finally {
      saveLock.current = false;
    }
  };

  const allCases = cases.data ?? [];
  const activeCasesCount = allCases.filter(c => c.status !== "RESOLVED" && c.status !== "CLOSED").length;
  const totalEvents = securitySummary.data?.totalEventCount ?? 0;
  const latestEventDate = securitySummary.data?.latestEventAt
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(securitySummary.data.latestEventAt),
      )
    : null;

  return (
    <div className="space-y-6" data-no-i18n>
      {/* Section 3: Advanced Settings — Collapsed by default */}
      <details className="group rounded-xl border border-border/80 bg-card shadow-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:px-6 select-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">{t("Advanced settings")}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("Optional controls for AI processing, external academic lookup, LaTeX source exports, and project lifecycle.")}
              </p>
            </div>
          </div>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <form
          onSubmit={handleSaveAdvanced}
          aria-label={t("Advanced settings")}
          className="border-t border-border/60 p-5 sm:p-6 space-y-5"
        >
          <ChangedNotice visible={advancedState.latest} reload={advancedState.reload} />

          <fieldset disabled={!writable || updateProject.isPending} className="min-w-0 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="sec-ai-policy" className="text-sm font-medium">
                {t("Use AI to assist research")}
              </Label>
              <select
                id="sec-ai-policy"
                className="project-form-select"
                value={draft.aiDataPolicy}
                onChange={e => setDraft({ ...draft, aiDataPolicy: e.target.value as ProjectAiDataPolicy })}
              >
                <option value="ALLOW_PERSONAL_AI">{t("Allow personal AI & platform AI")}</option>
                <option value="PLATFORM_AI_ONLY">{t("Platform AI only")}</option>
                <option value="DISABLED">{t("Disable external AI processing")}</option>
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("Controls whether project content can be processed by personal AI keys, LumiGap platform AI only, or disabled for external AI.")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sec-lookup-policy" className="text-sm font-medium">
                {t("External academic metadata lookup (OpenAlex)")}
              </Label>
              <select
                id="sec-lookup-policy"
                className="project-form-select"
                value={draft.externalLookupPolicy}
                onChange={e => setDraft({ ...draft, externalLookupPolicy: e.target.value as ProjectExternalLookupPolicy })}
              >
                <option value="ALLOW_PUBLIC_INDEX">{t("Allow OpenAlex metadata lookup")}</option>
                <option value="LOCAL_CORPUS_ONLY">{t("Local project library only")}</option>
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("Allows querying public bibliographic metadata from OpenAlex during gap analysis. Does not upload private PDFs or full manuscript text.")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sec-export-policy" className="text-sm font-medium">
                {t("LaTeX source export permissions")}
              </Label>
              <select
                id="sec-export-policy"
                className="project-form-select"
                value={draft.exportPolicy}
                onChange={e => setDraft({ ...draft, exportPolicy: e.target.value as ProjectExportPolicy })}
              >
                <option value="ALL_MEMBERS">{t("All project members")}</option>
                <option value="OWNER_ONLY">{t("Owner only")}</option>
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("Controls who can export LaTeX source bundles, manuscript files, or sync to GitHub. Compiled PDF preview remains available to active members.")}
              </p>
            </div>

            {!isArchived ? (
              <div className="space-y-1.5 border-t border-border/60 pt-4">
                <Label htmlFor="project-lifecycle-status" className="text-sm font-medium">
                  {t("Project lifecycle")}
                </Label>
                <select
                  id="project-lifecycle-status"
                  className="project-form-select"
                  value={draft.status}
                  onChange={e => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
                >
                  {Object.entries({
                    PLANNING: "Planning",
                    ACTIVE: "Active",
                    ON_HOLD: "On hold",
                    COMPLETED: "Completed",
                  }).map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("Research stage is managed in Overview. Lifecycle controls whether the project is ongoing, paused or completed.")}
                </p>
              </div>
            ) : null}
          </fieldset>

          {advancedError ? <p role="alert" className="text-sm text-destructive">{advancedError}</p> : null}

          {writable ? (
            <div className="flex justify-end pt-1 border-t border-border/60">
              <Button type="submit" disabled={!advancedState.dirty || updateProject.isPending}>
                {t(updateProject.isPending ? "Saving…" : "Save changes")}
              </Button>
            </div>
          ) : null}
        </form>
      </details>

      {/* Section 4: Research Integrity & Audit History Summary */}
      <section
        aria-labelledby="project-integrity-history-heading"
        className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="project-integrity-history-heading" className="text-base font-semibold text-foreground">
              {t("Research integrity & history")}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("Review recorded project activity or report an integrity concern without cluttering daily settings.")}
            </p>
          </div>
        </div>

        <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-background">
          {/* Audit History Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t("Audit history")}</span>
                {securitySummary.data ? (
                  <Badge variant="secondary" className="font-normal">
                    {t("{{count}} recorded events", { count: totalEvents })}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {latestEventDate
                  ? t("Last recorded activity: {{date}}", { date: latestEventDate })
                  : t("Important project actions will appear here automatically.")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => setAuditDialogOpen(true)}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("View history")}
            </Button>
          </div>

          {/* Integrity Incident Reporting Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t("Active integrity cases")}</span>
                {activeCasesCount > 0 ? (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    {t("{{count}} active case(s)", { count: activeCasesCount })}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {activeCasesCount > 0
                  ? t("Structured dispute and incident containment workflow with immutable snapshot preservation.")
                  : t("No active integrity incidents.")}
              </p>
            </div>

            <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  {t("Report an incident")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg" closeLabel={t("Close")} data-no-i18n>
                <DialogHeader>
                  <DialogTitle>{t("Report research dispute or suspected data leak")}</DialogTitle>
                  <DialogDescription>
                    {t("Submit a factual dispute or suspected data leak report. Evidence references and policy states are preserved for review.")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="case-kind" className="text-xs font-semibold">
                      {t("Incident type")}
                    </Label>
                    <select
                      id="case-kind"
                      className="project-form-select text-sm"
                      value={reportKind}
                      onChange={e => setReportKind(e.target.value as IntegrityCaseKind)}
                    >
                      <option value="DATA_LEAK_INCIDENT">{t("Suspected research data leak")}</option>
                      <option value="CONTRIBUTION_DISPUTE">{t("Contribution record dispute")}</option>
                      <option value="ATTRIBUTION_DISPUTE">{t("Authorship attribution dispute")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="case-target-kind" className="text-xs font-semibold">
                      {t("Target scope")}
                    </Label>
                    <select
                      id="case-target-kind"
                      className="project-form-select text-sm"
                      value={reportTargetKind}
                      onChange={e => setReportTargetKind(e.target.value as IntegrityTargetKind)}
                    >
                      <option value="PROJECT">{t("Whole project")}</option>
                      <option value="MANUSCRIPT">{t("Manuscript source")}</option>
                      <option value="MANUSCRIPT_ATTRIBUTION">{t("Attribution check")}</option>
                      <option value="WORK_CONTRIBUTION">{t("Work contribution record")}</option>
                      <option value="ALLOCATION_REVISION">{t("Contribution allocation revision")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="case-title" className="text-xs font-semibold">
                      {t("Summary title")} *
                    </Label>
                    <Input
                      id="case-title"
                      value={reportTitle}
                      placeholder={t("Brief summary")}
                      onChange={e => setReportTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="case-description" className="text-xs font-semibold">
                      {t("Detailed factual description")} *
                    </Label>
                    <textarea
                      id="case-description"
                      className="project-form-textarea text-sm"
                      rows={4}
                      value={reportDescription}
                      placeholder={t("Describe what occurred, relevant timestamps, and concerns")}
                      onChange={e => setReportDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setReportModalOpen(false)}>
                    {t("Cancel")}
                  </Button>
                  <Button
                    type="button"
                    disabled={!reportTitle.trim() || !reportDescription.trim() || createCaseMutation.isPending}
                    onClick={() =>
                      createCaseMutation.mutate({
                        kind: reportKind,
                        targetKind: reportTargetKind,
                        title: reportTitle.trim(),
                        description: reportDescription.trim(),
                      })
                    }
                  >
                    {t(createCaseMutation.isPending ? "Submitting…" : "Submit report")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Render Integrity Case Cards only when cases actually exist */}
        {allCases.length > 0 ? (
          <div className="space-y-3 pt-1">
            {allCases.map(c => (
              <div key={c.id} className="rounded-lg border border-border/70 p-4 space-y-3 bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={c.status === "RESOLVED" ? "default" : "secondary"}>{t(c.status)}</Badge>
                    <span className="text-sm font-semibold text-foreground truncate">{c.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString(language)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.description}</p>
                {c.containmentActions.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-amber-600">{t("Containment applied")}:</span>
                    {c.containmentActions.map(act => (
                      <Badge key={act} variant="outline" className="text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {t(act)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {c.resolutionSummary ? (
                  <div className="rounded border bg-card/60 p-2.5 text-xs">
                    <span className="font-semibold text-emerald-600">{t("Resolution")}: </span>
                    {c.resolutionSummary}
                  </div>
                ) : null}
                {(c.viewerCanContain || c.viewerCanEscalate || c.viewerCanResolve) ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                    {c.viewerCanContain && c.status !== "RESOLVED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={containMutation.isPending}
                        onClick={() =>
                          containMutation.mutate({
                            caseId: c.id,
                            actions: [
                              "RESTRICT_EXPORT_OWNER_ONLY",
                              "SET_PROJECT_PRIVATE",
                              "RESTRICT_AI_PLATFORM_ONLY",
                            ],
                          })
                        }
                      >
                        {t("Apply lockdown containment")}
                      </Button>
                    ) : null}
                    {c.viewerCanEscalate ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEscalateReason("");
                          setEscalatingCaseId(c.id);
                        }}
                      >
                        {t("Escalate to institutional review")}
                      </Button>
                    ) : null}
                    {c.viewerCanResolve ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        onClick={() => {
                          setResolutionSummary("");
                          setResolvingCaseId(c.id);
                        }}
                      >
                        {t("Resolve case")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground pt-1">
          <Link to={projectSectionHref(project._id, "support")} className="text-primary underline-offset-4 hover:underline">
            {t("Looking for a mentor? Manage discovery in Academic Support → Mentor.")}
          </Link>
        </p>
      </section>

      {/* Dedicated Audit History Dialog */}
      <ProjectAuditHistoryDialog
        projectId={project._id}
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
      />

      {/* Escalate Integrity Case Dialog (replaces previously dead button) */}
      <Dialog
        open={Boolean(escalatingCaseId)}
        onOpenChange={open => {
          if (!open && !escalateMutation.isPending) {
            setEscalatingCaseId(null);
            setEscalateReason("");
          }
        }}
      >
        <DialogContent className="max-w-md" closeLabel={t("Close")} data-no-i18n>
          <DialogHeader>
            <DialogTitle>{t("Escalate case for institutional review")}</DialogTitle>
            <DialogDescription>
              {t("Provide a clear factual reason for escalating this case to an institutional administrator.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="escalate-reason-input">{t("Escalation reason")} *</Label>
            <textarea
              id="escalate-reason-input"
              className="project-form-textarea text-sm"
              rows={3}
              value={escalateReason}
              disabled={escalateMutation.isPending}
              onChange={e => setEscalateReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={escalateMutation.isPending}
              onClick={() => setEscalatingCaseId(null)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={escalateReason.trim().length < 5 || escalateMutation.isPending || !escalatingCaseId}
              onClick={() =>
                escalatingCaseId &&
                escalateMutation.mutate({ caseId: escalatingCaseId, reason: escalateReason.trim() })
              }
            >
              {t(escalateMutation.isPending ? "Submitting…" : "Confirm escalation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Integrity Case Dialog (replaces window.prompt) */}
      <Dialog
        open={Boolean(resolvingCaseId)}
        onOpenChange={open => {
          if (!open && !resolveMutation.isPending) {
            setResolvingCaseId(null);
            setResolutionSummary("");
          }
        }}
      >
        <DialogContent className="max-w-md" closeLabel={t("Close")} data-no-i18n>
          <DialogHeader>
            <DialogTitle>{t("Resolve integrity case")}</DialogTitle>
            <DialogDescription>
              {t("Record a factual resolution summary. This note is permanently preserved in the case timeline.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="resolve-summary-input">{t("Resolution summary")} *</Label>
            <textarea
              id="resolve-summary-input"
              className="project-form-textarea text-sm"
              rows={3}
              value={resolutionSummary}
              disabled={resolveMutation.isPending}
              onChange={e => setResolutionSummary(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={resolveMutation.isPending}
              onClick={() => setResolvingCaseId(null)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={resolutionSummary.trim().length < 5 || resolveMutation.isPending || !resolvingCaseId}
              onClick={() =>
                resolvingCaseId &&
                resolveMutation.mutate({ caseId: resolvingCaseId, summary: resolutionSummary.trim() })
              }
            >
              {t(resolveMutation.isPending ? "Saving…" : "Confirm resolution")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
