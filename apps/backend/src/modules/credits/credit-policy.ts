/* ------------------------------------------------------------------ */
/*  AI Credit Policy — single source of truth for billing costs        */
/* ------------------------------------------------------------------ */

export const CREDIT_ACTIONS = [
  "semantic_search",
  "trends_deterministic",
  "search_rerank",
  "fast_report",
  "standard_report",
  "deep_mcp_report",
  "generate_gaps",
  "generate_directions",
  "project_chat_message",
  "paper_request",
  "paper_download",
  "paper_upload_reward",
  "paper_review_system_key",
  "paper_review_personal_key",
  "paper_format_check",
] as const;

export type CreditAction = (typeof CREDIT_ACTIONS)[number];

/** Cost table — 0 means the action is free (no ledger entry created). */
export const AI_CREDIT_COSTS: Record<CreditAction, number> = {
  semantic_search: 0,
  trends_deterministic: 0,
  search_rerank: 5,
  fast_report: 20,
  standard_report: 50,
  deep_mcp_report: 100,
  generate_gaps: 30,
  generate_directions: 15,
  project_chat_message: 1,
  paper_request: 0,
  paper_download: 0,
  paper_upload_reward: 0,
  paper_review_system_key: 10,
  paper_review_personal_key: 3,
  paper_format_check: 2,
} as const;

/** Look up the credit cost for a given action. */
export function getAiActionCost(action: CreditAction): number {
  return AI_CREDIT_COSTS[action];
}

/**
 * Resolve which credit action and cost to use for a report request.
 *
 * Priority: deepAnalysis > fast > standard.
 * If both `fast` and `deepAnalysis` are true, deep wins.
 */
export function resolveReportCreditCost(input: {
  fast?: boolean;
  deepAnalysis?: boolean;
}): { action: CreditAction; cost: number } {
  if (input.deepAnalysis) {
    return { action: "deep_mcp_report", cost: AI_CREDIT_COSTS.deep_mcp_report };
  }
  if (input.fast) {
    return { action: "fast_report", cost: AI_CREDIT_COSTS.fast_report };
  }
  return { action: "standard_report", cost: AI_CREDIT_COSTS.standard_report };
}
