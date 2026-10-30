import type {
  TopicBackfillRequestResult,
  TopicBackfillRun,
  TopicBackfillState,
  TopicBackfillTargetKind,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

/** Kinds a signed-in user may request from search; tags are admin-only. */
export type SearchBackfillTargetKind = Exclude<TopicBackfillTargetKind, "tag">;

export interface RequestTopicBackfillInput {
  targetKind: SearchBackfillTargetKind;
  targetId: string;
}

export interface AdminRequestTopicBackfillInput {
  targetKind: TopicBackfillTargetKind;
  targetId: string;
  /** 1..1000; the backend defaults to 100. */
  maxNewPapers?: number;
}

export interface TopicBackfillRunsParams {
  targetKind?: TopicBackfillTargetKind;
  targetId?: string;
  state?: TopicBackfillState;
  page?: number;
  pageSize?: number;
}

export interface TopicBackfillPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TopicBackfillRunsPage {
  data: TopicBackfillRun[];
  meta: TopicBackfillPageMeta;
}

/** Drop empty filters so they are not sent as `?state=`. */
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Partial<T>;
}

export const topicBackfillApi = {
  async request(input: RequestTopicBackfillInput): Promise<TopicBackfillRequestResult> {
    const res = await api.post(API_ROUTES.topicBackfill.request, input);
    return res.data.data as TopicBackfillRequestResult;
  },
  async getRun(id: string, signal?: AbortSignal): Promise<TopicBackfillRun> {
    const res = await api.get(API_ROUTES.topicBackfill.run(id), { signal });
    return res.data.data as TopicBackfillRun;
  },
  async adminRequest(input: AdminRequestTopicBackfillInput): Promise<TopicBackfillRequestResult> {
    const res = await api.post(API_ROUTES.admin.topicBackfill.request, clean(input));
    return res.data.data as TopicBackfillRequestResult;
  },
  async adminRuns(params: TopicBackfillRunsParams = {}, signal?: AbortSignal): Promise<TopicBackfillRunsPage> {
    const res = await api.get(API_ROUTES.admin.topicBackfill.runs, { params: clean(params), signal });
    return { data: res.data.data as TopicBackfillRun[], meta: res.data.meta as TopicBackfillPageMeta };
  },
};

/** The code of a failed request, e.g. TOPIC_NOT_THIN; undefined for network errors. */
export function backfillErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error?: { code?: string } } } } | null)?.response?.data?.error?.code;
}

export function backfillErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}
