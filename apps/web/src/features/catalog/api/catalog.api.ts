import type {
  CatalogKeyword,
  KeywordStatus,
  PaperTagSource,
  TaggedPaper,
  Tag,
  TagApplyJob,
  TagCampaign,
  TagCampaignPreflight,
  TagDetail,
  TagPreview,
  TagRuleInput,
  TagStatus,
  TaxonomyLevel,
  TaxonomyNode,
  TaxonomyNodeDetail,
  TaxonomyNodeStatus,
  TaxonomyStats,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface NodeListParams {
  level?: TaxonomyLevel;
  parentId?: string;
  q?: string;
  status?: TaxonomyNodeStatus;
  sort?: "paperCount" | "worksCount" | "name";
  page?: number;
  pageSize?: number;
}

export interface UpdateNodeInput {
  aliases?: string[];
  status?: TaxonomyNodeStatus;
  description?: string | null;
}

export interface KeywordListParams {
  q?: string;
  status?: KeywordStatus;
  sort?: "paperCount" | "name";
  page?: number;
  pageSize?: number;
}

export interface UpdateKeywordInput {
  keywordName?: string;
  aliases?: string[];
  status?: "active" | "hidden";
}

export interface TagListParams {
  q?: string;
  status?: TagStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateTagInput {
  name: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  rules?: TagRuleInput[];
}

export interface UpdateTagInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  status?: TagStatus;
}

export interface TagPapersParams {
  source?: PaperTagSource;
  q?: string;
  page?: number;
  pageSize?: number;
}

function paged<T>(res: { data: { data: T[]; meta: PageMeta } }): Paginated<T> {
  return { data: res.data.data, meta: res.data.meta };
}

/** Drop empty filters so they are not sent as `?q=`. */
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Partial<T>;
}

export const taxonomyApi = {
  async stats(): Promise<TaxonomyStats> {
    const res = await api.get(API_ROUTES.admin.taxonomy.stats);
    return res.data.data as TaxonomyStats;
  },
  async listNodes(params: NodeListParams = {}): Promise<Paginated<TaxonomyNode>> {
    return paged(await api.get(API_ROUTES.admin.taxonomy.nodes, { params: clean(params) }));
  },
  async getNode(id: string): Promise<TaxonomyNodeDetail> {
    const res = await api.get(API_ROUTES.admin.taxonomy.node(id));
    return res.data.data as TaxonomyNodeDetail;
  },
  async updateNode(id: string, input: UpdateNodeInput): Promise<TaxonomyNode> {
    const res = await api.patch(API_ROUTES.admin.taxonomy.node(id), input);
    return res.data.data as TaxonomyNode;
  },
  async listKeywords(params: KeywordListParams = {}): Promise<Paginated<CatalogKeyword>> {
    return paged(await api.get(API_ROUTES.admin.taxonomy.keywords, { params: clean(params) }));
  },
  async updateKeyword(id: string, input: UpdateKeywordInput): Promise<CatalogKeyword> {
    const res = await api.patch(API_ROUTES.admin.taxonomy.keyword(id), input);
    return res.data.data as CatalogKeyword;
  },
  async mergeKeyword(id: string, targetId: string): Promise<unknown> {
    const res = await api.post(API_ROUTES.admin.taxonomy.mergeKeyword(id), { targetId });
    return res.data.data;
  },
};

export const tagsApi = {
  async list(params: TagListParams = {}): Promise<Paginated<Tag>> {
    return paged(await api.get(API_ROUTES.admin.tags.root, { params: clean(params) }));
  },
  async create(input: CreateTagInput): Promise<TagDetail> {
    const res = await api.post(API_ROUTES.admin.tags.root, input);
    return res.data.data as TagDetail;
  },
  async get(id: string): Promise<TagDetail> {
    const res = await api.get(API_ROUTES.admin.tags.tag(id));
    return res.data.data as TagDetail;
  },
  async update(id: string, input: UpdateTagInput): Promise<TagDetail> {
    const res = await api.patch(API_ROUTES.admin.tags.tag(id), input);
    return res.data.data as TagDetail;
  },
  async replaceRules(id: string, rules: TagRuleInput[]): Promise<TagDetail> {
    const res = await api.put(API_ROUTES.admin.tags.rules(id), { rules });
    return res.data.data as TagDetail;
  },
  async archive(id: string): Promise<unknown> {
    const res = await api.delete(API_ROUTES.admin.tags.tag(id));
    return res.data.data;
  },
  async preview(id: string): Promise<TagPreview> {
    const res = await api.get(API_ROUTES.admin.tags.preview(id));
    return res.data.data as TagPreview;
  },
  async apply(id: string): Promise<TagApplyJob> {
    const res = await api.post(API_ROUTES.admin.tags.apply(id));
    return res.data.data as TagApplyJob;
  },
  async applyAll(): Promise<TagApplyJob> {
    const res = await api.post(API_ROUTES.admin.tags.applyAll);
    return res.data.data as TagApplyJob;
  },
  async papers(id: string, params: TagPapersParams = {}): Promise<Paginated<TaggedPaper>> {
    return paged(await api.get(API_ROUTES.admin.tags.papers(id), { params: clean(params) }));
  },
  async addPapers(id: string, paperIds: string[]): Promise<TaggedPaper[]> {
    const res = await api.post(API_ROUTES.admin.tags.papers(id), { paperIds });
    return res.data.data as TaggedPaper[];
  },
  async removePaper(id: string, paperId: string): Promise<{ paperId: string; source: "blocked" | null }> {
    const res = await api.delete(API_ROUTES.admin.tags.paper(id, paperId));
    return res.data.data as { paperId: string; source: "blocked" | null };
  },
  async unblockPaper(id: string, paperId: string): Promise<TagApplyJob> {
    const res = await api.post(API_ROUTES.admin.tags.unblock(id, paperId));
    return res.data.data as TagApplyJob;
  },
};

export const tagCampaignsApi = {
  async preflight(tagId: string): Promise<TagCampaignPreflight> {
    const res = await api.post(API_ROUTES.admin.tagCampaigns.preflight, { tagId });
    return res.data.data as TagCampaignPreflight;
  },
  async plan(tagId: string, targetUniqueWorks: number): Promise<TagCampaign> {
    const res = await api.post(API_ROUTES.admin.tagCampaigns.list, { tagId, targetUniqueWorks });
    return res.data.data as TagCampaign;
  },
  async list(tagId: string): Promise<TagCampaign[]> {
    const res = await api.get(API_ROUTES.admin.tagCampaigns.list, { params: { tagId } });
    return res.data.data as TagCampaign[];
  },
};
