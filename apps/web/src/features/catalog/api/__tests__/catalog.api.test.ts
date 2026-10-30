import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: mocks }));

import { taxonomyApi, tagsApi, tagCampaignsApi } from "../catalog.api";

const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
const envelope = (data: unknown, withMeta = false) => ({ data: { success: true, data, ...(withMeta ? { meta } : {}) } });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("taxonomyApi", () => {
  it("lists nodes with filters and drops empty params", async () => {
    mocks.get.mockResolvedValue(envelope([{ id: "n1" }], true));
    const result = await taxonomyApi.listNodes({ level: "field", parentId: "p1", q: "", status: undefined, sort: "name", page: 2 });
    expect(mocks.get).toHaveBeenCalledWith("/admin/taxonomy/nodes", {
      params: { level: "field", parentId: "p1", sort: "name", page: 2 },
    });
    expect(result).toEqual({ data: [{ id: "n1" }], meta });
  });

  it("reads stats and node detail from their own paths", async () => {
    mocks.get.mockResolvedValue(envelope({ papers: 3 }));
    expect(await taxonomyApi.stats()).toEqual({ papers: 3 });
    expect(mocks.get).toHaveBeenCalledWith("/admin/taxonomy/stats");
    await taxonomyApi.getNode("abc");
    expect(mocks.get).toHaveBeenLastCalledWith("/admin/taxonomy/nodes/abc");
  });

  it("patches a node and a keyword", async () => {
    mocks.patch.mockResolvedValue(envelope({}));
    await taxonomyApi.updateNode("n1", { aliases: ["ml"], status: "hidden", description: null });
    expect(mocks.patch).toHaveBeenCalledWith("/admin/taxonomy/nodes/n1", { aliases: ["ml"], status: "hidden", description: null });
    await taxonomyApi.updateKeyword("k1", { keywordName: "Deep learning" });
    expect(mocks.patch).toHaveBeenLastCalledWith("/admin/taxonomy/keywords/k1", { keywordName: "Deep learning" });
  });

  it("lists keywords and merges with the target id", async () => {
    mocks.get.mockResolvedValue(envelope([], true));
    await taxonomyApi.listKeywords({ q: "learn", status: "active", sort: "paperCount", pageSize: 10 });
    expect(mocks.get).toHaveBeenCalledWith("/admin/taxonomy/keywords", {
      params: { q: "learn", status: "active", sort: "paperCount", pageSize: 10 },
    });
    mocks.post.mockResolvedValue(envelope({ id: "k2" }));
    await taxonomyApi.mergeKeyword("k1", "k2");
    expect(mocks.post).toHaveBeenCalledWith("/admin/taxonomy/keywords/k1/merge", { targetId: "k2" });
  });
});

describe("tagsApi", () => {
  it("lists, creates and reads tags", async () => {
    mocks.get.mockResolvedValue(envelope([], true));
    await tagsApi.list({ q: "ai", status: "archived", page: 3 });
    expect(mocks.get).toHaveBeenCalledWith("/admin/tags", { params: { q: "ai", status: "archived", page: 3 } });
    mocks.post.mockResolvedValue(envelope({ id: "t1" }));
    await tagsApi.create({ name: "AI", color: "#112233" });
    expect(mocks.post).toHaveBeenCalledWith("/admin/tags", { name: "AI", color: "#112233" });
    mocks.get.mockResolvedValue(envelope({ id: "t1", rules: [] }));
    await tagsApi.get("t1");
    expect(mocks.get).toHaveBeenLastCalledWith("/admin/tags/t1");
  });

  it("replaces rules with the whole list and archives with DELETE", async () => {
    mocks.put.mockResolvedValue(envelope({ id: "t1", rules: [] }));
    const rules = [{ ruleKind: "topic", researchTopicId: "n1", effect: "include" }] as const;
    await tagsApi.replaceRules("t1", [...rules]);
    expect(mocks.put).toHaveBeenCalledWith("/admin/tags/t1/rules", { rules });
    mocks.delete.mockResolvedValue(envelope({}));
    await tagsApi.archive("t1");
    expect(mocks.delete).toHaveBeenCalledWith("/admin/tags/t1");
  });

  it("reads the preview and starts re-tagging jobs", async () => {
    mocks.get.mockResolvedValue(envelope({ matchedPapers: 2, sample: [] }));
    await tagsApi.preview("t1");
    expect(mocks.get).toHaveBeenCalledWith("/admin/tags/t1/preview");
    mocks.post.mockResolvedValue(envelope({ jobId: "j1", tagId: "t1" }));
    expect(await tagsApi.apply("t1")).toEqual({ jobId: "j1", tagId: "t1" });
    expect(mocks.post).toHaveBeenCalledWith("/admin/tags/t1/apply");
    await tagsApi.applyAll();
    expect(mocks.post).toHaveBeenLastCalledWith("/admin/tags/apply-all");
  });

  it("manages tagged papers", async () => {
    mocks.get.mockResolvedValue(envelope([], true));
    await tagsApi.papers("t1", { source: "blocked", q: "graph", page: 2, pageSize: 20 });
    expect(mocks.get).toHaveBeenCalledWith("/admin/tags/t1/papers", {
      params: { source: "blocked", q: "graph", page: 2, pageSize: 20 },
    });
    mocks.post.mockResolvedValue(envelope([]));
    await tagsApi.addPapers("t1", ["p1", "p2"]);
    expect(mocks.post).toHaveBeenCalledWith("/admin/tags/t1/papers", { paperIds: ["p1", "p2"] });
    mocks.delete.mockResolvedValue(envelope({ paperId: "p1", source: "blocked" }));
    expect(await tagsApi.removePaper("t1", "p1")).toEqual({ paperId: "p1", source: "blocked" });
    expect(mocks.delete).toHaveBeenCalledWith("/admin/tags/t1/papers/p1");
    mocks.post.mockResolvedValue(envelope({ jobId: "j2", tagId: "t1" }));
    await tagsApi.unblockPaper("t1", "p1");
    expect(mocks.post).toHaveBeenLastCalledWith("/admin/tags/t1/papers/p1/unblock");
  });
});

describe("tagCampaignsApi", () => {
  it("runs the preflight with the tag id", async () => {
    mocks.post.mockResolvedValue(envelope({ population: 5 }));
    expect(await tagCampaignsApi.preflight("t1")).toEqual({ population: 5 });
    expect(mocks.post).toHaveBeenCalledWith("/admin/openalex-ingest/tag-campaigns/preflight", { tagId: "t1" });
  });

  it("plans a campaign with the tag id and target", async () => {
    mocks.post.mockResolvedValue(envelope({ id: "c1", state: "planned" }));
    expect(await tagCampaignsApi.plan("t1", 250)).toEqual({ id: "c1", state: "planned" });
    expect(mocks.post).toHaveBeenCalledWith("/admin/openalex-ingest/tag-campaigns", { tagId: "t1", targetUniqueWorks: 250 });
  });

  it("lists the campaigns of one tag", async () => {
    mocks.get.mockResolvedValue(envelope([{ id: "c1" }]));
    expect(await tagCampaignsApi.list("t1")).toEqual([{ id: "c1" }]);
    expect(mocks.get).toHaveBeenCalledWith("/admin/openalex-ingest/tag-campaigns", { params: { tagId: "t1" } });
  });
});
