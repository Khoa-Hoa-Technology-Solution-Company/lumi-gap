import { notificationService } from "../notifications/notification.service.js";
import type { WorkspaceContext } from "./workspace-access.js";

export async function contributionsNotify(context: WorkspaceContext, recipients: string[], event: string, entityId: string, version: number, allocation = false) {
  for (const userId of new Set(recipients)) {
    if (userId === context.actorId) continue;
    await notificationService.create({ userId, type: allocation ? "PROJECT_ALLOCATION_UPDATE" : "PROJECT_CONTRIBUTION_UPDATE", title: "Cập nhật đóng góp", message: "Có nội dung cần xem hoặc xác nhận trong mục Đóng góp.", targetKind: "project", targetId: context.project.id, eventKey: `CONTRIBUTIONS:${event}:${entityId}:${version}:${userId}`, emailStatus: "PENDING", emailPayload: { projectId: context.project.id, entityId, allocation } }, context.tx);
  }
}
