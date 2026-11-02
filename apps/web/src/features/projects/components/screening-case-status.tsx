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
  const collecting = data.ready === false && ["COLLECTING"].includes(data.status);

  return (
    <>
      <section
        aria-label="Hồ sơ phân xử"
        className="rounded-xl border border-purple-200/80 bg-purple-50/40 p-3.5 space-y-2.5 text-xs sm:text-sm dark:border-purple-900/50 dark:bg-purple-950/20"
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-bold text-foreground">
            <Scale size={16} className="text-purple-600 dark:text-purple-400" />
            <span>Hồ sơ phân xử</span>
          </h4>
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950/80 dark:text-purple-300">
            {caseStatusLabels[data.status] ?? "Đang xử lý hồ sơ"}
          </span>
        </div>

        {collecting && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {data.deadline && (
              <p role="status" className="flex items-center gap-1.5 font-medium text-foreground">
                <Clock size={13} className="text-purple-600 dark:text-purple-400" />
                <span>Hạn chung: {new Date(data.deadline).toLocaleString("vi-VN")}</span>
              </p>
            )}
            <p className="leading-relaxed">
              Mỗi reviewer bổ sung ý kiến riêng hoặc sử dụng ý kiến đã ghi. Không phản hồi không đồng nghĩa đồng ý.
            </p>
          </div>
        )}

        {data.assignedAdjudicator && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User size={13} className="text-purple-600 dark:text-purple-400" />
            <span>
              {data.assignedAdjudicator.name} · {adjudicatorRoleLabels[data.assignedAdjudicator.role ?? ""] ?? (data.assignedAdjudicator.mentor ? "Cố vấn học thuật" : "Người phân xử độc lập")}
            </span>
          </p>
        )}

        <div className="pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDossierOpen(true)}
            className="gap-1.5 font-medium border-purple-300 text-purple-900 hover:bg-purple-100/70 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950/50"
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