import type { WorkspaceContext } from "./workspace-access.js";
import { screeningPeople } from "./screening-assignments.js";
import { notificationService } from "../notifications/notification.service.js";

/** Called only after an authorized comment is saved, in the same transaction. */
export async function notifyScreeningDiscussion(c: WorkspaceContext, roundId: string, messageId: string) {
  const round = await c.tx.screeningRound.findFirstOrThrow({ where: { id: roundId, projectId: c.project.id } });
  const [assignments, people, paper] = await Promise.all([
    c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId, active: true, submittedAt: { not: null }, reviewerId: { not: c.actorId } }, select: { reviewerId: true } }),
    screeningPeople(c),
    c.tx.paper.findUnique({ where: { id: round.paperId }, select: { title: true } }),
  ]);
  const eligible = new Set(people.map(p => p.id));
  const sender = people.find(p => p.id === c.actorId)?.name ?? "Reviewer còn lại";
  for (const userId of new Set(assignments.map(a => a.reviewerId).filter(id => eligible.has(id)))) {
    await notificationService.create({
      userId, type: "SCREENING_DISCUSSION_MESSAGE", paperId: round.paperId,
      title: `${sender} đã gửi trao đổi mới`,
      message: `Mở trao đổi về bài “${(paper?.title ?? "Bài báo").slice(0, 180)}” để xem và phản hồi.`,
      targetKind: "project", targetId: c.project.id,
      eventKey: `SCREENING:${roundId}:DISCUSSION:${messageId}:${userId}`,
      emailPayload: { screeningRoundId: roundId, screeningMessageId: messageId },
      emailStatus: "SKIPPED",
    }, c.tx);
  }
}
