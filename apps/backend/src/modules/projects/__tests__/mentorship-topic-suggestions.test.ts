import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { mentorshipTopicSuggestions as service, MENTOR_TOPICS_JOB } from "../mentorship-topic-suggestions.service.js";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), fetch: vi.fn(), get: vi.fn(), set: vi.fn(), gate: vi.fn(), add: vi.fn(), job: vi.fn() }));
vi.mock("../academic-relationship-access.js", () => ({ assertAcademicRelationshipManager: mocks.authorize }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: { get: mocks.get, set: mocks.set } }));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: { set: mocks.gate } }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: { add: mocks.add, getJob: mocks.job } }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ appendOpenAlexIdentity: vi.fn() }));
const project = { title: "Research methods", mentorshipSummary: "Approved abstract for an interpretable research project.", status: "ACTIVE" };
const result = { source: "OPENALEX" as const, generatedAt: new Date().toISOString(), classification: { nodeIds: [], keywordIds: [], skillIds: [], nodes: [], keywords: [], vocabularyVersion: "test" } };
const payload = () => ({ ownerId: "owner", projectId: "project", title: project.title, abstract: project.mentorshipSummary, consentAt: new Date().toISOString(), inputHash: createHash("sha256").update(JSON.stringify([project.title, project.mentorshipSummary])).digest("hex") });
beforeEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.authorize.mockResolvedValue(project); mocks.get.mockResolvedValue(null); mocks.gate.mockResolvedValue("OK"); });
it("posts only the authorized approved text to the fixed provider endpoint and caches scoped results", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ topics: [], keywords: [] }) }); vi.spyOn(service, "importSuggestions").mockResolvedValue(result);
  expect(await service.process(payload())).toBe(result);
  const [url, options] = mocks.fetch.mock.calls[0]; expect(new URL(url).origin).toBe("https://api.openalex.org"); expect(new URL(url).pathname).toBe("/text");
  expect(new URL(url).searchParams.has("abstract")).toBe(false); expect(JSON.parse(options.body)).toEqual({ title: project.title, abstract: project.mentorshipSummary });
  expect(mocks.set.mock.calls[0][0]).toContain("project:owner:");
});
it("makes no provider request when owner authorization was revoked or approved text changed", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Access revoked")); await expect(service.process(payload())).rejects.toThrow("Access revoked"); expect(mocks.fetch).not.toHaveBeenCalled();
  await expect(service.process({ ...payload(), inputHash: "outdated" })).rejects.toThrow("Approved research brief changed"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("uses local taxonomy on timeout, malformed response and provider failure without logging the body", async () => {
  const fallback = { ...result, source: "LOCAL" as const }; vi.spyOn(service, "localSuggestions").mockResolvedValue(fallback);
  mocks.fetch.mockRejectedValueOnce(new Error("Timeout")); expect((await service.process(payload())).source).toBe("LOCAL");
  mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ topics: "invalid" }) }); expect((await service.process(payload())).source).toBe("LOCAL");
  mocks.fetch.mockResolvedValueOnce({ ok: false }); expect((await service.process(payload())).source).toBe("LOCAL");
});
it("honors the provider-wide rate gate and does not multiply billable calls", async () => {
  mocks.gate.mockResolvedValue(null); await expect(service.process(payload())).rejects.toMatchObject({ statusCode: 409 }); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("returns cached results without contacting the provider", async () => {
  mocks.get.mockResolvedValue(result); expect(await service.process(payload())).toBe(result); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("never exposes another owner's suggestion job or raw queue payload", async () => {
  mocks.job.mockResolvedValue({ name: MENTOR_TOPICS_JOB, data: { projectId: "project", ownerId: "someone-else" } }); await expect(service.status("project", "owner", "job")).rejects.toMatchObject({ statusCode: 404 });
  mocks.job.mockResolvedValue({ name: MENTOR_TOPICS_JOB, data: { projectId: "project", ownerId: "owner", abstract: "Private" }, getState: async () => "completed", returnvalue: result });
  expect(await service.status("project", "owner", "job")).toEqual({ jobId: "job", status: "COMPLETED", result });
});
