import type { Bookmark } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import type { CreateBookmarkInput, UpdateBookmarkInput } from "./dto/bookmark.schema.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";

export const bookmarkService = {
  async create(userId: string, input: CreateBookmarkInput): Promise<Bookmark> {
    {
      const prisma = getPrisma();
      const user = await postgresRecord("user", userId);
      if (!user) throw AppError.unauthorized();
      const target = await postgresRecord(input.targetKind, input.targetId);
      if (!target) throw AppError.notFound(input.targetKind === "paper" ? "Paper not found" : "Report not found");
      const where = input.targetKind === "paper"
        ? { userId: user.id, paperId: target.id }
        : { userId: user.id, reportId: target.id };
      if (await prisma.bookmark.findFirst({ where, select: { id: true } })) {
        throw AppError.conflict("Item is already bookmarked");
      }
      const bookmark = await prisma.bookmark.create({
        data: {
          userId: user.id,
          paperId: input.targetKind === "paper" ? target.id : undefined,
          reportId: input.targetKind === "report" ? target.id : undefined,
          note: input.note?.trim() || null,
        },
      });
      return postgresBookmarkDto(bookmark, user, input.targetKind, target);
    }
  },

  async delete(userId: string, id: string): Promise<void> {
    {
      const prisma = getPrisma();
      const [user, parsed] = [await postgresRecord("user", userId), parseDatabaseId(id)];
      if (!user) throw AppError.unauthorized();
      if (!parsed) throw AppError.notFound("Bookmark not found");
      const bookmark = await prisma.bookmark.findUnique({
        where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      });
      if (!bookmark) throw AppError.notFound("Bookmark not found");
      if (bookmark.userId !== user.id) throw AppError.forbidden("You do not own this bookmark");
      await prisma.bookmark.delete({ where: { id: bookmark.id } });
      return;
    }
  },

  async list(userId: string): Promise<Bookmark[]> {
    {
      const user = await postgresRecord("user", userId);
      if (!user) return [];
      const prisma = getPrisma();
      const docs = await prisma.bookmark.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      const results: Bookmark[] = [];
      for (const doc of docs) {
        const kind = doc.paperId ? "paper" as const : "report" as const;
        const target = doc.paperId
          ? await prisma.paper.findUnique({ where: { id: doc.paperId }, select: { id: true, legacyMongoId: true } })
          : doc.reportId
            ? await prisma.report.findUnique({ where: { id: doc.reportId }, select: { id: true, legacyMongoId: true } })
            : null;
        if (target) results.push(postgresBookmarkDto(doc, user, kind, target));
      }
      return results;
    }
  },

  async updateNote(userId: string, id: string, input: UpdateBookmarkInput): Promise<Bookmark> {
    {
      const prisma = getPrisma();
      const [user, parsed] = [await postgresRecord("user", userId), parseDatabaseId(id)];
      if (!user) throw AppError.unauthorized();
      if (!parsed) throw AppError.notFound("Bookmark not found");
      const bookmark = await prisma.bookmark.findUnique({
        where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      });
      if (!bookmark) throw AppError.notFound("Bookmark not found");
      if (bookmark.userId !== user.id) throw AppError.forbidden("You do not own this bookmark");
      const updated = await prisma.bookmark.update({
        where: { id: bookmark.id },
        data: { note: input.note === undefined ? undefined : input.note?.trim() || null },
      });
      const kind = updated.paperId ? "paper" as const : "report" as const;
      const target = updated.paperId
        ? await prisma.paper.findUnique({ where: { id: updated.paperId }, select: { id: true, legacyMongoId: true } })
        : updated.reportId
          ? await prisma.report.findUnique({ where: { id: updated.reportId }, select: { id: true, legacyMongoId: true } })
          : null;
      if (!target) throw AppError.internal("Failed to load updated bookmark");
      return postgresBookmarkDto(updated, user, kind, target);
    }
  },

  async checkStatus(userId: string, targetKind: "paper" | "report", targetId: string): Promise<{ bookmarked: boolean; bookmarkId?: string }> {
    {
      const [user, target] = await Promise.all([postgresRecord("user", userId), postgresRecord(targetKind, targetId)]);
      if (!user || !target) return { bookmarked: false };
      const existing = await getPrisma().bookmark.findFirst({
        where: targetKind === "paper"
          ? { userId: user.id, paperId: target.id }
          : { userId: user.id, reportId: target.id },
        select: { id: true, legacyMongoId: true },
      });
      return existing ? { bookmarked: true, bookmarkId: publicDatabaseId(existing) } : { bookmarked: false };
    }
  }
};

async function postgresRecord(kind: "user" | "paper" | "report", value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) return null;
  const where = parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
  if (kind === "user") return getPrisma().user.findUnique({ where, select: { id: true, legacyMongoId: true } });
  if (kind === "paper") return getPrisma().paper.findUnique({ where, select: { id: true, legacyMongoId: true } });
  return getPrisma().report.findUnique({ where, select: { id: true, legacyMongoId: true } });
}

function postgresBookmarkDto(
  bookmark: { id: string; legacyMongoId: string | null; note: string | null; createdAt: Date; updatedAt: Date },
  user: { id: string; legacyMongoId: string | null },
  targetKind: "paper" | "report",
  target: { id: string; legacyMongoId: string | null },
): Bookmark {
  return {
    id: publicDatabaseId(bookmark),
    userId: publicDatabaseId(user),
    targetKind,
    targetId: publicDatabaseId(target),
    note: bookmark.note,
    createdAt: bookmark.createdAt.toISOString(),
    updatedAt: bookmark.updatedAt.toISOString(),
  };
}
