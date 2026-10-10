import type { Prisma, Project } from "../../generated/prisma/client.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { pageMeta } from "./project-mentorship.service.js";

export interface ContextQuery { section?: "papers" | "gaps" | "reports" | "evidence" | "members"; page?: number; pageSize?: number }
// Called only inside the transaction that validates current team or mentor access.
export async function mentorshipResearchContext(tx: Prisma.TransactionClient, p: Project, query: ContextQuery) {
  const section = query.section ?? "papers", meta = pageMeta(0, query), paging = { take: meta.pageSize, skip: (meta.page - 1) * meta.pageSize };
  const counts = { papers: await tx.projectPaper.count({ where: { projectId: p.id } }), gaps: await tx.researchGap.count({ where: { projectId: p.id } }),
    reports: await tx.report.count({ where: { projectId: p.id } }), members: await tx.projectMember.count({ where: { projectId: p.id, status: "ACTIVE" } }),
    evidence: (await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM gap_evidence_records e JOIN research_gaps g ON g.id=e.gap_id WHERE g.project_id=${p.id}::uuid`)[0]?.n ?? 0n };
  let items: Array<{ id: string; title: string; body: string; detail?: string }> = [];
  if (section === "papers") {
    const links = await tx.projectPaper.findMany({ where: { projectId: p.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...paging });
    const papers = await tx.paper.findMany({ where: { id: { in: links.map(l => l.paperId) } }, select: { id: true, legacyMongoId: true, title: true, abstractText: true, publicationYear: true, doi: true } });
    items = links.flatMap(l => { const paper = papers.find(s => s.id === l.paperId); return paper ? [{ id: publicDatabaseId(paper), title: paper.title, body: [paper.abstractText, l.notes].filter(Boolean).join("\n\n"), detail: [paper.publicationYear, paper.doi, l.screeningStatus, l.readingStatus].filter(Boolean).join(" · ") }] : []; });
  } else if (section === "gaps") {
    const rows = await tx.researchGap.findMany({ where: { projectId: p.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...paging });
    items = rows.map(g => ({ id: publicDatabaseId(g), title: g.title, body: [g.description, g.rationale, g.observedLimitation, g.missingEvidence, g.suggestedResearchQuestion].filter(Boolean).join("\n\n"), detail: `${g.gapType} · ${g.validationStatus}` }));
  } else if (section === "reports") {
    const rows = await tx.report.findMany({ where: { projectId: p.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...paging, select: { id: true, legacyMongoId: true, title: true, topic: true, markdown: true, status: true, artifactStatus: true } });
    items = rows.map(r => ({ id: publicDatabaseId(r), title: r.title ?? r.topic ?? "Research report", body: r.markdown ?? "", detail: `${r.status} · ${r.artifactStatus}` }));
  } else if (section === "members") {
    const members = await tx.projectMember.findMany({ where: { projectId: p.id, status: "ACTIVE" }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], ...paging });
    const users = await tx.user.findMany({ where: { id: { in: members.map(m => m.userId) } }, select: { id: true, legacyMongoId: true, fullName: true } });
    items = members.flatMap(m => { const u = users.find(u => u.id === m.userId); return u ? [{ id: publicDatabaseId(u), title: u.fullName, body: "", detail: m.role }] : []; });
  } else {
    const rows = await tx.$queryRaw<Array<{ id: string; title: string; excerpt: string | null; explanation: string; source_location: string | null }>>`
      SELECT e.id,g.title,e.excerpt,e.explanation,e.source_location FROM gap_evidence_records e JOIN research_gaps g ON g.id=e.gap_id
      WHERE g.project_id=${p.id}::uuid ORDER BY e.created_at DESC,e.id LIMIT ${meta.pageSize} OFFSET ${(meta.page - 1) * meta.pageSize}`;
    items = rows.map(e => ({ id: e.id, title: e.title, body: [e.excerpt, e.explanation].filter(Boolean).join("\n\n"), detail: e.source_location ?? undefined }));
  }
  return { description: p.description ?? "", inclusionCriteria: p.inclusionCriteria, exclusionCriteria: p.exclusionCriteria,
    section, items, counts: { ...counts, evidence: Number(counts.evidence) }, meta: pageMeta(Number(counts[section]), query) };
}
