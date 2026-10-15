import type { ActivityResult, AllocationDraftInput, AllocationPeriodInput, AllocationPeriodView, AllocationRevisionView, AllocationShareInput, ContributionInput, ContributionPage, WorkContribution } from "@trend/shared-types";
import { api as apiClient } from "@/services/api-client";
const path = (id: string, resource: string) => `/projects/${encodeURIComponent(id)}/contributions/${resource}`;
async function get<T>(id: string, resource: string, params?: Record<string, unknown>) { return (await apiClient.get<{ data: T }>(path(id, resource), { params })).data.data; }
async function write<T>(id: string, resource: string, data: unknown, edit = false) { return (await apiClient[edit ? "patch" : "post"]<{ data: T }>(path(id, resource), data)).data.data; }
export const contributionsApi = {
  activity: (id: string, query: Record<string, unknown>) => get<ActivityResult>(id, "activity", query),
  work: (id: string, query: Record<string, unknown>) => get<ContributionPage>(id, "work", query),
  detail: (id: string, recordId: string) => get<WorkContribution>(id, `work/${recordId}`),
  save: (id: string, data: ContributionInput & { clientKey?: string; expectedVersion?: number; correctionReason?: string }, recordId?: string) => write<WorkContribution>(id, recordId ? `work/${recordId}` : "work", data, Boolean(recordId)),
  submit: (id: string, recordId: string, expectedVersion: number) => write<WorkContribution>(id, `work/${recordId}/submit`, { expectedVersion }),
  review: (id: string, recordId: string, data: { expectedVersion: number; decision: string; note: string }) => write<WorkContribution>(id, `work/${recordId}/reviews`, data),
  periods: (id: string) => get<AllocationPeriodView[]>(id, "periods"),
  period: (id: string, periodId: string) => get<AllocationPeriodView>(id, `periods/${periodId}`),
  createPeriod: (id: string, data: AllocationPeriodInput) => write<AllocationPeriodView>(id, "periods", data),
  history: (id: string, periodId: string) => get<AllocationRevisionView[]>(id, `periods/${periodId}/history`),
  draft: (id: string, periodId: string, data: AllocationDraftInput) => write<AllocationRevisionView>(id, `periods/${periodId}/revisions`, data),
  edit: (id: string, revisionId: string, data: { shares: AllocationShareInput[]; rationale: string; expectedVersion: number }) => write<AllocationRevisionView>(id, `revisions/${revisionId}`, data, true),
  submitDraft: (id: string, revisionId: string, expectedVersion: number) => write<AllocationRevisionView>(id, `revisions/${revisionId}/submit`, { expectedVersion }),
  revision: (id: string, revisionId: string) => get<AllocationRevisionView>(id, `revisions/${revisionId}`),
  decide: (id: string, revisionId: string, decision: "APPROVE" | "DISPUTE", explanation = "") => write<AllocationRevisionView>(id, `revisions/${revisionId}/decisions`, { decision, explanation }),
  challenge: (id: string, periodId: string, revisionId: string, explanation: string) => write<AllocationRevisionView>(id, `periods/${periodId}/challenges`, { revisionId, explanation }),
  export: (id: string, revisionId: string) => get<AllocationRevisionView>(id, `revisions/${revisionId}/export`),
};
