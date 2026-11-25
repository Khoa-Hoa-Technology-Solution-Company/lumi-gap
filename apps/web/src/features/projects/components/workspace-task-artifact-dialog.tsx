import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectEvidence, WorkspaceLink } from "@trend/shared-types";
import { ExternalLink, FileText, Loader2, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReport } from "@/features/reports/hooks/use-reports";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { EvidenceDetail, EvidenceEditor } from "./research-evidence-detail";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../research-evidence.css";

export interface TaskArtifactPreview {
  link: WorkspaceLink;
  href: string;
}

const POPUP_ARTIFACT_KINDS = new Set<WorkspaceLink["kind"]>(["EVIDENCE", "REPORT"]);

export function isTaskArtifactPopupKind(kind: WorkspaceLink["kind"]): boolean {
  return POPUP_ARTIFACT_KINDS.has(kind);
}

export function TaskArtifactPreviewDialog({
  projectId,
  readOnly,
  artifact,
  onClose,
}: {
  projectId: string;
  readOnly: boolean;
  artifact: TaskArtifactPreview | null;
  onClose: () => void;
}) {
  const kind = artifact?.link.kind;

  return (
    <Dialog open={Boolean(artifact)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88dvh] flex flex-col overflow-hidden" closeLabel="Đóng">
        {artifact && kind === "EVIDENCE" ? (
          <EvidencePreviewBody
            projectId={projectId}
            evidenceId={artifact.link.id}
            href={artifact.href}
            readOnly={readOnly}
          />
        ) : artifact && kind === "REPORT" ? (
          <ReportPreviewBody reportId={artifact.link.id} href={artifact.href} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EvidencePreviewBody({
  projectId,
  evidenceId,
  href,
  readOnly,
}: {
  projectId: string;
  evidenceId: string;
  href: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<ProjectEvidence | null>(null);
  useEffect(() => { setEditing(null); }, [evidenceId]);
  const evidence = useResearchResource(
    projectId,
    ["evidence", evidenceId],
    () => researchApi.evidence(projectId, { itemId: evidenceId, page: 1 }),
    Boolean(evidenceId),
  );

  return (
    <>
      <DialogHeader className="text-left pr-6 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span>Bằng chứng nghiên cứu</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Xem và đối chiếu chi tiết trích xuất ngay trên danh sách công việc.
            </DialogDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <span>Mở trang mới</span>
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {editing ? (
          <EvidenceEditor
            key={editing.id}
            projectId={projectId}
            item={editing}
            onClose={() => setEditing(null)}
          />
        ) : evidence.isLoading ? (
          <WorkspaceLoading />
        ) : evidence.isError ? (
          <WorkspaceError error={evidence.error} retry={() => void evidence.refetch()} />
        ) : evidence.data?.legacyGapId ? (
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <p className="text-muted-foreground m-0">Bản ghi này thuộc khoảng trống nghiên cứu gốc.</p>
            <Link
              className="research-source-link inline-flex items-center gap-1"
              to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&gap=${encodeURIComponent(evidence.data.legacyGapId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Mở bản ghi bằng chứng gốc</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : evidence.data?.items.length ? (
          evidence.data.items.map(item => (
            <EvidenceDetail
              key={item.id}
              projectId={projectId}
              item={item}
              readOnly={readOnly}
              onEdit={() => setEditing(item)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Không tìm thấy nội dung bằng chứng hoặc bạn không còn quyền truy cập.
          </p>
        )}
      </div>
    </>
  );
}

function ReportPreviewBody({ reportId, href }: { reportId: string; href: string }) {
  const { data: report, isLoading, isError, refetch } = useReport(reportId);
  const title = report?.topic || report?.query || "Báo cáo nghiên cứu";

  return (
    <>
      <DialogHeader className="text-left pr-6 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">{title}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Xem nhanh nội dung báo cáo hoặc mở ở tab mới để xem đầy đủ.
            </DialogDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              <span>Mở trang báo cáo</span>
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Đang tải báo cáo…</span>
          </div>
        ) : isError ? (
          <div className="rounded-lg border p-4 text-sm space-y-3">
            <p className="text-destructive m-0">Không thể tải nội dung xem trước của báo cáo.</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                Thử lại
              </Button>
              <Button type="button" size="sm" variant="ghost" asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">Mở ở tab mới</a>
              </Button>
            </div>
          </div>
        ) : report?.status === "queued" || report?.status === "generating" ? (
          <div className="py-10 flex flex-col items-center justify-center text-muted-foreground gap-2 text-sm text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="font-medium text-foreground m-0">Báo cáo đang được tạo…</p>
            <p className="text-xs m-0">Nội dung sẽ tự động cập nhật khi hoàn tất.</p>
          </div>
        ) : report?.status === "failed" ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {report.errorMessage || "Quá trình tạo báo cáo gặp lỗi."}
          </div>
        ) : report?.markdown ? (
          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none py-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Báo cáo chưa có nội dung hiển thị.
          </p>
        )}
      </div>
    </>
  );
}
