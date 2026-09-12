import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

export interface FormatCheckResponse {
  preset: string;
  passed: boolean;
  summary: string;
  measurements: Record<string, unknown>;
  report_markdown: string;
}

export interface ReviewPaperResponse {
  success: boolean;
  strictness: string;
  model: string;
  profile: {
    title?: string;
    authors?: string;
    paper_type?: string;
  };
  scores: Record<string, { score: number; comment: { en: string; vi: string } }>;
  bilingual_review: {
    strengths: Array<{ en: string; vi: string }>;
    weaknesses: Array<{ en: string; vi: string }>;
    detailed_feedback: { en: string; vi: string };
  };
  recommendation: "Strong Reject" | "Reject" | "Borderline" | "Accept" | "Strong Accept";
  report_markdown: string;
  artifacts_dir: string;
}

export const aiReviewerClient = {
  /**
   * Kiểm tra tình trạng kết nối đến Python AI Reviewer Service
   */
  async checkHealth(): Promise<{ status: string; service: string }> {
    try {
      const res = await fetch(`${env.AI_REVIEWER_URL}/internal/health`, {
        headers: {
          "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`Health check returned status ${res.status}`);
      }

      return (await res.json()) as { status: string; service: string };
    } catch (err: unknown) {
      logger.warn({ err }, "AI Reviewer service is currently unavailable");
      throw AppError.serviceUnavailable("Dịch vụ AI Reviewer hiện không khả dụng. Vui lòng thử lại sau.");
    }
  },

  /**
   * Lấy danh sách các preset kiểm tra chuẩn định dạng (IEEE, Springer,...)
   */
  async getFormatPresets(): Promise<Array<{ name: string; description: string; source_url?: string }>> {
    try {
      const res = await fetch(`${env.AI_REVIEWER_URL}/internal/format-presets`, {
        headers: {
          "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`Presets request returned status ${res.status}`);
      }

      return (await res.json()) as Array<{ name: string; description: string; source_url?: string }>;
    } catch (err: unknown) {
      logger.error({ err }, "Failed to fetch format presets from AI Reviewer");
      throw AppError.serviceUnavailable("Không thể lấy danh sách mẫu định dạng từ AI Reviewer");
    }
  },

  /**
   * Gọi kiểm tra định dạng PDF theo preset
   */
  async checkFormat(
    fileBuffer: Buffer,
    fileName: string,
    presetName: string = "IEEE Conference · A4",
  ): Promise<FormatCheckResponse> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    formData.append("file", blob, fileName);
    formData.append("preset_name", presetName);

    try {
      const res = await fetch(`${env.AI_REVIEWER_URL}/internal/format-check`, {
        method: "POST",
        headers: {
          "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        },
        body: formData,
        signal: AbortSignal.timeout(60000), // Đo lường PDF tối đa 60s
      });

      if (!res.ok) {
        const errorBody = await res.text();
        logger.error({ status: res.status, errorBody }, "AI Reviewer format-check failed");
        throw new Error(errorBody || `Format check returned status ${res.status}`);
      }

      return (await res.json()) as FormatCheckResponse;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, "Failed to execute format-check");
      throw AppError.serviceUnavailable("Lỗi khi kiểm tra định dạng bài báo với AI Reviewer");
    }
  },

  /**
   * Gọi thẩm định bài báo khoa học bằng Google Gemini qua AI Reviewer Service
   */
  async reviewPaper(
    fileBuffer: Buffer,
    fileName: string,
    strictness: string = "balanced",
    personalApiKey?: string,
  ): Promise<ReviewPaperResponse> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    formData.append("file", blob, fileName);
    formData.append("strictness", strictness);
    if (personalApiKey) {
      formData.append("api_key", personalApiKey);
    }

    try {
      const res = await fetch(`${env.AI_REVIEWER_URL}/internal/review`, {
        method: "POST",
        headers: {
          "X-Internal-Key": env.INTERNAL_SERVICE_KEY,
        },
        body: formData,
        signal: AbortSignal.timeout(180000), // Thẩm định Gemini sâu tối đa 3 phút
      });

      if (!res.ok) {
        const errorBody = await res.text();
        logger.error({ status: res.status, errorBody }, "AI Reviewer review call failed");
        throw new Error(errorBody || `Review call returned status ${res.status}`);
      }

      return (await res.json()) as ReviewPaperResponse;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, "Failed to execute reviewPaper");
      throw AppError.serviceUnavailable("Quá trình thẩm định bài báo bằng AI gặp sự cố. Vui lòng thử lại sau.");
    }
  },
};
