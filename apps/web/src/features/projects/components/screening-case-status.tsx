import { ScreeningStatusBadge } from "./screening-status-badge";
import { screeningStatusTone } from "../screening-status";
import { useState } from "react";
import { Scale, Clock, User } from "lucide-react";
import type { ScreeningRoundView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { adjudicatorRoleLabels, caseStatusLabels } from "./screening-case-controls";
import { ScreeningAdjudicationDialog } from "./screening-adjudication";

export function ScreeningCaseStatus({ projectId, round }: { projectId: string; round: ScreeningRoundView }) {
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const data = round.adjudicationCase;
  if (!data) return null;
  const collecting = data.ready === false && ["COLLECTING", "COI_REVIEW"].includes(data.status);

  return (
    <>
      <section
        aria-label="Hồ sơ phân xử"
        className="screening-tone screening-status-surface rounded-xl border p-3.5 space-y-2.5 text-xs sm:text-sm"
        data-tone={screeningStatusTone({ caseStatus: data.status })}
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-bold text-foreground">
            <Scale size={16} className="screening-status-text" />
            <span>Hồ sơ phân xử</span>
          </h4>
          <ScreeningStatusBadge tone={screeningStatusTone({ caseStatus: data.status })}>
            {caseStatusLabels[data.status] ?? "Đang xử lý hồ sơ"}
          </ScreeningStatusBadge>
        </div>

        <div role="group" aria-label="Người phân xử" className="flex items-start gap-2 rounded-lg bg-background/60 px-3 py-2.5">
          <User size={16} className="screening-status-text mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Người phân xử</p>
            {data.assignedAdjudicator ? (
              <p className="mt-0.5 break-words text-sm text-foreground">
                <strong className="font-semibold">{data.assignedAdjudicator.name}</strong>
                {" · "}{adjudicatorRoleLabels[data.assignedAdjudicator.role ?? ""] ?? (data.assignedAdjudicator.mentor ? "Cố vấn học thuật" : "Người phân xử độc lập")}
              </p>
            ) : <>
              <p className="mt-0.5 text-sm font-medium text-foreground">Chờ phân công</p>
              {["COLLECTING", "WAITING_ASSIGNMENT"].includes(data.status) && <>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{round.adjudicationBlockedReason || "Chưa có người độc lập đủ điều kiện. Chủ dự án cần mời thêm thành viên hoặc cố vấn."}</p>
                {round.canManage && <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline"><a href={`/projects/${encodeURIComponent(projectId)}?tab=members`}>Mời thêm thành viên</a></Button>
                  {!round.adjudicationBlockedReason && <Button asChild size="sm" variant="outline"><a href={`/projects/${encodeURIComponent(projectId)}?tab=support`}>Mời cố vấn</a></Button>}
                </div>}
              </>}
            </>}
          </div>
        </div>

        {data.assignedAdjudicator && round.adjudicationBlockedReason && <p role="status" className="text-xs leading-5 text-muted-foreground">{round.adjudicationBlockedReason}</p>}
        {collecting && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {data.deadline && (
              <p role="status" className="flex items-center gap-1.5 font-medium text-foreground">
                <Clock size={13} className="screening-status-text" />
                <span>Hạn chung: {new Date(data.deadline).toLocaleString("vi-VN")}</span>
              </p>
            )}
            <p className="leading-relaxed">
              Hai reviewer gửi ý kiến riêng trong thời hạn chung. Người phân xử được giao tự động, không cần nhận lời mời. Không phản hồi không đồng nghĩa đồng ý.
            </p>
          </div>
        )}

        <div className="pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDossierOpen(true)}
            className="gap-1.5 font-medium"
          >
            <Scale size={14} />
            <span>Hồ sơ phân xử</span>
          </Button>
        </div>
      </section>

      {isDossierOpen && (
        <ScreeningAdjudicationDialog
          projectId={projectId}
          roundId={round.id}
          caseId={data.id}
          open={isDossierOpen}
          onClose={() => setIsDossierOpen(false)}
        />
      )}
    </>
  );
}
