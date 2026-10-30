import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";
import type { importPaperSchema } from "./dto/project-research.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";
import { withWorkspace, workspaceEvent } from "./workspace-access.js";
import { researchPaper } from "./project-evidence.service.js";
import { projectPaperWithDoi } from "./project-paper-identity.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";

export const projectSourcesService = {
  async import(projectId: string, actorId: string, input: z.infer<typeof importPaperSchema>) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const { tx, project } = context;
      const retry = await tx.projectActivity.findFirst({ where: { projectId: project.id, actorId: context.actorId, type: "PAPER_IMPORTED", entityId: input.clientKey } });
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      if (retry) { const data = retry.metadata as { hash: string; paperId: string }; if (data.hash !== hash) throw AppError.conflict("This import key was used for different metadata"); return { paperId: data.paperId, duplicate: true }; }
      const doi = input.doi?.toLowerCase();
      const existingId = doi ? await projectPaperWithDoi(tx, project.id, doi) : null;
      if (existingId) {
        await workspaceEvent(context, "PAPER_IMPORTED", "IMPORT", input.clientKey, { hash, paperId: existingId, duplicate: true });
        return { paperId: existingId, duplicate: true };
      }
      // Bibliographic metadata shares the existing canonical identity. Private files/notes never do.
      if (doi) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`paper-doi:${doi}`},0))::text`;
      // A title is not a reliable canonical identifier. Never merge distinct DOI-less references by title.
      let paper = doi ? await tx.paper.findUnique({ where: { doi } }) : null;
      if (paper && paper.dataStatus !== "active" && paper.requestedById !== context.actorId && !await tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: project.id, paperId: paper.id } } })) throw AppError.conflict("This DOI cannot be linked automatically; review the reference details");
      const duplicate = Boolean(paper);
      if (!paper) {
          paper = await tx.paper.create({ data: { title: input.title, doi, publicationYear: input.publicationYear ?? 0, journalName: input.journalName, abstractText: input.abstractText, paperLink: input.paperLink, primaryProvider: "user", dataStatus: "draft", paperStatus: "pending", requestedById: context.actorId } });
          for (const [position, name] of input.authors.entries()) {
            const author = await tx.author.create({ data: { displayName: name } });
            await tx.paperAuthor.create({ data: { paperId: paper.id, authorId: author.id, displayName: name, position: position + 1 } });
          }
      }
      await tx.projectPaper.upsert({ where: { projectId_paperId: { projectId: project.id, paperId: paper.id } }, create: { projectId: project.id, paperId: paper.id, addedById: context.actorId, importSource: doi ? "DOI_REFERENCE" : "MANUAL", sourceReference: input.reference || doi || null }, update: {} });
      await workspaceEvent(context, "PAPER_IMPORTED", "IMPORT", input.clientKey, { hash, paperId: paper.id, duplicate }); return { paperId: paper.id, duplicate };
    });
  },
  async organize(projectId: string, actorId: string, paperId: string, input: { tags: string[]; collectionName: string | null; expectedUpdatedAt: string }) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const link = await researchPaper(context, paperId);
      if (link.updatedAt.toISOString() !== input.expectedUpdatedAt) throw AppError.conflict("This source changed. Reload before saving");
      const next = await context.tx.projectPaper.update({ where: { id: link.id }, data: { tags: [...new Set(input.tags)], collectionName: input.collectionName || null, updatedAt: new Date(Math.max(Date.now(), link.updatedAt.getTime() + 1)) } });
      await workspaceEvent(context, "PAPER_ORGANIZED", "PAPER", paperId); return next;
    });
  },
  async upload(projectId: string, actorId: string, paperId: string, buffer: Buffer) {
    if (buffer.length > 10 * 1024 * 1024) throw AppError.badRequest("PDF limit is 10 MiB"); assertPdfMagic(buffer);
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      await researchPaper(context, paperId);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const prior = await context.tx.projectPaperFile.findUnique({ where: { projectId_paperId_sha256: { projectId: context.project.id, paperId, sha256 } }, select: { id: true, sha256: true, byteSize: true } }); if (prior) return prior;
      const size = await context.tx.projectPaperFile.aggregate({ where: { projectId: context.project.id }, _sum: { byteSize: true } });
      if ((size._sum.byteSize ?? 0) + buffer.length > 100 * 1024 * 1024) throw AppError.conflict("This project's private source storage has reached 100 MiB");
      const row = await context.tx.projectPaperFile.create({ data: { id: randomUUID(), projectId: context.project.id, paperId, uploadedById: context.actorId, content: new Uint8Array(buffer), sha256, byteSize: buffer.length }, select: { id: true, sha256: true, byteSize: true } });
      await workspaceEvent(context, "PRIVATE_SOURCE_UPLOADED", "PAPER", paperId);
      await researchLedgerService.record({ tx: context.tx, projectId: context.project.id, actorId: context.actorId, eventType: "PRIVATE_SOURCE_UPLOADED", resourceKind: "PROJECT_PAPER_FILE", resourceId: row.id, checksumSha256: sha256, visibility: "PROJECT_TEAM", retentionClass: "SECURITY_AUDIT", metadata: { paperId, byteSize: buffer.length } });
      return row;
    });
  },
  async file(projectId: string, actorId: string, id: string) {
    return withWorkspace(projectId, actorId, {}, async context => { const row = await context.tx.projectPaperFile.findFirst({ where: { id, projectId: context.project.id } }); if (!row) throw AppError.notFound("Private source not found"); return row; });
  },
};
