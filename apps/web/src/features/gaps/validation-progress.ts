import type { GapValidationRecord } from "@trend/shared-types";

/** Experts whose latest decision is VALIDATE; each expert counts once, and a later decision replaces an earlier one. */
export function countValidatingExperts(validations: Array<Pick<GapValidationRecord, "id" | "action" | "createdAt" | "reviewerId">>): number {
  const latest = new Map<string, string>();
  [...validations]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((item) => latest.set(item.reviewerId?.id ?? item.id, item.action));
  return [...latest.values()].filter((action) => action === "VALIDATE").length;
}
