import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { mentorshipApplicationsService as applications } from "../mentorship-applications.service.js";
import { projectMentorshipService as consent } from "../project-mentorship.service.js";
import { mentorPositions } from "../mentorship-positions.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { mentorAccessService } from "../mentor-access.service.js";
import { mentorPresets } from "@trend/shared-types";
import express from "express";
import { once } from "node:events";
import { mentorshipApplicationsRouter } from "../mentorship-applications.routes.js";
import { requireAuth } from "../../../common/middleware/auth.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.MENTOR_APPLICATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test database required");
describe.skipIf(!enabled).sequential("mentoring applicant pool on PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, lecturers: string[];
  async function user(lecturer = false) {
    const row = await db.user.create({ data: { fullName: lecturer ? "Verified applicant" : "Research team", email: `${randomUUID()}@applicant.invalid`, emailVerifiedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "STUDENT", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: lecturer }, expertiseAreas: ["Computer vision"], skills: ["Survey"] } }); return row.id;
  }
  beforeEach(async () => { owner = await user(); member = await user(); lecturers = await Promise.all([user(true), user(true), user(true)]); });
  afterAll(disconnectPostgres);
  async function project(extra = {}) {
    const p = await createProjectFixture({ data: { ownerId: owner, title: "Computer vision research", description: "DO-NOT-SHARE-PRIVATE-RESEARCH", mentorshipSummary: "A shared abstract describing computer vision methods for an undergraduate research project", mentorshipDiscovery: "SEEKING_MENTOR", mentorshipResearchAreas: ["Computer vision"], mentorshipMethodologies: ["Survey"], mentorshipNeeds: "Study design and weekly feedback", ...extra } });
    await db.projectMember.create({ data: { projectId: p.id, userId: member } }); return p;
  }
  const input = () => ({ message: "I can guide computer vision study design and analysis", mentorRole: "PRIMARY", areas: ["Computer vision"], methodologies: ["Survey"], capabilities: ["Study design"], availability: "One review meeting each week", idempotencyKey: randomUUID() });
  const apply = async (p: string, lecturer = lecturers[0]!) => applications.apply(p, lecturer, input());
  const detail = (p: string, id: string, actor = owner) => applications.detail(p, id, actor);
  const invite = async (p: string, id: string, lecturer: string, extra = {}) => {
    const view = await detail(p, id);
    return consent.request(p, owner, { mentorUserId: lecturer, message: "Please guide the methodology and provide regular feedback", mentorRole: "PRIMARY", applicationId: id, expectedApplicationVersion: view.version, idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null }, ...extra });
  };
  it("collects multiple applicants without creating requests, occupying slots or granting private access", async () => {
    const p = await project(); await Promise.all(lecturers.map(id => apply(p.id, id)));
    expect((await applications.list(p.id, owner)).meta.total).toBe(3);
    expect(await db.mentorshipRequest.count({ where: { projectId: p.id } })).toBe(0);
    expect((await mentorPositions(p.id)).PRIMARY.status).toBe("VACANT");
    for (const lecturer of lecturers) expect(await canAccessProjectAsMentor(p.id, lecturer)).toBe(false);
    const mine = await applications.mine(lecturers[0]!);
    expect(JSON.stringify(mine)).not.toContain("DO-NOT-SHARE-PRIVATE-RESEARCH");
    await expect(consent.workspace(p.id, lecturers[0]!)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("makes concurrent identical submissions idempotent and rejects changed reuse or duplicate active submissions", async () => {
    const p = await project(), data = input();
    const rows = await Promise.all([applications.apply(p.id, lecturers[0]!, data), applications.apply(p.id, lecturers[0]!, data)]);
    expect(rows[0].id).toBe(rows[1].id);
    await expect(applications.apply(p.id, lecturers[0]!, { ...data, availability: "Different availability declaration" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(apply(p.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.mentorshipApplication.count({ where: { projectId: p.id } })).toBe(1);
  });
  it.each(["ARCHIVED", "COMPLETED"])("rejects a %s project", async status => {
    const p = await project({ status }); await expect(apply(p.id)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects closed discovery, members, owner, unavailable and unverified lecturers", async () => {
    const p = await project({ mentorshipDiscovery: "CLOSED" }); await expect(apply(p.id)).rejects.toMatchObject({ statusCode: 409 });
    await db.project.update({ where: { id: p.id }, data: { mentorshipDiscovery: "SEEKING_MENTOR" } });
    const unverified = await user(true); await db.academicProfile.update({ where: { userId: unverified }, data: { roleVerificationStatus: "SELF_DECLARED" } });
    await expect(apply(p.id, unverified)).rejects.toMatchObject({ statusCode: 403 });
    const unavailable = await user(true); await db.academicProfile.update({ where: { userId: unavailable }, data: { supportAvailability: { enabled: false } } });
    await expect(apply(p.id, unavailable)).rejects.toMatchObject({ statusCode: 409 });
    await db.projectMember.create({ data: { projectId: p.id, userId: lecturers[0]! } });
    await expect(apply(p.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(apply(p.id, owner)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("limits applicant reads and decisions to the owner and their own application", async () => {
    const p = await project(), a = await apply(p.id), other = await project();
    await expect(applications.list(p.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(detail(p.id, a.id, lecturers[1]!)).rejects.toMatchObject({ statusCode: 404 });
    await expect(detail(other.id, a.id)).rejects.toMatchObject({ statusCode: 404 });
    for (const actor of [lecturers[0]!, member]) await expect(applications.action(p.id, a.id, actor, { action: "SHORTLIST", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: actor === member ? 404 : 403 });
    const shortlisted = await applications.action(p.id, a.id, owner, { action: "SHORTLIST", expectedVersion: 1 });
    expect(shortlisted.status).toBe("SHORTLISTED");
    await expect(applications.action(p.id, a.id, owner, { action: "DECLINE", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("allows only the applicant to withdraw and preserves the prior application on reapplication", async () => {
    const p = await project(), originalInput = input(), a = await applications.apply(p.id, lecturers[0]!, originalInput);
    await expect(applications.action(p.id, a.id, owner, { action: "WITHDRAW", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    expect((await applications.action(p.id, a.id, lecturers[0]!, { action: "WITHDRAW", expectedVersion: 1 })).status).toBe("WITHDRAWN");
    const again = await apply(p.id); expect(again.id).toBe(a.id);
    expect((await detail(p.id, a.id)).events.map(event => event.type)).toEqual(expect.arrayContaining(["APPLIED", "WITHDRAWN"]));
    expect(await applications.apply(p.id, lecturers[0]!, originalInput)).toEqual(a);
    expect(await db.mentorshipApplicationEvent.count({where:{applicationId:a.id,type:"APPLIED"}})).toBe(2);
  });
  it("keeps clarification private, idempotent and separate from project chat or access", async () => {
    const p = await project(), a = await apply(p.id), note = { body: "Can you provide weekly feedback on our survey design?", clientKey: randomUUID() };
    await applications.note(p.id, a.id, owner, note); await applications.note(p.id, a.id, owner, note);
    await applications.note(p.id, a.id, lecturers[0]!, { body: "Yes, one meeting and written feedback every week", clientKey: randomUUID() });
    await expect(applications.note(p.id, a.id, lecturers[1]!, note)).rejects.toMatchObject({ statusCode: 404 });
    expect((await detail(p.id, a.id)).notes).toHaveLength(2);
    expect(await db.projectChatMessage.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.mentorAccess.count({ where: { projectId: p.id } })).toBe(0);
    const global = await db.auditLog.findMany({ where: { targetRecordId: a.id } });
    expect(JSON.stringify(global)).not.toContain(note.body);
    const saved=await db.mentorshipApplicationNote.findFirstOrThrow({where:{applicationId:a.id}});
    await expect(db.mentorshipApplicationNote.update({where:{id:saved.id},data:{body:"Rewritten clarification"}})).rejects.toThrow();
    await expect(db.mentorshipApplicationEvent.deleteMany({where:{applicationId:a.id}})).rejects.toThrow();
  });
  it("creates only an official invitation on selection, then activates the normal relationship after explicit acceptance", async () => {
    const p = await project(), a = await apply(p.id), request = await invite(p.id, a.id, lecturers[0]!);
    expect((await detail(p.id, a.id)).status).toBe("INVITED");
    expect(await canAccessProjectAsMentor(p.id, lecturers[0]!)).toBe(false);
    expect(await db.mentorRelationship.count({ where: { projectId: p.id } })).toBe(0);
    await consent.accept(p.id, request.id, lecturers[0]!, "Accepted", request.accessPolicy?.version);
    expect((await detail(p.id, a.id)).status).toBe("ACCEPTED");
    expect(await canAccessProjectAsMentor(p.id, lecturers[0]!)).toBe(true);
    expect(await db.mentorRelationship.count({ where: { projectId: p.id, mentorRole: "PRIMARY", status: "ACTIVE" } })).toBe(1);
    const relationship = await db.mentorRelationship.findUniqueOrThrow({where:{sourceRequestId:request.id}});
    await consent.end(p.id,relationship.id,owner,"The planned mentoring work has ended");
    expect((await detail(p.id,a.id)).status).toBe("CLOSED");
    expect(await canAccessProjectAsMentor(p.id,lecturers[0]!)).toBe(false);
  });
  it.each([false, true])("closes the linked application immediately when access is revoked (accepted: %s)", async accepted => {
    const p = await project(), a = await apply(p.id), request = await invite(p.id, a.id, lecturers[0]!);
    if (accepted) await consent.accept(p.id, request.id, lecturers[0]!, "Accepted", request.accessPolicy?.version);
    const access = await db.mentorAccess.findUniqueOrThrow({ where: { requestId: request.id } });
    await mentorAccessService.revoke(p.id, owner, access.id, { expectedVersion: access.version, reason: "Owner ended the mentoring arrangement", confirmed: true });
    // Assert persisted state before a read can reconcile it as a side effect.
    const stored = await db.mentorshipApplication.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.status).toBe("CLOSED");
    expect(await db.mentorshipApplicationEvent.count({ where: { applicationId: a.id, type: accepted ? "RELATIONSHIP_ENDED" : "CLOSED" } })).toBe(1);
    expect(await canAccessProjectAsMentor(p.id, lecturers[0]!)).toBe(false);
  });
  it("enforces owner authorization, revalidates eligibility and prevents concurrent same-role selection", async () => {
    const p = await project(), [a,b] = await Promise.all([apply(p.id),apply(p.id,lecturers[1]!)]);
    await expect(consent.request(p.id, member, { mentorUserId: lecturers[0]!, message: "An unauthorized invitation to an applicant", applicationId: a.id, expectedApplicationVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.allSettled([invite(p.id,a.id,lecturers[0]!),invite(p.id,b.id,lecturers[1]!)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.mentorshipRequest.count({ where: { projectId: p.id, status: "PENDING" } })).toBe(1);
    expect(await db.mentorshipApplication.count({ where: { projectId: p.id, status: "INVITED" } })).toBe(1);
    expect(await db.mentorshipApplication.count({ where: { projectId: p.id, status: "APPLIED" } })).toBe(1);
    const q = await project(), applicant = await apply(q.id,lecturers[2]!);
    await db.academicProfile.update({ where: { userId: lecturers[2]! }, data: { supportAvailability: { enabled: false } } });
    await expect(invite(q.id,applicant.id,lecturers[2]!)).rejects.toMatchObject({ statusCode: 409 });
    await db.academicProfile.update({ where: { userId: lecturers[2]! }, data: { supportAvailability: { enabled: true } } });
  });
  it.each(["decline", "cancel", "expire"])("%s does not activate an alternate applicant", async outcome => {
    const p = await project(), a = await apply(p.id); await apply(p.id,lecturers[1]!); const request = await invite(p.id,a.id,lecturers[0]!);
    if (outcome === "expire") { await db.mentorshipRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now()-1000) } }); await consent.expireRequests(); }
    else if (outcome === "decline") await consent.decline(p.id,request.id,lecturers[0]!);
    else await consent.cancel(p.id,request.id,owner);
    expect((await detail(p.id,a.id)).status).toBe(outcome === "decline" ? "DECLINED" : "CLOSED");
    expect(await db.mentorRelationship.count({ where: { projectId: p.id } })).toBe(0);
    expect(await db.mentorshipApplication.count({ where: { projectId: p.id, status: "APPLIED" } })).toBe(1);
  });
  it("uses only visible profile evidence and labels missing publications without inventing authorship", async () => {
    const p = await project(), a = await apply(p.id);
    const evidence = (await detail(p.id,a.id)).evidence!;
    expect(evidence.methodologies).toEqual(["Survey"]); expect(evidence.publications).toEqual([]);
    expect(evidence.topics).toContainEqual({ term: "Computer vision", source: "APPLICATION_DECLARATION" });
    await db.academicProfile.update({ where: { userId: lecturers[0]! }, data: { profileVisibility: "PRIVATE" } });
    const hidden = (await detail(p.id,a.id)).evidence!;
    expect(hidden.profileVisible).toBe(false); expect(hidden.topics.some(term=>term.source==="PROFILE_DECLARATION")).toBe(false);
    expect(hidden.identities).toEqual([]); expect(hidden.publications).toEqual([]);
    await db.academicProfile.update({ where: { userId: lecturers[0]! }, data: { profileVisibility: "PUBLIC" } });
  });
  it("never links an OpenAlex author by name or an unverified ORCID identity and honors link privacy", async () => {
    const p = await project(), a = await apply(p.id), profile = await db.academicProfile.findUniqueOrThrow({where:{userId:lecturers[0]!}});
    const orcid = `0000-${Date.now().toString().slice(-12).match(/.{4}/g)!.join("-")}`;
    const author = await db.author.create({data:{displayName:"Verified applicant",openalexId:`A${Date.now()}`,orcid}});
    const paper = await db.paper.create({data:{title:"Computer vision evidence from OpenAlex",publicationYear:2025,primaryProvider:"openalex",dataStatus:"active",doi:`10.1000/${randomUUID()}`}});
    await db.paperAuthor.create({data:{paperId:paper.id,authorId:author.id,displayName:author.displayName,position:0}});
    expect((await detail(p.id,a.id)).evidence?.publications).toEqual([]);
    const link=await db.academicIdentityLink.create({data:{userId:lecturers[0]!,provider:"ORCID",identifier:author.orcid,profileUrl:`https://orcid.org/${author.orcid}`,visibility:"PUBLIC",status:"SELF_DECLARED",connectionMethod:"MANUAL",verificationStatus:"UNVERIFIED"}});
    expect((await detail(p.id,a.id)).evidence?.publications).toEqual([]);
    await db.academicIdentityLink.update({where:{id:link.id},data:{connectionMethod:"OAUTH",status:"CONNECTED",verificationStatus:"PROVIDER_CONNECTED"}});
    expect((await detail(p.id,a.id)).evidence?.publications).toEqual([expect.objectContaining({title:paper.title,attribution:"LINKED_IDENTITY",source:"openalex"})]);
    await db.academicIdentityLink.update({where:{id:link.id},data:{visibility:"PRIVATE"}});
    expect((await detail(p.id,a.id)).evidence?.publications).toEqual([]);
    await db.academicProfile.update({where:{id:profile.id},data:{privacySettings:{expertise:"PRIVATE",researchInterests:"PRIVATE"}}});
    expect((await detail(p.id,a.id)).evidence?.topics.some(topic=>topic.source==="PROFILE_DECLARATION")).toBe(false);
  });
  it("keeps applications discoverable while someone else holds a formal pending invitation", async () => {
    const p=await project(); await consent.request(p.id,owner,{mentorUserId:lecturers[0]!,message:"Please guide our computer vision research"});
    const opportunities=await consent.discovery(lecturers[1]!,{q:p.title});
    expect(opportunities.items.some(project=>project.id===p.id)).toBe(true);
    await apply(p.id,lecturers[1]!);expect((await mentorPositions(p.id)).PRIMARY.status).toBe("INVITING");
    expect(await db.mentorshipRequest.count({where:{projectId:p.id,status:"PENDING"}})).toBe(1);
  });
  it("enforces database uniqueness and cross-project request foreign keys independently of services", async () => {
    const p=await project(), q=await project(), a=await apply(p.id);
    const row=await db.mentorshipApplication.findUniqueOrThrow({where:{id:a.id}});const {id:_id,...data}=row;
    await expect(db.mentorshipApplication.create({data:{...data,submissionKey:randomUUID()}})).rejects.toMatchObject({code:"P2002"});
    await expect(db.mentorshipRequest.create({data:{projectId:q.id,mentorUserId:lecturers[0]!,requestedBy:owner,message:"Cross-project request",applicationId:a.id}})).rejects.toMatchObject({code:"P2003"});
  });
  it("validates authenticated HTTP bodies, scopes, privacy headers and error envelopes", async () => {
    const p=await project();
    const app=express();app.use(express.json());app.use('/projects/:id/mentorship-applications',requireAuth,mentorshipApplicationsRouter);app.use(errorHandler);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}/projects/${p.id}/mentorship-applications`;
    async function token(id:string){const familyId=randomUUID();await db.refreshToken.create({data:{userId:id,familyId,tokenHash:hashOpaqueToken(randomUUID()),expiresAt:new Date(Date.now()+3600000)}});return tokenService.signAccessToken({sub:id,systemRole:"USER",sessionId:familyId}).token;}
    const [lecturerToken,ownerToken,memberToken]=await Promise.all([token(lecturers[0]!),token(owner),token(member)]);
    const post=(body:unknown)=>fetch(origin,{method:'POST',headers:{Authorization:`Bearer ${lecturerToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    try{
      expect((await fetch(origin)).status).toBe(401);
      expect((await post({...input(),message:"tiny"})).status).toBe(400);
      const response=await post(input());expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('private, no-store');
      const payload=await response.json() as {success:boolean;data:{id:string}};expect(payload.success).toBe(true);
      const denied=await fetch(origin,{headers:{Authorization:`Bearer ${memberToken}`}});expect(denied.status).toBe(403);expect((await denied.json() as {success:boolean}).success).toBe(false);
      const list=await fetch(origin,{headers:{Authorization:`Bearer ${ownerToken}`}});expect(list.status).toBe(200);expect(JSON.stringify(await list.json())).not.toContain('DO-NOT-SHARE-PRIVATE-RESEARCH');
      expect((await fetch(`${origin}/${payload.data.id}`,{headers:{Authorization:`Bearer ${lecturerToken}`}})).status).toBe(200);
    } finally {server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
  it("routes legacy new offers into the pool while existing owner invitation flows remain available", async () => {
    const p = await project(); await consent.offer(p.id,lecturers[0]!,{message:"I can guide the research methods and analysis",idempotencyKey:randomUUID()});
    expect(await db.mentorshipRequest.count({ where:{projectId:p.id} })).toBe(0);
    const q = await project(); const request = await consent.request(q.id,owner,{mentorUserId:lecturers[1]!,message:"Please guide our research methods and analysis"});
    expect(request.status).toBe("PENDING"); expect(await db.mentorshipApplication.count({where:{projectId:q.id}})).toBe(0);
  });
});
