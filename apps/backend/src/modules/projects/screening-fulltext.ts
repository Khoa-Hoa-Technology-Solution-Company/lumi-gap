import type { WorkspaceContext } from "./workspace-access.js";

/** A DOI/landing page is not proof that full text is available. */
export async function screeningFullTextAvailable(c: WorkspaceContext, paperId: string) {
  const [paper, files] = await Promise.all([
    c.tx.paper.findUnique({ where: { id: paperId }, select: { pdfPath: true, openAccessUrl: true } }),
    c.tx.projectPaperFile.count({ where: { projectId: c.project.id, paperId } }),
  ]);
  return Boolean(paper?.pdfPath || paper?.openAccessUrl || files);
}

export async function screeningExclusionEvidence(c: WorkspaceContext, paperId: string, phase: string) {
  if (phase === "FULL_TEXT") return screeningFullTextAvailable(c, paperId);
  const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: paperId }, select: { abstractText: true } });
  return Boolean(paper.abstractText?.trim()) || screeningFullTextAvailable(c, paperId);
}
