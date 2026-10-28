import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Database,
  FileText,
  HelpCircle,
  Info,
  MinusCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";

export function ProjectPaperAnalysis({
  projectId,
  paperId,
  readOnly,
}: {
  projectId: string;
  paperId: string;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const view = useResearchResource(
    projectId,
    ["paper-analysis", paperId],
    () => researchApi.paperAnalysis(projectId, paperId),
    true,
    (data) => ["queued", "processing"].includes(data?.knowledge.status ?? "")
  );
  const command = useResearchCommand(projectId);

  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;

  const { analysis, knowledge, screeningStatus, paperId: canonicalId } = view.data;
  const busy = command.isPending || ["queued", "processing"].includes(knowledge.status);
  const current = knowledge.status === "ready";

  const fields = [
    { label: "Research questions in this paper", value: analysis?.researchQuestions, icon: HelpCircle },
    { label: "Methodology", value: analysis?.methods, icon: Compass },
    { label: "Dataset, population or sample", value: analysis?.dataset, icon: Database },
    { label: "Reported results", value: analysis?.findings, icon: CheckCircle2 },
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
    <section className="project-paper-analysis" data-no-i18n>
      <div className="project-ai-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-semibold px-2.5 py-1 ${
              knowledge.sourceKind === "abstract"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
            }`}
          >
            {t(
              knowledge.sourceKind === "abstract"
                ? "Coverage: abstract only"
                : "Coverage: indexed full text"
            )}
          </Badge>
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

      <div className="project-ai-disclaimer">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 mt-0.5" />
        <span>
          {t("AI interpretations need human review. Private project attachments are not sent by this action.")}
        </span>
      </div>

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
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("Summary")}
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
        <div className="pt-2">
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
