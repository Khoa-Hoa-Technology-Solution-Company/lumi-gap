import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useEffect, useMemo, useState } from "react";
import type { AcademicReviewMode, ReviewTemplateCriterionInput, ReviewTemplateSource } from "@trend/shared-types";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronUp, Eye, History, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useCreateReviewTemplate, usePublishReviewTemplate, useReviewTemplate, useSaveReviewTemplateVersion } from "@/features/reviews";
import { useI18n } from "@/i18n";

const ARTIFACT_TYPES = [
  "",
  "RESEARCH_PAPER",
  "RESEARCH_PROPOSAL",
  "LITERATURE_REVIEW",
  "METHODOLOGY",
  "SOFTWARE_RESEARCH_PROJECT",
  "THESIS_CHAPTER",
  "THESIS_DRAFT",
  "MANUSCRIPT",
  "EVIDENCE_SYNTHESIS",
  "GAP_ANALYSIS",
  "RESEARCH_PLAN",
  "GENERAL_REPORT",
] as const;

const MODES: AcademicReviewMode[] = ["RUBRIC_ASSESSMENT", "STRUCTURED_REVIEW", "GUIDED_FEEDBACK"];

const DEFAULT_LEVELS = [
  { label: "Excellent", description: "Fully meets the criterion with strong evidence.", score: 4 },
  { label: "Good", description: "Mostly meets the criterion with minor issues.", score: 3 },
  { label: "Developing", description: "Requires significant refinement.", score: 2 },
  { label: "Poor", description: "Does not yet meet the criterion.", score: 1 },
];

const emptyCriterion = (): ReviewTemplateCriterionInput => ({
  title: "",
  description: "",
  required: true,
  allowNotApplicable: false,
});

export function ReviewTemplateBuilderPage() {
  const { t, language } = useI18n();
  const { embedded, param, navigate } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const templateId = param("templateId");
  const detail = useReviewTemplate(templateId);
  const projects = useProjects();
  const create = useCreateReviewTemplate();
  const saveVersion = useSaveReviewTemplateVersion(templateId ?? "");
  const publish = usePublishReviewTemplate();

  const [name, setName] = useState("");
  const [source, setSource] = useState<ReviewTemplateSource>("PERSONAL");
  const [projectId, setProjectId] = useState("");
  const [artifactType, setArtifactType] = useState("RESEARCH_PROPOSAL");
  const [reviewMode, setReviewMode] = useState<AcademicReviewMode>("STRUCTURED_REVIEW");
  const [description, setDescription] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [criteria, setCriteria] = useState<ReviewTemplateCriterionInput[]>([emptyCriterion()]);
  const [expandedLevels, setExpandedLevels] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState(false);

  const editing = Boolean(templateId);
  const hasPublishedVersion = Boolean(detail.data?.versions?.some(v => v.status === "PUBLISHED"));
  const isReadOnly =
    editing &&
    Boolean(detail.data) &&
    (detail.data!.status === "ARCHIVED" || detail.data!.canManage === false || detail.data!.source === "SYSTEM");

  useEffect(() => {
    if (!detail.data) return;
    const draft = detail.data.versions.find((item) => item.status === "DRAFT") ?? detail.data.activeVersion;
    if (!draft) return;
    setName(detail.data.name);
    setSource(detail.data.source);
    setProjectId(detail.data.projectId ?? "");
    setArtifactType(detail.data.artifactType ?? "");
    setReviewMode(draft.reviewMode);
    setDescription(draft.description ?? detail.data.description ?? "");
    setGuidelines(draft.guidelines.join("\n"));
    setCriteria(
      draft.criteria.map(({ id: _id, order: _order, key, levels, ...criterion }) => ({
        ...criterion,
        key,
        levels: levels.map(({ id: _levelId, position: _position, ...level }) => level),
      })),
    );
  }, [detail.data]);

  const payload = useMemo(() => ({
    name: name.trim(),
    artifactType: artifactType || null,
    reviewMode,
    description: description.trim() || undefined,
    guidelines: guidelines.split("\n").map((item) => item.trim()).filter(Boolean),
    criteria: criteria.map((criterion) => ({
      ...criterion,
      title: criterion.title.trim(),
      description: criterion.description?.trim() || undefined,
      weight: reviewMode === "RUBRIC_ASSESSMENT" ? criterion.weight : undefined,
      levels: reviewMode === "RUBRIC_ASSESSMENT" ? (criterion.levels ?? DEFAULT_LEVELS) : undefined,
    })),
  }), [artifactType, criteria, description, guidelines, name, reviewMode]);

  function updateCriterion(index: number, change: Partial<ReviewTemplateCriterionInput>) {
    setCriteria((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...change } : item)));
  }

  function move(index: number, direction: -1 | 1) {
    setCriteria((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const sourceItem = next[index];
      const targetItem = next[target];
      if (!sourceItem || !targetItem) return current;
      next[index] = targetItem;
      next[target] = sourceItem;
      return next;
    });
  }

  function validate(): string | undefined {
    if (name.trim().length < 3) return t("reviewTemplates.builder.errName");
    if (!criteria.length || criteria.some((item) => item.title.trim().length < 2)) {
      return t("reviewTemplates.builder.errCriteria");
    }
    if (!editing && source === "PROJECT" && !projectId) {
      return t("reviewTemplates.builder.errProject");
    }
    if (reviewMode === "RUBRIC_ASSESSMENT") {
      for (const c of criteria) {
        if (c.weight !== undefined && (!Number.isFinite(c.weight) || c.weight < 0.1 || c.weight > 100)) {
          return t("reviewTemplates.builder.errWeight");
        }
        const levels = c.levels ?? DEFAULT_LEVELS;
        if (levels.length < 2 || levels.some(l => !l.label.trim() || !Number.isInteger(l.score) || l.score < 0 || l.score > 100)) {
          return t("reviewTemplates.builder.errLevels");
        }
        if (new Set(levels.map(l => l.score)).size !== levels.length) {
          return t("reviewTemplates.builder.errLevels");
        }
      }
    }
    return undefined;
  }

  async function save(publishNow: boolean) {
    if (isReadOnly) return;
    const issue = validate();
    if (issue) return toast.error(issue);
    try {
      if (!editing) {
        const created = await create.mutateAsync({
          name: name.trim(),
          source,
          projectId: source === "PROJECT" ? projectId : undefined,
          artifactType: artifactType || undefined,
          publish: publishNow,
          reviewMode: payload.reviewMode,
          description: payload.description,
          guidelines: payload.guidelines,
          criteria: payload.criteria,
        });
        toast.success(publishNow ? t("reviewTemplates.builder.published") : t("reviewTemplates.builder.savedDraft"));
        navigate(publishNow ? "/review-templates" : `/review-templates/${created.id}/edit`);
      } else {
        await saveVersion.mutateAsync(payload);
        if (publishNow) await publish.mutateAsync(templateId!);
        toast.success(publishNow ? t("reviewTemplates.builder.publishedNew") : t("reviewTemplates.builder.savedDraft"));
        if (publishNow) navigate("/review-templates");
      }
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || t("reviewTemplates.builder.saveError"));
    }
  }

  if (editing && detail.isLoading) {
    return (
      <Container className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </Container>
    );
  }

  const ownedProjects = projects.data?.filter((project) => project.accessRole === "OWNER") ?? [];

  return (
    <Container className={embedded ? "min-w-0 w-full space-y-6" : "mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6"} data-no-i18n>
      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-xs" onClick={() => navigate("/review-templates")}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("reviewTemplates.backToTemplates")}</span>
      </Button>

      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("reviewTemplates.builder.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {editing ? t("reviewTemplates.builder.editTitle") : t("reviewTemplates.builder.createTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("reviewTemplates.builder.subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPreview((value) => !value)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span>{preview ? t("reviewTemplates.builder.edit") : t("reviewTemplates.builder.preview")}</span>
        </Button>
      </header>

      {isReadOnly ? (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          {detail.data?.source === "SYSTEM"
            ? t("reviewTemplates.builder.readOnlySystem")
            : t("reviewTemplates.builder.readOnlyArchived")}
        </div>
      ) : null}

      {preview ? (
        <TemplatePreview
          name={name}
          mode={reviewMode}
          description={description}
          guidelines={payload.guidelines}
          criteria={payload.criteria}
          t={t}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {/* Basic Information */}
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-base font-semibold text-foreground">{t("reviewTemplates.builder.detailsTitle")}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-foreground sm:col-span-2">
                  <span>{t("reviewTemplates.builder.nameLabel")}</span>
                  <Input
                    className="mt-1.5"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={200}
                    disabled={isReadOnly}
                    placeholder={t("reviewTemplates.builder.namePlaceholder")}
                  />
                </label>

                <label className="text-xs font-medium text-foreground">
                  <span>{t("reviewTemplates.builder.artifactTypeLabel")}</span>
                  <select
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                    value={artifactType}
                    onChange={(event) => setArtifactType(event.target.value)}
                    disabled={isReadOnly || (editing && hasPublishedVersion)}
                  >
                    {ARTIFACT_TYPES.map((item) => (
                      <option key={item || "ANY"} value={item}>
                        {item ? t(`reviewTemplates.artifact.${item}`) : t("reviewTemplates.anyArtifact")}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-foreground">
                  <span>{t("reviewTemplates.builder.modeLabel")}</span>
                  <select
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                    value={reviewMode}
                    disabled={isReadOnly}
                    onChange={(event) => {
                      const mode = event.target.value as AcademicReviewMode;
                      setReviewMode(mode);
                      if (mode === "RUBRIC_ASSESSMENT") {
                        setCriteria((current) =>
                          current.map((item) => ({
                            ...item,
                            levels: item.levels?.length ? item.levels : DEFAULT_LEVELS,
                          })),
                        );
                      }
                    }}
                  >
                    {MODES.map((item) => (
                      <option key={item} value={item}>
                        {t(`reviewTemplates.mode.${item}`)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                    {t(`reviewTemplates.modeDesc.${reviewMode}`)}
                  </p>
                </label>

                {!editing ? (
                  <>
                    <label className="text-xs font-medium text-foreground">
                      <span>{t("reviewTemplates.builder.sourceLabel")}</span>
                      <select
                        className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                        value={source}
                        onChange={(event) => setSource(event.target.value as ReviewTemplateSource)}
                      >
                        <option value="PERSONAL">{t("reviewTemplates.source.PERSONAL")}</option>
                        {ownedProjects.length > 0 ? (
                          <option value="PROJECT">{t("reviewTemplates.source.PROJECT")}</option>
                        ) : null}
                      </select>
                    </label>
                    {source === "PROJECT" ? (
                      <label className="text-xs font-medium text-foreground">
                        <span>{t("reviewTemplates.builder.projectLabel")}</span>
                        <select
                          className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                          value={projectId}
                          onChange={(event) => setProjectId(event.target.value)}
                        >
                          <option value="">{t("reviewTemplates.builder.selectProject")}</option>
                          {ownedProjects.map((project) => (
                            <option key={project._id} value={project._id}>
                              {project.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}

                <label className="text-xs font-medium text-foreground sm:col-span-2">
                  <span>{t("reviewTemplates.builder.descriptionLabel")}</span>
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                    value={description}
                    disabled={isReadOnly}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("reviewTemplates.builder.descriptionPlaceholder")}
                    maxLength={5000}
                  />
                </label>
              </div>
            </section>

            {/* Evaluation Criteria with Progressive Disclosure */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t("reviewTemplates.builder.criteriaTitle")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("reviewTemplates.builder.criteriaHint")}</p>
                </div>
                {!isReadOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCriteria((current) => [
                        ...current,
                        {
                          ...emptyCriterion(),
                          levels: reviewMode === "RUBRIC_ASSESSMENT" ? DEFAULT_LEVELS.map(l => ({ ...l })) : undefined,
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("reviewTemplates.builder.addCriterion")}</span>
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                {criteria.map((criterion, index) => {
                  const levels = criterion.levels ?? DEFAULT_LEVELS;
                  const levelsOpen = Boolean(expandedLevels[index]);
                  return (
                    <article key={index} className="rounded-xl border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-3">
                          <Input
                            value={criterion.title}
                            disabled={isReadOnly}
                            onChange={(event) => updateCriterion(index, { title: event.target.value })}
                            placeholder={t("reviewTemplates.builder.criterionTitlePlaceholder")}
                            maxLength={160}
                          />
                          <textarea
                            value={criterion.description ?? ""}
                            disabled={isReadOnly}
                            onChange={(event) => updateCriterion(index, { description: event.target.value })}
                            className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder={t("reviewTemplates.builder.criterionDescPlaceholder")}
                          />
                          <div className="flex flex-wrap items-center gap-4 text-xs">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={isReadOnly}
                                checked={criterion.required}
                                onChange={(event) => updateCriterion(index, { required: event.target.checked })}
                              />
                              <span>{t("reviewTemplates.required")}</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={isReadOnly}
                                checked={criterion.allowNotApplicable}
                                onChange={(event) => updateCriterion(index, { allowNotApplicable: event.target.checked })}
                              />
                              <span>{t("reviewTemplates.allowNa")}</span>
                            </label>
                            {reviewMode === "RUBRIC_ASSESSMENT" ? (
                              <label className="flex items-center gap-2">
                                <span className="text-muted-foreground">{t("reviewTemplates.builder.weightField")}</span>
                                <Input
                                  type="number"
                                  min={0.1}
                                  max={100}
                                  step="0.5"
                                  disabled={isReadOnly}
                                  className="h-7 w-20 text-xs tabular-nums"
                                  value={criterion.weight ?? 1}
                                  onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })}
                                />
                              </label>
                            ) : null}
                          </div>

                          {/* Progressive disclosure for Rubric performance levels */}
                          {reviewMode === "RUBRIC_ASSESSMENT" ? (
                            <div className="rounded-lg border border-border/80 bg-muted/25 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  aria-expanded={levelsOpen}
                                  onClick={() =>
                                    setExpandedLevels(prev => ({ ...prev, [index]: !prev[index] }))
                                  }
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary"
                                >
                                  <span>{t("reviewTemplates.builder.advancedLevels", { count: levels.length })}</span>
                                  {levelsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                                {!levelsOpen ? (
                                  <div className="flex flex-wrap gap-1">
                                    {levels.map((lv, li) => (
                                      <span key={li} className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                                        {lv.score} · {lv.label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              {levelsOpen ? (
                                <div className="space-y-2 pt-1">
                                  {levels.map((level, levelIndex) => (
                                    <div key={levelIndex} className="rounded-md border bg-background p-2.5 space-y-2">
                                      <div className="grid grid-cols-[minmax(0,1fr)_80px_auto] items-center gap-2">
                                        <Input
                                          className="h-8 text-xs"
                                          disabled={isReadOnly}
                                          placeholder={t("reviewTemplates.builder.levelLabelPlaceholder")}
                                          value={level.label}
                                          onChange={(event) =>
                                            updateCriterion(index, {
                                              levels: levels.map((item, itemIndex) =>
                                                itemIndex === levelIndex ? { ...item, label: event.target.value } : item,
                                              ),
                                            })
                                          }
                                        />
                                        <Input
                                          type="number"
                                          min={0}
                                          max={100}
                                          disabled={isReadOnly}
                                          aria-label={t("reviewTemplates.builder.levelScoreLabel")}
                                          className="h-8 text-xs tabular-nums"
                                          value={level.score}
                                          onChange={(event) =>
                                            updateCriterion(index, {
                                              levels: levels.map((item, itemIndex) =>
                                                itemIndex === levelIndex ? { ...item, score: Number(event.target.value) } : item,
                                              ),
                                            })
                                          }
                                        />
                                        {!isReadOnly ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            disabled={levels.length <= 2}
                                            onClick={() =>
                                              updateCriterion(index, {
                                                levels: levels.filter((_, li) => li !== levelIndex),
                                              })
                                            }
                                          >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                          </Button>
                                        ) : null}
                                      </div>
                                      <Input
                                        className="h-8 text-xs"
                                        disabled={isReadOnly}
                                        placeholder={t("reviewTemplates.builder.levelDescPlaceholder")}
                                        value={level.description ?? ""}
                                        onChange={(event) =>
                                          updateCriterion(index, {
                                            levels: levels.map((item, itemIndex) =>
                                              itemIndex === levelIndex ? { ...item, description: event.target.value } : item,
                                            ),
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                  {!isReadOnly && levels.length < 10 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        const nextScore = Math.max(0, ...levels.map(l => l.score)) + 1;
                                        updateCriterion(index, {
                                          levels: [...levels, { label: `Level ${nextScore}`, description: "", score: Math.min(100, nextScore) }],
                                        });
                                      }}
                                    >
                                      <Plus className="h-3 w-3" aria-hidden="true" />
                                      <span>{t("reviewTemplates.builder.addLevel")}</span>
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        {!isReadOnly ? (
                          <div className="flex flex-col gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(index, -1)} disabled={index === 0}>
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(index, 1)} disabled={index === criteria.length - 1}>
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              disabled={criteria.length === 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Optional Review Guidelines */}
            <section className="rounded-xl border bg-card p-5 space-y-2">
              <h2 className="text-base font-semibold text-foreground">{t("reviewTemplates.builder.guidelinesTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("reviewTemplates.builder.guidelinesHint")}</p>
              <textarea
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
                value={guidelines}
                disabled={isReadOnly}
                onChange={(event) => setGuidelines(event.target.value)}
              />
            </section>
          </div>

          {/* Right Sidebar: Lifecycle, Actions & Version History */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">{t("reviewTemplates.builder.policyTitle")}</p>
              <p className="text-xs leading-5 text-muted-foreground">{t("reviewTemplates.builder.policyNote")}</p>
              {!isReadOnly ? (
                <div className="grid gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void save(false)}
                    disabled={create.isPending || saveVersion.isPending}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("reviewTemplates.builder.saveDraft")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void save(true)}
                    disabled={create.isPending || saveVersion.isPending || publish.isPending}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("reviewTemplates.builder.publish")}</span>
                  </Button>
                </div>
              ) : null}
            </div>

            {editing && detail.data?.versions?.length ? (
              <div className="rounded-xl border bg-card p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{t("reviewTemplates.versionsTitle")}</span>
                </div>
                <ul className="divide-y divide-border/60 text-xs">
                  {detail.data.versions.map(v => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold tabular-nums">v{v.versionNumber}</span>
                        <Badge variant={v.status === "PUBLISHED" ? "secondary" : "outline"} className="text-[10px]">
                          {t(`reviewTemplates.status.${v.status}`)}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString(language) : t("reviewTemplates.criteriaCount", { count: v.criteria.length })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </Container>
  );
}

function TemplatePreview({
  name,
  mode,
  description,
  guidelines,
  criteria,
  t,
}: {
  name: string;
  mode: AcademicReviewMode;
  description: string;
  guidelines: string[];
  criteria: ReviewTemplateCriterionInput[];
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="border-b pb-4">
        <Badge variant="secondary" className="text-xs">{t(`reviewTemplates.mode.${mode}`)}</Badge>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">{name || t("reviewTemplates.builder.createTitle")}</h2>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>

      {guidelines.length ? (
        <section className="rounded-xl border bg-muted/20 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t("reviewTemplates.builder.guidelinesTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {guidelines.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="divide-y rounded-xl border bg-card">
        {criteria.map((criterion, index) => (
          <article key={index} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {index + 1}. {criterion.title || t("reviewTemplates.builder.criterionTitlePlaceholder")}
              </h3>
              <div className="flex items-center gap-1.5">
                {mode === "RUBRIC_ASSESSMENT" && criterion.weight != null ? (
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {t("reviewTemplates.weightLabel", { weight: criterion.weight })}
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="text-[10px]">
                  {criterion.required ? t("reviewTemplates.required") : t("reviewTemplates.optional")}
                </Badge>
                {criterion.allowNotApplicable ? (
                  <Badge variant="outline" className="text-[10px]">{t("reviewTemplates.allowNa")}</Badge>
                ) : null}
              </div>
            </div>
            {criterion.description ? (
              <p className="text-xs leading-5 text-muted-foreground">{criterion.description}</p>
            ) : null}
            {mode === "RUBRIC_ASSESSMENT" && criterion.levels?.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {criterion.levels.map((level, li) => (
                  <span key={li} className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs tabular-nums">
                    <strong>{level.score}</strong> · {level.label}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
