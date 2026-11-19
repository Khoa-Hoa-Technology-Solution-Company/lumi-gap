import { emptyResearchClassification, type ResearchClassificationInput } from "@trend/shared-types";

/** Recover optional local drafts without trusting their object shape. Server validation stays authoritative. */
export function classificationInput(value?: ResearchClassificationInput): ResearchClassificationInput {
  if (!value || typeof value !== "object") return emptyResearchClassification();
  const ids = (values: unknown, max: number) => Array.isArray(values) ? [...new Set(values.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 120))].slice(0, max) : [];
  return { nodeIds: ids(value.nodeIds, 20), keywordIds: ids(value.keywordIds, 30), skillIds: ids(value.skillIds, 30) };
}
