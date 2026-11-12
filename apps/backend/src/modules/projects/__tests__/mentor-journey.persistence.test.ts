import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { resolveResearchClassification } from "../../taxonomy/research-classification.service.js";
import { projectMentorshipService as service } from "../project-mentorship.service.js";
import { mentorAccessService } from "../mentor-access.service.js";
import { mentorshipTopicSuggestions } from "../mentorship-topic-suggestions.service.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn(), getJob: vi.fn() } }));
const enabled = process.env.MENTOR_JOURNEY_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test database required");
describe.skipIf(!enabled).sequential("canonical matching and the consent journey", () => {
  const db = getPrisma(), prefix = `Mentor journey ${randomUUID()}`; let field: string, subfield: string, topic: string;
  beforeAll(async () => {
    field = (await db.researchTopic.create({ data: { topicName: "Cross-disciplinary field", level: "field" } })).id;
    subfield = (await db.researchTopic.create({ data: { topicName: "Medical image analysis", level: "subfield", parentTopicId: field } })).id;
    topic = (await db.researchTopic.create({ data: { topicName: "Explainable chest imaging", level: "topic", parentTopicId: subfield } })).id;
  });
  afterAll(disconnectPostgres);
  const classification = (ids = [topic], skills = ["pytorch"]) => resolveResearchClassification({ nodeIds: ids, keywordIds: [], skillIds: skills });
  async function person(name: string, ids?: string[]) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@mentor-journey.invalid`, fullName: `${prefix} ${name}`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: user.id, academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", primaryPosition: "LECTURER", profileVisibility: "PUBLIC", expertiseAreas: ["Broad generic discipline"], researchClassification: ids ? await classification(ids) as never : {}, supportAvailability: { enabled: true, types: ["DATA_ANALYSIS"], preferredTopics: [] } } }); return user.id;
  }
  async function project() {
    const owner = await person("owner"), p = await createProjectFixture({ data: { title: "Medical image evaluation", ownerId: owner, status: "ACTIVE", researchClassification: await classification() as never, mentorshipSupportTypes: ["DATA_ANALYSIS"], mentorshipSummary: "An owner-approved research proposal about evaluating interpretable medical image models.", mentorshipExpertise: ["PyTorch"], mentorshipResearchAreas: ["Broad generic discipline"] } }); return { owner, p };
  }
  it("prioritizes exact topic, then subfield, then broad field with stable pagination", async () => {
    const { owner, p } = await project(), broad = await person("A broad", [field]), specialized = await person("B subfield", [subfield]), exact = await person("Z exact topic", [topic]);
    const result = await service.mentors(p.id, owner, { q: prefix, pageSize: 30 }); const ids = result.items.map(item => item._id);
    expect(ids.indexOf(exact)).toBeLessThan(ids.indexOf(specialized)); expect(ids.indexOf(specialized)).toBeLessThan(ids.indexOf(broad));
    expect(result.items.find(item => item._id === exact)?.matchExplanation).toMatchObject({ relevance: "HIGHLY_RELEVANT", topics: ["Explainable chest imaging"], skills: ["PyTorch"], support: ["DATA_ANALYSIS"] });
    const first = await service.mentors(p.id, owner, { q: prefix, pageSize: 1 }); expect((await service.mentors(p.id, owner, { q: prefix, pageSize: 1 })).items[0]._id).toBe(first.items[0]._id);
    expect(JSON.stringify(result)).not.toMatch(/matchPercent|similarityScore|suitabilityScore/);
  });
  it("matches cross-disciplinary canonical topics and curated technology aliases", async () => {
    const { owner, p } = await project(), lecturer = await person("cross-disciplinary", [topic]);
    await db.academicProfile.update({ where: { userId: lecturer }, data: { expertiseAreas: ["A different self-declared field"], skills: ["CV"] } });
    const found = await service.mentors(p.id, owner, { interest: topic, technology: "Computer Vision" });
    expect(found.items.some(item => item._id === lecturer)).toBe(true);
    expect((await service.mentors(p.id, owner, { technology: "CV writing" })).items.some(item => item._id === lecturer)).toBe(false);
  });
  it("never uses hidden canonical expertise in search, ranking or explanations", async () => {
    const { owner, p } = await project(), lecturer = await person("hidden", [topic]);
    await db.academicProfile.update({ where: { userId: lecturer }, data: { privacySettings: { expertise: "PRIVATE", researchInterests: "PRIVATE" } } });
    expect((await service.mentors(p.id, owner, { interest: topic })).items.some(item => item._id === lecturer)).toBe(false);
    const candidate = (await service.mentors(p.id, owner, { q: `${prefix} hidden` })).items.find(item => item._id === lecturer);
    expect(candidate?.matchExplanation).toMatchObject({ topics: [], fields: [], skills: [] });
    expect(JSON.stringify(candidate)).not.toContain("Explainable chest imaging");
  });
  it("excludes unavailable, private, unverified, collaboration-disabled and member candidates", async () => {
    const { owner, p } = await project();
    for (const [name, patch] of [["off", { supportAvailability: { enabled: false } }], ["private", { profileVisibility: "PRIVATE" }], ["unverified", { roleVerificationStatus: "SELF_DECLARED" }], ["disabled requests", { allowCollaborationRequests: false }]] as const) {
      const id = await person(name, [topic]); await db.academicProfile.update({ where: { userId: id }, data: patch });
      expect((await service.mentors(p.id, owner, { q: `${prefix} ${name}` })).items.some(item => item._id === id)).toBe(false);
      if (name === "disabled requests") await expect(service.request(p.id, owner, { mentorUserId: id, message: "Please help with methods" })).rejects.toMatchObject({ statusCode: 409 });
    }
    const member = await person("member", [topic]); await db.projectMember.create({ data: { projectId: p.id, userId: member } });
    expect((await service.mentors(p.id, owner, {})).items.some(item => item._id === member)).toBe(false);
  });
  it("uses the approved taxonomy in the invitation and accepts exactly one relationship", async () => {
    const { owner, p } = await project(), lecturer = await person("invitee", [topic]);
    const settings = await service.settings(p.id, owner, { discovery: "CLOSED", summary: p.mentorshipSummary!, expertise: ["PyTorch"], researchClassification: { nodeIds: [topic], keywordIds: [], skillIds: ["pytorch"] }, supportTypes: ["DATA_ANALYSIS"], expectedVersion: p.version });
    const key = randomUUID(), requestInput = { mentorUserId: lecturer, message: "Please help us evaluate this research method.", idempotencyKey: key, expectedPreviewToken: settings.previewToken };
    const request = await service.request(p.id, owner, requestInput); expect((await service.request(p.id, owner, requestInput)).id).toBe(request.id);
    expect(request.project?.researchClassification?.nodeIds).toEqual([topic]); expect(request.expiresAt && new Date(request.expiresAt).getTime() - new Date(request.createdAt).getTime()).toBeCloseTo(6 * 86400000, -3);
    await expect(mentorAccessService.workspace(p.id, lecturer)).rejects.toMatchObject({ statusCode: 404 });
    const outcomes = await Promise.all([service.accept(p.id, request.id, lecturer, undefined, request.accessPolicy?.version, request.previewToken), service.accept(p.id, request.id, lecturer, undefined, request.accessPolicy?.version, request.previewToken)]);
    expect(outcomes.every(item => item.status === "ACCEPTED")).toBe(true);
    expect(await db.mentorRelationship.count({ where: { projectId: p.id, mentorUserId: lecturer } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: p.id, userId: lecturer } })).toBe(0);
    const workspace = await mentorAccessService.workspace(p.id, lecturer); expect(workspace.canManage).toBe(false);
  });
  it("keeps a declined invitation in history, releases its role and enforces cooldown", async () => {
    const { owner, p } = await project(), lecturer = await person("declines", [topic]);
    const request = await service.request(p.id, owner, { mentorUserId: lecturer, message: "Invitation for research support." });
    expect((await service.decline(p.id, request.id, lecturer)).status).toBe("DECLINED");
    expect(await db.mentorRelationship.count({ where: { projectId: p.id } })).toBe(0);
    expect((await service.mine(lecturer, { view: "history" })).requests.some(item => item.id === request.id)).toBe(true);
    await expect(service.request(p.id, owner, { mentorUserId: lecturer, message: "Repeated invitation." })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("refuses suggestion consent from outsiders and rejects stale or missing authorization", async () => {
    const { owner, p } = await project(), outsider = await person("outsider");
    await expect(service.topicSuggestions(p.id, outsider, { authorized: true, expectedVersion: p.version })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.topicSuggestions(p.id, owner, { authorized: false, expectedVersion: p.version } as never)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.topicSuggestions(p.id, owner, { authorized: true, expectedVersion: p.version + 1 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("keeps supervision preferences separate from declared research expertise", async () => {
    const { owner, p } = await project(), broad = await person("supervision A broad", [field]), willing = await person("supervision Z willing", [field]);
    await db.academicProfile.update({ where: { userId: willing }, data: { supportAvailability: { enabled: true, types: ["DATA_ANALYSIS"], preferredTopicIds: [topic] } } });
    const result = await service.mentors(p.id, owner, { q: `${prefix} supervision`, pageSize: 30 });
    expect(result.items.findIndex(item => item._id === willing)).toBeLessThan(result.items.findIndex(item => item._id === broad));
    expect(result.items.find(item => item._id === willing)?.matchExplanation).toMatchObject({ topics: [], supervisionTopics: ["Explainable chest imaging"], relevance: "RELEVANT" });
  });
  it("adds exact keyword provenance without overwriting existing provider identities or aliases", async () => {
    const suffix = randomUUID(), label = `local keyword ${suffix}`, externalId = `local-keyword-${suffix}`;
    const keyword = await db.keyword.create({ data: { keywordName: label, normalizedName: label, aliases: ["curated alias"] } });
    const imported = await mentorshipTopicSuggestions.importSuggestions({ topics: [], keywords: [{ id: `https://openalex.org/keywords/${externalId}`, display_name: label }] });
    expect(imported.classification.keywordIds).toEqual([keyword.id]);
    expect(await db.keyword.findUnique({ where: { id: keyword.id } })).toMatchObject({ openalexId: externalId, aliases: ["curated alias"], keywordName: label });
    const conflicting = await mentorshipTopicSuggestions.importSuggestions({ topics: [], keywords: [{ id: `https://openalex.org/keywords/other-${suffix}`, display_name: label }] });
    expect(conflicting.classification.keywordIds).toEqual([]);
    expect((await db.keyword.findUniqueOrThrow({ where: { id: keyword.id } })).openalexId).toBe(externalId);
  });
  it("imports provider IDs, hierarchy and provenance without inventing academic IDs", async () => {
    const result = await mentorshipTopicSuggestions.importSuggestions({ topics: [{ id: "https://openalex.org/T10560", display_name: "Diabetes Management and Research", score: 0.995, domain: { id: "https://openalex.org/domains/4", display_name: "Health Sciences" }, field: { id: "https://openalex.org/fields/27", display_name: "Medicine" }, subfield: { id: "https://openalex.org/subfields/2712", display_name: "Endocrinology, Diabetes and Metabolism" } }], keywords: [{ id: "https://openalex.org/keywords/type-1-diabetes", display_name: "type 1 diabetes" }] });
    expect(result.source).toBe("OPENALEX"); expect(result.classification.nodes).toContainEqual(expect.objectContaining({ externalId: "T10560", source: "OPENALEX" }));
    expect(result.classification.keywords[0]).toMatchObject({ externalId: "type-1-diabetes", source: "OPENALEX" });
    expect(result.topicConfidence?.[result.classification.nodeIds[0]]).toBe(0.995);
    const invalid = await mentorshipTopicSuggestions.importSuggestions({ topics: [], keywords: [{ id: "https://evil.invalid/keywords/injected", display_name: "Invalid identifier" }] }); expect(invalid.classification.keywordIds).toEqual([]);
  });
});
