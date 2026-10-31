import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { GapAnalysisResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAnalyzeGap, useGapAnalysisStatus } from "@/features/gaps/hooks/use-gaps";
import { screeningApi } from "../api/screening.api";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceLoading } from "./workspace-common";
import { ScreeningError } from "./screening-common";
import { ProjectGapProgress } from "./project-gap-progress";
import { DiscoveryResults } from "./project-gap-discovery";

export function AnalysisSetDiscovery({ projectId, setId, readOnly, onAnalysisChange }: { projectId: string; setId: string; readOnly?: boolean; onAnalysisChange: (analysis: GapAnalysisResult | null) => void }) {
  const [params, setParams] = useSearchParams(), client = useQueryClient();
  const set = useResearchResource(projectId, ["analysis-set", setId], () => screeningApi.getSet(projectId, setId));
  const overview = useResearchResource(projectId, ["discovery"], () => researchApi.discovery(projectId), true, d => d?.latestAnalysis?.status === "queued" || d?.latestAnalysis?.status === "analyzing");
  const status = useGapAnalysisStatus(params.get("analysisRun")), analyze = useAnalyzeGap(), busy = useRef(false);
  const current = status.data?.analysisSetId === setId ? status.data : overview.data?.latestAnalysis?.analysisSetId === setId ? overview.data.latestAnalysis : null;
  const running = current?.status === "queued" || current?.status === "analyzing";
  useEffect(() => onAnalysisChange(current), [current, onAnalysisChange]);
  useEffect(() => { if (current?.status === "ready" || current?.status === "failed") { void client.invalidateQueries({ queryKey: ["gaps"] }); void client.invalidateQueries({ queryKey: ["credits"] }); } }, [client, current?.id, current?.status]);
  if (set.isLoading) return <WorkspaceLoading />;
  if (set.isError || !set.data) return <ScreeningError error={set.error} retry={() => void set.refetch()} />;
  const snapshot = set.data;
  return <section className="gap-discovery space-y-4" data-no-i18n aria-label="Phân tích bộ bài đã lưu">
    <header><h2 className="text-xl font-semibold">{snapshot.mode === "DRAFT" ? "Phân tích nháp — kết quả sơ bộ" : "Phân tích từ bộ bài chính thức"}</h2><p>{snapshot.topic}</p><small>{snapshot.sources.length} bài · lưu lúc {new Date(snapshot.createdAt).toLocaleString("vi-VN")} · quy tắc v{snapshot.settings.version}</small></header>
    {snapshot.mode === "DRAFT" && <p className="screening-notice">Đây là khám phá sơ bộ từ bộ bài nháp. Kết quả không thay đổi quyết định chọn bài và cần được nhóm kiểm tra minh chứng.</p>}
    <details><summary>Nguồn và khả năng tái hiện</summary><ul className="space-y-2">{snapshot.sources.map(s => <li key={s.id}><strong>{s.title}</strong><small className="block text-muted-foreground">{s.publicationYear} · {s.finalDecisionId ? "Có quyết định chọn" : "Chưa có quyết định chọn"} · {s.evidenceRevisions.length} phiên bản minh chứng</small></li>)}</ul><p className="text-xs text-muted-foreground break-all">Mã snapshot: {snapshot.hash}</p><p className="text-sm">Nếu tài liệu hoặc quyết định thay đổi, hệ thống sẽ yêu cầu tạo bộ mới. Bộ đã lưu vẫn giữ nguyên.</p></details>
    {running && <ProjectGapProgress selectedCount={snapshot.sources.length} analysis={current} />}
    <ScreeningError error={analyze.error || status.error} retry={status.isError ? () => void status.refetch() : undefined} />
    {current?.status === "failed" && <p role="alert">{current.errorMessage || "Chưa hoàn thành phân tích. Nguồn và bộ bài của bạn vẫn được lưu."}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={Boolean(readOnly || running || analyze.isPending || overview.isLoading || overview.isError || (overview.data?.latestAnalysis && ["queued", "analyzing"].includes(overview.data.latestAnalysis.status)))} onClick={async () => {
      if (busy.current) return; busy.current = true;
      try { const result = await analyze.mutateAsync({ projectId, analysisSetId: snapshot.id, projectDiscovery: true, evidenceMode: "selected", topic: snapshot.topic, selectedPaperIds: snapshot.sources.map(s => s.id) }); const next = new URLSearchParams(params); next.set("analysisRun", result.analysisId); setParams(next, { replace: true }); void overview.refetch(); }
      catch { /* Keep the frozen set and show the actual API error. */ } finally { busy.current = false; }
    }}>{analyze.isPending ? "Đang tạo lượt phân tích…" : running ? "Đang phân tích" : current?.status === "failed" ? "Thử phân tích lại bộ bài" : current?.status === "ready" ? "Phân tích lại bộ bài" : "Phân tích bộ bài"}</Button><small className="text-muted-foreground">30 credits / lượt · sử dụng luồng AI hiện có</small><Button variant="ghost" onClick={() => { const next = new URLSearchParams(params); next.set("tab", "papers"); next.delete("analysisSet"); next.delete("analysisRun"); setParams(next); }}>Về thư viện</Button></div>
    {overview.isError && <ScreeningError error={overview.error} retry={() => void overview.refetch()} />}
    {current?.status === "ready" && current.discovery && <DiscoveryResults projectId={projectId} result={current.discovery} />}
  </section>;
}
