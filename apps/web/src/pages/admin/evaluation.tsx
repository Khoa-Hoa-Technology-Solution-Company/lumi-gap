import { isAdminSystemRole, type EvaluationCheck } from "@trend/shared-types";
import { ClipboardCheck, Gauge, Info, Scale } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AdminErrorPanel,
  AdminStatusBadge,
  useEvaluationSummary,
  useQualityAgreement,
} from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";

export function AdminEvaluationPage() {
  const { language } = useI18n();
  const isVi = language === "vi";
  const { data: me, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);

  const { data, isLoading, isError, refetch, isFetching } = useEvaluationSummary(isAdmin);
  const { data: agreement, isLoading: agreementLoading, isError: agreementError } = useQualityAgreement(isAdmin);

  if (isUserLoading || isLoading) {
    return (
      <main className="space-y-6">
        <PageHeader
          title={isVi ? "Đánh giá kỹ thuật AI" : "AI Technical Evaluation"}
          description={
            isVi
              ? "Kiểm định tính tất định, trích dẫn có căn cứ và đối chiếu chất lượng giữa đánh giá máy và người."
              : "Deterministic acceptance checks, citation grounding telemetry, and LLM-vs-human rating agreement."
          }
        />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="space-y-4">
        <PageHeader
          title={isVi ? "Đánh giá kỹ thuật AI" : "AI Technical Evaluation"}
          description={
            isVi
              ? "Kiểm định tính tất định, trích dẫn có căn cứ và đối chiếu chất lượng giữa đánh giá máy và người."
              : "Deterministic acceptance checks, citation grounding telemetry, and LLM-vs-human rating agreement."
          }
        />
        <AdminErrorPanel
          title={isVi ? "Không thể tải báo cáo đánh giá AI" : "Could not load evaluation summary"}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </main>
    );
  }

  const scorePct = Math.round((data.overallScore / Math.max(data.maxScore, 1)) * 100);
  const agreementByKind = agreement
    ? [
        { kind: isVi ? "Báo cáo tổng hợp" : "Report", bucket: agreement.byKind.report },
        { kind: isVi ? "Khoảng trống nghiên cứu" : "Research Gap", bucket: agreement.byKind.gap },
        { kind: isVi ? "Bài báo" : "Paper", bucket: agreement.byKind.paper },
      ]
    : [];

  return (
    <main className="space-y-6">
      <PageHeader
        title={isVi ? "Đánh giá kỹ thuật AI" : "AI Technical Evaluation"}
        description={
          isVi
            ? "Bảng kiểm kỹ thuật đo mức độ sẵn sàng hệ thống (độ phủ dữ liệu, trích dẫn hợp lệ, quy tắc chấm điểm) — không thay thế thẩm định khoa học của chuyên gia."
            : "Technical acceptance checks for determinism, grounding, and rubric coverage — not a substitute for independent scientific peer review."
        }
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p>
          {isVi
            ? "Giới hạn phương pháp: Các điểm số bên dưới đo lường tính nhất quán kỹ thuật và độ phủ trích dẫn trên kho dữ liệu hiện có. Chỉ số tương đồng AI–Người phản ánh độ khớp thang điểm trên mẫu được gắn nhãn, KHÔNG chứng minh độ chính xác học thuật tuyệt đối."
            : "Methodology limitation: Scores below measure deterministic engineering readiness and citation coverage over the current corpus. LLM-vs-human agreement measures rating alignment on the labeled sample only and does NOT prove scientific validity."}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-blue-600" />
              {isVi ? "Mức độ sẵn sàng kỹ thuật" : "Technical Readiness"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tabular-nums">{scorePct}%</span>
                <AdminStatusBadge
                  status={data.overallStatus === "healthy" ? "pass" : data.overallStatus === "needs_data" ? "warn" : "fail"}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {overallStatusLabel(data.overallStatus, isVi)}. {formatNumber(data.overallScore)}/{formatNumber(data.maxScore)}{" "}
                {isVi ? "điểm kiểm định" : "benchmark points"}.{" "}
                {isVi ? "Tạo lúc" : "Generated"}{" "}
                {new Date(data.generatedAt).toLocaleString(isVi ? "vi-VN" : "en-US")}.
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
              {isVi ? "Chỉ số độ phủ & căn cứ" : "Coverage & Grounding Telemetry"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <Metric
              label={isVi ? "Đã tạo vector / đủ điều kiện" : "Embedded / analyzable papers"}
              value={`${formatNumber(data.corpus.embeddedPapers)}/${formatNumber(data.corpus.analyzablePapers)}`}
              sub={`${data.corpus.embeddingCoveragePct}%`}
            />
            <Metric
              label={isVi ? "Phân tích cấu trúc AI" : "Structured AI analysis"}
              value={`${formatNumber(data.corpus.aiAnalyzedPapers)}/${formatNumber(data.corpus.analyzablePapers)}`}
              sub={`${data.corpus.aiAnalysisCoveragePct}%`}
            />
            <Metric
              label={isVi ? "Báo cáo có căn cứ" : "Grounded reports"}
              value={`${formatNumber(data.corpus.groundedReports)}/${formatNumber(data.corpus.readyReports)}`}
              sub={`${data.corpus.reportGroundingCoveragePct}%`}
            />
            <Metric
              label={isVi ? "Trích dẫn báo cáo hợp lệ" : "Valid report citations"}
              value={`${formatNumber(data.corpus.groundedReports - data.corpus.invalidCitationReports)}/${formatNumber(data.corpus.groundedReports)}`}
              sub={`${data.corpus.reportCitationValidityPct}%`}
            />
            <Metric
              label={isVi ? "Khoảng trống có bằng chứng" : "Evidence-backed gaps"}
              value={`${formatNumber(data.corpus.evidenceBackedGaps)}/${formatNumber(data.corpus.activeGaps)}`}
              sub={`${data.corpus.gapEvidenceCoveragePct}%`}
            />
          </CardContent>
        </Card>
      </section>

      {/* LLM-vs-Human Agreement Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            {isVi ? "Đối chiếu đánh giá AI và con người" : "LLM-vs-Human Rating Agreement"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {isVi
              ? "Đo sai số tuyệt đối trung bình (MAE), tỷ lệ lệch ≤ 1 điểm và hệ số tương quan Pearson trên các mục có cả đánh giá AI và con người."
              : "Mean absolute error (MAE), within-1-point rate, and Pearson correlation on items rated by both AI and human reviewers."}
          </p>
        </CardHeader>
        <CardContent>
          {agreementLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : agreementError ? (
            <p className="text-xs text-muted-foreground">
              {isVi ? "Không thể tải dữ liệu đối chiếu AI–Người." : "Unable to load LLM-vs-human agreement telemetry."}
            </p>
          ) : !agreement || agreement.sampleSize === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isVi
                ? "Chưa có đủ mẫu đối chiếu song song giữa AI và chuyên gia."
                : "No paired LLM-and-human rated samples available yet."}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric
                  label={isVi ? "Cỡ mẫu (n)" : "Sample size (n)"}
                  value={formatNumber(agreement.sampleSize)}
                  sub={agreement.sampleSize < 20 ? (isVi ? "Mẫu nhỏ" : "Small sample") : ""}
                />
                <Metric
                  label="MAE"
                  value={agreement.mae.toFixed(2)}
                  sub={isVi ? "Thấp hơn là khớp hơn" : "Lower is closer"}
                />
                <Metric
                  label={isVi ? "Lệch ≤ 1 điểm" : "Within 1 point"}
                  value={`${Math.round(agreement.withinOnePct)}%`}
                  sub=""
                />
                <Metric
                  label="Pearson r"
                  value={agreement.correlation !== null ? agreement.correlation.toFixed(2) : "—"}
                  sub=""
                />
              </div>

              {agreementByKind.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isVi ? "Nhóm tài liệu" : "Kind"}</TableHead>
                        <TableHead className="text-right">n</TableHead>
                        <TableHead className="text-right">MAE</TableHead>
                        <TableHead className="text-right">{isVi ? "Lệch ≤ 1" : "Within-1"}</TableHead>
                        <TableHead className="text-right">Pearson r</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agreementByKind.map(({ kind, bucket }) => (
                        <TableRow key={kind}>
                          <TableCell className="font-medium">{kind}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatNumber(bucket.sampleSize)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {bucket.sampleSize > 0 ? bucket.mae.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {bucket.sampleSize > 0 ? `${Math.round(bucket.withinOnePct)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {bucket.correlation !== null ? bucket.correlation.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isVi ? "Phân tầng điểm bài báo (Band 1–3)" : "Paper Score Bands 1–3"}</CardTitle>
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
          <CardTitle className="text-base">{isVi ? "Danh sách kiểm định tính năng" : "Feature Acceptance Checks"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isVi
              ? "Tách biệt các kiểm tra backend tất định với những hạng mục vẫn cần thêm quy mô kho dữ liệu hoặc đánh giá bởi chuyên gia."
              : "Separates deterministic backend proof from items that still need corpus scale or human-labeled evaluation."}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[110px]">{isVi ? "Tính năng" : "Feature"}</TableHead>
                <TableHead className="min-w-[200px]">{isVi ? "Hạng mục" : "Check"}</TableHead>
                <TableHead>{isVi ? "Trạng thái" : "Status"}</TableHead>
                <TableHead className="min-w-[240px]">{isVi ? "Cơ sở đo" : "Basis"}</TableHead>
                <TableHead className="min-w-[240px]">{isVi ? "Bằng chứng" : "Evidence"}</TableHead>
                <TableHead className="min-w-[200px]">{isVi ? "Hành động tiếp theo" : "Next Action"}</TableHead>
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {sub ? <span className="text-xs font-medium text-muted-foreground">{sub}</span> : null}
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
        <div className="text-xs text-muted-foreground tabular-nums">
          {check.score}/{check.maxScore} pts
        </div>
      </TableCell>
      <TableCell>
        <AdminStatusBadge status={check.status} />
      </TableCell>
      <TableCell className="text-sm leading-6 text-muted-foreground">{check.basis}</TableCell>
      <TableCell className="text-sm leading-6">{check.evidence}</TableCell>
      <TableCell className="text-sm leading-6 text-muted-foreground">{check.action}</TableCell>
    </TableRow>
  );
}

function overallStatusLabel(status: "healthy" | "needs_data" | "at_risk", isVi: boolean) {
  if (status === "healthy") {
    return isVi ? "Đạt: tất cả kiểm định kỹ thuật hiện đang đạt" : "Healthy: all benchmark checks currently pass";
  }
  if (status === "needs_data") {
    return isVi ? "Cần thêm dữ liệu: kho dữ liệu chưa đủ lớn để đánh giá đầy đủ" : "Needs data: corpus is not large enough to evaluate";
  }
  return isVi ? "Có rủi ro: ít nhất một kiểm định đang cảnh báo hoặc không đạt" : "At risk: at least one benchmark check is warning or failing";
}

function overallProgressClass(status: "healthy" | "needs_data" | "at_risk") {
  if (status === "healthy") return "bg-emerald-600";
  if (status === "needs_data") return "bg-amber-500";
  return "bg-red-600";
}
