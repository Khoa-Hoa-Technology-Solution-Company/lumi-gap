import type { Bookmark } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { BookmarkModel, type BookmarkDoc } from "./models/bookmark.model.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { presentPaperDetail } from "../papers/paper.presenter.js";
import { ReportModel } from "../reports/models/report.model.js";
import type { CreateBookmarkInput, UpdateBookmarkInput } from "./dto/bookmark.schema.js";

export const bookmarkService = {
  async create(userId: string, input: CreateBookmarkInput): Promise<Bookmark> {
    // 1. Verify target exists
    if (input.targetKind === "paper") {
      const paper = await PaperModel.findOne({ _id: input.targetId, dataStatus: "active" });
      if (!paper) throw AppError.notFound("Paper not found");
    } else if (input.targetKind === "report") {
      const report = await ReportModel.findById(input.targetId);
      if (!report) throw AppError.notFound("Report not found");
    }

    // 2. Check duplicate
    const existing = await BookmarkModel.findOne({
      userId,
      targetKind: input.targetKind,
      targetId: input.targetId,
    });
    if (existing) throw AppError.conflict("Item is already bookmarked");

    // 3. Create bookmark
    const doc = await BookmarkModel.create({
      userId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      note: input.note?.trim() || null,
    });

    const [created] = await this.populateDetails([doc]);
    if (!created) throw AppError.internal("Failed to load created bookmark");
    return created;
  },

  async delete(userId: string, id: string): Promise<void> {
    const bookmark = await BookmarkModel.findById(id);
    if (!bookmark) throw AppError.notFound("Bookmark not found");

    if (bookmark.userId.toString() !== userId) {
      throw AppError.forbidden("You do not own this bookmark");
    }

    await BookmarkModel.deleteOne({ _id: id });
  },

  async list(userId: string): Promise<Bookmark[]> {
    const docs = await BookmarkModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return this.populateDetails(docs);
  },

  async updateNote(userId: string, id: string, input: UpdateBookmarkInput): Promise<Bookmark> {
    const bookmark = await BookmarkModel.findById(id);
    if (!bookmark) throw AppError.notFound("Bookmark not found");

    if (bookmark.userId.toString() !== userId) {
      throw AppError.forbidden("You do not own this bookmark");
    }

    if (input.note !== undefined) {
      bookmark.note = input.note?.trim() || null;
    }
    await bookmark.save();

    const [updated] = await this.populateDetails([bookmark]);
    if (!updated) throw AppError.internal("Failed to load updated bookmark");
    return updated;
  },

  async checkStatus(userId: string, targetKind: "paper" | "report", targetId: string): Promise<{ bookmarked: boolean; bookmarkId?: string }> {
    const existing = await BookmarkModel.findOne({ userId, targetKind, targetId }).lean();
    if (existing) {
      return { bookmarked: true, bookmarkId: existing._id.toString() };
    }
    return { bookmarked: false };
  },

  // Helper method to manually populate dynamic target details
  async populateDetails(docs: any[]): Promise<Bookmark[]> {
    if (docs.length === 0) return [];

    const paperIds = docs.filter(d => d.targetKind === "paper").map(d => d.targetId);
    const reportIds = docs.filter(d => d.targetKind === "report").map(d => d.targetId);

    const [papers, reports] = await Promise.all([
      PaperModel.find({ _id: { $in: paperIds }, dataStatus: "active" }).lean(),
      ReportModel.find({ _id: { $in: reportIds } }).lean(),
    ]);

    const paperMap = new Map(papers.map(p => [p._id.toString(), p]));
    const reportMap = new Map(reports.map(r => [r._id.toString(), r]));

    return docs.map(doc => {
      const id = doc._id.toString();
      const userId = doc.userId.toString();
      const targetId = doc.targetId.toString();

      const b: Bookmark = {
        id,
        userId,
        targetKind: doc.targetKind,
        targetId,
        note: doc.note === null ? null : (doc.note ?? undefined),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      };

      if (doc.targetKind === "paper") {
        const p = paperMap.get(targetId);
        if (p) {
          b.paperDetail = presentPaperDetail(p, { includeWorkflow: false });
        }
      } else if (doc.targetKind === "report") {
        const r = reportMap.get(targetId);
        if (r) {
          b.reportDetail = { id: r._id.toString(), ...r } as any;
        }
      }

      return b;
    });
  }
};
