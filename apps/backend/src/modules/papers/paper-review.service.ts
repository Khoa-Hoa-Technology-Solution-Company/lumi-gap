import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { UserModel } from "../auth/models/user.model.js";
import { creditService } from "../credits/credit.service.js";
import { AI_CREDIT_COSTS } from "../credits/credit-policy.js";
import { aiReviewerClient } from "./ai-reviewer.client.js";
import { PaperReviewModel } from "./models/paper-review.model.js";
import { PaperFormatCheckModel } from "./models/paper-format-check.model.js";

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

    // Lưu kết quả vào MongoDB
    const record = await PaperFormatCheckModel.create({
      userId,
      fileName,
      preset: checkResult.preset,
      passed: checkResult.passed,
      summary: checkResult.summary,
      measurements: checkResult.measurements,
      reportMarkdown: checkResult.report_markdown,
    });

    return {
      id: record._id.toString(),
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

    const user = await UserModel.findById(userId);
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
    const reviewRecord = await PaperReviewModel.create({
      userId,
      fileName,
      fileSize: fileBuffer.length,
      strictness,
      status: "pending",
      creditsCharged: creditCost,
    });

    // Trừ credit tạm thời
    const idempotencyKey = `review:${reviewRecord._id.toString()}`;
    let chargeTx;
    try {
      chargeTx = await creditService.chargeCreditsChecked({
        userId,
        action,
        amount: creditCost,
        targetKind: "paper_review",
        targetId: reviewRecord._id.toString(),
        idempotencyKey,
      });
    } catch (err: unknown) {
      await PaperReviewModel.findByIdAndUpdate(reviewRecord._id, {
        status: "failed",
        errorMessage: "Số dư credit không đủ",
      });
      throw err;
    }

    // Cập nhật trạng thái đang xử lý
    await PaperReviewModel.findByIdAndUpdate(reviewRecord._id, {
      status: "processing",
    });

    try {
      // Gọi Python AI Reviewer Service
      const result = await aiReviewerClient.reviewPaper(
        fileBuffer,
        fileName,
        strictness,
        personalApiKey,
      );

      // Cập nhật kết quả thành công
      const updated = await PaperReviewModel.findByIdAndUpdate(
        reviewRecord._id,
        {
          status: "completed",
          model: result.model,
          recommendation: result.recommendation,
          scores: result.scores,
          profile: result.profile,
          bilingualReview: result.bilingual_review,
          reportMarkdown: result.report_markdown,
          artifactsDir: result.artifacts_dir,
        },
        { new: true },
      ).lean();

      return {
        id: reviewRecord._id.toString(),
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
      logger.error({ err, reviewId: reviewRecord._id }, "Paper review execution failed, refunding credits");

      await PaperReviewModel.findByIdAndUpdate(reviewRecord._id, {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Thẩm định bài báo thất bại",
      });

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
    return PaperReviewModel.find({ userId })
      .sort({ createdAt: -1 })
      .select("-reportMarkdown")
      .limit(50)
      .lean();
  },

  /**
   * Lấy chi tiết báo cáo phản biện theo ID
   */
  async getReviewById(userId: string, reviewId: string) {
    const review = await PaperReviewModel.findOne({ _id: reviewId, userId }).lean();
    if (!review) {
      throw AppError.notFound("Không tìm thấy báo cáo phản biện");
    }
    return review;
  },

  /**
   * Lấy danh sách lịch sử kiểm tra định dạng của người dùng
   */
  async getFormatHistory(userId: string) {
    return PaperFormatCheckModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  },
};
