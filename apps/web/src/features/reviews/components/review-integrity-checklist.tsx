import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  scientificIntegrityChecks,
  type AcademicReviewInput,
  type FeedbackItemPriority,
  type IntegrityEvidencePreview,
  type ReviewIntegrityEvidenceMap,
  type ScientificIntegrityCheckKey,
} from "@trend/shared-types";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import {
  localizeIntegrityGuidance,
  localizeIntegrityTitle,
} from "@/features/reviews/system-rubric-i18n";

type Checks = NonNullable<AcademicReviewInput["integrityChecks"]>;
type CheckStatus = "CHECKED" | "CONCERN" | "NOT_APPLICABLE";

const CONCERN_MIN_CHARS = 10;

function formatFactValue(raw: string, t: (key: string) => string): string {
  if (raw === "YES") return t("reviewWorkspace.integrity.factValue.YES");
  if (raw === "SEPARATE") return t("reviewWorkspace.integrity.factValue.SEPARATE");
  return raw;
}

export function ReviewIntegrityChecklist({
  value,
  onChange,
  disabled,
  variant = "workspace",
  evidence,
  isNarrowPanel = false,
  focusedCheckKey = null,
  showMissingHighlight = false,
  commentOnly = false,
  previousIntegrity,
  onCreateRevisionFromConcern,
  onNavigateToRevisions,
}: {
  value: Checks;
  onChange: (value: Checks) => void;
  disabled: boolean;
  variant?: "workspace" | "readonly";
  evidence?: ReviewIntegrityEvidenceMap;
  isNarrowPanel?: boolean;
  focusedCheckKey?: ScientificIntegrityCheckKey | null;
  showMissingHighlight?: boolean;
  commentOnly?: boolean;
  previousIntegrity?: { roundNumber: number; checks?: Checks };
  onCreateRevisionFromConcern?: (draft: {
    description: string;
    priority: FeedbackItemPriority;
    locator?: string;
  }) => { added: boolean; duplicate?: boolean };
  onNavigateToRevisions?: () => void;
}) {
  const { t, language } = useI18n();
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const noteDraftsRef = useRef<Record<string, string>>({});

  // Optional inline clarification/revision composer triggered explicitly from a CONCERN
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const [composerDesc, setComposerDesc] = useState("");
  const [composerLocator, setComposerLocator] = useState("");
  const [composerPriority, setComposerPriority] = useState<FeedbackItemPriority>("MAJOR");
  const [composerNotice, setComposerNotice] = useState<{
    key: string;
    type: "added" | "duplicate";
  } | null>(null);
  const submittingRef = useRef(false);

  const stats = useMemo(() => {
    let answered = 0;
    let valid = 0;
    let checked = 0;
    let concern = 0;
    let na = 0;
    let missingNotes = 0;
    for (const check of scientificIntegrityChecks) {
      const entry = value[check.key];
      if (!entry?.status) continue;
      if (entry.status === "NOT_APPLICABLE" && !check.allowNotApplicable) continue;
      answered += 1;
      if (entry.status === "CHECKED") {
        checked += 1;
        valid += 1;
      } else if (entry.status === "NOT_APPLICABLE") {
        na += 1;
        valid += 1;
      } else if (entry.status === "CONCERN") {
        concern += 1;
        if ((entry.note?.trim().length ?? 0) >= CONCERN_MIN_CHARS) {
          valid += 1;
        } else {
          missingNotes += 1;
        }
      }
    }
    return {
      total: scientificIntegrityChecks.length,
      answered,
      valid,
      unchecked: scientificIntegrityChecks.length - answered,
      checked,
      concern,
      na,
      missingNotes,
    };
  }, [value]);

  // Auto-open and focus a specific check when navigated to from Bottom Bar / Summary / Submit Dialog
  useEffect(() => {
    if (!focusedCheckKey) return;
    setExpandedKeys(current => ({ ...current, [focusedCheckKey]: true }));
    window.requestAnimationFrame(() => {
      const noteEl = document.getElementById(`integrity-note-${focusedCheckKey}`);
      if (noteEl instanceof HTMLTextAreaElement) {
        noteEl.focus();
        return;
      }
      const rowEl = document.getElementById(`integrity-row-${focusedCheckKey}`);
      if (rowEl && typeof rowEl.scrollIntoView === "function") {
        rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }, [focusedCheckKey]);

  const setCheckStatus = (checkKey: ScientificIntegrityCheckKey, allowNA: boolean, nextStatus: CheckStatus) => {
    if (disabled) return;
    if (nextStatus === "NOT_APPLICABLE" && !allowNA) return;

    const currentEntry = value[checkKey];
    // Preserve any typed concern note locally before switching away so it never leaks into non-CONCERN payloads,
    // while remaining recoverable if the reviewer toggles back to CONCERN.
    if (currentEntry?.status === "CONCERN" && currentEntry.note?.trim()) {
      noteDraftsRef.current[checkKey] = currentEntry.note;
    }

    if (nextStatus === "CONCERN") {
      const restoredNote = currentEntry?.note ?? noteDraftsRef.current[checkKey] ?? "";
      onChange({
        ...value,
        [checkKey]: {
          status: "CONCERN",
          ...(restoredNote ? { note: restoredNote } : {}),
        },
      });
      setExpandedKeys(current => ({ ...current, [checkKey]: true }));
      window.requestAnimationFrame(() => {
        const noteEl = document.getElementById(`integrity-note-${checkKey}`);
        if (noteEl instanceof HTMLTextAreaElement) noteEl.focus();
      });
      return;
    }

    // Strip any stale concern note from payload when moving to CHECKED or NOT_APPLICABLE (INT-09)
    onChange({
      ...value,
      [checkKey]: { status: nextStatus },
    });
    if (composerKey === checkKey) {
      setComposerKey(null);
    }
  };

  const updateConcernNote = (checkKey: ScientificIntegrityCheckKey, note: string) => {
    if (disabled) return;
    noteDraftsRef.current[checkKey] = note;
    onChange({
      ...value,
      [checkKey]: {
        status: "CONCERN",
        note,
      },
    });
  };

  const toggleRowDetails = (checkKey: string) => {
    setExpandedKeys(current => ({ ...current, [checkKey]: !current[checkKey] }));
  };

  const openConcernComposer = (checkKey: string, note: string) => {
    setComposerKey(checkKey);
    setComposerDesc(note.trim());
    setComposerLocator("");
    setComposerPriority("MAJOR");
    setComposerNotice(null);
  };

  const submitConcernComposer = (checkKey: string) => {
    if (submittingRef.current || !onCreateRevisionFromConcern) return;
    const trimmed = composerDesc.trim();
    if (!trimmed) return;
    submittingRef.current = true;
    try {
      const result = onCreateRevisionFromConcern({
        description: trimmed,
        priority: composerPriority,
        locator: composerLocator.trim() || undefined,
      });
      if (result.duplicate) {
        setComposerNotice({ key: checkKey, type: "duplicate" });
        return;
      }
      if (result.added) {
        setComposerNotice({ key: checkKey, type: "added" });
        setComposerKey(null);
        setComposerDesc("");
        setComposerLocator("");
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const renderEvidenceBlock = (preview: IntegrityEvidencePreview | undefined) => {
    if (!preview) return null;
    return (
      <div className="rw-integrity-evidence">
        <p className="text-[11px] font-semibold text-foreground">
          {t("reviewWorkspace.integrity.evidenceTitle")}
        </p>
        {preview.access === "RESTRICTED" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={12} className="shrink-0" aria-hidden="true" />
            <span>{t("reviewWorkspace.integrity.evidenceRestricted")}</span>
          </p>
        ) : preview.access === "EMPTY" || preview.facts.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("reviewWorkspace.integrity.evidenceEmpty")}
          </p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <dl className="rw-integrity-facts">
              {preview.facts.map((fact, idx) => (
                <div key={`${fact.label}-${idx}`} className="rw-integrity-fact-row" data-tone={fact.tone ?? "neutral"}>
                  <dt>{t(`reviewWorkspace.integrity.fact.${fact.label}`)}</dt>
                  <dd>{formatFactValue(fact.value, t)}</dd>
                </div>
              ))}
            </dl>
            {preview.advisoryNotes?.length ? (
              <div className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/80">
                  {t("reviewWorkspace.integrity.evidenceAdvisoryTag")}
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {preview.advisoryNotes.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const renderRowDetail = (check: (typeof scientificIntegrityChecks)[number]) => {
    const entry = value[check.key];
    const isConcern = entry?.status === "CONCERN";
    const noteText = entry?.note ?? "";
    const trimmedLen = noteText.trim().length;
    const needsMoreChars = isConcern && trimmedLen < CONCERN_MIN_CHARS;
    const guidance = localizeIntegrityGuidance(check.key, language);
    const preview = evidence?.[check.key];
    const isComposerOpen = composerKey === check.key;

    return (
      <div id={`integrity-detail-${check.key}`} className="rw-integrity-detail">
        {/* Criterion-specific Guidance */}
        {guidance ? (
          <div className="rw-integrity-guidance">
            <p className="text-xs font-medium text-foreground">{guidance.summary}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              {guidance.points.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] italic text-muted-foreground">{guidance.caution}</p>
          </div>
        ) : null}

        {/* Scoped Supporting Evidence Preview (only if provided by backend) */}
        {renderEvidenceBlock(preview)}

        {/* Historical Integrity Context from prior round (read-only reference; never auto-clears CONCERN) */}
        {previousIntegrity?.checks?.[check.key]?.status ? (() => {
          const prevEntry = previousIntegrity.checks![check.key]!;
          const prevStatusText =
            prevEntry.status === "CHECKED"
              ? t("reviewWorkspace.integrity.checked")
              : prevEntry.status === "CONCERN"
                ? t("reviewWorkspace.integrity.concern")
                : t("reviewWorkspace.integrity.notApplicable");
          return (
            <div
              className="rounded-md border border-border/75 bg-muted/20 px-2.5 py-2 text-xs space-y-1"
              data-tone={prevEntry.status === "CONCERN" ? "concern" : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t("reviewWorkspace.priorRound.integrityRefTitle", { round: previousIntegrity.roundNumber })}
                </span>
                <span
                  className="rw-integrity-status-pill"
                  data-tone={
                    prevEntry.status === "CHECKED"
                      ? "checked"
                      : prevEntry.status === "CONCERN"
                        ? "concern"
                        : "na"
                  }
                >
                  {prevStatusText}
                </span>
              </div>
              {prevEntry.status === "CONCERN" && prevEntry.note ? (
                <p className="whitespace-pre-wrap leading-5 text-muted-foreground">{prevEntry.note}</p>
              ) : null}
            </div>
          );
        })() : null}

        {/* Progressive Concern Editor — ONLY rendered when status === CONCERN */}
        {isConcern ? (
          <div className="rw-integrity-concern-box">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor={`integrity-note-${check.key}`}
                className="text-xs font-semibold text-foreground"
              >
                {t("reviewWorkspace.integrity.noteLabel")}
              </label>
              <span
                className={
                  needsMoreChars
                    ? "text-[11px] font-medium text-amber-700 dark:text-amber-300"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {needsMoreChars
                  ? t("reviewWorkspace.integrity.noteMinHint", { current: trimmedLen })
                  : t("reviewWorkspace.integrity.noteReadyHint")}
              </span>
            </div>
            <textarea
              id={`integrity-note-${check.key}`}
              rows={2}
              disabled={disabled}
              maxLength={2000}
              placeholder={t("reviewWorkspace.integrity.notePlaceholder")}
              className={`rw-comment-textarea mt-1.5 ${
                needsMoreChars && showMissingHighlight ? "border-amber-500" : ""
              }`}
              value={noteText}
              onChange={e => updateConcernNote(check.key, e.target.value)}
            />

            {/* Optional explicit Concern -> Revision Request workflow */}
            {!disabled && onCreateRevisionFromConcern ? (
              <div className="mt-2 space-y-2">
                {!isComposerOpen ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => openConcernComposer(check.key, noteText)}
                    >
                      <Plus size={12} aria-hidden="true" />
                      <span>{t("reviewWorkspace.integrity.createRevisionCta")}</span>
                    </Button>
                    {composerNotice?.key === check.key ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          role="status"
                          className={
                            composerNotice.type === "added"
                              ? "font-medium text-emerald-700 dark:text-emerald-400"
                              : "font-medium text-amber-700 dark:text-amber-300"
                          }
                        >
                          {composerNotice.type === "added"
                            ? t("reviewWorkspace.matrix.revisionAdded")
                            : t("reviewWorkspace.matrix.revisionDuplicate")}
                        </span>
                        {composerNotice.type === "added" && onNavigateToRevisions ? (
                          <button
                            type="button"
                            className="rw-text-action"
                            onClick={onNavigateToRevisions}
                          >
                            {t("reviewWorkspace.subTab.revisions")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="rw-inline-composer"
                    role="form"
                    aria-label={t("reviewWorkspace.integrity.createRevisionCta")}
                  >
                    <p className="text-[11px] text-muted-foreground">
                      {t("reviewWorkspace.integrity.createRevisionHint")}
                    </p>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      aria-label={t("reviewWorkspace.revisionContentLabel")}
                      placeholder={t("reviewWorkspace.revisionPlaceholder")}
                      className="rw-comment-textarea"
                      value={composerDesc}
                      onChange={e => {
                        setComposerDesc(e.target.value);
                        if (composerNotice?.type === "duplicate") setComposerNotice(null);
                      }}
                    />
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      role="group"
                      aria-label={t("reviewWorkspace.matrix.priorityLabel")}
                    >
                      {(["MAJOR", "MINOR", "SUGGESTION"] as FeedbackItemPriority[]).map(priority => {
                        const active = composerPriority === priority;
                        const tone =
                          priority === "MAJOR"
                            ? "major"
                            : priority === "SUGGESTION"
                              ? "suggestion"
                              : "minor";
                        const Icon =
                          priority === "MAJOR"
                            ? AlertCircle
                            : priority === "SUGGESTION"
                              ? Lightbulb
                              : AlertTriangle;
                        return (
                          <button
                            key={priority}
                            type="button"
                            aria-pressed={active}
                            className="rw-severity-btn"
                            data-active={active ? "true" : undefined}
                            data-tone={tone}
                            onClick={() => setComposerPriority(priority)}
                          >
                            <Icon size={12} aria-hidden="true" />
                            <span>{t(`reviewWorkspace.feedbackFirst.severity.${priority}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      className="h-8 text-xs"
                      aria-label={t("reviewWorkspace.evidenceLabel")}
                      placeholder={t("reviewWorkspace.evidencePlaceholder")}
                      value={composerLocator}
                      onChange={e => setComposerLocator(e.target.value)}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setComposerKey(null)}
                      >
                        {t("reviewWorkspace.matrix.cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={!composerDesc.trim()}
                        onClick={() => submitConcernComposer(check.key)}
                      >
                        <Check size={12} aria-hidden="true" />
                        <span>{t("reviewWorkspace.matrix.confirmAddRevision")}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  // Compact read-only view (used in ReviewRequestDetailPage history)
  if (variant === "readonly") {
    return (
      <section id="review-integrity" data-no-i18n className="rounded-lg border border-border/75 bg-muted/15 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-foreground">{t("reviewWorkspace.integrityTitle")}</h3>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {t("reviewWorkspace.integrity.headerStats", { answered: stats.valid, total: stats.total })}
            {stats.concern > 0 ? ` · ${t("reviewWorkspace.integrity.statConcerns", { count: stats.concern })}` : ""}
          </span>
        </div>
        <ul className="divide-y divide-border/60 rounded-md border border-border/70 bg-background">
          {scientificIntegrityChecks.map(check => {
            const entry = value[check.key];
            const status = entry?.status;
            const title = localizeIntegrityTitle(check.title, language);
            const statusLabel =
              status === "CHECKED"
                ? t("reviewWorkspace.integrity.checked")
                : status === "CONCERN"
                  ? t("reviewWorkspace.integrity.concern")
                  : status === "NOT_APPLICABLE"
                    ? t("reviewWorkspace.integrity.notApplicable")
                    : t("reviewWorkspace.integrity.unchecked");
            const tone =
              status === "CHECKED"
                ? "checked"
                : status === "CONCERN"
                  ? "concern"
                  : status === "NOT_APPLICABLE"
                    ? "na"
                    : "unchecked";
            return (
              <li key={check.key} className="px-3 py-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{title}</span>
                  <span className="rw-integrity-status-pill" data-tone={tone}>
                    {statusLabel}
                  </span>
                </div>
                {status === "CONCERN" && entry?.note ? (
                  <p className="text-muted-foreground leading-relaxed">{entry.note}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section id="review-integrity" data-no-i18n className="rw-integrity-card scroll-mt-24">
      {/* Compact Header */}
      <header className="rw-integrity-header">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-foreground">{t("reviewWorkspace.integrityTitle")}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{t("reviewWorkspace.integrityHint")}</p>
          </div>
          <span
            className="rw-integrity-complete-pill"
            data-state={stats.valid === stats.total ? "done" : "pending"}
          >
            {stats.valid === stats.total ? (
              <Check size={11} aria-hidden="true" />
            ) : null}
            <span>
              {stats.valid === stats.total
                ? t("reviewWorkspace.integrity.completedLabel")
                : t("reviewWorkspace.integrity.pendingLabel")}
            </span>
          </span>
        </div>

        {/* Calm Summary Counts (separates answered vs valid completion) */}
        <div className="rw-integrity-stats" role="status" aria-live="polite">
          {stats.answered === stats.total && stats.missingNotes > 0 ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {t("reviewWorkspace.integrity.answeredMissingNotes", {
                answered: stats.answered,
                total: stats.total,
                count: stats.missingNotes,
              })}
            </span>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">
                {t("reviewWorkspace.integrity.headerStats", {
                  answered: stats.answered,
                  total: stats.total,
                })}
              </span>
              {stats.unchecked > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t("reviewWorkspace.integrity.statUnchecked", { count: stats.unchecked })}</span>
                </>
              ) : null}
              {stats.concern > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {t("reviewWorkspace.integrity.statConcerns", { count: stats.concern })}
                  </span>
                </>
              ) : null}
              {stats.missingNotes > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {t("reviewWorkspace.integrity.statMissingNotes", { count: stats.missingNotes })}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>

        <p className="rw-integrity-disclaimer">{t("reviewWorkspace.integrityDisclaimer")}</p>

        {commentOnly ? (
          <div className="rw-decision-callout mt-1" data-tone="info">
            <span>{t("reviewWorkspace.integrity.commentOnlyNotice")}</span>
          </div>
        ) : null}
      </header>

      {/* Compact Integrity Matrix (Desktop / Comfortable width) OR Segmented Compact List (Narrow panel) */}
      {!isNarrowPanel ? (
        <div className="rw-matrix-wrap">
          <table className="rw-integrity-table" aria-label={t("reviewWorkspace.integrityTitle")}>
            <thead>
              <tr>
                <th scope="col" className="rw-matrix-th-criterion">
                  {t("reviewWorkspace.integrity.colCheck")}
                </th>
                <th scope="col" className="rw-integrity-th-status">
                  {t("reviewWorkspace.integrity.checked")}
                </th>
                <th scope="col" className="rw-integrity-th-status">
                  {t("reviewWorkspace.integrity.concern")}
                </th>
                <th scope="col" className="rw-integrity-th-status">
                  {t("reviewWorkspace.integrity.notApplicable")}
                </th>
                <th scope="col" className="rw-integrity-th-info">
                  <span className="sr-only">{t("reviewWorkspace.integrity.infoButton")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {scientificIntegrityChecks.map(check => {
                const entry = value[check.key];
                const status = entry?.status;
                const title = localizeIntegrityTitle(check.title, language);
                const isConcern = status === "CONCERN";
                const missingNote = isConcern && (entry?.note?.trim().length ?? 0) < CONCERN_MIN_CHARS;
                const isMissing = showMissingHighlight && (!status || missingNote);
                const isExpanded = Boolean(expandedKeys[check.key]) || isConcern;

                return (
                  <Fragment key={check.key}>
                    <tr
                      id={`integrity-row-${check.key}`}
                      className="rw-integrity-row"
                      data-status={status ?? "UNCHECKED"}
                      data-missing={isMissing ? "true" : undefined}
                      data-expanded={isExpanded ? "true" : undefined}
                    >
                      <td className="rw-integrity-td-title">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            className="rw-integrity-title-btn"
                            aria-expanded={isExpanded}
                            aria-controls={`integrity-detail-${check.key}`}
                            onClick={() => toggleRowDetails(check.key)}
                          >
                            <span className="truncate">{title}</span>
                          </button>
                          {previousIntegrity?.checks?.[check.key]?.status === "CONCERN" ? (
                            <span
                              className="rw-prior-ref-pill rw-prior-ref-concern shrink-0"
                              title={t("reviewWorkspace.priorRound.integrityRefTitle", {
                                round: previousIntegrity.roundNumber,
                              })}
                            >
                              {t("reviewWorkspace.priorRound.priorConcernBadge")}
                            </span>
                          ) : null}
                          {missingNote ? (
                            <span className="rw-matrix-warn-pill shrink-0">
                              {t("reviewWorkspace.integrity.statMissingNotes", { count: 1 })}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="rw-integrity-td-btn">
                        <button
                          type="button"
                          disabled={disabled}
                          aria-pressed={status === "CHECKED"}
                          aria-label={`${title}: ${t("reviewWorkspace.integrity.checked")}`}
                          title={t("reviewWorkspace.integrity.checked")}
                          className="rw-integrity-choice-btn"
                          data-choice="checked"
                          onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "CHECKED")}
                        >
                          <Check size={14} aria-hidden="true" />
                          <span className="sr-only">{t("reviewWorkspace.integrity.checked")}</span>
                        </button>
                      </td>

                      <td className="rw-integrity-td-btn">
                        <button
                          type="button"
                          disabled={disabled}
                          aria-pressed={status === "CONCERN"}
                          aria-label={`${title}: ${t("reviewWorkspace.integrity.concern")}`}
                          title={t("reviewWorkspace.integrity.concern")}
                          className="rw-integrity-choice-btn"
                          data-choice="concern"
                          onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "CONCERN")}
                        >
                          <AlertTriangle size={14} aria-hidden="true" />
                          <span className="sr-only">{t("reviewWorkspace.integrity.concern")}</span>
                        </button>
                      </td>

                      <td className="rw-integrity-td-btn">
                        {check.allowNotApplicable ? (
                          <button
                            type="button"
                            disabled={disabled}
                            aria-pressed={status === "NOT_APPLICABLE"}
                            aria-label={`${title}: ${t("reviewWorkspace.integrity.notApplicable")}`}
                            title={t("reviewWorkspace.integrity.notApplicable")}
                            className="rw-integrity-choice-btn"
                            data-choice="na"
                            onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "NOT_APPLICABLE")}
                          >
                            <Minus size={13} aria-hidden="true" />
                            <span className="sr-only">{t("reviewWorkspace.integrity.notApplicable")}</span>
                          </button>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground/45 select-none"
                            aria-hidden="true"
                          >
                            —
                          </span>
                        )}
                      </td>

                      <td className="rw-integrity-td-info">
                        <button
                          type="button"
                          className="rw-integrity-info-btn"
                          aria-expanded={isExpanded}
                          aria-controls={`integrity-detail-${check.key}`}
                          aria-label={`${title} — ${t("reviewWorkspace.integrity.infoButton")}`}
                          title={t("reviewWorkspace.integrity.infoButton")}
                          onClick={() => toggleRowDetails(check.key)}
                        >
                          {isExpanded ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <Info size={14} aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="rw-matrix-detail-row">
                        <td colSpan={5} className="p-0">
                          {renderRowDetail(check)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Narrow-panel & mobile segmented list fallback (zero horizontal overflow) */
        <div className="divide-y divide-border/70">
          {scientificIntegrityChecks.map(check => {
            const entry = value[check.key];
            const status = entry?.status;
            const title = localizeIntegrityTitle(check.title, language);
            const isConcern = status === "CONCERN";
            const missingNote = isConcern && (entry?.note?.trim().length ?? 0) < CONCERN_MIN_CHARS;
            const isMissing = showMissingHighlight && (!status || missingNote);
            const isExpanded = Boolean(expandedKeys[check.key]) || isConcern;

            return (
              <div
                key={check.key}
                id={`integrity-row-${check.key}`}
                className="p-3 space-y-2"
                data-missing={isMissing ? "true" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="rw-integrity-title-btn text-left"
                    aria-expanded={isExpanded}
                    aria-controls={`integrity-detail-${check.key}`}
                    onClick={() => toggleRowDetails(check.key)}
                  >
                    <span>{title}</span>
                  </button>
                  <button
                    type="button"
                    className="rw-integrity-info-btn shrink-0"
                    aria-expanded={isExpanded}
                    aria-controls={`integrity-detail-${check.key}`}
                    aria-label={`${title} — ${t("reviewWorkspace.integrity.infoButton")}`}
                    onClick={() => toggleRowDetails(check.key)}
                  >
                    {isExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label={title}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={status === "CHECKED"}
                    className="rw-integrity-seg-btn"
                    data-choice="checked"
                    onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "CHECKED")}
                  >
                    <Check size={12} aria-hidden="true" />
                    <span>{t("reviewWorkspace.integrity.checked")}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={status === "CONCERN"}
                    className="rw-integrity-seg-btn"
                    data-choice="concern"
                    onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "CONCERN")}
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    <span>{t("reviewWorkspace.integrity.concern")}</span>
                  </button>
                  {check.allowNotApplicable ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={status === "NOT_APPLICABLE"}
                      className="rw-integrity-seg-btn"
                      data-choice="na"
                      onClick={() => setCheckStatus(check.key, check.allowNotApplicable, "NOT_APPLICABLE")}
                    >
                      <Minus size={12} aria-hidden="true" />
                      <span>{t("reviewWorkspace.integrity.notApplicableShort")}</span>
                    </button>
                  ) : null}
                </div>

                {isExpanded ? renderRowDetail(check) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
