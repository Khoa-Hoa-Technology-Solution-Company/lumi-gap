import type { WorkspaceContext } from "./workspace-access.js";

export async function screeningPeople(c: WorkspaceContext) {
  const members = await c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } });
  const rows = await c.tx.user.findMany({ where: { id: { in: [c.project.ownerId, ...members.map(m => m.userId)] }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, fullName: true } });
  return rows.map(p => ({ id: p.id, name: p.fullName || "Thành viên" }));
}

export async function effectiveAssignments(c: WorkspaceContext, roundId: string) {
  const [rows, people] = await Promise.all([c.tx.screeningAssignment.findMany({ where: { roundId, projectId: c.project.id, active: true }, orderBy: { reviewerId: "asc" } }), screeningPeople(c)]);
  const active = new Set(people.map(p => p.id));
  // Submitted independent work survives membership changes; unfinished assignments do not count.
  const now = new Date();
  return rows.filter(a => a.submittedAt || (active.has(a.reviewerId) && (!a.dueAt || a.dueAt > now)));
}
