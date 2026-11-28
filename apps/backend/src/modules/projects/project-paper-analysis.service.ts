import type { PaperAiAnalysis, PaperTopic, ProjectPaperAnalysis, ProjectScreeningStatus } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import { withWorkspace, workspaceId } from "./workspace-access.js";
import { buildPaperReadingSources, evaluatePaperFullTextStatus } from "./screening-fulltext.js";

async function source(projectId: string, actorId: string, paperId: string, write = false) {
  return withWorkspace(projectId, actorId, { write }, async context => {
    const paper = await context.tx.paper.findUnique({ where: workspaceId(paperId) });
    if (!paper || paper.dataStatus !== "active") throw AppError.notFound("Project source not found");
    const link = await context.tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: context.project.id, paperId: paper.id } } });
    if (!link) throw AppError.notFound("Project source not found");
    return { paper, link, actorId: context.actorId };
  });
}

export const projectPaperAnalysisService = {
  async get(projectId: string, actorId: string, paperId: string): Promise<ProjectPaperAnalysis> {
    const { paper, link } = await source(projectId, actorId, paperId);
    const [knowledge, metadata] = await Promise.all([
      knowledgeService.get(publicDatabaseId(paper)),
      withWorkspace(projectId, actorId, {}, async c => {
        const [authors, keywords, topics, projectFiles, translations] = await Promise.all([
          c.tx.paperAuthor.findMany({ where: { paperId: paper.id }, orderBy: { position: "asc" }, select: { displayName: true } }),
          c.tx.paperKeyword.findMany({ where: { paperId: paper.id }, orderBy: { position: "asc" }, select: { keywordName: true } }),
          c.tx.paperTopic.findMany({
            where: { paperId: paper.id },
            orderBy: { position: "asc" },
            select: {
              topicId: true, openalexTopicId: true, topicName: true, detectedBy: true, confidence: true, isPrimary: true,
              subfieldId: true, subfieldName: true, fieldId: true, fieldName: true, domainId: true, domainName: true,
            },
          }),
          c.tx.projectPaperFile.findMany({
            where: { projectId: c.project.id, paperId: paper.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, sha256: true, byteSize: true, createdAt: true, uploadedById: true },
          }),
          c.tx.paperTranslation.findMany({
            where: { paperId: paper.id },
            orderBy: { updatedAt: "desc" },
            take: 6,
            select: { targetLanguage: true, sourceLanguage: true, translatedTitle: true, translatedAbstract: true, provider: true, updatedAt: true },
          }),
        ]);
        const uploaderIds = [...new Set(projectFiles.map(f => f.uploadedById).filter(Boolean))];
        const uploaders = uploaderIds.length
          ? await c.tx.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, fullName: true } })
          : [];
        const uploaderMap = new Map(uploaders.map(u => [u.id, u.fullName]));
        return {
          authors: authors.map(a => a.displayName),
          keywords: keywords.map(k => k.keywordName),
          topics: topics.map(t => ({
            topicId: t.topicId ?? undefined,
            openalexTopicId: t.openalexTopicId ?? undefined,
            topicName: t.topicName,
            detectedBy: t.detectedBy as PaperTopic["detectedBy"],
            confidence: t.confidence ?? undefined,
            isPrimary: t.isPrimary,
            subfieldId: t.subfieldId ?? undefined,
            subfieldName: t.subfieldName ?? undefined,
            fieldId: t.fieldId ?? undefined,
            fieldName: t.fieldName ?? undefined,
            domainId: t.domainId ?? undefined,
            domainName: t.domainName ?? undefined,
          })),
          projectFiles: projectFiles.map(f => ({
            id: f.id,
            sha256: f.sha256,
            byteSize: f.byteSize,
            createdAt: f.createdAt.toISOString(),
            uploadedByName: uploaderMap.get(f.uploadedById) ?? undefined,
          })),
          cachedTranslations: translations.map(tr => ({
            targetLanguage: tr.targetLanguage,
            sourceLanguage: tr.sourceLanguage,
            translatedTitle: tr.translatedTitle,
            translatedAbstract: tr.translatedAbstract,
            provider: tr.provider,
            updatedAt: tr.updatedAt.toISOString(),
          })),
        };
      }),
    ]);

    const ftState = evaluatePaperFullTextStatus({
      pdfPath: paper.pdfPath,
      paperStatus: paper.paperStatus,
      openAccessUrl: paper.openAccessUrl,
      paperLink: paper.paperLink,
      projectFileCount: metadata.projectFiles.length,
    });

    const sources = buildPaperReadingSources({
      id: publicDatabaseId(paper),
      doi: paper.doi,
      abstractText: paper.abstractText,
      pdfPath: paper.pdfPath,
      paperStatus: paper.paperStatus,
      openAccessUrl: paper.openAccessUrl,
      openAccessStatus: paper.openAccessStatus,
      paperLink: paper.paperLink,
      licenseName: paper.licenseName,
      primaryProvider: paper.primaryProvider,
      journalName: paper.journalName,
      paperKind: paper.paperKind,
      downloadCost: paper.downloadCost,
      updatedAt: paper.updatedAt,
      projectFiles: metadata.projectFiles,
    });

    return {
      paperId: paper.id,
      title: paper.title,
      screeningStatus: link.screeningStatus as ProjectScreeningStatus,
      analysis: paper.aiAnalysis as unknown as PaperAiAnalysis | null,
      knowledge,
      authors: metadata.authors,
      publicationYear: paper.publicationYear || null,
      journalName: paper.journalName ?? null,
      doi: paper.doi ?? null,
      abstractText: paper.abstractText ?? null,
      paperLink: paper.paperLink ?? paper.openAccessUrl ?? null,
      fullTextAvailable: ftState.fullTextAvailable,
      fullTextStatus: ftState.fullTextStatus,
      sources,
      projectFiles: metadata.projectFiles,
      corpusPdf: {
        available: Boolean(paper.pdfPath && paper.paperStatus === "downloaded"),
        paperStatus: paper.paperStatus,
        requiresEntitlement: Boolean(paper.pdfPath && (paper.downloadCost ?? 0) > 0),
        downloadCost: paper.downloadCost ?? null,
      },
      bibliographic: {
        openalexId: paper.openalexId ?? null,
        arxivId: paper.arxivId ?? null,
        pubmedId: paper.pubmedId ?? null,
        language: paper.language ?? null,
        paperKind: paper.paperKind ?? null,
        primaryProvider: paper.primaryProvider ?? null,
        openAccessStatus: paper.openAccessStatus ?? null,
        openAccessUrl: paper.openAccessUrl ?? null,
        licenseName: paper.licenseName ?? null,
        citationCount: paper.citationCount ?? 0,
        fwci: paper.fwci ?? null,
        referencedWorksCount: paper.referencedWorks?.length ?? 0,
        relatedWorksCount: paper.relatedWorksCount ?? 0,
        keywords: metadata.keywords,
        topics: metadata.topics,
        dataQualityScore: paper.dataQualityScore ?? 0,
        metadataUpdatedAt: paper.updatedAt.toISOString(),
      },
      cachedTranslations: metadata.cachedTranslations,
    };
  },
  async request(projectId: string, actorId: string, paperId: string) {
    const current = await source(projectId, actorId, paperId, true);
    // Private project attachments are never passed to the shared paper index.
    return knowledgeService.requestIndex(publicDatabaseId(current.paper), true, current.actorId);
  },
};
