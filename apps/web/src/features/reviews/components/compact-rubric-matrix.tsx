import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FeedbackItemPriority, StructuredAssessment } from "@trend/shared-types";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  Quote,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  localizeSystemCriterion,
  localizeSystemLevelDescription,
  type SystemRubricContext,
} from "@/features/reviews/system-rubric-i18n";
import { useI18n } from "@/i18n";
import type { CriterionResponseDraft, RevisionItemDraft } from "@/features/reviews/review-readiness";
import type { CompatiblePriorCriterionRef } from "@/features/reviews/revision-comparison";

export type MatrixCriterion = {
  key: string;
  title: string;
  description?: string | null;
  order: number;
  required: boolean;
  allowNotApplicable: boolean;
  weight?: number | null;
  levels: Array<{
    id: string;
    score: number;
    label: string;
    description?: string | null;
  }>;
};

type CreateRevisionResult = { added: boolean; duplicate?: boolean };
type UpdateRevisionResult = { updated: boolean; duplicate?: boolean };

const DESCRIPTION_COLLAPSE_THRESHOLD = 220;

const assessmentOptions: Array<{ value: StructuredAssessment; key: string }> = [
  { value: "MAJOR_ISSUES", key: "reviewWorkspace.assessment.MAJOR_ISSUES" },
  { value: "NEEDS_IMPROVEMENT", key: "reviewWorkspace.assessment.NEEDS_IMPROVEMENT" },
  { value: "ADEQUATE", key: "reviewWorkspace.assessment.ADEQUATE" },
  { value: "STRONG", key: "reviewWorkspace.assessment.STRONG" },
  { value: "NOT_APPLICABLE", key: "reviewWorkspace.assessment.NOT_APPLICABLE" },
];

function shortLevelLabel(rawLabel: string, language: string): string {
  const parts = rawLabel
    .split(/\s*\/\s*/)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    return language === "vi" ? parts[1]! : parts[0]!;
  }
  return rawLabel;
}

function priorityMeta(priority: FeedbackItemPriority, t: (key: string) => string) {
  if (priority === "MAJOR") {
    return {
      label: t("reviewWorkspace.feedbackFirst.severity.MAJOR"),
      tone: "major" as const,
      Icon: AlertCircle,
    };
  }
  if (priority === "SUGGESTION") {
    return {
      label: t("reviewWorkspace.feedbackFirst.severity.SUGGESTION"),
      tone: "suggestion" as const,
      Icon: Lightbulb,
    };
  }
  return {
    label: t("reviewWorkspace.feedbackFirst.severity.MINOR"),
    tone: "minor" as const,
    Icon: AlertTriangle,
  };
}

export function CompactRubricMatrix({
  criteria,
  allCriteriaOrderMap,
  reviewMode,
  isSystemRubric,
  rubricContext,
  responses,
  requiredRevisions = [],
  revisionCountByCriterion,
  expandedKey,
  onToggleExpand,
  onUpdateResponse,
  onCreateRevisionRequest,
  onUpdateRevisionRequest,
  onDeleteRevisionRequest,
  onNavigateToRevisions,
  disabled,
  showMissingHighlight,
  isCriterionComplete,
  needsLowScoreComment,
  isNarrowPanel,
  previousCriteriaMap,
}: {
  criteria: MatrixCriterion[];
  allCriteriaOrderMap: Map<string, number>;
  reviewMode: string;
  isSystemRubric: boolean;
  rubricContext?: SystemRubricContext;
  responses: Record<string, CriterionResponseDraft>;
  requiredRevisions?: RevisionItemDraft[];
  revisionCountByCriterion: Record<string, number>;
  expandedKey: string | null;
  onToggleExpand: (criterionKey: string | null) => void;
  onUpdateResponse: (criterionKey: string, patch: Partial<CriterionResponseDraft>) => void;
  onCreateRevisionRequest: (draft: {
    criterionKey: string;
    description: string;
    priority: FeedbackItemPriority;
    locator?: string;
    quotation?: string;
  }) => CreateRevisionResult;
  onUpdateRevisionRequest?: (
    index: number,
    patch: {
      criterionKey: string;
      description: string;
      priority: FeedbackItemPriority;
      locator?: string;
      quotation?: string;
    },
  ) => UpdateRevisionResult;
  onDeleteRevisionRequest?: (index: number) => void;
  onNavigateToRevisions: () => void;
  disabled: boolean;
  showMissingHighlight: boolean;
  isCriterionComplete: (criterion: MatrixCriterion) => boolean;
  needsLowScoreComment: (criterion: MatrixCriterion) => boolean;
  isNarrowPanel: boolean;
  previousCriteriaMap?: Record<string, CompatiblePriorCriterionRef>;
}) {
  const { t, language } = useI18n();

  // Hover/focus level preview for keyboard & mouse discoverability without cluttering rows
  const [previewLevel, setPreviewLevel] = useState<{
    criterionKey: string;
    score: number;
    label: string;
    description: string;
  } | null>(null);

  // Per-criterion optional toggles inside detail region
  const [expandedDescKeys, setExpandedDescKeys] = useState<Record<string, boolean>>({});
  const [evidenceOpenKeys, setEvidenceOpenKeys] = useState<Record<string, boolean>>({});

  // Inline revision request composer state (create or edit, scoped to expanded criterion)
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const [editingRevisionIndex, setEditingRevisionIndex] = useState<number | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftLocator, setDraftLocator] = useState("");
  const [draftQuotation, setDraftQuotation] = useState("");
  const [showQuotationInput, setShowQuotationInput] = useState(false);
  const [draftPriority, setDraftPriority] = useState<FeedbackItemPriority>("MINOR");
  const [composerNotice, setComposerNotice] = useState<{
    type: "added" | "duplicate";
    criterionKey: string;
  } | null>(null);

  const submittingComposerRef = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const addRevisionTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isRubricAssessment = reviewMode === "RUBRIC_ASSESSMENT";
  const isStructuredReview = reviewMode === "STRUCTURED_REVIEW";

  const allCriteriaRequired = useMemo(
    () => criteria.length > 0 && criteria.every(c => c.required),
    [criteria],
  );

  // Derive scale columns dynamically from template criteria — never hardcoded
  const uniformScores = useMemo(() => {
    if (!isRubricAssessment || criteria.length === 0) return null;
    const first = criteria[0];
    if (!first || first.levels.length === 0) return null;
    const baseScores = first.levels.map(level => level.score);
    const baseSig = baseScores.join(",");
    const allMatch = criteria.every(
      c => c.levels.length === baseScores.length && c.levels.map(l => l.score).join(",") === baseSig,
    );
    return allMatch ? baseScores : null;
  }, [criteria, isRubricAssessment]);

  const anyAllowNA = useMemo(
    () => isRubricAssessment && criteria.some(c => c.allowNotApplicable),
    [criteria, isRubricAssessment],
  );

  // Focus composer textarea cleanly when opened
  useEffect(() => {
    if (composerKey && composerTextareaRef.current) {
      composerTextareaRef.current.focus();
    }
  }, [composerKey, editingRevisionIndex]);

  const openCreateComposer = (criterion: MatrixCriterion) => {
    const state = responses[criterion.key];
    const selectedLevel = criterion.levels.find(l => l.id === state?.performanceLevelId);
    const defaultPriority: FeedbackItemPriority =
      selectedLevel && selectedLevel.score <= 2
        ? "MAJOR"
        : state?.assessment === "MAJOR_ISSUES"
          ? "MAJOR"
          : "MINOR";
    setEditingRevisionIndex(null);
    setComposerKey(criterion.key);
    setDraftDescription(state?.comment.trim() ?? "");
    setDraftLocator(state?.evidence.trim() ?? "");
    setDraftQuotation("");
    setShowQuotationInput(false);
    setDraftPriority(defaultPriority);
    setComposerNotice(null);
  };

  const openEditComposer = (criterionKey: string, index: number, item: RevisionItemDraft) => {
    setEditingRevisionIndex(index);
    setComposerKey(criterionKey);
    setDraftDescription(item.description);
    setDraftLocator(item.locator ?? "");
    setDraftQuotation(item.quotation ?? "");
    setShowQuotationInput(Boolean(item.quotation?.trim()));
    setDraftPriority(item.priority);
    setComposerNotice(null);
  };

  const closeInlineComposer = (restoreFocus = false) => {
    setComposerKey(null);
    setEditingRevisionIndex(null);
    setDraftDescription("");
    setDraftLocator("");
    setDraftQuotation("");
    setShowQuotationInput(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => addRevisionTriggerRef.current?.focus());
    }
  };

  const confirmInlineComposer = (criterionKey: string) => {
    if (submittingComposerRef.current) return;
    const trimmed = draftDescription.trim();
    if (!trimmed) return;

    submittingComposerRef.current = true;
    try {
      if (editingRevisionIndex !== null && onUpdateRevisionRequest) {
        const result = onUpdateRevisionRequest(editingRevisionIndex, {
          criterionKey,
          description: trimmed,
          priority: draftPriority,
          locator: draftLocator.trim() || undefined,
          quotation: draftQuotation.trim() || undefined,
        });
        if (result.duplicate) {
          setComposerNotice({ type: "duplicate", criterionKey });
          return;
        }
        if (result.updated) {
          closeInlineComposer(true);
        }
        return;
      }

      const result = onCreateRevisionRequest({
        criterionKey,
        description: trimmed,
        priority: draftPriority,
        locator: draftLocator.trim() || undefined,
        quotation: draftQuotation.trim() || undefined,
      });
      if (result.duplicate) {
        setComposerNotice({ type: "duplicate", criterionKey });
        return;
      }
      if (result.added) {
        setComposerNotice({ type: "added", criterionKey });
        closeInlineComposer(true);
      }
    } finally {
      submittingComposerRef.current = false;
    }
  };

  const levelDescOptions = (criterion: MatrixCriterion) => ({
    criterionKey: criterion.key,
    criterionTitle: criterion.title,
    artifactType: rubricContext?.artifactType,
    versionNumber: rubricContext?.versionNumber,
    guidelines: rubricContext?.guidelines,
  });

  const renderDetailPanel = (criterion: MatrixCriterion) => {
    const loc = localizeSystemCriterion(criterion, language, isSystemRubric, rubricContext);
    const state: CriterionResponseDraft = responses[criterion.key] ?? {
      comment: "",
      evidence: "",
      notApplicable: false,
    };
    const selectedLevel = criterion.levels.find(l => l.id === state.performanceLevelId);
    const lowScoreNeedsComment = needsLowScoreComment(criterion);
    const linkedEntries = requiredRevisions
      .map((item, index) => ({ item, index }))
      .filter(entry => entry.item.criterionKey === criterion.key && entry.item.description.trim().length > 0);
    const linkedCount = linkedEntries.length || (revisionCountByCriterion[criterion.key] ?? 0);
    const isComposerOpen = composerKey === criterion.key;
    const activePreview =
      previewLevel && previewLevel.criterionKey === criterion.key ? previewLevel : null;
    const hasEvidence = state.evidence.trim().length > 0;
    const isEvidenceExpanded = hasEvidence || Boolean(evidenceOpenKeys[criterion.key]);
    const isLongDesc = Boolean(loc.description && loc.description.length > DESCRIPTION_COLLAPSE_THRESHOLD);
    const isDescExpanded = Boolean(expandedDescKeys[criterion.key]);
    const commentTrimmed = state.comment.trim();
    const canCopyCommentIntoComposer =
      Boolean(commentTrimmed) && commentTrimmed !== draftDescription.trim();
    const priorRef = previousCriteriaMap?.[criterion.key];
    const maxScore = criterion.levels.length > 0 ? Math.max(...criterion.levels.map(l => l.score)) : 5;

    return (
      <div
        id={`rw-criterion-detail-${criterion.key}`}
        className="rw-criterion-detail"
        role="region"
        aria-label={loc.title}
      >
        {/* Compact Criterion Description — avoids repeating criterion title & weight already shown on the row directly above */}
        <div className="rw-criterion-detail-head">
          <div className="min-w-0 flex-1">
            {loc.description ? (
              <div>
                <p
                  className={`rw-criterion-desc mb-0 ${
                    isLongDesc && !isDescExpanded ? "rw-criterion-desc-clamped" : ""
                  }`}
                >
                  {loc.description}
                </p>
                {isLongDesc ? (
                  <button
                    type="button"
                    className="rw-text-action mt-0.5"
                    aria-expanded={isDescExpanded}
                    onClick={() =>
                      setExpandedDescKeys(current => ({
                        ...current,
                        [criterion.key]: !current[criterion.key],
                      }))
                    }
                  >
                    {isDescExpanded ? t("reviewWorkspace.showLess") : t("reviewWorkspace.showMore")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="rw-detail-close-btn"
            aria-label={t("reviewWorkspace.matrix.closeDetails")}
            onClick={() => onToggleExpand(null)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Selected Performance Descriptor */}
        {isRubricAssessment ? (
          <div className="space-y-1.5">
            {state.notApplicable ? (
              <div className="rw-descriptor-box" data-compact="true">
                <strong>{t("reviewWorkspace.notApplicable")}</strong>
              </div>
            ) : activePreview ? (
              <div className="rw-descriptor-box">
                <div className="rw-descriptor-heading">
                  <strong>
                    {activePreview.score} — {activePreview.label}
                  </strong>
                </div>
                {activePreview.description ? (
                  <p className="rw-descriptor-body">{activePreview.description}</p>
                ) : null}
              </div>
            ) : selectedLevel ? (
              <div className="rw-descriptor-box">
                <div className="rw-descriptor-heading">
                  <strong>
                    {selectedLevel.score} — {shortLevelLabel(selectedLevel.label, language)}
                  </strong>
                </div>
                {localizeSystemLevelDescription(
                  selectedLevel,
                  language,
                  isSystemRubric,
                  levelDescOptions(criterion),
                ) ? (
                  <p className="rw-descriptor-body">
                    {localizeSystemLevelDescription(
                      selectedLevel,
                      language,
                      isSystemRubric,
                      levelDescOptions(criterion),
                    )}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rw-descriptor-empty">{t("reviewWorkspace.selectScoreHint")}</p>
            )}

            {criterion.allowNotApplicable ? (
              <div className="rw-scale-controls mt-0">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={state.notApplicable}
                    onChange={e =>
                      onUpdateResponse(criterion.key, {
                        notApplicable: e.target.checked,
                        performanceLevelId: e.target.checked ? undefined : state.performanceLevelId,
                      })
                    }
                  />
                  <span>{t("reviewWorkspace.notApplicable")}</span>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Structured review assessment selector */}
        {isStructuredReview ? (
          <label className="block text-xs font-medium text-foreground">
            <span>{t("reviewWorkspace.assessment")}</span>
            <select
              disabled={disabled}
              className="mt-1.5 h-9 w-full rounded-md border bg-background px-3 text-sm font-normal"
              value={state.assessment ?? ""}
              onChange={e =>
                onUpdateResponse(criterion.key, {
                  assessment: (e.target.value || undefined) as StructuredAssessment | undefined,
                  notApplicable: e.target.value === "NOT_APPLICABLE",
                })
              }
            >
              <option value="">{t("reviewWorkspace.notAssessed")}</option>
              {assessmentOptions
                .filter(opt => opt.value !== "NOT_APPLICABLE" || criterion.allowNotApplicable)
                .map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        {/* Academic Comment + Collapsible Optional Evidence */}
        {priorRef && (priorRef.comment || priorRef.score != null || priorRef.notApplicable || priorRef.assessment) ? (
          <details className="rounded-lg border border-border/75 bg-muted/20 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
              {t("reviewWorkspace.priorRound.commentTitle", { round: priorRef.roundNumber })}
              {priorRef.notApplicable
                ? ` · N/A`
                : priorRef.score != null
                  ? ` · ${priorRef.score}/${maxScore}`
                  : priorRef.assessment
                    ? ` · ${t(`reviewWorkspace.assessment.${priorRef.assessment}`)}`
                    : ""}
            </summary>
            {priorRef.comment ? (
              <p className="mt-1.5 whitespace-pre-wrap border-t border-border/60 pt-1.5 leading-5 text-foreground/85">
                {priorRef.comment}
              </p>
            ) : (
              <p className="mt-1.5 italic text-muted-foreground">
                {t("reviewWorkspace.priorRound.noCriterionComment")}
              </p>
            )}
          </details>
        ) : null}

        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {reviewMode === "GUIDED_FEEDBACK"
                  ? t("reviewWorkspace.responseLabel")
                  : t("reviewWorkspace.commentLabel")}
              </span>
              {lowScoreNeedsComment ? (
                <span className="rw-inline-warn">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {t("reviewWorkspace.matrix.lowScoreCommentHint")}
                </span>
              ) : null}
            </span>
            <textarea
              disabled={disabled}
              rows={2}
              maxLength={4000}
              placeholder={
                reviewMode === "GUIDED_FEEDBACK"
                  ? t("reviewWorkspace.responsePlaceholder")
                  : t("reviewWorkspace.commentPlaceholder")
              }
              className={`rw-comment-textarea mt-1.5 ${
                lowScoreNeedsComment && showMissingHighlight ? "border-amber-500" : ""
              }`}
              value={state.comment}
              onChange={e => onUpdateResponse(criterion.key, { comment: e.target.value })}
            />
          </label>

          {/* Optional Evidence Location — collapsed when empty, always visible when populated */}
          {isEvidenceExpanded ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`rw-evidence-${criterion.key}`}
                  className="text-xs font-medium text-foreground"
                >
                  {t("reviewWorkspace.evidenceLabel")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("reviewWorkspace.optional")}
                  </span>
                </label>
                {!hasEvidence && !disabled ? (
                  <button
                    type="button"
                    className="rw-text-action"
                    onClick={() =>
                      setEvidenceOpenKeys(current => ({ ...current, [criterion.key]: false }))
                    }
                  >
                    {t("reviewWorkspace.hideEvidence")}
                  </button>
                ) : null}
              </div>
              <Input
                ref={evidenceInputRef}
                id={`rw-evidence-${criterion.key}`}
                disabled={disabled}
                className="h-8 text-sm font-normal"
                placeholder={t("reviewWorkspace.evidencePlaceholder")}
                value={state.evidence}
                onChange={e => onUpdateResponse(criterion.key, { evidence: e.target.value })}
              />
            </div>
          ) : !disabled ? (
            <div>
              <button
                type="button"
                className="rw-subtle-add-btn"
                onClick={() => {
                  setEvidenceOpenKeys(current => ({ ...current, [criterion.key]: true }));
                  window.requestAnimationFrame(() => evidenceInputRef.current?.focus());
                }}
              >
                <Plus size={12} aria-hidden="true" />
                <span>{t("reviewWorkspace.addEvidenceCta")}</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Linked Revision Requests inside this Criterion (shared requiredRevisions source of truth) */}
        {linkedEntries.length > 0 ? (
          <div className="rw-criterion-revisions">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("reviewWorkspace.revisionSectionHeader", { count: linkedEntries.length })}
              </span>
              <button
                type="button"
                className="rw-linked-rev-link"
                onClick={onNavigateToRevisions}
              >
                <ListChecks size={12} aria-hidden="true" />
                {t("reviewWorkspace.subTab.revisions")}
              </button>
            </div>
            <ul className="space-y-1.5">
              {linkedEntries.map(({ item, index }) => {
                const meta = priorityMeta(item.priority, t);
                const Icon = meta.Icon;
                return (
                  <li key={`${index}-${item.description.slice(0, 24)}`} className="rw-criterion-rev-item">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rw-severity-pill" data-tone={meta.tone}>
                          <Icon size={11} aria-hidden="true" />
                          <span>{meta.label}</span>
                        </span>
                        {item.priority === "SUGGESTION" ? (
                          <span className="text-[11px] text-muted-foreground">
                            ({t("reviewWorkspace.revisionOptionalTag")})
                          </span>
                        ) : null}
                      </div>
                      {!disabled ? (
                        <div className="flex items-center gap-1 shrink-0">
                          {onUpdateRevisionRequest ? (
                            <button
                              type="button"
                              className="rw-rev-icon-btn"
                              aria-label={t("reviewWorkspace.revisionEdit")}
                              onClick={() => openEditComposer(criterion.key, index, item)}
                            >
                              <Pencil size={12} aria-hidden="true" />
                              <span>{t("reviewWorkspace.revisionEdit")}</span>
                            </button>
                          ) : null}
                          {onDeleteRevisionRequest ? (
                            <button
                              type="button"
                              className="rw-rev-icon-btn rw-rev-icon-btn-danger"
                              aria-label={t("reviewWorkspace.revisionDelete")}
                              onClick={() => {
                                if (editingRevisionIndex === index) closeInlineComposer();
                                onDeleteRevisionRequest(index);
                              }}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                              <span>{t("reviewWorkspace.revisionDelete")}</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-foreground">{item.description}</p>
                    {item.locator ? (
                      <p className="text-[11px] text-muted-foreground">{item.locator}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Criterion footer actions: compact "+ Add revision request" CTA */}
        <div className="rw-criterion-detail-actions">
          <div className="flex flex-wrap items-center gap-2">
            {!disabled && !isComposerOpen ? (
              <Button
                ref={addRevisionTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => openCreateComposer(criterion)}
              >
                <Plus size={13} aria-hidden="true" />
                {t("reviewWorkspace.matrix.createRevision")}
              </Button>
            ) : null}

            {linkedEntries.length === 0 && linkedCount > 0 ? (
              <button
                type="button"
                className="rw-linked-rev-link"
                onClick={onNavigateToRevisions}
              >
                <ListChecks size={12} aria-hidden="true" />
                {t("reviewWorkspace.matrix.linkedRevisionsCount", { count: linkedCount })}
              </button>
            ) : null}
          </div>

          {composerNotice && composerNotice.criterionKey === criterion.key ? (
            <span
              className={
                composerNotice.type === "added"
                  ? "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  : "text-xs font-medium text-amber-700 dark:text-amber-400"
              }
              role="status"
            >
              {composerNotice.type === "added"
                ? t("reviewWorkspace.matrix.revisionAdded")
                : t("reviewWorkspace.matrix.revisionDuplicate")}
            </span>
          ) : null}
        </div>

        {/* Inline Revision Request Composer (opened only on explicit user click — never repeats criterion title) */}
        {isComposerOpen && !disabled ? (
          <div
            className="rw-inline-composer"
            role="form"
            aria-label={
              editingRevisionIndex !== null
                ? t("reviewWorkspace.revisionEditTitle")
                : t("reviewWorkspace.matrix.createRevision")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor={`rw-composer-desc-${criterion.key}`}
                className="text-xs font-semibold text-foreground"
              >
                {editingRevisionIndex !== null
                  ? t("reviewWorkspace.revisionEditTitle")
                  : t("reviewWorkspace.revisionContentLabel")}
              </label>
              {canCopyCommentIntoComposer ? (
                <button
                  type="button"
                  className="rw-text-action"
                  onClick={() => {
                    setDraftDescription(commentTrimmed);
                    if (composerNotice?.type === "duplicate") setComposerNotice(null);
                    composerTextareaRef.current?.focus();
                  }}
                >
                  {t("reviewWorkspace.useCommentDraft")}
                </button>
              ) : null}
            </div>

            <textarea
              ref={composerTextareaRef}
              id={`rw-composer-desc-${criterion.key}`}
              rows={2}
              maxLength={2000}
              placeholder={t("reviewWorkspace.revisionPlaceholder")}
              className="rw-comment-textarea"
              value={draftDescription}
              onChange={e => {
                setDraftDescription(e.target.value);
                if (composerNotice?.type === "duplicate") setComposerNotice(null);
              }}
            />

            <div className="space-y-1.5">
              <span className="block text-[11px] font-medium text-muted-foreground">
                {t("reviewWorkspace.matrix.priorityLabel")}
              </span>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("reviewWorkspace.matrix.priorityLabel")}
              >
                {(["MAJOR", "MINOR", "SUGGESTION"] as FeedbackItemPriority[]).map(priority => {
                  const active = draftPriority === priority;
                  const meta = priorityMeta(priority, t);
                  const Icon = meta.Icon;
                  return (
                    <button
                      key={priority}
                      type="button"
                      aria-pressed={active}
                      className="rw-severity-btn"
                      data-active={active ? "true" : undefined}
                      data-tone={meta.tone}
                      onClick={() => setDraftPriority(priority)}
                    >
                      <Icon size={12} aria-hidden="true" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {t(`reviewWorkspace.priorityHint.${draftPriority}`)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Input
                className="h-8 text-xs"
                aria-label={t("reviewWorkspace.evidenceLabel")}
                placeholder={t("reviewWorkspace.evidencePlaceholder")}
                value={draftLocator}
                onChange={e => setDraftLocator(e.target.value)}
              />
              {showQuotationInput ? (
                <Input
                  className="h-8 text-xs"
                  aria-label={t("reviewWorkspace.matrix.quotationLabel")}
                  placeholder={t("reviewWorkspace.matrix.quotationPlaceholder")}
                  value={draftQuotation}
                  onChange={e => setDraftQuotation(e.target.value)}
                />
              ) : (
                <button
                  type="button"
                  className="rw-text-action inline-flex items-center gap-1"
                  onClick={() => setShowQuotationInput(true)}
                >
                  <Quote size={11} aria-hidden="true" />
                  <span>{t("reviewWorkspace.addQuotationCta")}</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => closeInlineComposer(true)}
              >
                {t("reviewWorkspace.matrix.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={!draftDescription.trim()}
                onClick={() => confirmInlineComposer(criterion.key)}
              >
                <Check size={12} aria-hidden="true" />
                {editingRevisionIndex !== null
                  ? t("reviewWorkspace.revisionSaveChanges")
                  : t("reviewWorkspace.matrix.confirmAddRevision")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  if (criteria.length === 0) {
    return (
      <div className="rw-card p-5 text-center text-sm text-muted-foreground">
        {t("reviewWorkspace.allCriteriaDone")}
      </div>
    );
  }

  // Case 1: Compact Rubric Matrix table for uniform RUBRIC_ASSESSMENT on comfortable width
  if (isRubricAssessment && uniformScores && !isNarrowPanel) {
    const colCount = uniformScores.length + (anyAllowNA ? 1 : 0) + 2;
    return (
      <div className="rw-matrix-card">
        {allCriteriaRequired ? (
          <div className="rw-matrix-note-bar">
            {t("reviewWorkspace.allCriteriaRequiredNote")}
          </div>
        ) : null}
        <div className="rw-matrix-wrap">
          <table className="rw-matrix-table" aria-label={t("reviewWorkspace.modeTab.rubric")}>
            <thead>
              <tr>
                <th scope="col" className="rw-matrix-th-criterion">
                  {t("reviewWorkspace.matrix.criterionCol")}
                </th>
                {uniformScores.map(score => (
                  <th key={score} scope="col" className="rw-matrix-th-score">
                    {score}
                  </th>
                ))}
                {anyAllowNA ? (
                  <th scope="col" className="rw-matrix-th-score">
                    N/A
                  </th>
                ) : null}
                <th scope="col" className="rw-matrix-th-action">
                  <span className="sr-only">{t("reviewWorkspace.matrix.details")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map(criterion => {
                const state: CriterionResponseDraft = responses[criterion.key] ?? {
                  comment: "",
                  evidence: "",
                  notApplicable: false,
                };
                const loc = localizeSystemCriterion(criterion, language, isSystemRubric, rubricContext);
                const complete = isCriterionComplete(criterion);
                const lowScoreWarn = needsLowScoreComment(criterion);
                const isMissing = showMissingHighlight && criterion.required && !complete;
                const isExpanded = expandedKey === criterion.key;
                const hasComment = state.comment.trim().length > 0;
                const linkedCount = revisionCountByCriterion[criterion.key] ?? 0;
                const idx = allCriteriaOrderMap.get(criterion.key) ?? 0;
                const priorRef = previousCriteriaMap?.[criterion.key];
                const criterionMaxScore =
                  criterion.levels.length > 0 ? Math.max(...criterion.levels.map(l => l.score)) : 5;

                return (
                  <Fragment key={criterion.key}>
                    <tr
                      id={`criterion-${criterion.key}`}
                      className="rw-matrix-row"
                      data-expanded={isExpanded ? "true" : undefined}
                      data-complete={complete && !lowScoreWarn ? "true" : undefined}
                      data-missing={isMissing || (showMissingHighlight && lowScoreWarn) ? "true" : undefined}
                    >
                      <td className="rw-matrix-td-criterion">
                        <div className="rw-matrix-criterion-cell">
                          <span
                            className="rw-matrix-status"
                            data-state={
                              isMissing || lowScoreWarn
                                ? "warn"
                                : complete
                                  ? "done"
                                  : "idle"
                            }
                            aria-hidden="true"
                          >
                            {isMissing || lowScoreWarn ? (
                              <AlertTriangle size={12} />
                            ) : complete ? (
                              <Check size={12} />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="rw-matrix-title-btn"
                              aria-expanded={isExpanded}
                              aria-controls={`rw-criterion-detail-${criterion.key}`}
                              onClick={() => onToggleExpand(isExpanded ? null : criterion.key)}
                            >
                              <span className="truncate">{loc.title}</span>
                            </button>
                            <div className="rw-matrix-meta">
                              {criterion.weight ? (
                                <span className="rw-matrix-weight">
                                  {t("reviewWorkspace.weightShort", { weight: criterion.weight })}
                                </span>
                              ) : null}
                              {priorRef && (priorRef.notApplicable || priorRef.score != null) ? (
                                <span
                                  className="rw-prior-ref-pill"
                                  title={t("reviewWorkspace.priorRound.scoreTooltip", { round: priorRef.roundNumber })}
                                >
                                  {priorRef.notApplicable
                                    ? t("reviewWorkspace.priorRound.scoreNa")
                                    : t("reviewWorkspace.priorRound.scoreBadge", {
                                        score: priorRef.score!,
                                        max: criterionMaxScore,
                                      })}
                                </span>
                              ) : null}
                              {!allCriteriaRequired ? (
                                <span className="rw-matrix-weight">
                                  ·{" "}
                                  {criterion.required
                                    ? t("reviewWorkspace.required")
                                    : t("reviewWorkspace.optionalCriterion")}
                                </span>
                              ) : null}
                              {hasComment ? (
                                <span
                                  className="rw-matrix-indicator"
                                  title={t("reviewWorkspace.matrix.hasComment")}
                                >
                                  <MessageSquare size={11} aria-hidden="true" />
                                </span>
                              ) : null}
                              {linkedCount > 0 ? (
                                <span
                                  className="rw-matrix-indicator rw-matrix-indicator-rev"
                                  title={t("reviewWorkspace.matrix.linkedRevisionsCount", {
                                    count: linkedCount,
                                  })}
                                >
                                  <ListChecks size={11} aria-hidden="true" />
                                  {linkedCount}
                                </span>
                              ) : null}
                              {lowScoreWarn ? (
                                <span className="rw-matrix-warn-pill">
                                  {t("reviewWorkspace.matrix.needsCommentShort")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      {criterion.levels.map(level => {
                        const selected =
                          !state.notApplicable && state.performanceLevelId === level.id;
                        const label = shortLevelLabel(level.label, language);
                        const desc = localizeSystemLevelDescription(
                          level,
                          language,
                          isSystemRubric,
                          levelDescOptions(criterion),
                        );
                        return (
                          <td key={level.id} className="rw-matrix-td-score">
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={selected}
                              aria-label={`${loc.title}: ${level.score} — ${label}`}
                              title={`${level.score} — ${label}${desc ? `: ${desc}` : ""}`}
                              className="rw-matrix-score-btn"
                              onMouseEnter={() =>
                                setPreviewLevel({
                                  criterionKey: criterion.key,
                                  score: level.score,
                                  label,
                                  description: desc ?? "",
                                })
                              }
                              onMouseLeave={() => setPreviewLevel(null)}
                              onFocus={() =>
                                setPreviewLevel({
                                  criterionKey: criterion.key,
                                  score: level.score,
                                  label,
                                  description: desc ?? "",
                                })
                              }
                              onBlur={() => setPreviewLevel(null)}
                              onClick={() =>
                                onUpdateResponse(criterion.key, {
                                  performanceLevelId: level.id,
                                  notApplicable: false,
                                })
                              }
                            >
                              {level.score}
                            </button>
                          </td>
                        );
                      })}

                      {anyAllowNA ? (
                        <td className="rw-matrix-td-score">
                          {criterion.allowNotApplicable ? (
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={state.notApplicable}
                              aria-label={`${loc.title}: ${t("reviewWorkspace.notApplicable")}`}
                              title={t("reviewWorkspace.notApplicable")}
                              className="rw-matrix-score-btn rw-matrix-na-btn"
                              onClick={() =>
                                onUpdateResponse(criterion.key, {
                                  notApplicable: !state.notApplicable,
                                  performanceLevelId: !state.notApplicable
                                    ? undefined
                                    : state.performanceLevelId,
                                })
                              }
                            >
                              N/A
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ) : null}

                      <td className="rw-matrix-td-action">
                        <button
                          type="button"
                          className="rw-matrix-expand-btn"
                          aria-expanded={isExpanded}
                          aria-controls={`rw-criterion-detail-${criterion.key}`}
                          onClick={() => onToggleExpand(isExpanded ? null : criterion.key)}
                        >
                          <span>{t("reviewWorkspace.matrix.details")}</span>
                          {isExpanded ? (
                            <ChevronUp size={13} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={13} aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="rw-matrix-detail-row">
                        <td colSpan={colCount} className="p-0">
                          {renderDetailPanel(criterion)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live hover/focus level descriptor bar — lets reviewer verify score meaning without opening Details */}
        {previewLevel && previewLevel.criterionKey !== expandedKey ? (
          <div className="rw-matrix-preview-bar" role="status" aria-live="polite">
            <strong>
              {previewLevel.score} — {previewLevel.label}:
            </strong>{" "}
            <span>{previewLevel.description || t("reviewWorkspace.selectScoreHint")}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Case 2: Narrow-panel fallback for RUBRIC_ASSESSMENT (or non-uniform levels), and compact list for STRUCTURED_REVIEW / GUIDED_FEEDBACK
  return (
    <div className="rw-compact-list">
      {allCriteriaRequired ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {t("reviewWorkspace.allCriteriaRequiredNote")}
        </p>
      ) : null}
      {criteria.map(criterion => {
        const state: CriterionResponseDraft = responses[criterion.key] ?? {
          comment: "",
          evidence: "",
          notApplicable: false,
        };
        const loc = localizeSystemCriterion(criterion, language, isSystemRubric, rubricContext);
        const complete = isCriterionComplete(criterion);
        const lowScoreWarn = needsLowScoreComment(criterion);
        const isMissing = showMissingHighlight && criterion.required && !complete;
        const isExpanded = expandedKey === criterion.key;
        const hasComment = state.comment.trim().length > 0;
        const linkedCount = revisionCountByCriterion[criterion.key] ?? 0;
        const idx = allCriteriaOrderMap.get(criterion.key) ?? 0;

        return (
          <div
            key={criterion.key}
            id={`criterion-${criterion.key}`}
            className="rw-compact-item"
            data-expanded={isExpanded ? "true" : undefined}
            data-missing={isMissing || (showMissingHighlight && lowScoreWarn) ? "true" : undefined}
          >
            <div className="rw-compact-item-top">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span
                  className="rw-matrix-status mt-0.5"
                  data-state={isMissing || lowScoreWarn ? "warn" : complete ? "done" : "idle"}
                  aria-hidden="true"
                >
                  {isMissing || lowScoreWarn ? (
                    <AlertTriangle size={12} />
                  ) : complete ? (
                    <Check size={12} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="rw-matrix-title-btn text-left"
                    aria-expanded={isExpanded}
                    aria-controls={`rw-criterion-detail-${criterion.key}`}
                    onClick={() => onToggleExpand(isExpanded ? null : criterion.key)}
                  >
                    <span>{loc.title}</span>
                  </button>
                  <div className="rw-matrix-meta">
                    {criterion.weight ? (
                      <span className="rw-matrix-weight">
                        {t("reviewWorkspace.weightShort", { weight: criterion.weight })}
                      </span>
                    ) : null}
                    {!allCriteriaRequired ? (
                      <span className="rw-matrix-weight">
                        ·{" "}
                        {criterion.required
                          ? t("reviewWorkspace.required")
                          : t("reviewWorkspace.optionalCriterion")}
                      </span>
                    ) : null}
                    {isStructuredReview ? (
                      <span className="rw-score-badge" data-assessed={state.assessment ? "true" : undefined}>
                        {state.assessment
                          ? t(`reviewWorkspace.assessment.${state.assessment}`)
                          : t("reviewWorkspace.notAssessed")}
                      </span>
                    ) : null}
                    {hasComment ? (
                      <span className="rw-matrix-indicator" title={t("reviewWorkspace.matrix.hasComment")}>
                        <MessageSquare size={11} aria-hidden="true" />
                      </span>
                    ) : null}
                    {linkedCount > 0 ? (
                      <span className="rw-matrix-indicator rw-matrix-indicator-rev">
                        <ListChecks size={11} aria-hidden="true" />
                        {linkedCount}
                      </span>
                    ) : null}
                    {lowScoreWarn ? (
                      <span className="rw-matrix-warn-pill">
                        {t("reviewWorkspace.matrix.needsCommentShort")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="rw-matrix-expand-btn shrink-0"
                aria-expanded={isExpanded}
                aria-controls={`rw-criterion-detail-${criterion.key}`}
                onClick={() => onToggleExpand(isExpanded ? null : criterion.key)}
              >
                <span>{t("reviewWorkspace.matrix.details")}</span>
                {isExpanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              </button>
            </div>

            {isRubricAssessment && criterion.levels.length > 0 ? (
              <div className="rw-compact-score-row" role="group" aria-label={loc.title}>
                {criterion.levels.map(level => {
                  const selected = !state.notApplicable && state.performanceLevelId === level.id;
                  const label = shortLevelLabel(level.label, language);
                  const desc = localizeSystemLevelDescription(
                    level,
                    language,
                    isSystemRubric,
                    levelDescOptions(criterion),
                  );
                  return (
                    <button
                      key={level.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${loc.title}: ${level.score} — ${label}`}
                      title={`${level.score} — ${label}${desc ? `: ${desc}` : ""}`}
                      className="rw-matrix-score-btn"
                      onClick={() =>
                        onUpdateResponse(criterion.key, {
                          performanceLevelId: level.id,
                          notApplicable: false,
                        })
                      }
                    >
                      {level.score}
                    </button>
                  );
                })}
                {criterion.allowNotApplicable ? (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={state.notApplicable}
                    aria-label={`${loc.title}: ${t("reviewWorkspace.notApplicable")}`}
                    className="rw-matrix-score-btn rw-matrix-na-btn"
                    onClick={() =>
                      onUpdateResponse(criterion.key, {
                        notApplicable: !state.notApplicable,
                        performanceLevelId: !state.notApplicable ? undefined : state.performanceLevelId,
                      })
                    }
                  >
                    N/A
                  </button>
                ) : null}
              </div>
            ) : null}

            {isExpanded ? renderDetailPanel(criterion) : null}
          </div>
        );
      })}
    </div>
  );
}
