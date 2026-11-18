import type { ProjectChatReference, ProjectChatReferenceCard } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, type WorkspaceContext } from "./workspace-access.js";

/** Uses the same team-only boundary as manuscripts/tasks. A reference is not a grant. */
export async function chatReferenceChoices(c: WorkspaceContext, kind: ProjectChatReference["kind"], q = "", page = 1, exactId?: string): Promise<ProjectChatReferenceCard[]> {
  const { tx, project } = c;
  const base = `/projects/${project.id}`;
  const pagination: { take?: number; skip?: number } = exactId ? {} : { take: 30, skip: (page - 1) * 30 };
  if (kind === "PAPER") {
    const links = await tx.projectPaper.findMany({ where: { projectId: project.id, ...(exactId ? { paperId: exactId } : {}) }, select: { paperId: true } });
    const rows = await tx.paper.findMany({ where: { id: { in: links.map(r => r.paperId) }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) }, orderBy: [{ title: "asc" }, { id: "asc" }], ...pagination, select: { id: true, title: true, publicationYear: true } });
    const authors = await tx.paperAuthor.findMany({ where: { paperId: { in: rows.map(r => r.id) } }, orderBy: { position: "asc" }, select: { paperId: true, displayName: true } });
    return rows.map(r => ({ kind, id: r.id, title: r.title, subtitle: [authors.filter(a => a.paperId === r.id).slice(0, 2).map(a => a.displayName).join(", "), r.publicationYear].filter(Boolean).join(" · "), href: `${base}?tab=papers&paper=${r.id}` }));
  }
  if (kind === "TASK") {
    const rows = await tx.projectTask.findMany({ where: { projectId: project.id, deletedAt: null, ...(exactId ? { id: exactId } : {}), ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], ...pagination });
    const users = await tx.user.findMany({ where: { id: { in: rows.flatMap(r => r.assigneeId ? [r.assigneeId] : []) } }, select: { id: true, fullName: true } });
    return rows.map(r => ({ kind, id: r.id, title: r.title, status: r.status, subtitle: users.find(u => u.id === r.assigneeId)?.fullName, href: `${base}?tab=tasks&task=${r.id}` }));
  }
  if (kind === "MANUSCRIPT_SNAPSHOT") {
    const drafts = await tx.draftWorkspace.findMany({ where: { projectId: project.id, deletedAt: null, writingMode: "LATEX", ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, name: true, archivedAt: true } });
    const rows = await tx.manuscriptSnapshot.findMany({ where: { projectId: project.id, workspaceId: { in: drafts.map(d => d.id) }, ...(exactId ? { id: exactId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...pagination, select: { id: true, workspaceId: true, label: true, sourceVersion: true } });
    return rows.map(r => ({ kind, id: r.id, title: drafts.find(d => d.id === r.workspaceId)!.name, subtitle: r.label, version: r.sourceVersion, status: drafts.find(d => d.id === r.workspaceId)!.archivedAt ? "ARCHIVED" : "SNAPSHOT", href: `${base}/manuscripts/${r.workspaceId}?snapshot=${r.id}` }));
  }
  const submissions = await tx.submission.findMany({ where: { projectId: project.id, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, title: true, status: true } });
  const rows = await tx.submissionRevision.findMany({ where: { submissionId: { in: submissions.map(s => s.id) }, ...(exactId ? { id: exactId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...pagination, select: { id: true, submissionId: true, revisionNumber: true } });
  return rows.map(r => ({ kind, id: r.id, title: submissions.find(s => s.id === r.submissionId)!.title, version: r.revisionNumber, status: submissions.find(s => s.id === r.submissionId)!.status, href: `${base}?tab=submissions&submission=${r.submissionId}&revision=${r.id}` }));
}

export async function assertChatReference(c: WorkspaceContext, ref: ProjectChatReference) {
  const result = (await chatReferenceChoices(c, ref.kind, "", 1, ref.id))[0];
  if (!result) throw AppError.notFound("Research reference is unavailable");
  return result;
}
export const projectChatReferences = {
  list: (projectId: string, actorId: string, kind: ProjectChatReference["kind"], q: string, page: number) => withWorkspace(projectId, actorId, {}, c => chatReferenceChoices(c, kind, q, page)),
  resolve: (projectId: string, actorId: string, ref: ProjectChatReference) => withWorkspace(projectId, actorId, {}, c => assertChatReference(c, ref)),
};
