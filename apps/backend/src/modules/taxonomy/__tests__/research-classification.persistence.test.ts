import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { resolveResearchClassification } from "../research-classification.service.js";
import { researchClassificationSchema } from "../research-classification.schema.js";
import { researchCatalogService } from "../research-catalog.service.js";
import { normalizeTechnicalSkill } from "@trend/shared-types";
import { authService } from "../../auth/auth.service.js";
import { academicProfileService } from "../../academic-profiles/academic-profile.service.js";
import { projectService } from "../../projects/project.service.js";
import { projectMentorshipService } from "../../projects/project-mentorship.service.js";
const enabled = process.env.MENTOR_JOURNEY_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test database required");
describe.skipIf(!enabled).sequential("shared classification, onboarding and project setup", () => {
  const db = getPrisma(), marker = randomUUID(); let field: string, subfield: string, topic: string;
  beforeAll(async () => {
    field = (await db.researchTopic.create({ data: { topicName: `QA field ${marker}`, level: "field" } })).id;
    subfield = (await db.researchTopic.create({ data: { topicName: `QA specialization ${marker}`, level: "subfield", parentTopicId: field, aliases: [`alias ${marker}`] } })).id;
    topic = (await db.researchTopic.create({ data: { topicName: `QA topic ${marker}`, level: "topic", parentTopicId: subfield, syncedAt: new Date(), sourceVersion: "test-fixture" } })).id;
  });
  afterAll(disconnectPostgres);
  const input = () => ({ nodeIds: [topic], keywordIds: [], skillIds: ["pytorch"] });
  async function lecturer() { const user = await db.user.create({ data: { email: `${randomUUID()}@journey.invalid`, fullName: "Lecturer", emailVerifiedAt: new Date() } }); await authService.updateAcademicProfile(user.id, { academicRole: "LECTURER", institutionName: "Test University", positionTitle: "Lecturer", researchAreas: ["Computer Science"], researchInterests: ["Current interest"], researchClassification: input(), mentorshipPreferences: { interested: true, preferredTopics: ["A supervision topic"] } }); return user; }
  it("resolves hierarchy and provenance from authoritative nodes rather than client labels", async () => {
    const resolved = await resolveResearchClassification(input());
    expect(resolved.nodes.map(node => node.id)).toEqual([topic, subfield, field]);
    expect(resolved.nodes[0]).toMatchObject({ source: "LOCAL", sourceVersion: "test-fixture", parentId: subfield });
    expect(() => researchClassificationSchema.parse({ ...input(), nodes: [{ name: "Forged" }] })).toThrow();
  });
  it("rejects unknown, hidden and duplicate references and unrecognized skills", async () => {
    await expect(resolveResearchClassification({ ...input(), nodeIds: [randomUUID()] })).rejects.toMatchObject({ statusCode: 400 });
    const hidden = await db.researchTopic.create({ data: { topicName: "Hidden topic", status: "hidden" } });
    await expect(resolveResearchClassification({ ...input(), nodeIds: [hidden.id] })).rejects.toMatchObject({ statusCode: 400 });
    expect(() => researchClassificationSchema.parse({ ...input(), nodeIds: [topic, topic] })).toThrow();
    expect(() => researchClassificationSchema.parse({ ...input(), skillIds: ["arbitrary-tech-id"] })).toThrow();
  });
  it("normalizes only curated skill aliases, preserving ambiguous/unrelated terms", () => {
    expect(normalizeTechnicalSkill(" CV ")).toBe("computer-vision"); expect(normalizeTechnicalSkill("pytorch")).toBe("pytorch");
    expect(normalizeTechnicalSkill("R")).toBe("r"); expect(normalizeTechnicalSkill("React")).toBe("react"); expect(normalizeTechnicalSkill("CV writing")).toBe("cv writing");
  });
  it("searches taxonomy aliases and returns hierarchy context without external requests", async () => {
    const results = await researchCatalogService.search({ q: `alias ${marker}`, level: "subfield" });
    expect(results).toContainEqual(expect.objectContaining({ id: subfield, context: `QA field ${marker}` }));
  });
  it("persists distinct expertise, interests and supervision preferences without granting authority", async () => {
    const user = await lecturer(), profile = await academicProfileService.getMine(user.id);
    expect(profile.researchClassification?.nodeIds).toEqual([topic]); expect(profile.researchInterests).toEqual(["Current interest"]);
    expect(profile.supportAvailability).toMatchObject({ enabled: false, preferredTopics: ["A supervision topic"], requestedEnabled: true });
    expect(profile.academicRoleVerificationStatus).not.toBe("VERIFIED");
    await authService.updateAcademicProfile(user.id, { academicRole: "LECTURER", institutionName: "Test University", positionTitle: "Lecturer", researchAreas: ["Legacy field"] });
    expect((await academicProfileService.getMine(user.id)).researchClassification?.nodeIds).toEqual([topic]);
  });
  it("redacts canonical expertise under the existing field privacy", async () => {
    const user = await lecturer(), viewer = await lecturer();
    await academicProfileService.updateMine(user.id, { privacy: { expertise: "PRIVATE" } });
    expect((await academicProfileService.getPublic(user.id, viewer.id)).researchClassification).toBeUndefined();
    expect((await academicProfileService.getMine(user.id)).researchClassification?.nodeIds).toEqual([topic]);
  });
  it("creates a private project, preserves idempotency and requires explicit approval to share classification", async () => {
    const user = await lecturer(), request = { title: "Test proposal", researchClassification: input(), idempotencyKey: randomUUID() };
    const project = await projectService.createProject(request, user.id);
    expect(project.visibility).toBe("PRIVATE"); expect(project.researchClassification?.nodeIds).toEqual([topic]);
    expect((await projectService.createProject(request, user.id))._id).toBe(project._id);
    const stored = await db.project.findUniqueOrThrow({ where: { id: project._id } }); expect(stored.mentorshipClassification).toEqual({});
    await expect(projectService.createProject({ ...request, researchClassification: { ...input(), skillIds: [] } }, user.id)).rejects.toMatchObject({ statusCode: 409 });
    await projectMentorshipService.settings(project._id, user.id, { discovery: "CLOSED", summary: "Approved proposal text for reviewing methods with the team.", expertise: [], researchClassification: input(), expectedVersion: project.version });
    expect((await db.project.findUniqueOrThrow({ where: { id: project._id } })).mentorshipClassification).toMatchObject({ nodeIds: [topic] });
  });
});
