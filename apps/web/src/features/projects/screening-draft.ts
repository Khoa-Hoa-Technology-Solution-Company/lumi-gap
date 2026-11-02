import type { ScreeningChoice } from "@trend/shared-types";
import type { AssessmentContextValue } from "./components/assessment-context";

export interface ScreeningDraft { decision: ScreeningChoice | ""; reason: string; comment: string; context: AssessmentContextValue }
export const screeningDraftKey = (project: string, round: string, actor: string | undefined) => actor ? `screening-draft:${actor}:${project}:${round}` : null;
export function loadScreeningDraft(key: string | null): ScreeningDraft | null {
  try {
    const v = key ? JSON.parse(sessionStorage.getItem(key) ?? "null") : null;
    return v && ["", "INCLUDE", "EXCLUDE", "UNSURE"].includes(v.decision) && typeof v.reason === "string" && typeof v.comment === "string" &&
      ["TITLE_ABSTRACT", "FULL_TEXT"].includes(v.context?.scope) && typeof v.context.fullTextReference === "string" && Array.isArray(v.context.researchQuestionIds) &&
      v.context.researchQuestionIds.every((id: unknown) => typeof id === "string") ? v : null;
  } catch { return null; }
}
export function saveScreeningDraft(key: string | null, draft: ScreeningDraft) {
  if (!key) return;
  try {
    if (draft.decision || draft.reason || draft.comment || draft.context.fullTextReference || draft.context.researchQuestionIds.length) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch { /* The in-memory draft and navigation guard still protect restricted browsers. */ }
}
