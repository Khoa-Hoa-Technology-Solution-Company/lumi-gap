import { AppError } from "../../common/exceptions/app-error.js";
import type { ScreeningPhase } from "@trend/shared-types";
import type { WorkspaceContext } from "./workspace-access.js";

export async function projectQuestionOptions(context: WorkspaceContext) {
  const plan = await context.tx.researchPlan.findUnique({ where: { projectId: context.project.id }, select: { questions: true } });
  return Array.isArray(plan?.questions) ? plan.questions.flatMap(question => {
    if (!question || typeof question !== "object" || Array.isArray(question)) return [];
    return typeof question.id === "string" && typeof question.text === "string" ? [{ id: question.id, text: question.text }] : [];
  }) : [];
}

/** Resolve question identities on the server and seal the text used in this review version. */
export async function assessmentContext(context: WorkspaceContext, input: { scope?: ScreeningPhase; fullTextReference?: string; researchQuestionIds?: string[] }, phase: ScreeningPhase, collaborative: boolean) {
  const scope = input.scope ?? phase;
  if (!collaborative && scope !== phase) throw AppError.badRequest("Phạm vi đánh giá phải đúng giai đoạn của quy trình");
  const fullTextReference = scope === "FULL_TEXT" ? input.fullTextReference?.trim() : null;
  if (scope === "FULL_TEXT" && (!fullTextReference || fullTextReference.length < 10)) throw AppError.badRequest("Ghi nguồn toàn văn đã đọc hoặc mô tả cách nhóm kiểm tra toàn văn trước khi gửi");
  const options = await projectQuestionOptions(context), ids = input.researchQuestionIds ?? [];
  if (ids.some(id => !options.some(question => question.id === id))) throw AppError.conflict("Câu hỏi nghiên cứu đã thay đổi hoặc không thuộc dự án. Kiểm tra lại trước khi lưu");
  return { scope, fullTextReference, researchQuestions: options.filter(question => ids.includes(question.id)) };
}

export function meaningfulLegacyScreening(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.screenedAt || record.screenedById || record.inclusionReason || record.exclusionReason || record.exclusionNote || typeof record.status === "string" && record.status !== "UNDECIDED");
}
