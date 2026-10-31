import { api } from "@/services/api-client";
import type { MentorAccessWorkspace, MentorAccessPage, MentorSharedResource, MentorShareInput, MentorResourceKind, MentorPolicyInput, MentorFeedback, MentorAgreement } from "@trend/shared-types";
const base = (id: string) => `/projects/${encodeURIComponent(id)}/mentor-access`;
const get = async <T>(id: string, suffix = "", params?: object): Promise<T> => (await api.get(`${base(id)}${suffix}`, { params })).data.data;
const send = async (id: string, suffix: string, body: unknown, method = "post") => (await api.request({ url: `${base(id)}${suffix}`, method, data: body })).data.data;
export const mentorAccessApi = {
  workspace: (id: string, page = 1) => get<MentorAccessWorkspace>(id, "", { page }),
  catalog: (id: string, kind: MentorResourceKind, page: number, q: string) => get<MentorAccessPage<MentorShareInput>>(id, "/catalog", { kind, page, q }),
  configure: (id: string, accessId: string, body: MentorPolicyInput & { expectedVersion: number; reason: string }) => send(id, `/${accessId}`, body, "put"),
  revoke: (id: string, accessId: string, body: object) => send(id, `/${accessId}/revoke`, body),
  share: (id: string, accessId: string, body: MentorShareInput & { expectedVersion: number }): Promise<MentorSharedResource> => send(id, `/${accessId}/shares`, body),
  resource: (id: string, accessId: string, shareId: string) => get<MentorSharedResource>(id, `/${accessId}/shares/${shareId}`),
  unshare: (id: string, accessId: string, shareId: string, body: object) => send(id, `/${accessId}/shares/${shareId}/revoke`, body),
  feedback: (id: string, accessId: string, page: number) => get<MentorAccessPage<MentorFeedback>>(id, `/${accessId}/feedback`, { page }),
  comment: (id: string, accessId: string, body: object) => send(id, `/${accessId}/feedback`, body),
  handle: (id: string, accessId: string, feedbackId: string, body: object) => send(id, `/${accessId}/feedback/${feedbackId}`, body, "put"),
  history: (id: string, accessId: string, page: number) => get<MentorAccessPage<{ id: string; type: string; actorId: string; actorName: string; createdAt: string; details: Record<string, unknown> }>>(id, `/${accessId}/history`, { page }),
  agreements: (id: string, accessId: string, page: number) => get<MentorAccessPage<MentorAgreement>>(id, `/${accessId}/agreements`, { page }),
  propose: (id: string, accessId: string, body: object) => send(id, `/${accessId}/agreements`, body),
  respond: (id: string, accessId: string, agreementId: string, status: string) => send(id, `/${accessId}/agreements/${agreementId}/respond`, { status, confirmed: true }),
};
