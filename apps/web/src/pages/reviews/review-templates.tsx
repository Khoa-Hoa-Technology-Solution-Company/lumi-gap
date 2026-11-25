import { useMemo, useState } from "react";
import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { Link } from "react-router-dom";
import { Archive, ChevronDown, ChevronUp, Copy, FilePlus2, Layers3, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArchiveReviewTemplate, useDuplicateReviewTemplate, useReviewTemplates } from "@/features/reviews";
import { useI18n } from "@/i18n";

const SOURCES = ["PERSONAL", "PROJECT", "SYSTEM"] as const;
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

function friendlyTemplateName(name: string, artifactType: string | null | undefined, t: (key: string) => string): string {
  // Replace long technical system template titles with clean human-readable labels without mutating backend records.
  const systemMatch = /^LumiGap Scientific Manuscript Review Rubric (v[\d.]+)\s*·\s*([A-Z_]+)$/i.exec(name.trim());
  if (systemMatch) {
    const version = systemMatch[1];
    const typeKey = systemMatch[2]?.toUpperCase();
    const label = typeKey && ARTIFACT_TYPES.includes(typeKey as typeof ARTIFACT_TYPES[number])
      ? t(`reviewTemplates.artifact.${typeKey}`)
      : typeKey?.replaceAll("_", " ") ?? t("reviewTemplates.anyArtifact");
    return `${label} (LumiGap ${version})`;
  }
  if (name === "Literature Review" && artifactType === "LITERATURE_REVIEW") {
    return t("reviewTemplates.artifact.LITERATURE_REVIEW");
  }
  return name;
}

function artifactLabel(type: string | null | undefined, t: (key: string) => string): string {
  if (!type) return t("reviewTemplates.anyArtifact");
  if (ARTIFACT_TYPES.includes(type as typeof ARTIFACT_TYPES[number])) {
    return t(`reviewTemplates.artifact.${type}`);
  }
  return type.replaceAll("_", " ");
}

function reviewModeLabel(mode: string | null | undefined, t: (key: string) => string): string {
  if (!mode) return t("reviewTemplates.status.DRAFT");
  if (["RUBRIC_ASSESSMENT", "STRUCTURED_REVIEW", "GUIDED_FEEDBACK"].includes(mode)) {
    return t(`reviewTemplates.mode.${mode}`);
  }
  return mode.replaceAll("_", " ");
}

export function ReviewTemplatesPage() {
  const { t } = useI18n();
  const { embedded, href } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const query = useReviewTemplates();
  const duplicate = useDuplicateReviewTemplate();
  const archive = useArchiveReviewTemplate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const templates = query.data ?? [];
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
      if (typeFilter !== "ALL" && item.artifactType !== typeFilter) return false;
      if (!term) return true;
      const friendly = friendlyTemplateName(item.name, item.artifactType, t);
      const hay = `${item.name} ${friendly} ${artifactLabel(item.artifactType, t)}`.toLocaleLowerCase();
      return hay.includes(term);
    });
  }, [templates, search, typeFilter, t]);

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

  return (
    <Container className={embedded ? "min-w-0 w-full space-y-6" : "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"} data-no-i18n>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
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

      {templates.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label={t("reviewTemplates.searchPlaceholder")}
                placeholder={t("reviewTemplates.searchPlaceholder")}
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {availableTypes.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("reviewTemplates.allTypes")}>
                <button
                  type="button"
                  onClick={() => setTypeFilter("ALL")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === "ALL"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("reviewTemplates.allTypes")}
                </button>
                {availableTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      typeFilter === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {artifactLabel(type, t)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
            }}
          >
            {t("mentorWorkspace.clearFilters")}
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {SOURCES.map(source => {
            const rows = filteredTemplates.filter(item => item.source === source);
            if (!rows.length) return null;
            return (
              <section key={source} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-foreground">{t(`reviewTemplates.source.${source}`)}</h2>
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {rows.length}
                  </Badge>
                </div>

                <div className="divide-y rounded-xl border bg-card">
                  {rows.map(template => {
                    const isExpanded = expandedId === template.id;
                    const criteria = template.activeVersion?.criteria ?? [];
                    const displayName = friendlyTemplateName(template.name, template.artifactType, t);
                    return (
                      <article key={template.id} className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm sm:text-base font-semibold text-foreground">{displayName}</h3>
                              <Badge variant={template.status === "PUBLISHED" ? "secondary" : "outline"} className="text-xs">
                                {t(`reviewTemplates.status.${template.status}`)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                              {artifactLabel(template.artifactType, t)} · {reviewModeLabel(template.activeVersion?.reviewMode, t)}
                              {template.activeVersion ? ` · v${template.activeVersion.versionNumber}` : ""} ·{" "}
                              {t("reviewTemplates.criteriaCount", { count: criteria.length })}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedId(current => (current === template.id ? null : template.id))}
                              className="gap-1 text-xs"
                            >
                              <span>{t(isExpanded ? "reviewTemplates.hidePreview" : "reviewTemplates.preview")}</span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>

                            {template.source !== "SYSTEM" ? (
                              <Button asChild variant="outline" size="sm">
                                <Link to={href(`/review-templates/${encodeURIComponent(template.id)}/edit`)}>
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t("reviewTemplates.edit")}</span>
                                </Link>
                              </Button>
                            ) : null}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await duplicate.mutateAsync(template.id);
                                  toast.success(t("reviewTemplates.duplicated"));
                                } catch {
                                  toast.error(t("reviewTemplates.duplicateError"));
                                }
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t("reviewTemplates.duplicate")}</span>
                            </Button>

                            {template.source !== "SYSTEM" ? (
                              <Button
                                variant="ghost"
                                size="sm"
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
                            {template.activeVersion?.description ? (
                              <p className="text-xs leading-5 text-muted-foreground">
                                {template.activeVersion.description}
                              </p>
                            ) : null}
                            {criteria.length > 0 ? (
                              <ol className="space-y-2 text-xs">
                                {criteria.map((c, idx) => (
                                  <li key={c.id ?? idx} className="rounded-md border bg-background px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-semibold text-foreground">
                                        {idx + 1}. {c.title}
                                      </span>
                                      {c.required ? (
                                        <Badge variant="outline" className="text-[10px]">
                                          {t("reviewTemplates.required")}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    {c.description ? (
                                      <p className="mt-1 text-muted-foreground leading-5">{c.description}</p>
                                    ) : null}
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="text-xs text-muted-foreground">{t("reviewTemplates.noCriteria")}</p>
                            )}
                          </div>
                        ) : null}
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
