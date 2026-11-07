import { Prisma } from "../../generated/prisma/client.js";
import type { WorkspaceContext } from "./workspace-access.js";

/** Submitted ballots lock the original proposal, including inactive rounds and revisions. */
export async function reviewedProposalPapers(c: WorkspaceContext, paperIds: string[]) {
  if (!paperIds.length) return new Set<string>();
  const rows = await c.tx.$queryRaw<{ paperId: string }[]>`
    SELECT DISTINCT r.paper_id AS "paperId"
    FROM screening_rounds r
    JOIN screening_assignments a ON a.round_id = r.id AND a.project_id = r.project_id
    JOIN screening_reviews v ON v.assignment_id = a.id AND v.project_id = a.project_id
    WHERE r.project_id = ${c.project.id}::uuid
      AND r.paper_id IN (${Prisma.join(paperIds.map(id => Prisma.sql`${id}::uuid`))})
    UNION
    SELECT paper_id AS "paperId" FROM project_screening_decisions
    WHERE project_id = ${c.project.id}::uuid AND decision <> 'UNDECIDED'
      AND paper_id IN (${Prisma.join(paperIds.map(id => Prisma.sql`${id}::uuid`))})
  `;
  return new Set(rows.map(row => row.paperId));
}
