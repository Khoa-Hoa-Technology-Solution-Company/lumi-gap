import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import type { CreditRole, ManuscriptWritingReport } from "@trend/shared-types";
import { manuscriptsApi } from "./manuscripts.api";
import { useAuthStore } from "@/stores/auth-store";
import {
  ContributionEditor,
  type ContributionEditorInitialScope,
} from "@/features/projects/components/work-contributions";
import { CreditRolePicker } from "@/features/projects/components/credit-role-picker";
import {
  ManuscriptContributionsAckTab,
  ManuscriptContributionsContentTab,
  ManuscriptContributionsOverviewTab,
  type OutlineHeading,
} from "./manuscript-contributions-tabs";

export function WritingReportResult({ report }: { report: ManuscriptWritingReport }) {
  const { t, language } = useI18n(), result = report.result;
  if (!result) return null;
  const words = (units: number) => (units / 1000).toLocaleString(language, { maximumFractionDigits: 3 });
  // Sort alphabetically by name — never rank writers like a word-count leaderboard.
  const sortedMembers = [...result.members].sort((a, b) => a.name.localeCompare(b.name));
  return <div className="writing-contribution-result">
    <p className="writing-small">{report.snapshotLabel} · v{report.sourceVersion}{report.calculatedAt ? ` · ${new Date(report.calculatedAt).toLocaleString(language)}` : ""}</p>
    {report.isStale && <p role="status" className="writing-notice">{t("The manuscript changed. This report still describes the saved version.")}</p>}
    <p><strong>{result.totalWords.toLocaleString(language)} {t("prose words")}</strong> · {(result.coverageBasisPoints / 100).toFixed(2)}% {t("with recorded attribution")}</p>
    <progress max={10000} value={result.coverageBasisPoints} aria-label={t("Writing attribution coverage")} />
    <p className="writing-small">{t("Unattributed words")}: {words(result.unknownWordUnits)}</p>
    {sortedMembers.length ? <ul className="writing-contributor-list">{sortedMembers.map(member => <li key={member.userId}><div><strong>{member.name}</strong><span>{words(member.retainedWordUnits)} {t("word equivalents")}</span></div><div><span>{(member.overallBasisPoints / 100).toFixed(2)}% {t("of all prose")}</span><progress max={10000} value={member.overallBasisPoints} aria-label={`${member.name}: ${(member.overallBasisPoints / 100).toFixed(2)}%`} /></div></li>)}</ul> : <p>{t("No attributable writing yet. New edits will be tracked from now on; old text is not assigned to its uploader.")}</p>}
    <details><summary>{t("How writing attribution works")}</summary><p>{t("Only retained prose is counted. Mixed words are divided by character ownership. Deleted text, comments, bibliography and common LaTeX commands do not add writing credit.")}</p><p>{t("Recorded insertion does not prove intellectual authorship: pasted or AI text may be included. Research, analysis and review must be evaluated separately.")}</p><p>{t("Writing suggestions are normalized over attributed words only. Unknown text stays visible and every participant must confirm before contribution scoring.")}</p></details>
  </div>;
}

export function TechnicalWritingEvidence({
  projectId,
  manuscriptId,
  canWrite,
  prepare,
  currentVersion,
  existingWritingDraftId,
  onDraftCreated,
}: {
  projectId: string;
  manuscriptId: string;
  canWrite: boolean;
  prepare: () => Promise<string>;
  currentVersion?: number;
  existingWritingDraftId?: string | null;
  onDraftCreated?: () => void;
}) {
  const { t } = useI18n(), client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [reviewingRoles, setReviewingRoles] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, CreditRole[]>>({});
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const userId = useAuthStore(state => state.user?.id);
  const key = ["manuscript-writing", userId, projectId, manuscriptId];

  const history = useQuery({
    queryKey: [...key, page],
    queryFn: () => manuscriptsApi.writingReports(projectId, manuscriptId, page),
    refetchInterval: query => query.state.data?.items.some(r => r.status === "QUEUED") ? 2000 : false,
  });
  const id = selectedId ?? history.data?.items[0]?.id;
  const detail = useQuery({
    queryKey: [...key, "report", id],
    queryFn: () => manuscriptsApi.writingReport(projectId, manuscriptId, id!),
    enabled: Boolean(id),
    refetchInterval: query => query.state.data?.status === "QUEUED" ? 1500 : false,
  });
  const calculate = useMutation({
    mutationFn: async () => manuscriptsApi.requestWritingReport(projectId, manuscriptId, await prepare()),
    onSuccess: async report => {
      setSelectedId(report.id);
      setCreated(false);
      setReviewingRoles(false);
      setPage(1);
      client.setQueryData([...key, "report", report.id], report);
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ["manuscript-contributions"] });
    },
  });
  const retry = useMutation({
    mutationFn: async () => manuscriptsApi.requestWritingReport(projectId, manuscriptId, detail.data!.snapshotId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const draft = useMutation({
    mutationFn: (payload?: { participants?: Array<{ userId: string; roles: CreditRole[] }>; confirmDuplicate?: boolean }) =>
      manuscriptsApi.writingContribution(projectId, manuscriptId, id!, payload),
    onMutate: () => {
      setSelectedId(id!);
    },
    onSuccess: () => {
      setCreated(true);
      setReviewingRoles(false);
      void client.invalidateQueries({ queryKey: ["manuscript-contributions"] });
      onDraftCreated?.();
    },
  });

  const busy = calculate.isPending || draft.isPending || retry.isPending;
  const pending = busy || detail.data?.status === "QUEUED";

  function selectReport(next: string | null, nextPage = page) {
    if (busy) return;
    setSelectedId(next);
    setPage(nextPage);
    setCreated(false);
    setReviewingRoles(false);
    setSelectedRoles({});
    setConfirmDuplicate(false);
    calculate.reset();
    draft.reset();
    retry.reset();
  }

  function startRoleReview() {
    const members = detail.data?.result?.members ?? [];
    const initial: Record<string, CreditRole[]> = {};
    for (const member of members) {
      // Never auto-assign WRITING_ORIGINAL_DRAFT — users must explicitly choose roles.
      initial[member.userId] = [];
    }
    if (userId && !initial[userId]) {
      initial[userId] = [];
    }
    setSelectedRoles(initial);
    setReviewingRoles(true);
  }

  function submitDraft() {
    const members = detail.data?.result?.members ?? [];
    const participantIds = [...new Set([...members.map(m => m.userId), ...(userId ? [userId] : [])])];
    const participants = participantIds.map(uid => ({
      userId: uid,
      roles: selectedRoles[uid] ?? [],
    }));
    draft.mutate({
      participants,
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
    });
  }

  return (
    <div className="mc-technical-content">
      <div className="mc-technical-header">
        <h3>{t("Technical evidence — Text provenance")}</h3>
        <p className="mc-disclaimer-box">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {t(
              "Retained text statistics record account text insertions only. They do not prove intellectual authorship, replace CRediT roles, or measure scientific quality or total research effort.",
            )}
          </span>
        </p>
      </div>

      {canWrite ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => calculate.mutate()}>
          {t(calculate.isPending ? "Saving a version for analysis…" : "Save version and calculate writing")}
        </Button>
      ) : null}

      {(history.isLoading || (id && detail.isLoading)) ? (
        <p role="status">{t("Loading writing evidence…")}</p>
      ) : null}

      {(history.isError || detail.isError || calculate.isError || draft.isError || retry.isError) ? (
        <div role="alert">
          <p className="writing-error">
            {(draft.error as Error | null)?.message || t("Could not complete writing analysis. Your manuscript is preserved.")}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (calculate.isError && canWrite) calculate.mutate();
              else if (draft.isError && canWrite) submitDraft();
              else if (retry.isError && canWrite) retry.mutate();
              else {
                void history.refetch();
                if (id) void detail.refetch();
              }
            }}
          >
            {t("Try again")}
          </Button>
        </div>
      ) : null}

      {history.data?.items.length ? (
        <label className="mc-select-label">
          <span>{t("Writing report version")}</span>
          <select disabled={busy} value={id ?? ""} onChange={e => selectReport(e.target.value)}>
            {selectedId && !history.data.items.some(r => r.id === selectedId) && detail.data ? (
              <option value={selectedId}>{detail.data.snapshotLabel}</option>
            ) : null}
            {history.data.items.map(report => (
              <option value={report.id} key={report.id}>
                {report.snapshotLabel} · v{report.sourceVersion}
              </option>
            ))}
          </select>
        </label>
      ) : !history.isLoading ? (
        <p className="mc-small-note">{t("Save a version to calculate a reproducible writing report.")}</p>
      ) : null}

      {history.data && (page > 1 || history.data.hasNext) ? (
        <div className="writing-pagination">
          <Button size="sm" variant="outline" disabled={busy || page === 1} onClick={() => selectReport(null, page - 1)}>
            {t("Previous")}
          </Button>
          <span>{page}</span>
          <Button size="sm" variant="outline" disabled={busy || !history.data.hasNext} onClick={() => selectReport(null, page + 1)}>
            {t("Next")}
          </Button>
        </div>
      ) : null}

      {detail.data?.status === "QUEUED" ? (
        <p role="status">{t("Tracing retained words and their edit history. You can continue writing.")}</p>
      ) : null}

      {detail.data?.status === "FAILED" ? (
        <div role="alert">
          <p>{t("Writing analysis was interrupted. Retry this saved version.")}</p>
          {canWrite ? (
            <Button size="sm" disabled={busy} onClick={() => retry.mutate()}>
              {t("Try again")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {detail.data?.status === "COMPLETED" ? (
        <>
          <WritingReportResult
            report={{
              ...detail.data,
              isStale:
                detail.data.isStale ||
                (currentVersion !== undefined && currentVersion !== detail.data.sourceVersion),
            }}
          />

          {canWrite && Boolean(detail.data.result?.attributedWordUnits) ? (
            <div className="mc-draft-creator">
              {!reviewingRoles ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || created}
                  onClick={startRoleReview}
                >
                  {t(created ? "Contribution draft created" : "Create contribution draft from this report")}
                </Button>
              ) : (
                <div className="mc-role-review-box">
                  <h4>{t("Review CRediT roles before creating draft")}</h4>
                  <p className="mc-small-note">
                    {t("No CRediT role is auto-assigned from text counts. Select applicable roles for each participant or leave empty to edit later.")}
                  </p>
                  {existingWritingDraftId ? (
                    <div className="mc-alert-box is-pending" role="status">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <div>
                        <p>{t("A writing evidence draft already exists for this manuscript.")}</p>
                        <label className="mc-follow-toggle">
                          <input
                            type="checkbox"
                            checked={confirmDuplicate}
                            onChange={e => setConfirmDuplicate(e.target.checked)}
                          />
                          <span>{t("Create an additional draft for this snapshot anyway")}</span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {detail.data.result?.members.map(member => (
                    <div key={member.userId} className="mc-role-review-person">
                      <strong>{member.name}</strong>
                      <CreditRolePicker
                        value={selectedRoles[member.userId] ?? []}
                        onChange={roles =>
                          setSelectedRoles(prev => ({ ...prev, [member.userId]: roles }))
                        }
                      />
                    </div>
                  ))}
                  <div className="mc-ack-primary-row">
                    <Button
                      size="sm"
                      type="button"
                      disabled={busy || (Boolean(existingWritingDraftId) && !confirmDuplicate)}
                      onClick={submitDraft}
                    >
                      {t("Confirm and save draft")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => setReviewingRoles(false)}
                    >
                      {t("Cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {created ? (
                <p className="mc-small-note">
                  <Link className="mc-inline-link" to={`/projects/${projectId}?tab=contributions`}>
                    {t("Open contributions to review and submit")}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type ContributionPanelTab = "overview" | "content" | "ack";

export function ManuscriptWriting({
  projectId,
  manuscriptId,
  canWrite,
  prepare,
  currentVersion,
  manuscriptTitle,
  selectedFileId,
  selectedFilePath,
  activeOutline,
  onNavigateSource,
  defaultTechnicalOpen = false,
}: {
  projectId: string;
  manuscriptId: string;
  canWrite: boolean;
  prepare: () => Promise<string>;
  currentVersion?: number;
  manuscriptTitle?: string;
  selectedFileId?: string;
  selectedFilePath?: string;
  activeOutline?: OutlineHeading[];
  onNavigateSource?: (fileId: string, line?: number) => void;
  defaultTechnicalOpen?: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const userId = useAuthStore(state => state.user?.id ?? "");
  const [activeTab, setActiveTab] = useState<ContributionPanelTab>("overview");
  const [technicalOpen, setTechnicalOpen] = useState(defaultTechnicalOpen);
  const [declareScope, setDeclareScope] = useState<ContributionEditorInitialScope | null>(null);

  const summaryKey = ["manuscript-contributions", userId, projectId, manuscriptId];
  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: () => manuscriptsApi.contributions(projectId, manuscriptId),
    enabled: Boolean(projectId && manuscriptId && typeof manuscriptsApi.contributions === "function"),
    staleTime: 15000,
  });

  const summary = summaryQuery.data;
  const effectiveVersion = currentVersion ?? summary?.currentVersion;
  const isStale = Boolean(
    summary?.latestSnapshot && effectiveVersion !== undefined && summary.latestSnapshot.sourceVersion !== effectiveVersion,
  );
  const pendingCount =
    (summary?.viewerActionableDeclarations.length ?? 0) +
    (summary?.attributionCheck?.viewerCanDecide ? 1 : 0);

  const refreshAll = () => {
    void client.invalidateQueries({ queryKey: summaryKey });
    void client.invalidateQueries({ queryKey: ["manuscript-writing", userId, projectId, manuscriptId] });
  };

  return (
    <section className="writing-context writing-contributions mc-panel" aria-label={t("Manuscript contributions")}>
      <header className="mc-header">
        <div className="mc-header-top">
          <h2>{t("Manuscript contributions")}</h2>
          {effectiveVersion !== undefined ? (
            <span className="mc-version-pill">v{effectiveVersion}</span>
          ) : null}
        </div>
        <p className="mc-subtitle">
          {t("Evidence-based contribution attribution linked to this manuscript — separate from authorship eligibility.")}
        </p>
        {isStale && summary?.latestSnapshot && effectiveVersion !== undefined ? (
          <p className="mc-stale-banner" role="status">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t("Latest saved snapshot is v{{snap}} (draft is v{{curr}}).", {
                snap: summary.latestSnapshot.sourceVersion,
                curr: effectiveVersion,
              })}
            </span>
          </p>
        ) : null}
        {!canWrite ? (
          <p className="mc-readonly-note">{t("Read-only view: you can inspect contributions and evidence without modifying records.")}</p>
        ) : null}
      </header>

      {/* 3 Internal Tabs */}
      <div className="mc-tabs" role="tablist" aria-label={t("Manuscript contribution views")}>
        <button
          type="button"
          role="tab"
          id="mc-tab-overview"
          aria-selected={activeTab === "overview"}
          aria-controls="mc-panel-overview"
          className={activeTab === "overview" ? "is-active" : ""}
          onClick={() => setActiveTab("overview")}
        >
          {t("Overview")}
        </button>
        <button
          type="button"
          role="tab"
          id="mc-tab-content"
          aria-selected={activeTab === "content"}
          aria-controls="mc-panel-content"
          className={activeTab === "content" ? "is-active" : ""}
          onClick={() => setActiveTab("content")}
        >
          {t("By Content")}
        </button>
        <button
          type="button"
          role="tab"
          id="mc-tab-ack"
          aria-selected={activeTab === "ack"}
          aria-controls="mc-panel-ack"
          className={activeTab === "ack" ? "is-active" : ""}
          onClick={() => setActiveTab("ack")}
        >
          <span>{t("Acknowledgement")}</span>
          {pendingCount > 0 ? <small className="mc-tab-badge">{pendingCount}</small> : null}
        </button>
      </div>

      {summaryQuery.isLoading ? (
        <p role="status" className="mc-loading-note">
          {t("Loading manuscript contributions…")}
        </p>
      ) : null}

      {summaryQuery.isError ? (
        <div role="alert" className="mc-error-box">
          <p className="writing-error">{t("Could not load manuscript contributions. Your unsaved edits remain safe.")}</p>
          <Button size="sm" variant="outline" type="button" onClick={() => void summaryQuery.refetch()}>
            {t("Try again")}
          </Button>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <ManuscriptContributionsOverviewTab
          summary={summary}
          canWrite={canWrite}
          selectedFilePath={selectedFilePath}
          technicalOpen={technicalOpen}
          onToggleTechnical={() => setTechnicalOpen(open => !open)}
          onOpenDeclare={scope => setDeclareScope(scope)}
          onOpenAcknowledgement={() => setActiveTab("ack")}
          technicalPanel={
            <TechnicalWritingEvidence
              projectId={projectId}
              manuscriptId={manuscriptId}
              canWrite={canWrite}
              prepare={prepare}
              currentVersion={effectiveVersion}
              existingWritingDraftId={summary?.existingWritingDraftId}
              onDraftCreated={refreshAll}
            />
          }
        />
      ) : activeTab === "content" ? (
        <ManuscriptContributionsContentTab
          summary={summary}
          canWrite={canWrite}
          selectedFileId={selectedFileId}
          selectedFilePath={selectedFilePath}
          activeOutline={activeOutline}
          onNavigateSource={onNavigateSource}
          onOpenDeclare={scope => setDeclareScope(scope)}
        />
      ) : (
        <ManuscriptContributionsAckTab
          projectId={projectId}
          manuscriptId={manuscriptId}
          summary={summary}
          canWrite={canWrite}
          onRefresh={refreshAll}
        />
      )}

      {/* Pre-filled Declare Contribution Dialog (reuses ContributionEditor) */}
      <Dialog open={Boolean(declareScope)} onOpenChange={open => { if (!open) setDeclareScope(null); }}>
        <DialogContent className="mc-declare-dialog max-w-2xl max-h-[88vh] overflow-y-auto" closeLabel={t("Close")} data-no-i18n>
          <DialogHeader className="text-left">
            <DialogTitle>{t("Declare manuscript contribution")}</DialogTitle>
            <DialogDescription>
              {manuscriptTitle || summary?.manuscriptTitle || t("Pre-linked to the current manuscript")}
            </DialogDescription>
          </DialogHeader>
          {declareScope ? (
            <ContributionEditor
              key={`${declareScope.manuscriptId}:${declareScope.filePath ?? ""}:${declareScope.sectionHeading ?? ""}`}
              projectId={projectId}
              currentUserId={userId}
              readOnly={!canWrite}
              initialScope={declareScope}
              close={() => setDeclareScope(null)}
              saved={() => {
                setDeclareScope(null);
                toast.success(t("Contribution draft saved."));
                refreshAll();
                setActiveTab("ack");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
