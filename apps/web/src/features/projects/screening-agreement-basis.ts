import type { ScreeningRoundView } from "@trend/shared-types";

/** Reference existing records; never invent a new scientific rationale or edit ballots. */
export function recordedAgreementBasis(round: ScreeningRoundView, decision: "INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO") {
  const outcome = decision === "INCLUDED" ? "Phù hợp" : decision === "EXCLUDED" ? "Không phù hợp" : "Cần thêm thông tin";
  const reviews = round.reviews.map(review => `Phiếu ${review.id} (v${review.revision})`);
  const scope = round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt";
  const sources = [...new Set(round.reviews.map(review => review.fullTextReference?.trim()).filter((value): value is string => Boolean(value)))];
  return {
    reason: `Đề xuất kết luận ${outcome} sau trao đổi tại vòng ${round.number}. Căn cứ được lưu trong hai phiếu đánh giá và lịch sử trao đổi của vòng.`,
    sourceMaterial: [`Vòng ${round.id}: ${scope}.`, ...reviews, ...sources].join("\n").slice(0, 2000),
  };
}
