import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Database,
  FileCode2,
  FileText,
  GitCompare,
  HelpCircle,
  Info,
  Layers,
  MinusCircle,
  Quote,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import type { ScreeningPaperRow } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";

function buildCitationKey(title: string, authors?: string[], year?: number | null): string {
  const firstAuthor = authors?.[0]
    ? authors[0]
        .trim()
        .split(/\s+/)
        .slice(-1)[0]
        ?.replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase() || "author"
    : "paper";
  const y = year ? String(year) : "nd";
  const firstWord =
    title
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "work";
  return `${firstAuthor}${y}${firstWord}`;
}

export function ProjectPaperAnalysis({
  projectId,
  paperId,
  readOnly,
  paper,
}: {
  projectId: string;
  paperId: string;
  readOnly: boolean;
  paper?: Partial<ScreeningPaperRow>;
}) {
  const { t } = useI18n();
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [copiedApa, setCopiedApa] = useState(false);

  const hasPaperAnalysisApi = typeof researchApi?.paperAnalysis === "function";
  const view = useResearchResource(
    projectId,
    ["paper-analysis", paperId],
    () =>
      hasPaperAnalysisApi
        ? researchApi.paperAnalysis(projectId, paperId)
        : Promise.resolve(null as never),
    hasPaperAnalysisApi,
    (data) => ["queued", "processing"].includes(data?.knowledge.status ?? "")
  );
  const questionsQuery = useResearchResource(
    projectId,
    ["questions"],
    () =>
      typeof researchApi?.questions === "function"
        ? researchApi.questions(projectId)
        : Promise.resolve([]),
    Boolean(view.data) && typeof researchApi?.questions === "function"
  );
  const evidenceQuery = useResearchResource(
    projectId,
    ["evidence", 1],
    () =>
      typeof researchApi?.evidence === "function"
        ? researchApi.evidence(projectId, { page: 1, pageSize: 50 })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false }),
    Boolean(view.data) && typeof researchApi?.evidence === "function"
  );
  const command = useResearchCommand(projectId);

  if (view.isLoading && !paper) return <WorkspaceLoading />;
  if ((view.isError || !view.data) && !paper) {
    return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  }

  const analysis = view.data?.analysis ?? null;
  const knowledge = view.data?.knowledge ?? {
    status: "idle" as const,
    sourceKind: (paper?.fullTextAvailable ? "full_text" : "abstract") as "abstract" | "full_text",
    passages: [],
    warnings: [],
    errorMessage: null,
  };
  const screeningStatus = view.data?.screeningStatus ?? paper?.legacyStatus ?? "UNDECIDED";
  const canonicalId = view.data?.paperId ?? paper?.paperId ?? paperId;
  const title = view.data?.title ?? paper?.title ?? "";
  const busy = command.isPending || ["queued", "processing"].includes(knowledge.status);
  const current = knowledge.status === "ready";
  const isAbstractOnly = knowledge.sourceKind === "abstract";

  // Topic, keywords & category merged from AI keyTerms and paper metadata
  const mergedKeywords = Array.from(
    new Set([
      ...(analysis?.keyTerms ?? []),
      ...(paper?.keywords ?? []),
    ].map((k) => k.trim()).filter(Boolean))
  );
  const projectTags = paper?.tags ?? [];
  const paperCategory =
    paper?.paperKind === "article"
      ? "Journal Article"
      : paper?.paperKind === "review"
      ? "Literature Review"
      : paper?.paperKind === "conference" || paper?.paperKind === "proceedings"
      ? "Conference Proceedings"
      : paper?.paperKind === "preprint"
      ? "Preprint"
      : paper?.paperKind || "Research Paper";

  // Paper evidence rows extracted in this project
  const paperEvidence = (evidenceQuery.data?.items ?? []).filter(
    (item) => item.paperId === canonicalId || item.paperId === paperId
  );

  // Project research questions & relevance matching (strictly grounded in text overlap / linked evidence)
  const projectQuestions = questionsQuery.data ?? [];
  const corpusForMatching = [
    title,
    paper?.abstractText ?? "",
    paper?.proposalReason ?? "",
    analysis?.summary ?? "",
    ...(analysis?.researchQuestions ?? []),
    ...(analysis?.findings ?? []),
    ...(analysis?.keyTerms ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const questionRelevance = projectQuestions.map((rq) => {
    const linkedExtractions = paperEvidence.filter((ev) =>
      ev.relatedQuestions?.some((q) => q.id === rq.id)
    );
    const rqTokens = rq.text
      .toLowerCase()
      .split(/[^a-zA-Z0-9À-ỹ]+/)
      .filter((w) => w.length >= 4);
    const matchedTokens = Array.from(new Set(rqTokens.filter((w) => corpusForMatching.includes(w))));
    return {
      question: rq,
      linkedCount: linkedExtractions.length,
      matchedTokens: matchedTokens.slice(0, 6),
    };
  });

  const citeKey = buildCitationKey(title || paper?.title || "paper", paper?.authors, paper?.publicationYear);
  const latexCite = `\\cite{${citeKey}}`;
  const apaCitation = (() => {
    const authorStr = paper?.authors?.length
      ? paper.authors.length > 3
        ? `${paper.authors[0]} et al.`
        : paper.authors.join(", ")
      : "Unknown author";
    const yearStr = paper?.publicationYear ? ` (${paper.publicationYear})` : "";
    const titleStr = ` ${(title || paper?.title || "").replace(/\.$/, "")}.`;
    const journalStr = paper?.journalName ? ` ${paper.journalName}.` : "";
    const doiStr = paper?.doi ? ` https://doi.org/${paper.doi}` : "";
    return `${authorStr}${yearStr}.${titleStr}${journalStr}${doiStr}`.trim();
  })();

  const copyToClipboard = async (value: string, label: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      setFlag(true);
      toast.success(label);
      setTimeout(() => setFlag(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const fields = [
    { label: "Research questions in this paper", value: analysis?.researchQuestions, icon: HelpCircle },
    { label: "Methodology", value: analysis?.methods, icon: Compass },
    { label: "Dataset, population or sample", value: analysis?.dataset, icon: Database },
    { label: "Reported results", value: analysis?.findings, icon: CheckCircle2 },
    { label: "Key contributions", value: analysis?.contributions, icon: Sparkles },
    { label: "Limitations", value: analysis?.limitations, icon: AlertTriangle },
    { label: "Future work", value: analysis?.futureWork, icon: ArrowUpRight },
  ] as const;

  const activeFields = fields.filter((f) =>
    Array.isArray(f.value) ? f.value.length > 0 : Boolean(f.value)
  );
  const emptyFields = fields.filter((f) =>
    Array.isArray(f.value) ? f.value.length === 0 : !f.value
  );

  return (
    <section className="project-paper-analysis space-y-3.5" data-no-i18n>
      {/* Top Toolbar: Provenance Badge + Refresh Action */}
      <div className="project-ai-toolbar flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-semibold px-2.5 py-1 gap-1.5 ${
              isAbstractOnly
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
            }`}
          >
            {isAbstractOnly ? (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            )}
            {t(
              isAbstractOnly
                ? "Coverage: abstract only"
                : "Coverage: indexed full text"
            )}
          </Badge>
          {knowledge.passages.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {knowledge.passages.length} indexed source passage{knowledge.passages.length === 1 ? "" : "s"}
            </span>
          )}
          {busy && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {t("Analyzing paper…")}
            </span>
          )}
        </div>

        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5"
            disabled={busy}
            onClick={() =>
              command.mutate(() =>
                researchApi.requestPaperAnalysis(projectId, paperId)
              )
            }
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {t(busy ? "Analyzing paper…" : current ? "Refresh paper analysis" : "Analyze paper")}
          </Button>
        )}
      </div>

      {/* Explicit Provenance Guardrail Banner: Abstract-Only vs Full-Text Evidence */}
      <div
        className={`rounded-xl border p-3 text-xs leading-relaxed flex items-start gap-2.5 ${
          isAbstractOnly
            ? "border-amber-500/30 bg-amber-500/8 text-amber-900 dark:text-amber-200"
            : "border-emerald-500/30 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200"
        }`}
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">
            {isAbstractOnly
              ? "Abstract-Only Analysis — Full Text Not Indexed"
              : "Full-Text Indexed Evidence Available"}
          </p>
          <p className="opacity-90">
            {isAbstractOnly
              ? "Insights below are extracted strictly from the paper's title, OpenAlex metadata, and abstract. Unmentioned details are never invented. Verify full text before citing specific experimental metrics."
              : "Insights are grounded in indexed full-text passages and metadata. Always verify source passages and page locators before accepting claims into your synthesis."}
          </p>
          <p className="text-[11px] opacity-80">
            {t("AI interpretations need human review. Private project attachments are not sent by this action.")}
          </p>
        </div>
      </div>

      {/* Quick Actions Bar: Save/Organize, Compare, Extract Evidence, Insert Citation */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/25 p-2.5">
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5" asChild>
          <Link
            to={`/projects/${encodeURIComponent(projectId)}?${new URLSearchParams({
              tab: "gaps",
              research: "evidence",
              extract: canonicalId,
            })}`}
          >
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span>{t("Extract and review evidence")}</span>
          </Link>
        </Button>

        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5" asChild>
          <Link
            to={`/projects/${encodeURIComponent(projectId)}?${new URLSearchParams({
              tab: "papers",
              view: "clusters",
              compare: canonicalId,
            })}`}
          >
            <GitCompare className="h-3.5 w-3.5 text-indigo-500" />
            <span>Compare Paper</span>
          </Link>
        </Button>

        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5" asChild>
          <Link
            to={`/projects/${encodeURIComponent(projectId)}?${new URLSearchParams({
              tab: "papers",
              view: "library",
              paper: canonicalId,
            })}`}
          >
            <Bookmark className="h-3.5 w-3.5 text-emerald-600" />
            <span>Save & Tag in Library</span>
          </Link>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1.5"
          onClick={() => void copyToClipboard(latexCite, `Copied LaTeX citation ${latexCite}`, setCopiedLatex)}
        >
          {copiedLatex ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <FileCode2 className="h-3.5 w-3.5 text-amber-600" />}
          <span>{copiedLatex ? "Copied \\cite" : `Insert ${latexCite}`}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs gap-1.5"
          onClick={() => void copyToClipboard(apaCitation, "Copied APA citation", setCopiedApa)}
        >
          {copiedApa ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Quote className="h-3.5 w-3.5" />}
          <span>{copiedApa ? "Copied APA" : "Copy APA"}</span>
        </Button>
      </div>

      {/* Topic, Keywords & Category Card */}
      {(mergedKeywords.length > 0 || projectTags.length > 0 || paper?.paperKind) && (
        <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-500 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Topic, Keywords & Category
              </h4>
            </div>
            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {paperCategory}
            </span>
          </div>

          {mergedKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mergedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {projectTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
              <Tag className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-semibold text-muted-foreground">Project tags:</span>
              {projectTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {knowledge.errorMessage && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          {knowledge.errorMessage}
        </div>
      )}

      {knowledge.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
          {warning}
        </p>
      ))}

      {analysis && (
        <div className="space-y-4 pt-1">
          {analysis.summary && (
            <div className="project-ai-summary-card">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("Summary")} · Research Problem & Objectives
                </h4>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {analysis.summary}
              </p>
            </div>
          )}

          {activeFields.length > 0 && (
            <div className="project-ai-findings-grid">
              {activeFields.map(({ label, value, icon: Icon }) => (
                <div key={label} className="project-ai-finding-card">
                  <div className="project-ai-finding-header">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-xs tracking-wide uppercase text-foreground">
                      {t(label)}
                    </span>
                  </div>
                  <div className="project-ai-finding-body">
                    {Array.isArray(value) ? (
                      <ul className="project-ai-bullet-list">
                        {value.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm leading-relaxed text-foreground/90">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {emptyFields.length > 0 && (
            <div className="project-ai-unmentioned-card">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("Not mentioned in this source")}:
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {emptyFields.map(({ label }) => (
                  <span key={label} className="project-ai-unmentioned-pill">
                    <MinusCircle className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <span>{t(label)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeFields.length === 0 && !analysis.summary && (
            <p className="text-xs text-muted-foreground italic py-2">
              {t("No structured analysis available yet.")}
            </p>
          )}
        </div>
      )}

      {/* Relevance to Project's Research Questions */}
      {(paper?.proposalReason || projectQuestions.length > 0) && (
        <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-600 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Relevance to Project Research Questions
              </h4>
            </div>
            <Link
              to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=questions`}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              View Project RQs
            </Link>
          </div>

          {paper?.proposalReason && (
            <div className="rounded-lg bg-blue-500/8 border border-blue-500/20 p-2.5 text-xs">
              <span className="font-semibold text-foreground">Team Proposal Rationale: </span>
              <span className="text-foreground/90">{paper.proposalReason}</span>
            </div>
          )}

          {questionRelevance.length > 0 ? (
            <ul className="space-y-2">
              {questionRelevance.map(({ question, linkedCount, matchedTokens }) => (
                <li
                  key={question.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-foreground">{question.text}</span>
                    {linkedCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        {linkedCount} linked evidence
                      </span>
                    ) : matchedTokens.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                        Keyword overlap
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        Not yet linked
                      </span>
                    )}
                  </div>
                  {matchedTokens.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Shared concepts: <strong className="text-foreground">{matchedTokens.join(", ")}</strong>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No project research questions formulated yet. Derive research questions from validated gaps or your research plan.
            </p>
          )}
        </div>
      )}

      {/* Project Evidence Extractions for this Paper */}
      {paperEvidence.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Extracted Project Evidence ({paperEvidence.length})
              </h4>
            </div>
            <Link
              to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=evidence&extract=${encodeURIComponent(canonicalId)}`}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Manage Extractions
            </Link>
          </div>
          <ul className="space-y-2">
            {paperEvidence.slice(0, 4).map((ev) => (
              <li key={ev.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{ev.claim}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      ev.verificationStatus === "VERIFIED" || ev.reviewState === "ACCEPTED"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {ev.verificationStatus ?? ev.reviewState} · {ev.sourceScope === "FULL_TEXT" ? "Full Text" : "Abstract"}
                  </span>
                </div>
                {ev.quotation && (
                  <blockquote className="border-l-2 border-primary/40 pl-2 italic text-muted-foreground">
                    “{ev.quotation}” {ev.locator ? `(${ev.locator})` : ""}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source Passages */}
      {current && knowledge.passages.length > 0 && (
        <details className="project-ai-passages-details">
          <summary className="project-ai-passages-summary">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span>{t("Check source passages")}</span>
            <span className="text-xs text-muted-foreground">({knowledge.passages.length})</span>
          </summary>
          <div className="space-y-2.5 pt-3">
            {knowledge.passages.map((passage) => (
              <div key={passage.id} className="project-ai-passage-item">
                <span className="project-ai-passage-page">
                  {passage.pageNumber
                    ? t("Page {{page}}", { page: passage.pageNumber })
                    : t("Abstract")}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground mt-1">
                  {passage.text}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {screeningStatus === "INCLUDED" && (
        <div className="pt-1">
          <Button size="sm" variant="outline" asChild>
            <Link
              to={`/projects/${projectId}?${new URLSearchParams({
                tab: "gaps",
                research: "evidence",
                extract: canonicalId,
              })}`}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              {t("Extract and review evidence")}
            </Link>
          </Button>
        </div>
      )}

      {command.isError && <WorkspaceError error={command.error} />}
    </section>
  );
}
