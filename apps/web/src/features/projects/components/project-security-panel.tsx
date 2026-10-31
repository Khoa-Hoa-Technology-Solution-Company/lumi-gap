import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  IProject,
  IntegrityCaseKind,
  IntegrityContainmentAction,
  IntegrityTargetKind,
  ProjectAiDataPolicy,
  ProjectExportPolicy,
  ProjectExternalLookupPolicy,
} from "@trend/shared-types";
import { Shield, AlertTriangle, Lock, FileDown, Eye, CheckCircle2, AlertOctagon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { projectsApi } from "../api/projects.api";
import { useUpdateProject } from "../hooks/use-projects";

interface Props {
  project: IProject;
}

export function ProjectSecurityPanel({ project }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isOwner = project.accessRole === "OWNER";
  const updateProject = useUpdateProject(project._id);

  const security = useQuery({
    queryKey: ["project-security", project._id],
    queryFn: () => projectsApi.securityOverview(project._id),
  });

  const cases = useQuery({
    queryKey: ["project-integrity-cases", project._id],
    queryFn: () => projectsApi.integrityCases(project._id),
  });

  // Policy form state
  const [exportPolicy, setExportPolicy] = useState<ProjectExportPolicy>(
    project.exportPolicy ?? "ALL_MEMBERS",
  );
  const [aiDataPolicy, setAiDataPolicy] = useState<ProjectAiDataPolicy>(
    project.aiDataPolicy ?? "PLATFORM_AI_ONLY",
  );
  const [externalLookupPolicy, setExternalLookupPolicy] = useState<ProjectExternalLookupPolicy>(
    project.externalLookupPolicy ?? "ALLOW_PUBLIC_INDEX",
  );

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportKind, setReportKind] = useState<IntegrityCaseKind>("DATA_LEAK_INCIDENT");
  const [reportTargetKind, setReportTargetKind] = useState<IntegrityTargetKind>("PROJECT");
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
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
      void security.refetch();
    },
    onError: () => toast.error(t("Could not record integrity case")),
  });

  const containMutation = useMutation({
    mutationFn: ({ caseId, actions }: { caseId: string; actions: IntegrityContainmentAction[] }) =>
      projectsApi.containLeakIncident(project._id, caseId, actions),
    onSuccess: () => {
      toast.success(t("Containment actions applied"));
      void cases.refetch();
      void security.refetch();
      void queryClient.invalidateQueries({ queryKey: ["project", project._id] });
    },
    onError: () => toast.error(t("Could not apply containment")),
  });

  const respondMutation = useMutation({
    mutationFn: ({ caseId, note }: { caseId: string; note: string }) =>
      projectsApi.respondIntegrityCase(project._id, caseId, note),
    onSuccess: () => {
      toast.success(t("Response recorded"));
      setResponseNote("");
      void cases.refetch();
    },
    onError: () => toast.error(t("Could not record response")),
  });

  const escalateMutation = useMutation({
    mutationFn: ({ caseId, reason }: { caseId: string; reason: string }) =>
      projectsApi.escalateIntegrityCase(project._id, caseId, reason),
    onSuccess: () => {
      toast.success(t("Case escalated for institutional review"));
      setEscalateReason("");
      void cases.refetch();
    },
    onError: () => toast.error(t("Could not escalate case")),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ caseId, summary }: { caseId: string; summary: string }) =>
      projectsApi.resolveIntegrityCase(project._id, caseId, summary, "RESOLVED"),
    onSuccess: () => {
      toast.success(t("Case resolved"));
      setResolutionSummary("");
      void cases.refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || t("Could not resolve case")),
  });

  const policiesChanged =
    exportPolicy !== (project.exportPolicy ?? "ALL_MEMBERS") ||
    aiDataPolicy !== (project.aiDataPolicy ?? "PLATFORM_AI_ONLY") ||
    externalLookupPolicy !== (project.externalLookupPolicy ?? "ALLOW_PUBLIC_INDEX");

  const handleSavePolicies = async () => {
    try {
      await updateProject.mutateAsync({
        exportPolicy,
        aiDataPolicy,
        externalLookupPolicy,
        expectedVersion: project.version,
      });
      toast.success(t("Security policies saved"));
      void security.refetch();
    } catch {
      toast.error(t("Could not save security policies"));
    }
  };

  return (
    <div className="space-y-8 border-t pt-6" data-no-i18n>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{t("Research Security & Evidence Ledger")}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t(
            "Configure source export permissions, AI privacy boundaries, and inspect the tamper-evident audit ledger.",
          )}
        </p>
      </div>

      {/* Security Policies */}
      <section className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          {t("Project Security Policies")}
        </h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sec-export-policy" className="text-xs font-semibold">
              {t("LaTeX Source Code Export")}
            </Label>
            <select
              id="sec-export-policy"
              className="project-form-select text-xs"
              value={exportPolicy}
              disabled={!isOwner || updateProject.isPending}
              onChange={e => setExportPolicy(e.target.value as ProjectExportPolicy)}
            >
              <option value="ALL_MEMBERS">{t("Team members (default)")}</option>
              <option value="OWNER_ONLY">{t("Project owner only")}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sec-ai-policy" className="text-xs font-semibold">
              {t("Research AI Processing")}
            </Label>
            <select
              id="sec-ai-policy"
              className="project-form-select text-xs"
              value={aiDataPolicy}
              disabled={!isOwner || updateProject.isPending}
              onChange={e => setAiDataPolicy(e.target.value as ProjectAiDataPolicy)}
            >
              <option value="ALLOW_PERSONAL_AI">{t("Allow personal AI & external models")}</option>
              <option value="PLATFORM_AI_ONLY">{t("Platform AI only (default)")}</option>
              <option value="DISABLED">{t("Disable AI processing")}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sec-lookup-policy" className="text-xs font-semibold">
              {t("Academic Metadata Lookup")}
            </Label>
            <select
              id="sec-lookup-policy"
              className="project-form-select text-xs"
              value={externalLookupPolicy}
              disabled={!isOwner || updateProject.isPending}
              onChange={e => setExternalLookupPolicy(e.target.value as ProjectExternalLookupPolicy)}
            >
              <option value="ALLOW_PUBLIC_INDEX">{t("Allow external lookup (OpenAlex)")}</option>
              <option value="LOCAL_CORPUS_ONLY">{t("Local corpus only (isolated)")}</option>
            </select>
          </div>
        </div>

        {isOwner && (
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              disabled={!policiesChanged || updateProject.isPending}
              onClick={() => void handleSavePolicies()}
            >
              {t(updateProject.isPending ? "Saving…" : "Save security policies")}
            </Button>
          </div>
        )}
      </section>

      {/* Suspected Data Leak & Integrity Cases */}
      <section className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("Research Integrity & Data Leak Incidents")}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "Structured dispute and incident containment workflow with immutable snapshot preservation.",
              )}
            </p>
          </div>
          <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                {t("Report dispute or leak incident")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" closeLabel={t("Close")} data-no-i18n>
              <DialogHeader>
                <DialogTitle>{t("Report research dispute or suspected data leak")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "Submit a factual dispute or suspected data leak report. Evidence references and policy states are preserved for review.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="case-kind" className="text-xs font-semibold">
                    {t("Incident type")}
                  </Label>
                  <select
                    id="case-kind"
                    className="project-form-select text-xs"
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
                    className="project-form-select text-xs"
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
                    className="project-form-textarea text-xs"
                    rows={4}
                    value={reportDescription}
                    placeholder={t("Describe what occurred, relevant timestamps, and concerns")}
                    onChange={e => setReportDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReportModalOpen(false)}>
                  {t("Cancel")}
                </Button>
                <Button
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

        {cases.data && cases.data.length > 0 ? (
          <div className="space-y-3">
            {cases.data.map(c => (
              <div key={c.id} className="rounded-lg border border-border/70 p-4 space-y-3 bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "RESOLVED" ? "default" : "secondary"}>
                      {t(c.status)}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">{c.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.description}</p>
                {c.containmentActions.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-amber-600">{t("Containment applied")}:</span>
                    {c.containmentActions.map(act => (
                      <Badge key={act} variant="outline" className="text-2xs bg-amber-500/10 text-amber-700">
                        {t(act)}
                      </Badge>
                    ))}
                  </div>
                )}
                {c.resolutionSummary && (
                  <div className="rounded border bg-card/60 p-2 text-xs">
                    <span className="font-semibold text-emerald-600">{t("Resolution")}: </span>
                    {c.resolutionSummary}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                  {c.viewerCanContain && c.status !== "RESOLVED" && (
                    <Button
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
                  )}
                  {c.viewerCanEscalate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedCaseId(c.id)}
                    >
                      {t("Escalate to institutional review")}
                    </Button>
                  )}
                  {c.viewerCanResolve && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                      onClick={() => {
                        const summary = prompt(t("Enter factual resolution summary:"));
                        if (summary) resolveMutation.mutate({ caseId: c.id, summary });
                      }}
                    >
                      {t("Resolve case")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            {t("No active research integrity or data leak cases recorded.")}
          </p>
        )}
      </section>

      {/* Research Evidence & Security Ledger */}
      <section className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            {t("Append-Only Security & Export Ledger")}
          </h4>
          <span className="text-xs text-muted-foreground">
            {t("Protected by database immutability triggers")}
          </span>
        </div>
        {security.data?.recentEvents && security.data.recentEvents.length > 0 ? (
          <div className="divide-y divide-border/50 max-h-80 overflow-y-auto text-xs">
            {security.data.recentEvents.map(evt => (
              <div key={evt.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-2xs font-mono">
                      {evt.type}
                    </Badge>
                    <span className="font-medium text-foreground truncate">{evt.summary}</span>
                  </div>
                  {evt.checksumSha256 && (
                    <p className="text-2xs font-mono text-muted-foreground truncate">
                      SHA-256: {evt.checksumSha256}
                    </p>
                  )}
                </div>
                <div className="text-right text-muted-foreground shrink-0">
                  <span>{evt.actor?.name || t("System")}</span> ·{" "}
                  <span>{new Date(evt.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            {t("No security audit events recorded yet.")}
          </p>
        )}
      </section>
    </div>
  );
}
