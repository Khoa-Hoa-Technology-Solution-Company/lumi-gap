import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Eye, Lock, Search, Shapes, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ReviewTemplateSource, ReviewTemplateSummary, ReviewTemplateVersionDetail } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChangeReviewTemplate, useEligibleReviewTemplates } from "../hooks/use-reviews";
import { isLumiGapSystemRubric, localizeSystemCriterion } from "../system-rubric-i18n";
import { useReviewPageNavigation } from "../hooks/use-review-page-navigation";
import { useI18n } from "@/i18n";

const KNOWN_ARTIFACTS = new Set([
  "RESEARCH_PAPER",
  "LITERATURE_REVIEW",
  "RESEARCH_PROPOSAL",
  "METHODOLOGY",
  "SOFTWARE_RESEARCH_PROJECT",
  "MANUSCRIPT",
  "THESIS_CHAPTER",
  "THESIS_DRAFT",
  "GAP_ANALYSIS",
  "EVIDENCE_SYNTHESIS",
  "RESEARCH_PLAN",
  "GENERAL_REPORT",
]);

export function formatFriendlyTemplateName(
  name: string | undefined,
  artifactType: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!name) return t("reviewTemplates.title");
  const systemMatch = /^LumiGap Scientific Manuscript Review Rubric (v[\d.]+)\s*·\s*([A-Z_]+)$/i.exec(name.trim());
  if (systemMatch) {
    const version = systemMatch[1];
    const typeKey = systemMatch[2]?.toUpperCase();
    const label = typeKey && KNOWN_ARTIFACTS.has(typeKey)
      ? t(`reviewTemplates.artifact.${typeKey}`)
      : typeKey?.replaceAll("_", " ") ?? t("reviewTemplates.anyArtifact");
    return `${label} (LumiGap ${version})`;
  }
  if (name === "Literature Review" && artifactType === "LITERATURE_REVIEW") {
    return t("reviewTemplates.artifact.LITERATURE_REVIEW");
  }
  return name;
}

function formatMode(mode: string | undefined, t: (key: string) => string): string {
  if (mode && ["RUBRIC_ASSESSMENT", "STRUCTURED_REVIEW", "GUIDED_FEEDBACK"].includes(mode)) {
    return t(`reviewTemplates.mode.${mode}`);
  }
  return mode?.replaceAll("_", " ") ?? "";
}

function formatArtifact(type: string | null | undefined, t: (key: string) => string): string {
  if (!type) return t("reviewTemplates.anyArtifact");
  return KNOWN_ARTIFACTS.has(type) ? t(`reviewTemplates.artifact.${type}`) : type.replaceAll("_", " ");
}

function CriteriaPreviewList({
  version,
  artifactType,
  language,
  t,
}: {
  version?: ReviewTemplateVersionDetail;
  artifactType?: string | null;
  language: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (!version || version.criteria.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("reviewTemplates.noCriteria")}</p>;
  }
  const sys = isLumiGapSystemRubric(version.guidelines);
  const ctx = { artifactType, versionNumber: version.versionNumber, guidelines: version.guidelines };
  return (
    <ol className="space-y-2 text-xs">
      {version.criteria.map((criterion, idx) => {
        const loc = localizeSystemCriterion(criterion, language, sys, ctx);
        return (
          <li key={criterion.id ?? criterion.key ?? idx} className="rounded-md border border-border/80 bg-background px-3 py-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                {idx + 1}. {loc.title}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {version.reviewMode === "RUBRIC_ASSESSMENT" && criterion.weight != null ? (
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {t("reviewTemplates.weightLabel", { weight: criterion.weight })}
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="text-[10px]">
                  {criterion.required ? t("reviewTemplates.required") : t("reviewTemplates.optional")}
                </Badge>
                {criterion.allowNotApplicable ? (
                  <Badge variant="outline" className="text-[10px]">
                    {t("reviewTemplates.allowNa")}
                  </Badge>
                ) : null}
              </div>
            </div>
            {loc.description ? (
              <p className="text-muted-foreground leading-5">{loc.description}</p>
            ) : null}
            {version.reviewMode === "RUBRIC_ASSESSMENT" && criterion.levels.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {criterion.levels.map(level => (
                  <span key={level.id ?? level.score} className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {level.score} · {level.label}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ReviewTemplatePreviewDialog({
  open,
  onOpenChange,
  templateVersion,
  artifactType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateVersion?: ReviewTemplateVersionDetail;
  artifactType?: string | null;
}) {
  const { t, language } = useI18n();
  const title = formatFriendlyTemplateName(templateVersion?.templateName, artifactType, t);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col" data-no-i18n>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>{title}</span>
            {templateVersion?.templateSource ? (
              <Badge variant="outline" className="text-[11px] font-medium">
                {t(`reviewTemplates.source.${templateVersion.templateSource}`)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {[
              formatMode(templateVersion?.reviewMode, t),
              templateVersion ? `v${templateVersion.versionNumber}` : "",
              templateVersion ? t("reviewTemplates.criteriaCount", { count: templateVersion.criteria.length }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
          {templateVersion?.description ? (
            <p className="text-xs leading-5 text-muted-foreground">{templateVersion.description}</p>
          ) : null}
          <CriteriaPreviewList version={templateVersion} artifactType={artifactType} language={language} t={t} />
        </div>

        <DialogFooter>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            {t("reviewTemplates.selector.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewTemplateSelectorDialog({
  open,
  onOpenChange,
  requestId,
  artifactType,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  artifactType?: string | null;
  onChanged?: () => void;
}) {
  const { t, language } = useI18n();
  const { href } = useReviewPageNavigation();
  const eligible = useEligibleReviewTemplates(requestId, open);
  const changeTemplate = useChangeReviewTemplate();

  const [scope, setScope] = useState<"ALL" | ReviewTemplateSource>("ALL");
  const [search, setSearch] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDraftReset, setConfirmDraftReset] = useState(false);
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !eligible.data) return;
    setSelectedVersionId(eligible.data.currentTemplateVersionId);
    setConfirmDraftReset(false);
    setReason("");
    setServerError(null);
    setPreviewId(null);
  }, [open, eligible.data]);

  const templates = useMemo(() => eligible.data?.templates ?? [], [eligible.data?.templates]);
  const counts = useMemo(() => {
    const out = { ALL: templates.length, SYSTEM: 0, PERSONAL: 0, PROJECT: 0 };
    for (const item of templates) out[item.source] += 1;
    return out;
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return templates.filter(item => {
      if (scope !== "ALL" && item.source !== scope) return false;
      if (!term) return true;
      const friendly = formatFriendlyTemplateName(item.name, item.artifactType, t);
      const hay = `${item.name} ${friendly} ${item.description ?? ""} ${formatMode(item.activeVersion?.reviewMode, t)}`.toLocaleLowerCase();
      return hay.includes(term);
    });
  }, [templates, scope, search, t]);

  const data = eligible.data;
  const isChanging = Boolean(data && selectedVersionId && selectedVersionId !== data.currentTemplateVersionId);
  const needsDraftConfirm = Boolean(isChanging && data?.hasDraftResponses);
  const needsRoundReason = Boolean(isChanging && (data?.submittedRoundCount ?? 0) > 0);
  const canApply =
    Boolean(data?.canChangeTemplate) &&
    isChanging &&
    (!needsDraftConfirm || confirmDraftReset) &&
    (!needsRoundReason || reason.trim().length >= 5) &&
    !changeTemplate.isPending;

  async function handleApply() {
    if (!canApply || !selectedVersionId) return;
    setServerError(null);
    try {
      await changeTemplate.mutateAsync({
        requestId,
        input: {
          templateVersionId: selectedVersionId,
          ...(needsDraftConfirm ? { confirmDraftReset: true } : {}),
          ...(needsRoundReason ? { reason: reason.trim() } : {}),
        },
      });
      toast.success(t("reviewTemplates.selector.changed"));
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setServerError(msg || t("reviewTemplates.selector.changeError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col" data-no-i18n>
        <DialogHeader>
          <DialogTitle className="text-base">{t("reviewTemplates.selector.dialogTitle")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("reviewTemplates.selector.dialogSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {eligible.isLoading ? (
          <div className="space-y-2 py-6">
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : eligible.isError || !data ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
            {t("reviewTemplates.loadError")}
          </div>
        ) : (
          <div className="min-h-0 flex-1 flex flex-col gap-3 overflow-hidden">
            {data.mandatoryProjectTemplate && !data.canChangeTemplate ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t("reviewTemplates.selector.mandatoryHint")}</span>
              </div>
            ) : null}

            {/* Scope tabs + Search */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("reviewTemplates.selector.dialogTitle")}>
                  {(["ALL", "SYSTEM", "PERSONAL", "PROJECT"] as const).map(itemScope => {
                    const active = scope === itemScope;
                    const label =
                      itemScope === "ALL"
                        ? t("reviewTemplates.allScopes")
                        : t(`reviewTemplates.source.${itemScope}`);
                    return (
                      <button
                        key={itemScope}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setScope(itemScope)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{label}</span>
                        <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{counts[itemScope]}</span>
                      </button>
                    );
                  })}
                </div>

                <Link
                  to={href("/review-templates")}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Shapes className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("reviewTemplates.selector.manageLink")}</span>
                </Link>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  className="h-8 pl-8 text-xs"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("reviewTemplates.selector.searchPlaceholder")}
                  aria-label={t("reviewTemplates.selector.searchPlaceholder")}
                />
              </div>
            </div>

            {/* Eligible template list */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
              {visibleTemplates.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {t("reviewTemplates.selector.noEligible")}
                </p>
              ) : (
                visibleTemplates.map((tpl: ReviewTemplateSummary) => {
                  const version = tpl.activeVersion;
                  if (!version) return null;
                  const isSelected = selectedVersionId === version.id;
                  const isCurrent = data.currentTemplateVersionId === version.id;
                  const isSuggested = data.suggestedTemplateVersionId === version.id;
                  const isPreviewOpen = previewId === tpl.id;
                  const title = formatFriendlyTemplateName(tpl.name, tpl.artifactType, t);
                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/[0.04]"
                          : "border-border bg-card hover:border-border/90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                          <input
                            type="radio"
                            name="selected-review-template"
                            className="mt-1 h-4 w-4 accent-primary"
                            disabled={!data.canChangeTemplate}
                            checked={isSelected}
                            onChange={() => {
                              setSelectedVersionId(version.id);
                              setServerError(null);
                            }}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground">{title}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {t(`reviewTemplates.source.${tpl.source}`)}
                              </Badge>
                              {isSuggested ? (
                                <Badge variant="secondary" className="gap-0.5 text-[10px]">
                                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                                  {t("reviewTemplates.selector.suggestedBadge")}
                                </Badge>
                              ) : null}
                              {isCurrent ? (
                                <Badge variant="secondary" className="gap-0.5 text-[10px] text-primary">
                                  <Check className="h-2.5 w-2.5" aria-hidden="true" />
                                  {t("reviewTemplates.selector.currentBadge")}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatMode(version.reviewMode, t)} · {formatArtifact(tpl.artifactType, t)} · v{version.versionNumber} ·{" "}
                              {t("reviewTemplates.criteriaCount", { count: version.criteria.length })}
                            </p>
                            {tpl.description ? (
                              <p className="text-xs leading-5 text-muted-foreground line-clamp-2">{tpl.description}</p>
                            ) : null}
                          </div>
                        </label>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 gap-1 px-2 text-xs"
                          aria-expanded={isPreviewOpen}
                          onClick={() => setPreviewId(curr => (curr === tpl.id ? null : tpl.id))}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t(isPreviewOpen ? "reviewTemplates.hidePreview" : "reviewTemplates.preview")}</span>
                          {isPreviewOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>

                      {isPreviewOpen ? (
                        <div className="mt-3 rounded-lg border border-border/75 bg-muted/25 p-3">
                          <CriteriaPreviewList
                            version={version}
                            artifactType={artifactType ?? tpl.artifactType}
                            language={language}
                            t={t}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {/* Draft protection warning & Round 2+ reason */}
            {needsDraftConfirm ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.06] p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">{t("reviewTemplates.selector.draftWarningTitle")}</p>
                    <p className="leading-5">
                      {t("reviewTemplates.selector.draftWarningBody", { count: data.draftResponseCount })}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={confirmDraftReset}
                    onChange={e => setConfirmDraftReset(e.target.checked)}
                  />
                  <span>{t("reviewTemplates.selector.confirmDraftCheck")}</span>
                </label>
              </div>
            ) : null}

            {needsRoundReason ? (
              <label className="block space-y-1 text-xs font-medium text-foreground">
                <span>{t("reviewTemplates.selector.roundReasonLabel", { round: data.submittedRoundCount + 1 })}</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={t("reviewTemplates.selector.roundReasonPlaceholder")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            ) : null}

            {serverError ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {serverError}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("reviewTemplates.selector.cancel")}
          </Button>
          {data?.canChangeTemplate ? (
            <Button type="button" size="sm" disabled={!canApply} onClick={() => void handleApply()}>
              {t("reviewTemplates.selector.apply")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
