import type { ISODateString } from "./common.js";

/* ------------------------------------------------------------------ */
/*  Credit types — framework-agnostic                                  */
/* ------------------------------------------------------------------ */

export type CreditTransactionType = "charge" | "refund" | "reward";

export type CreditAction =
  | "semantic_search"
  | "trends_deterministic"
  | "search_rerank"
  | "fast_report"
  | "standard_report"
  | "deep_mcp_report"
  | "generate_gaps"
  | "generate_directions"
  | "project_chat_message"
  | "paper_request"
  | "paper_download"
  | "paper_upload_reward"
  | "paper_review_system_key"
  | "paper_review_personal_key"
  | "paper_format_check";

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  action: CreditAction;
  amount: number;
  balanceAfter?: number;
  targetKind?: string;
  targetId?: string;
  status: "applied" | "refunded";
  refundedTransactionId?: string;
  metadata?: {
    description?: string;
    uploaderName?: string;
    [key: string]: unknown;
  };
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreditBalance {
  credits: number;
}

/** Credit cost table exposed to frontend for UI display. */
export const AI_CREDIT_COSTS_CLIENT = {
  search_rerank: 5,
  fast_report: 20,
  standard_report: 50,
  deep_mcp_report: 100,
  generate_gaps: 30,
  generate_directions: 15,
  project_chat_message: 1,
} as const;
