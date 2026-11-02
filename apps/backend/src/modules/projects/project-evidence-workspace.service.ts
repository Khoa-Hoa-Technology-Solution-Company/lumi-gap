import type { EvidenceOverviewEntry, PlanQuestion, ResearchSynthesisWorkspace } from "@trend/shared-types";
import type { z } from "zod";
import type { evidenceWorkspaceSchema } from "./dto/project-research.schema.js";
import { withWorkspace } from "./workspace-access.js";
import { evidenceEligibility } from "./evidence-eligibility.js";
import { evidenceScope, evidenceStatus, extractionQuestions, evidenceSourceChanged } from "./evidence-presentation.js";

/** Pagination is by project paper, never by extraction. No source text enters the overview. */
export const projectEvidenceWorkspaceService = {
  async get(projectId: string, actorId: string, query: z.infer<typeof evidenceWorkspaceSchema>): Promise<ResearchSynthesisWorkspace> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const [eligibility, links, rows, plan] = await Promise.all([
        evidenceEligibility(tx, project.id),
        tx.projectPaper.findMany({ where: { projectId: project.id }, select: { paperId: true, tags: true } }),
        tx.projectEvidenceItem.findMany({ where: { projectId: project.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }),
        tx.researchPlan.findUnique({ where: { projectId: project.id }, select: { questions: true } }),
      ]);
      const questions = (Array.isArray(plan?.questions) ? plan.questions : []) as unknown as PlanQuestion[];
      const [papers, revisions, documents] = await Promise.all([
        tx.paper.findMany({ where: { id: { in: links.map(link => link.paperId) } }, select: { id: true, title: true, doi: true, publicationYear: true, abstractText: true, pdfPath: true, openAccessUrl: true, uploadedAt: true } }),
        tx.projectWorkspaceRevision.findMany({ where: { projectId: project.id, entityKind: "EXTRACTION", entityId: { in: rows.map(row => row.id) } }, select: { id: true, entityId: true } }),
        tx.paperDocument.findMany({ where: { paperId: { in: links.map(link => link.paperId) } }, select: { paperId: true, status: true, contentHash: true, sourceHash: true } }),
      ]);
      const paperById = new Map(papers.map(paper => [paper.id, paper]));
      const documentByPaper = new Map(documents.map(document => [document.paperId, document]));
      const revisionIds = new Map<string, Set<string>>();
      for (const revision of revisions) { const ids = revisionIds.get(revision.entityId) ?? new Set<string>(); ids.add(revision.id); revisionIds.set(revision.entityId, ids); }
      const byPaper = new Map<string, Array<typeof rows[number] & { relatedQuestions: Array<{ id: string; text: string }>; verificationStatus: NonNullable<EvidenceOverviewEntry["verificationStatus"]> }>>();
      for (const row of rows) {
        const entries = byPaper.get(row.paperId) ?? [];
        entries.push({ ...row, relatedQuestions: extractionQuestions(row.sourceSnapshot as Record<string, unknown>, questions, revisionIds.get(row.id) ?? new Set()), verificationStatus: evidenceStatus(row, !eligibility.get(row.paperId)?.eligible || evidenceSourceChanged(row.sourceSnapshot as Record<string, unknown>, paperById.get(row.paperId), documentByPaper.get(row.paperId))) });
        byPaper.set(row.paperId, entries);
      }
      const themes = [...new Set([...links.flatMap(link => link.tags), ...rows.flatMap(row => row.themes)])].sort();
      const needle = query.q.toLocaleLowerCase();
      const items = links.flatMap(link => {
        const paper = paperById.get(link.paperId), access = eligibility.get(link.paperId);
        if (!paper || !access || query.paperId && paper.id !== query.paperId || query.eligibility === "ELIGIBLE" && !access.eligible) return [];
        const entries = byPaper.get(link.paperId) ?? [];
        const matching = entries.filter(row => (!query.questionId || row.relatedQuestions.some(question => question.id === query.questionId)) && (!query.status || row.verificationStatus === query.status) && (!query.theme || link.tags.includes(query.theme) || row.themes.includes(query.theme)));
        if ((query.questionId || query.status) && !matching.length) return [];
        if (query.theme && !link.tags.includes(query.theme) && !matching.length) return [];
        if (needle && ![paper.title, paper.doi ?? "", ...link.tags, ...matching.flatMap(row => [row.claim, row.methodology, row.results, row.limitations, row.context, row.population, row.quotation, ...row.themes])].some(value => value.toLocaleLowerCase().includes(needle))) return [];
        const selected = [...matching].sort((a, b) => Number(b.verificationStatus === "VERIFIED") - Number(a.verificationStatus === "VERIFIED"));
        const compact = (value: string) => value.length > 180 ? `${value.slice(0, 177)}…` : value;
        return [{ paperId: paper.id, title: paper.title, doi: paper.doi, publicationYear: paper.publicationYear || null, ...access,
          extractionCount: entries.length, verifiedCount: entries.filter(row => row.verificationStatus === "VERIFIED").length,
          themes: [...new Set([...link.tags, ...entries.flatMap(row => row.themes)])],
          questions: questions.filter(question => entries.some(row => row.relatedQuestions.some(related => related.id === question.id))).map(({ id, text }) => ({ id, text })),
          entries: selected.filter((row, index) => index === 0 || row.relatedQuestions.some(question => selected.findIndex(entry => entry.relatedQuestions.some(related => related.id === question.id)) === index)).map(row => ({ id: row.id, version: row.version, origin: row.origin as "HUMAN" | "AI_SUGGESTED", reviewState: row.reviewState as EvidenceOverviewEntry["reviewState"], claim: compact(row.claim), methodology: compact(row.methodology), results: compact(row.results), limitations: compact(row.limitations), themes: row.themes, relatedQuestions: row.relatedQuestions, verificationStatus: row.verificationStatus, sourceScope: evidenceScope(row.sourceSnapshot as Record<string, unknown>) })),
        }];
      }).sort((a, b) => a.title.localeCompare(b.title) || a.paperId.localeCompare(b.paperId));
      const total = items.length;
      return { items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), questions: questions.map(({ id, text }) => ({ id, text })), themes, total, page: query.page, pageSize: query.pageSize, hasNext: query.page * query.pageSize < total };
    });
  },
};
