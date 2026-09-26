import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "../credits/credit.service.js";
import { AI_CREDIT_COSTS } from "../credits/credit-policy.js";
import { aiReviewerClient } from "./ai-reviewer.client.js";

async function resolveUser(userId: string) {
  const parsed = parseDatabaseId(userId);
  if (!parsed) return null;
  return getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
}

function resolveRowId(id: string) {
  const parsed = parseDatabaseId(id);
  return parsed ? (parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }) : null;
}

export const paperReviewService = {
  /**
   * Lấy danh sách preset format khả dụng
   */
  async getFormatPresets() {
    return aiReviewerClient.getFormatPresets();
  },

  /**
   * Thực hiện kiểm tra định dạng PDF theo chuẩn hội nghị
   */
  async checkFormat(params: {
    userId: string;
    fileBuffer: Buffer;
    fileName: string;
    presetName?: string;
  }) {
    const { userId, fileBuffer, fileName, presetName = "IEEE Conference · A4" } = params;

    // Kiểm tra định dạng qua Python Service
    const checkResult = await aiReviewerClient.checkFormat(fileBuffer, fileName, presetName);

    const user = await resolveUser(userId);
    if (!user) throw AppError.notFound("Không tìm thấy thông tin người dùng");
    const record = await getPrisma().paperFormatCheck.create({ data: {
      userId: user.id,
      fileName,
      preset: checkResult.preset,
      passed: checkResult.passed,
      summary: checkResult.summary,
      measurements: checkResult.measurements as never,
      reportMarkdown: checkResult.report_markdown,
    } });

    return {
      id: publicDatabaseId(record),
      preset: record.preset,
      passed: record.passed,
      summary: record.summary,
      measurements: record.measurements,
      reportMarkdown: record.reportMarkdown,
      createdAt: record.createdAt,
    };
  },

  /**
   * Thực hiện thẩm định bài báo khoa học bằng Google Gemini (kèm trừ / hoàn credit tự động)
   */
  async reviewPaper(params: {
    userId: string;
    fileBuffer: Buffer;
    fileName: string;
    strictness?: "lenient" | "balanced" | "strict";
    usePersonalKey?: boolean;
  }) {
    const {
      userId,
      fileBuffer,
      fileName,
      strictness = "balanced",
      usePersonalKey = false,
    } = params;

    const user = await resolveUser(userId);
    if (!user) throw AppError.notFound("Không tìm thấy thông tin người dùng");

    let personalApiKey: string | undefined;
    if (usePersonalKey) {
      if (!user.personalGeminiKey) {
        throw AppError.badRequest("Bạn chưa cấu hình Gemini API Key cá nhân trong cài đặt tài khoản");
      }
      personalApiKey = user.personalGeminiKey;
    }

    const action = usePersonalKey
      ? "paper_review_personal_key"
      : "paper_review_system_key";
    const creditCost = AI_CREDIT_COSTS[action];

    // Tạo bản ghi review ở trạng thái pending
    const reviewRecord = await getPrisma().paperReview.create({ data: {
      userId: user.id,
      fileName,
      fileSize: fileBuffer.length,
      strictness,
      model: "",
      status: "pending",
      creditsCharged: creditCost,
    } });

    // Trừ credit tạm thời
    const idempotencyKey = `review:${reviewRecord.id}`;
    let chargeTx;
    try {
      chargeTx = await creditService.chargeCreditsChecked({
        userId,
        action,
        amount: creditCost,
        targetKind: "paper_review",
        targetId: reviewRecord.id,
        idempotencyKey,
      });
    } catch (err: unknown) {
      await getPrisma().paperReview.update({ where: { id: reviewRecord.id }, data: { status: "failed", errorMessage: "Số dư credit không đủ" } });
      throw err;
    }

    // Cập nhật trạng thái đang xử lý
    await getPrisma().paperReview.update({ where: { id: reviewRecord.id }, data: { status: "processing" } });

    try {
      // Gọi Python AI Reviewer Service
      const result = await aiReviewerClient.reviewPaper(
        fileBuffer,
        fileName,
        strictness,
        personalApiKey,
      );

      // Cập nhật kết quả thành công
      const updated = await getPrisma().paperReview.update({
        where: { id: reviewRecord.id },
        data: {
          status: "completed",
          model: result.model,
          recommendation: result.recommendation,
          scores: result.scores as never,
          profile: result.profile as never,
          bilingualReview: result.bilingual_review as never,
          reportMarkdown: result.report_markdown,
          artifactsDir: result.artifacts_dir,
        },
      });

      return {
        id: publicDatabaseId(reviewRecord),
        fileName,
        strictness,
        status: "completed",
        recommendation: result.recommendation,
        scores: result.scores,
        profile: result.profile,
        bilingualReview: result.bilingual_review,
        reportMarkdown: result.report_markdown,
        creditsCharged: creditCost,
        createdAt: updated?.createdAt,
      };
    } catch (err: unknown) {
      logger.error({ err, reviewId: reviewRecord.id }, "Paper review execution failed, refunding credits");

      await getPrisma().paperReview.update({ where: { id: reviewRecord.id }, data: {
        status: "failed", errorMessage: err instanceof Error ? err.message : "Thẩm định bài báo thất bại",
      } });

      // Hoàn trả credit cho người dùng
      if (chargeTx?._id) {
        try {
          await creditService.refundCreditsOnce({
            transactionId: chargeTx._id.toString(),
            reason: "Hoàn phí do hệ thống thẩm định bài báo gặp sự cố",
          });
        } catch (refundErr) {
          logger.error({ refundErr }, "Failed to refund credits after review error");
        }
      }

      throw err;
    }
  },

  /**
   * Lấy danh sách lịch sử review của người dùng
   */
  async getReviewHistory(userId: string) {
    const user = await resolveUser(userId);
    if (!user) return [];
    return getPrisma().paperReview.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
      omit: { reportMarkdown: true },
    });
  },

  /**
   * Lấy chi tiết báo cáo phản biện theo ID
   */
  async getReviewById(userId: string, reviewId: string) {
    const [user, where] = await Promise.all([resolveUser(userId), Promise.resolve(resolveRowId(reviewId))]);
    const review = user && where ? await getPrisma().paperReview.findUnique({ where }) : null;
    if (review?.userId !== user?.id) {
      throw AppError.notFound("Không tìm thấy báo cáo phản biện");
    }
    if (!review) {
      throw AppError.notFound("Không tìm thấy báo cáo phản biện");
    }
    return review;
  },

  /**
   * Lấy danh sách lịch sử kiểm tra định dạng của người dùng
   */
  async getFormatHistory(userId: string) {
    const user = await resolveUser(userId);
    if (!user) return [];
    return getPrisma().paperFormatCheck.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
    });
  },
};
