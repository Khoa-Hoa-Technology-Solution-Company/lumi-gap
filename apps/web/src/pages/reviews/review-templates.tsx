import { useMemo, useState } from "react";
import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { Link } from "react-router-dom";
import { Archive, ChevronDown, ChevronUp, Copy, FilePlus2, History, Info, Pencil, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import type { ReviewTemplateSource, ReviewTemplateSummary } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useArchiveReviewTemplate,
  useDuplicateReviewTemplate,
  usePublishReviewTemplate,
  useReviewTemplate,
  useReviewTemplates,
} from "@/features/reviews";
import { formatFriendlyTemplateName } from "@/features/reviews/components/review-template-selector-dialog";
import { isLumiGapSystemRubric, localizeSystemCriterion } from "@/features/reviews/system-rubric-i18n";
import { useI18n } from "@/i18n";

const SCOPES: Array<{ key: "ALL" | ReviewTemplateSource; labelKey: string }> = [
  { key: "ALL", labelKey: "reviewTemplates.allScopes" },
  { key: "SYSTEM", labelKey: "reviewTemplates.source.SYSTEM" },
  { key: "PERSONAL", labelKey: "reviewTemplates.source.PERSONAL" },
  { key: "PROJECT", labelKey: "reviewTemplates.source.PROJECT" },
];

const ARTIFACT_TYPES = [
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
] as const;

const MODES = ["RUBRIC_ASSESSMENT", "STRUCTURED_REVIEW", "GUIDED_FEEDBACK"] as const;

function artifactLabel(type: string | null | undefined, t: (key: string) => string): string {
  if (!type) return t("reviewTemplates.anyArtifact");
  if (ARTIFACT_TYPES.includes(type as (typeof ARTIFACT_TYPES)[number])) {
    return t(`reviewTemplates.artifact.${type}`);
  }
  return type.replaceAll("_", " ");
}

function reviewModeLabel(mode: string | null | undefined, t: (key: string) => string): string {
  if (!mode) return t("reviewTemplates.status.DRAFT");
  if (MODES.includes(mode as (typeof MODES)[number])) {
    return t(`reviewTemplates.mode.${mode}`);
  }
  return mode.replaceAll("_", " ");
}

function TemplateVersionHistory({ templateId }: { templateId: string }) {
  const { t, language } = useI18n();
  const detail = useReviewTemplate(templateId);

  if (detail.isLoading) {
    return <p className="text-xs text-muted-foreground">{t("reviewTemplates.versionsLoading")}</p>;
  }
  if (!detail.data?.versions?.length) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-muted/25 p-3.5 space-y-2">
      <p className="text-xs font-semibold text-foreground">{t("reviewTemplates.versionsTitle")}</p>
      <ul className="divide-y divide-border/60 text-xs">
        {detail.data.versions.map(v => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground tabular-nums">v{v.versionNumber}</span>
              <Badge variant={v.status === "PUBLISHED" ? "secondary" : "outline"} className="text-[10px]">
                {t(`reviewTemplates.status.${v.status}`)}
              </Badge>
              <span className="text-muted-foreground">
                {reviewModeLabel(v.reviewMode, t)} · {t("reviewTemplates.criteriaCount", { count: v.criteria.length })}
              </span>
            </div>
            {v.publishedAt ? (
              <time dateTime={v.publishedAt} className="text-[11px] text-muted-foreground tabular-nums">
                {new Date(v.publishedAt).toLocaleDateString(language)}
              </time>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewTemplatesPage() {
  const { t, language } = useI18n();
  const { embedded, href, navigate } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";

  const [scopeTab, setScopeTab] = useState<"ALL" | ReviewTemplateSource>("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [modeFilter, setModeFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versionsId, setVersionsId] = useState<string | null>(null);

  const query = useReviewTemplates(showArchived);
  const duplicate = useDuplicateReviewTemplate();
  const publish = usePublishReviewTemplate();
  const archive = useArchiveReviewTemplate();

  const templates = useMemo(() => query.data ?? [], [query.data]);

  const scopeCounts = useMemo(() => {
    const counts = { ALL: templates.length, SYSTEM: 0, PERSONAL: 0, PROJECT: 0 };
    for (const item of templates) counts[item.source] += 1;
    return counts;
  }, [templates]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of templates) {
      if (item.artifactType) set.add(item.artifactType);
    }
    return [...set];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return templates.filter(item => {
      if (scopeTab !== "ALL" && item.source !== scopeTab) return false;
      if (typeFilter !== "ALL" && item.artifactType !== typeFilter) return false;
      if (modeFilter !== "ALL" && item.activeVersion?.reviewMode !== modeFilter) return false;
      if (!term) return true;
      const friendly = formatFriendlyTemplateName(item.name, item.artifactType, t);
      const hay = `${item.name} ${friendly} ${item.description ?? ""} ${artifactLabel(item.artifactType, t)}`.toLocaleLowerCase();
      return hay.includes(term);
    });
  }, [templates, scopeTab, typeFilter, modeFilter, search, t]);

  if (query.isLoading) {
    return (
      <Container className={embedded ? "space-y-4" : "mx-auto max-w-6xl px-4 py-10"}>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </Container>
    );
  }
  if (query.error) {
    return (
      <Container className={embedded ? "space-y-4" : "mx-auto max-w-3xl px-4 py-16"}>
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {t("reviewTemplates.loadError")}
        </div>
      </Container>
    );
  }

  const canManageTemplate = (template: ReviewTemplateSummary) =>
    template.canManage !== undefined ? template.canManage : template.source === "PERSONAL";

  const visibleScopes: ReviewTemplateSource[] =
    scopeTab === "ALL" ? ["PERSONAL", "PROJECT", "SYSTEM"] : [scopeTab];

  return (
    <Container className={embedded ? "min-w-0 w-full space-y-5" : "mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6"} data-no-i18n>
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("reviewTemplates.title")}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{t("reviewTemplates.subtitle")}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to={href("/review-templates/new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t("reviewTemplates.create")}</span>
          </Link>
        </Button>
      </header>

      {/* Scope navigation tabs + search/filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("reviewTemplates.title")}>
            {SCOPES.map(scope => {
              const active = scopeTab === scope.key;
              return (
                <button
                  key={scope.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScopeTab(scope.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span>{t(scope.labelKey)}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {scopeCounts[scope.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {(scopeTab === "ALL" || scopeTab === "PERSONAL") ? (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={showArchived}
                onChange={e => setShowArchived(e.target.checked)}
              />
              <span>{t("reviewTemplates.showArchived")}</span>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label={t("reviewTemplates.searchPlaceholder")}
              placeholder={t("reviewTemplates.searchPlaceholder")}
              className="h-9 pl-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {availableTypes.length > 0 ? (
            <select
              aria-label={t("reviewTemplates.allTypes")}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ALL">{t("reviewTemplates.allTypes")}</option>
              {availableTypes.map(type => (
                <option key={type} value={type}>
                  {artifactLabel(type, t)}
                </option>
              ))}
            </select>
          ) : null}

          <select
            aria-label={t("reviewTemplates.allModes")}
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ALL">{t("reviewTemplates.allModes")}</option>
            {MODES.map(mode => (
              <option key={mode} value={mode}>
                {t(`reviewTemplates.mode.${mode}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!templates.length ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-12 text-center">
          <FilePlus2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">{t("reviewTemplates.empty")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("reviewTemplates.emptyHint")}</p>
          <Button asChild className="mt-5" size="sm">
            <Link to={href("/review-templates/new")}>{t("reviewTemplates.create")}</Link>
          </Button>
        </div>
      ) : !filteredTemplates.length ? (
        <div className="rounded-xl border border-dashed bg-card/60 p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{t("reviewTemplates.emptyFilter")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setTypeFilter("ALL");
              setModeFilter("ALL");
            }}
          >
            {t("mentorWorkspace.clearFilters")}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleScopes.map(source => {
            const rows = filteredTemplates.filter(item => item.source === source);
            if (!rows.length) return null;
            return (
              <section key={source} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{t(`reviewTemplates.source.${source}`)}</h2>
                    <Badge variant="secondary" className="text-[11px] tabular-nums">
                      {rows.length}
                    </Badge>
                  </div>
                </div>

                {source === "SYSTEM" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{t("reviewTemplates.systemHint")}</span>
                  </p>
                ) : null}

                <div className="divide-y rounded-xl border bg-card">
                  {rows.map(template => {
                    const isExpanded = expandedId === template.id;
                    const isVersionsOpen = versionsId === template.id;
                    const version = template.activeVersion;
                    const criteria = version?.criteria ?? [];
                    const displayName = formatFriendlyTemplateName(template.name, template.artifactType, t);
                    const manageable = canManageTemplate(template);
                    const isArchived = template.status === "ARCHIVED";
                    const canPublishDraft = manageable && !isArchived && (template.status === "DRAFT" || template.hasDraftVersion);
                    const sysRubric = isLumiGapSystemRubric(version?.guidelines);
                    const rubricCtx = {
                      artifactType: template.artifactType,
                      versionNumber: version?.versionNumber,
                      guidelines: version?.guidelines,
                    };

                    return (
                      <article key={template.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm sm:text-base font-semibold text-foreground">{displayName}</h3>
                              <Badge variant={template.status === "PUBLISHED" ? "secondary" : "outline"} className="text-[11px]">
                                {t(`reviewTemplates.status.${template.status}`)}
                              </Badge>
                              {template.status === "PUBLISHED" && template.hasDraftVersion && template.draftVersionNumber ? (
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-300">
                                  {t("reviewTemplates.draftPending", { version: template.draftVersionNumber })}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {artifactLabel(template.artifactType, t)} · {reviewModeLabel(version?.reviewMode, t)}
                              {version ? ` · v${version.versionNumber}` : ""} ·{" "}
                              {t("reviewTemplates.criteriaCount", { count: criteria.length })}
                            </p>
                            {template.description ? (
                              <p className="max-w-2xl text-xs leading-5 text-muted-foreground line-clamp-2">
                                {template.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedId(current => (current === template.id ? null : template.id))}
                              className="h-8 gap-1 px-2.5 text-xs"
                            >
                              <span>{t(isExpanded ? "reviewTemplates.hidePreview" : "reviewTemplates.preview")}</span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-expanded={isVersionsOpen}
                              onClick={() => setVersionsId(current => (current === template.id ? null : template.id))}
                              className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <History className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t(isVersionsOpen ? "reviewTemplates.hideVersions" : "reviewTemplates.versions")}</span>
                            </Button>

                            {manageable && !isArchived ? (
                              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                                <Link to={href(`/review-templates/${encodeURIComponent(template.id)}/edit`)}>
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t("reviewTemplates.edit")}</span>
                                </Link>
                              </Button>
                            ) : null}

                            {canPublishDraft ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={publish.isPending}
                                onClick={async () => {
                                  try {
                                    await publish.mutateAsync(template.id);
                                    toast.success(t("reviewTemplates.published"));
                                  } catch {
                                    toast.error(t("reviewTemplates.publishError"));
                                  }
                                }}
                              >
                                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{t("reviewTemplates.publish")}</span>
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={duplicate.isPending}
                              onClick={async () => {
                                try {
                                  const copy = await duplicate.mutateAsync(template.id);
                                  toast.success(t("reviewTemplates.duplicated"));
                                  if (copy?.id) {
                                    navigate(`/review-templates/${encodeURIComponent(copy.id)}/edit`);
                                  }
                                } catch {
                                  toast.error(t("reviewTemplates.duplicateError"));
                                }
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t("reviewTemplates.duplicate")}</span>
                            </Button>

                            {manageable && !isArchived ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                disabled={archive.isPending}
                                onClick={async () => {
                                  try {
                                    await archive.mutateAsync(template.id);
                                    toast.success(t("reviewTemplates.archived"));
                                  } catch {
                                    toast.error(t("reviewTemplates.archiveError"));
                                  }
                                }}
                              >
                                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{t("reviewTemplates.archive")}</span>
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="rounded-lg border bg-muted/25 p-3.5 space-y-2.5">
                            {version?.description ? (
                              <p className="text-xs leading-5 text-muted-foreground">{version.description}</p>
                            ) : null}
                            {criteria.length > 0 ? (
                              <ol className="space-y-2 text-xs">
                                {criteria.map((c, idx) => {
                                  const loc = localizeSystemCriterion(c, language, sysRubric, rubricCtx);
                                  return (
                                    <li key={c.id ?? idx} className="rounded-md border bg-background px-3 py-2 space-y-1">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-foreground">
                                          {idx + 1}. {loc.title}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {version?.reviewMode === "RUBRIC_ASSESSMENT" && c.weight != null ? (
                                            <Badge variant="outline" className="text-[10px] tabular-nums">
                                              {t("reviewTemplates.weightLabel", { weight: c.weight })}
                                            </Badge>
                                          ) : null}
                                          <Badge variant="secondary" className="text-[10px]">
                                            {c.required ? t("reviewTemplates.required") : t("reviewTemplates.optional")}
                                          </Badge>
                                          {c.allowNotApplicable ? (
                                            <Badge variant="outline" className="text-[10px]">
                                              {t("reviewTemplates.allowNa")}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      </div>
                                      {loc.description ? (
                                        <p className="text-muted-foreground leading-5">{loc.description}</p>
                                      ) : null}
                                      {version?.reviewMode === "RUBRIC_ASSESSMENT" && c.levels.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {c.levels.map(lv => (
                                            <span key={lv.id ?? lv.score} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                                              {lv.score} · {lv.label}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ol>
                            ) : (
                              <p className="text-xs text-muted-foreground">{t("reviewTemplates.noCriteria")}</p>
                            )}
                          </div>
                        ) : null}

                        {isVersionsOpen ? <TemplateVersionHistory templateId={template.id} /> : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Container>
  );
}
