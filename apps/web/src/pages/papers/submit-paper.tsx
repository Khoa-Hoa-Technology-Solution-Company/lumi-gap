import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Info,
  Pencil,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { isAdminSystemRole } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/loading";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import {
  SettingsFormField,
  SettingsPageHeader,
} from "@/features/settings/components/settings-primitives";

function countWords(str: string) {
  return str
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type StepNumber = 1 | 2 | 3 | 4;

export function SubmitPaperPage({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminSystemRole(user?.systemRole);

  const [step, setStep] = useState<StepNumber>(1);
  const [initializing, setInitializing] = useState(Boolean(editId));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form states preserved across steps
  const [title, setTitle] = useState("");
  const [doi, setDoi] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [abstractText, setAbstractText] = useState("");
  const [publicationYear, setPublicationYear] = useState<string>(String(new Date().getFullYear()));
  const [paperKind, setPaperKind] = useState<
    "article" | "proceedings" | "preprint" | "review" | "book-chapter" | "other"
  >("article");
  const [openAccessUrl, setOpenAccessUrl] = useState("");
  const [authorsStr, setAuthorsStr] = useState("");
  const [keywordsStr, setKeywordsStr] = useState("");
  const [topicsStr, setTopicsStr] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdfPath, setExistingPdfPath] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    setInitializing(true);
    api
      .get(`/papers/${editId}/edit`)
      .then((res) => {
        const paper = res.data.data;
        if (paper) {
          setTitle(paper.title || "");
          setDoi(paper.externalIds?.doi || paper.doi || "");
          setPaperLink(paper.paperLink || "");
          setAbstractText(paper.abstractText || "");
          setPublicationYear(paper.publicationYear ? String(paper.publicationYear) : String(new Date().getFullYear()));
          setPaperKind(paper.paperKind || "article");
          setOpenAccessUrl(paper.openAccessUrl || "");
          if (Array.isArray(paper.authors)) {
            setAuthorsStr(paper.authors.map((a: { displayName: string }) => a.displayName).join(", "));
          }
          if (Array.isArray(paper.keywords)) {
            setKeywordsStr(paper.keywords.map((k: { keywordName: string }) => k.keywordName).join(", "));
          }
          if (Array.isArray(paper.topics)) {
            setTopicsStr(paper.topics.map((tp: { topicName: string }) => tp.topicName).join(", "));
          }
          if (paper.pdfPath) setExistingPdfPath(paper.pdfPath);
        }
      })
      .catch(() => {
        toast.error(t("Failed to load paper details for editing"));
      })
      .finally(() => {
        setInitializing(false);
      });
  }, [editId, t]);

  const abstractWordCount = countWords(abstractText);

  const parsedAuthors = authorsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedKeywords = keywordsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedTopics = topicsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function validateStep(targetStep: StepNumber): Record<string, string> {
    const next: Record<string, string> = {};
    if (targetStep === 1 || targetStep === 4) {
      if (!title.trim() || title.trim().length < 8) {
        next.title = t("Please enter a clearer paper title (at least 8 characters).");
      }
      if (!doi.trim() || !/^10\.\d{4,9}\/\S+$/i.test(doi.trim())) {
        next.doi = t("Please enter a valid DOI (e.g. 10.1145/3065386).");
      }
      if (!paperLink.trim()) {
        next.paperLink = t("Please enter a valid paper link URL.");
      } else if (!isValidHttpUrl(paperLink)) {
        next.paperLink = t("Paper link must start with http:// or https://.");
      }
      if (abstractWordCount < 50) {
        next.abstractText = t("Abstract must contain at least 50 words.");
      } else if (abstractWordCount > 350) {
        next.abstractText = t("Abstract must not exceed 350 words.");
      }
      const currentYear = new Date().getFullYear();
      const yearNum = parseInt(publicationYear, 10);
      if (!publicationYear || Number.isNaN(yearNum) || yearNum < 1900) {
        next.publicationYear = t("Publication year must be 1900 or later.");
      } else if (yearNum > currentYear) {
        next.publicationYear = t("Publication year cannot be in the future.");
      }
    }
    if (targetStep === 2 || targetStep === 4) {
      if (parsedAuthors.length === 0) {
        next.authors = t("Please enter at least one author.");
      }
      if (parsedKeywords.length === 0) {
        next.keywords = t("Please enter at least one keyword.");
      }
    }
    if (targetStep === 3 || targetStep === 4) {
      if (openAccessUrl.trim() && !isValidHttpUrl(openAccessUrl)) {
        next.openAccessUrl = t("Open Access URL must start with http:// or https://.");
      }
    }
    return next;
  }

  function handleNextStep() {
    const stepErrors = validateStep(step);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep((current) => Math.min(4, current + 1) as StepNumber);
  }

  function handleJumpStep(target: StepNumber) {
    if (target <= step) {
      setStep(target);
      return;
    }
    for (let s = step; s < target; s += 1) {
      const stepErrors = validateStep(s as StepNumber);
      if (Object.keys(stepErrors).length > 0) {
        setStep(s as StepNumber);
        setErrors(stepErrors);
        return;
      }
    }
    setErrors({});
    setStep(target);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("Only PDF files are allowed"));
      return;
    }
    setPdfFile(file);
    if (errors.pdf) setErrors((prev) => ({ ...prev, pdf: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allErrors = validateStep(4);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      if (allErrors.title || allErrors.doi || allErrors.paperLink || allErrors.abstractText || allErrors.publicationYear) {
        setStep(1);
      } else if (allErrors.authors || allErrors.keywords) {
        setStep(2);
      } else {
        setStep(3);
      }
      return;
    }

    setSubmitting(true);
    try {
      const authors = parsedAuthors.map((displayName, index) => ({
        displayName,
        position: index + 1,
        isCorresponding: index === 0,
      }));
      const keywords = parsedKeywords.map((keywordName) => ({ keywordName }));
      const topics = parsedTopics.map((topicName) => ({ topicName }));

      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("doi", doi.trim());
      formData.append("paperLink", paperLink.trim());
      formData.append("abstractText", abstractText.trim());
      formData.append("publicationYear", String(parseInt(publicationYear, 10)));
      formData.append("paperKind", paperKind);
      formData.append("authors", JSON.stringify(authors));
      formData.append("keywords", JSON.stringify(keywords));
      formData.append("topics", JSON.stringify(topics));
      if (openAccessUrl.trim()) formData.append("openAccessUrl", openAccessUrl.trim());
      if (pdfFile) formData.append("pdf", pdfFile);

      const res = editId
        ? await api.patch(`/papers/${editId}`, formData)
        : await api.post("/papers", formData);

      if (res.data.success) {
        if (isAdmin) {
          toast.success(
            pdfFile
              ? t("Paper and PDF added to the public corpus.")
              : t("Metadata-only paper added. A PDF can be uploaded later."),
          );
        } else if (editId) {
          toast.success(t("Paper resubmitted successfully! It will be reviewed by the admin."));
        } else {
          toast.success(t("Paper submitted successfully! It will be reviewed by the admin before being published."));
        }
        navigate(isAdmin ? "/admin/papers" : "/settings/my-papers");
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: { message?: string }; message?: string } } };
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          t("Failed to submit paper. Please check input parameters."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const steps: Array<{ num: StepNumber; labelKey: string }> = [
    { num: 1, labelKey: "settings.submit.step1" },
    { num: 2, labelKey: "settings.submit.step2" },
    { num: 3, labelKey: "settings.submit.step3" },
    { num: 4, labelKey: "settings.submit.step4" },
  ];

  const clearError = (field: string) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const content = (
    <div className="space-y-6" data-no-i18n>
      <SettingsPageHeader
        title={editId ? t("settings.submit.editTitle") : isAdmin ? t("Add Paper to Corpus") : t("settings.submit.title")}
        description={t("settings.submit.subtitle")}
        action={
          !isAdmin ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/settings/my-papers">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("settings.submit.backToWorks")}</span>
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* 4-step Academic Progress Stepper */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Submission steps">
        {steps.map(({ num, labelKey }) => {
          const active = step === num;
          const completed = step > num;
          return (
            <li key={num}>
              <button
                type="button"
                onClick={() => handleJumpStep(num)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/8 text-primary"
                    : completed
                      ? "border-emerald-500/30 bg-emerald-500/5 text-foreground hover:border-primary/40"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    active
                      ? "bg-primary text-primary-foreground"
                      : completed
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="h-3 w-3" aria-hidden="true" /> : num}
                </span>
                <span className="truncate">{t(labelKey)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {initializing ? (
        <SkeletonList items={3} />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          {/* STEP 1: Paper details */}
          {step === 1 ? (
            <div className="space-y-5">
              <SettingsFormField id="title" label={t("settings.submit.paperTitle")} required error={errors.title}>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearError("title");
                  }}
                  placeholder="e.g. Attention Is All You Need"
                  className="h-10"
                />
              </SettingsFormField>

              <div className="grid gap-5 sm:grid-cols-2">
                <SettingsFormField id="doi" label="DOI" required error={errors.doi}>
                  <Input
                    id="doi"
                    value={doi}
                    onChange={(e) => {
                      setDoi(e.target.value);
                      clearError("doi");
                    }}
                    placeholder="e.g. 10.1145/3065386"
                    className="h-10 font-mono text-xs"
                  />
                </SettingsFormField>

                <SettingsFormField id="paperLink" label={t("settings.submit.paperLink")} required error={errors.paperLink}>
                  <Input
                    id="paperLink"
                    value={paperLink}
                    onChange={(e) => {
                      setPaperLink(e.target.value);
                      clearError("paperLink");
                    }}
                    placeholder="https://arxiv.org/abs/1706.03762"
                    className="h-10"
                  />
                </SettingsFormField>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <SettingsFormField id="paperKind" label={t("settings.submit.paperKind")} required>
                  <select
                    id="paperKind"
                    value={paperKind}
                    onChange={(e) => setPaperKind(e.target.value as typeof paperKind)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="article">{t("Article / Research Paper")}</option>
                    <option value="proceedings">{t("Conference Proceedings")}</option>
                    <option value="preprint">{t("Preprint")}</option>
                    <option value="review">{t("Review")}</option>
                    <option value="book-chapter">{t("Book Chapter")}</option>
                    <option value="other">{t("Other")}</option>
                  </select>
                </SettingsFormField>

                <SettingsFormField
                  id="publicationYear"
                  label={t("Publication Year")}
                  required
                  error={errors.publicationYear}
                >
                  <Input
                    id="publicationYear"
                    type="number"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={publicationYear}
                    onChange={(e) => {
                      setPublicationYear(e.target.value.replace(/^0+(?=\d)/, ""));
                      clearError("publicationYear");
                    }}
                    className="h-10"
                  />
                </SettingsFormField>
              </div>

              <SettingsFormField
                id="abstractText"
                label={t("Abstract")}
                required
                error={errors.abstractText}
                helper={
                  <span
                    className={
                      abstractWordCount < 50 || abstractWordCount > 350
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {abstractWordCount} / 50–350 {t("settings.submit.words")}
                  </span>
                }
              >
                <textarea
                  id="abstractText"
                  rows={6}
                  value={abstractText}
                  onChange={(e) => {
                    setAbstractText(e.target.value);
                    clearError("abstractText");
                  }}
                  placeholder={t("Paste the abstract here (between 50 and 350 words)...")}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </SettingsFormField>
            </div>
          ) : null}

          {/* STEP 2: Authors & topics */}
          {step === 2 ? (
            <div className="space-y-5">
              <SettingsFormField
                id="authors"
                label={t("Authors (comma-separated)")}
                required
                error={errors.authors}
                helper={t("First author will be marked as corresponding author.")}
              >
                <Input
                  id="authors"
                  value={authorsStr}
                  onChange={(e) => {
                    setAuthorsStr(e.target.value);
                    clearError("authors");
                  }}
                  placeholder="e.g. Ashish Vaswani, Noam Shazeer, Niki Parmar"
                  className="h-10"
                />
              </SettingsFormField>

              {parsedAuthors.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {parsedAuthors.map((author, idx) => (
                    <span
                      key={`${author}-${idx}`}
                      className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {idx + 1}. {author}
                      {idx === 0 ? ` (${t("Corresponding")})` : ""}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <SettingsFormField
                  id="keywords"
                  label={t("Keywords")}
                  required
                  error={errors.keywords}
                  helper={t("Separate multiple keywords with commas.")}
                >
                  <Input
                    id="keywords"
                    value={keywordsStr}
                    onChange={(e) => {
                      setKeywordsStr(e.target.value);
                      clearError("keywords");
                    }}
                    placeholder="e.g. NLP, Transformers, Deep Learning"
                    className="h-10"
                  />
                </SettingsFormField>

                <SettingsFormField
                  id="topics"
                  label={t("Research Topics")}
                  helper={t("Optional comma-separated research domains.")}
                >
                  <Input
                    id="topics"
                    value={topicsStr}
                    onChange={(e) => setTopicsStr(e.target.value)}
                    placeholder="e.g. Computer Science, AI"
                    className="h-10"
                  />
                </SettingsFormField>
              </div>
            </div>
          ) : null}

          {/* STEP 3: Documents & links */}
          {step === 3 ? (
            <div className="space-y-5">
              <SettingsFormField
                id="openAccessUrl"
                label={t("Open Access URL")}
                error={errors.openAccessUrl}
                helper={t("Optional direct link to an open-access PDF or preprint.")}
              >
                <Input
                  id="openAccessUrl"
                  value={openAccessUrl}
                  onChange={(e) => {
                    setOpenAccessUrl(e.target.value);
                    clearError("openAccessUrl");
                  }}
                  placeholder="https://arxiv.org/pdf/1706.03762.pdf"
                  className="h-10"
                />
              </SettingsFormField>

              <SettingsFormField label={t("PDF Document")} error={errors.pdf}>
                {pdfFile ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-emerald-700 dark:text-emerald-300">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{pdfFile.name}</p>
                        <p className="text-xs opacity-80">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPdfFile(null)}
                      aria-label={t("Remove")}
                      className="rounded-lg p-1.5 hover:bg-emerald-500/15"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : existingPdfPath ? (
                  <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{t("Existing PDF Document")}</p>
                        <p className="text-xs text-muted-foreground">{t("You can upload a new PDF to replace it")}</p>
                      </div>
                    </div>
                    <label
                      htmlFor="pdf-upload"
                      className="cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {t("Replace PDF")}
                    </label>
                    <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                  </div>
                ) : (
                  <label
                    htmlFor="pdf-upload"
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/35"
                  >
                    <Upload className="mb-2 h-7 w-7 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{t("Click to upload PDF")}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{t("PDF only (Max 10MB) · Optional")}</span>
                    <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                  </label>
                )}
              </SettingsFormField>

              <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p>{t("settings.works.statusDisclaimer")}</p>
              </div>
            </div>
          ) : null}

          {/* STEP 4: Review & submit */}
          {step === 4 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("settings.submit.reviewHint")}</p>

              <div className="divide-y divide-border/70 rounded-xl border border-border/85">
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      1. {t("settings.submit.step1")}
                    </h3>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStep(1)}>
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span>{t("Edit")}</span>
                    </Button>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {publicationYear} · {paperKind} · DOI: <span className="font-mono">{doi}</span>
                  </p>
                  <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{abstractText}</p>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      2. {t("settings.submit.step2")}
                    </h3>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStep(2)}>
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span>{t("Edit")}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-foreground">
                    <strong>{t("Authors")}:</strong> {parsedAuthors.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>{t("Keywords")}:</strong> {parsedKeywords.join(", ")}
                  </p>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      3. {t("settings.submit.step3")}
                    </h3>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStep(3)}>
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span>{t("Edit")}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-foreground">
                    <strong>PDF:</strong>{" "}
                    {pdfFile ? pdfFile.name : existingPdfPath ? t("Existing PDF Document") : t("Metadata only (no PDF)")}
                  </p>
                  {openAccessUrl ? (
                    <p className="truncate text-xs text-muted-foreground">
                      <strong>Open Access:</strong> {openAccessUrl}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Step Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/75 pt-5">
            <div>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setStep((s) => Math.max(1, s - 1) as StepNumber)}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("settings.submit.back")}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting}
                  onClick={() => navigate(isAdmin ? "/admin/papers" : "/settings/my-papers")}
                >
                  {t("Cancel")}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step < 4 ? (
                <Button type="button" size="sm" onClick={handleNextStep} className="gap-1.5">
                  <span>{t("settings.submit.next")}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  loadingText={editId ? t("Resubmitting...") : isAdmin ? t("Creating...") : t("Submitting...")}
                >
                  {editId ? t("Resubmit Paper") : isAdmin ? t("Create Paper") : t("Submit Paper")}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );

  if (isEmbedded) return content;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-border/85 bg-card p-6 sm:p-8">{content}</div>
    </main>
  );
}
