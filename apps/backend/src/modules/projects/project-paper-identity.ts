import type { WorkspaceDb } from "./workspace-access.js";

export const normalizeProjectDoi = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");

/** Project lock must be held by the caller so two different providers cannot race. */
export async function projectPaperWithDoi(tx: WorkspaceDb, projectId: string, doi: string) {
  const rows = await tx.$queryRaw<{ paper_id: string }[]>`
    SELECT pp.paper_id FROM project_papers pp JOIN papers p ON p.id=pp.paper_id
    WHERE pp.project_id=${projectId}::uuid
      AND lower(regexp_replace(regexp_replace(btrim(p.doi), '^https?://(dx[.])?doi[.]org/', '', 'i'), '^doi:[[:space:]]*', '', 'i'))=${normalizeProjectDoi(doi)}
    LIMIT 1`;
  return rows[0]?.paper_id ?? null;
}
