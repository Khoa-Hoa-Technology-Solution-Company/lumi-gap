import { useState } from "react";
import type { ScreeningPhase } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { canLeaveWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";

/** Explicit owner recovery; never rewrite legacy assignments or ballots in place. */
export function LegacyScreeningRepair({ projectId, paperId, phase, canManage }: {
  projectId: string; paperId: string; phase: ScreeningPhase; canManage: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const command = useScreeningCommand(projectId);
  return <section aria-label="Rà soát vòng đánh giá cũ" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-2 dark:border-amber-800 dark:bg-amber-950/20">
    <h4 className="font-semibold">Vòng đánh giá cũ cần rà soát</h4>
    <p role="status">Phân công của vòng cũ chưa đáp ứng quy trình hiện tại. Vòng này chỉ được xem; các phiếu và quyết định cũ được giữ trong lịch sử.</p>
    {canManage ? <>
      <label className="screening-check"><input type="checkbox" checked={confirmed} disabled={command.isPending} onChange={e => setConfirmed(e.target.checked)} />Tạo vòng mới với quy tắc hiện tại, giữ nguyên lịch sử cũ.</label>
      <Button size="sm" variant="outline" disabled={!confirmed || command.isPending} onClick={async () => {
        if (!await canLeaveWorkspace()) return;
        await command.run({ paperId, phase, action: "legacy-reopen" }, clientKey => screeningApi.start(projectId, { paperIds: [paperId], phase, confirmRescreen: true, clientKey }));
      }}>{command.isPending ? "Đang mở vòng mới…" : "Mở vòng mới đã xác nhận"}</Button>
      <ScreeningError error={command.error} />
    </> : <p className="text-muted-foreground">Chủ dự án cần xác nhận mở vòng mới để nhóm tiếp tục đánh giá.</p>}
  </section>;
}
