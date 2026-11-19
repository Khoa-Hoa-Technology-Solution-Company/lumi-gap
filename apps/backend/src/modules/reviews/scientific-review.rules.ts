import { requiresScientificIntegrity, scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
export function validateScientificIntegrity(input: AcademicReviewInput, guidelines: string[], origin: string | undefined, submit: boolean) {
  if (Object.keys(input.integrityChecks ?? {}).some(key => !scientificIntegrityChecks.some(check => check.key === key))) throw AppError.badRequest("Unknown integrity checklist item");
  if (!submit || !requiresScientificIntegrity(guidelines, origin)) return;
  for (const check of scientificIntegrityChecks) {
    const response = input.integrityChecks?.[check.key];
    if (!response || !["CHECKED", "CONCERN", "NOT_APPLICABLE"].includes(response.status)) throw AppError.badRequest("Complete the academic integrity checklist", { key: check.key });
    if (response.status === "NOT_APPLICABLE" && !check.allowNotApplicable) throw AppError.badRequest("This integrity check cannot be marked N/A", { key: check.key });
    if (response.status === "CONCERN" && (response.note?.trim().length ?? 0) < 10) throw AppError.badRequest("Describe the integrity concern for human review", { key: check.key });
  }
  if (input.overallAssessment === "STRONG" && Object.values(input.integrityChecks ?? {}).some(check => check.status === "CONCERN")) throw AppError.conflict("Unresolved integrity concerns prevent internal readiness approval");
}
