import type { EvaluationCheck, EvaluationStatus } from "@trend/shared-types";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Gauge, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEvaluationSummary } from "@/features/admin/hooks/use-evaluation-summary";
import { useCurrentUser } from "@/features/auth";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

export function AdminEvaluationPage() {
  const { data: me, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = me?.user?.role === "admin";
  const { data, isLoading, isError } = useEvaluationSummary(isAdmin);

  if (isUserLoading || isLoading) {
    return (
      <main className="space-y-6">
        <PageHeader title="AI Evaluation" description="Benchmarks and acceptance checks for search, trends, gaps, reports, and scoring." />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="space-y-4">
        <PageHeader title="AI Evaluation" description="Benchmarks and acceptance checks for search, trends, gaps, reports, and scoring." />
        <Card className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100">
          <CardContent className="p-5">Could not load evaluation summary. Check the backend admin endpoint and auth token.</CardContent>
        </Card>
      </main>
    );
  }

  const scorePct = Math.round((data.overallScore / Math.max(data.maxScore, 1)) * 100);

  return (
    <main className="space-y-6">
      <PageHeader
        title="AI Evaluation"
        description="A technical acceptance dashboard showing whether AI/BE logic is deterministic, grounded, and ready for demo."
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-blue-600" />
              Overall Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tabular-nums">{scorePct}%</span>
                <StatusBadge status={data.overallStatus === "healthy" ? "pass" : data.overallStatus === "needs_data" ? "warn" : "fail"} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {overallStatusLabel(data.overallStatus)}. {formatNumber(data.overallScore)}/{formatNumber(data.maxScore)} benchmark points. Generated{" "}
                {new Date(data.generatedAt).toLocaleString("en-US")}.
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", overallProgressClass(data.overallStatus))} style={{ width: `${scorePct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-indigo-600" />
              What This Measures
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <Metric label="Embedded / analyzable papers" value={`${formatNumber(data.corpus.embeddedPapers)}/${formatNumber(data.corpus.analyzablePapers)}`} sub={`${data.corpus.embeddingCoveragePct}%`} />
            <Metric label="Structured AI analysis" value={`${formatNumber(data.corpus.aiAnalyzedPapers)}/${formatNumber(data.corpus.analyzablePapers)}`} sub={`${data.corpus.aiAnalysisCoveragePct}%`} />
            <Metric label="Grounded reports" value={`${formatNumber(data.corpus.groundedReports)}/${formatNumber(data.corpus.readyReports)}`} sub={`${data.corpus.reportGroundingCoveragePct}%`} />
            <Metric label="Valid report citations" value={`${formatNumber(data.corpus.groundedReports - data.corpus.invalidCitationReports)}/${formatNumber(data.corpus.groundedReports)}`} sub={`${data.corpus.reportCitationValidityPct}%`} />
            <Metric label="Evidence-backed gaps" value={`${formatNumber(data.corpus.evidenceBackedGaps)}/${formatNumber(data.corpus.activeGaps)}`} sub={`${data.corpus.gapEvidenceCoveragePct}%`} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paper Score Bands 1-3</CardTitle>
          <p className="text-sm text-muted-foreground">{data.rubric.paperScoreFormula}</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {data.rubric.scoreBands.map((band) => (
            <div key={band.rank} className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Band {band.rank}</span>
                <Badge variant="outline">{band.range}</Badge>
              </div>
              <h3 className="mt-3 font-semibold">{band.label}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{band.meaning}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Feature Acceptance Checks</CardTitle>
          <p className="text-sm text-muted-foreground">
            These checks separate deterministic backend proof from places that still need corpus scale or human-labeled evaluation.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Feature</TableHead>
                <TableHead className="min-w-[220px]">Check</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[260px]">Basis</TableHead>
                <TableHead className="min-w-[260px]">Evidence</TableHead>
                <TableHead className="min-w-[220px]">Next Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.checks.map((check) => (
                <EvaluationRow key={check.id} check={check} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        <span className="text-xs font-semibold text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function EvaluationRow({ check }: { check: EvaluationCheck }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary" className="capitalize">
          {check.feature}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="font-medium">{check.title}</div>
        <div className="text-xs text-muted-foreground">
          {check.score}/{check.maxScore} points
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={check.status} />
      </TableCell>
      <TableCell className="text-sm leading-6 text-muted-foreground">{check.basis}</TableCell>
      <TableCell className="text-sm leading-6">{check.evidence}</TableCell>
      <TableCell className="text-sm leading-6 text-muted-foreground">{check.action}</TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: EvaluationStatus }) {
  const Icon = status === "pass" ? CheckCircle2 : status === "warn" ? AlertTriangle : XCircle;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 capitalize",
        status === "pass" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300",
        status === "warn" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300",
        status === "fail" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function overallStatusLabel(status: "healthy" | "needs_data" | "at_risk") {
  if (status === "healthy") return "Healthy: all benchmark checks currently pass";
  if (status === "needs_data") return "Needs data: corpus is not large enough to evaluate";
  return "At risk: at least one benchmark check is warning or failing";
}

function overallProgressClass(status: "healthy" | "needs_data" | "at_risk") {
  if (status === "healthy") return "bg-emerald-600";
  if (status === "needs_data") return "bg-amber-500";
  return "bg-red-600";
}
