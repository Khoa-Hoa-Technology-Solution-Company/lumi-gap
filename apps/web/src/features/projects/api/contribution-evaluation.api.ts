import type { ContributionEvaluationBoard, ContributionEvaluationRule, ContributionEvaluationRun, ContributionEvaluationSnapshot, EvaluationDecisionKind, EvaluationProposalInput, OutcomeEvaluation } from "@trend/shared-types";
import { api } from "@/services/api-client";
const path = (projectId: string, resource: string) => `/projects/${encodeURIComponent(projectId)}/contributions/evaluation/${resource}`;
async function get<T>(p: string, r: string, params?: Record<string, unknown>) { return (await api.get<{ data: T }>(path(p, r), { params })).data.data; }
async function post<T>(p: string, r: string, body: unknown) { return (await api.post<{ data: T }>(path(p, r), body)).data.data; }
export interface EvaluationSnapshotPage { items: { id: string; calculatedAt: string; inputHash: string; isStale: boolean }[]; total: number; page: number; pageSize: number; hasNext: boolean }
export const contributionEvaluationApi = {
  writingSuggestions: (p: string, contributionIds: string[]) => get<import("@trend/shared-types").ManuscriptWritingReport[]>(p, "writing-suggestions", { contributionIds: contributionIds.join(",") }),
  board: (p: string, periodId: string, page = 1) => get<ContributionEvaluationBoard>(p, "board", { periodId, page, pageSize: 20 }),
  createRule: (p: string, data: { clientKey: string; title: string; rationale: string; defaultWeight: number; maxWeight: number }) => post<ContributionEvaluationRule>(p, "rules", data),
  propose: (p: string, data: EvaluationProposalInput) => post<OutcomeEvaluation>(p, "outcomes", data),
  detail: (p: string, id: string) => get<{ evaluation: OutcomeEvaluation; rule: ContributionEvaluationRule; people: { id: string; name: string }[] }>(p, `outcomes/${id}`),
  decide: (p: string, id: string, data: { payloadHash: string; kind: EvaluationDecisionKind; decision: "APPROVE" | "DISPUTE"; note: string }) => post<{ recorded: boolean }>(p, `outcomes/${id}/decisions`, data),
  calculate: (p: string, data: { clientKey: string; periodId: string; ruleId: string }) => post<ContributionEvaluationRun>(p, "runs", data),
  run: (p: string, id: string) => get<ContributionEvaluationRun>(p, `runs/${id}`),
  snapshots: (p: string, periodId: string, page = 1) => get<EvaluationSnapshotPage>(p, "snapshots", { periodId, page, pageSize: 20 }),
  snapshot: (p: string, id: string) => get<ContributionEvaluationSnapshot>(p, `snapshots/${id}`),
};
