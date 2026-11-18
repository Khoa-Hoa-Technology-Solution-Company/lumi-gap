import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { researchContributions as read, manuscriptContributionStatement as statement, researchContributionArtifact } from "../research-contribution-projection.js";
import { researchContributionsQuerySchema as query, activitySchema } from "../dto/project-contributions.schema.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { contributionActivityService } from "../contribution-activity.service.js";
import { projectTasksService } from "../project-tasks.service.js";
import { manuscriptAttributionService } from "../../workspaces/manuscript-attribution.service.js";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { screeningService } from "../screening.service.js";
import { projectEvidenceService } from "../project-evidence.service.js";
import { projectSynthesisService } from "../project-synthesis.service.js";
import { contributionProtectionService } from "../contribution-protection.service.js";

vi.mock("../../../infrastructure/queue.js", () => {
  const queue=()=>({add:vi.fn().mockResolvedValue({}),getJob:vi.fn().mockResolvedValue(null)});
  return {QUEUE_NAMES:{},notificationQueue:queue(),aiJobsQueue:queue(),apiSyncQueue:queue(),openAlexIngestQueue:queue(),corpusValidationQueue:queue(),embeddingQueue:queue(),paperAnalysisQueue:queue(),reportQueue:queue(),gapsQueue:queue(),taggingQueue:queue(),topicBackfillQueue:queue(),manuscriptCompileQueue:queue(),communitySummaryQueue:queue(),hasLiveJob:vi.fn().mockResolvedValue(false)};
});
const enabled = process.env.MENTOR_WORKSPACE_INTEGRATION === "1";
if (enabled && !/^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error("Isolated contribution database required");
describe.skipIf(!enabled).sequential("research contributions from real PostgreSQL sources", () => {
  const db = getPrisma(); afterAll(disconnectPostgres);
  async function user(mentor = false) {
    const u = await db.user.create({ data: { fullName: mentor ? "Academic mentor" : `Researcher ${randomUUID()}`, email: `${randomUUID()}@research.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: u.id, academicRole: mentor ? "LECTURER" : "RESEARCHER", primaryPosition: mentor ? "LECTURER" : "RESEARCH_STAFF", roleVerificationStatus: mentor ? "VERIFIED" : "SELF_DECLARED", positionStatus: mentor ? "VERIFIED" : "NOT_SUBMITTED" } }); return u.id;
  }
  async function fixture(mentorId?: string) {
    const owner = await user(), member = await user(), peer = await user(), mentor = mentorId ?? await user(true);
    const p = await createProjectFixture({ data: { ownerId: owner, title: "Research contribution scope", status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [member,peer].map(userId => ({ projectId:p.id,userId })) });
    const invitation = await db.mentorshipRequest.create({ data: { projectId:p.id,mentorUserId:mentor,requestedBy:owner,status:"ACCEPTED" } });
    const relation = await db.mentorRelationship.create({ data: { projectId:p.id,mentorUserId:mentor,sourceRequestId:invitation.id } });
    const access = await db.mentorAccess.create({ data: { projectId:p.id,mentorUserId:mentor,requestId:invitation.id,relationshipId:relation.id,configuredById:owner,permissions:["CONTRIBUTIONS_VIEW","SUBMISSIONS_VIEW"] } });
    return { projectId:p.id, owner,member,peer,mentor,access };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function draft(f:Fixture) {
    const d = await db.draftWorkspace.create({ data:{ projectId:f.projectId,createdById:f.owner,name:"Private manuscript",writingMode:"LATEX" } });
    const snap = await db.manuscriptSnapshot.create({ data:{workspaceId:d.id,projectId:f.projectId,label:"Version one",sourceVersion:1,manifest:{},checksum:"0".repeat(64),createdById:f.owner,clientKey:randomUUID()} }); return {d,snap};
  }
  async function review(f:Fixture, round=1, existing?: Awaited<ReturnType<typeof reviewBase>>) {
    const r = existing ?? await reviewBase(f);
    const revision = round===1 ? r.initialRevision : await db.submissionRevision.create({data:{submissionId:r.s.id,revisionNumber:round,uploadedById:f.owner,contentType:"MARKDOWN",contentSnapshot:`Scientific manuscript v${round}`,sizeBytes:25}});
    const hr = await db.humanReview.create({data:{assignmentId:r.assignment.id,submissionId:r.s.id,revisionId:revision.id,reviewerId:f.mentor,roundNumber:round,status:"SUBMITTED",overallComment:"Explain the methodology and add a suitable comparison group.",submittedAt:new Date()}});
    return {...r,revision,hr};
  }
  async function reviewBase(f:Fixture) {
    const s=await db.submission.create({data:{projectId:f.projectId,createdById:f.owner,title:"Shared manuscript"}});
    const initialRevision=await db.submissionRevision.create({data:{submissionId:s.id,revisionNumber:1,uploadedById:f.owner,contentType:"MARKDOWN",contentSnapshot:"Scientific manuscript version one",sizeBytes:32}});
    const template=await db.reviewTemplate.create({data:{name:"Test rubric"}});
    const version=await db.reviewTemplateVersion.create({data:{templateId:template.id,versionNumber:1,status:"PUBLISHED",reviewMode:"RUBRIC_ASSESSMENT"}});
    const request=await db.reviewRequest.create({data:{projectId:f.projectId,submissionId:s.id,artifactRevisionId:initialRevision.id,requesterId:f.owner,templateVersionId:version.id,origin:"MENTOR_GUIDANCE",status:"ACCEPTED"}});
    const assignment=await db.reviewerAssignment.create({data:{submissionId:s.id,artifactRevisionId:initialRevision.id,reviewRequestId:request.id,reviewerId:f.mentor,assignedById:f.owner,mentorAccessId:f.access.id,anonymousCode:randomUUID(),status:"accepted"}});
    await db.mentorResourceShare.create({data:{accessId:f.access.id,projectId:f.projectId,kind:"SUBMISSION",resourceId:s.id,sharedById:f.owner,title:"Shared version",content:"Explicit submission sharing"}});
    return {s,request,assignment,initialRevision};
  }
  const claim=(f:Fixture,refs: {kind:"MANUSCRIPT";id:string}[] = [])=>({title:"Offline method design",description:"Designed a comparison protocol outside the platform.",source:"MANUAL" as const,workDate:new Date().toISOString(),participants:[{userId:f.member,roles:["METHODOLOGY" as const]}],evidence:"Dated experiment protocol notes",evidenceRefs:refs,clientKey:randomUUID()});
  it("accepting mentorship or opening a project creates no research contribution",async()=>{
    const f=await fixture(); const data=await read(f.projectId,f.owner,query.parse({})); expect(data.items).toEqual([]); expect(data.profiles.every(p=>p.recordCount===0)).toBe(true); expect(data.profiles.find(p=>p.id===f.mentor)?.suggestedRoles).toEqual([]);
  });
  it("attributes completed task execution to the actor, not the assignee, and does not confirm a CRediT role",async()=>{
    const f=await fixture(); const input={title:"Prepare research protocol",description:"Protocol with reproducible deliverables",status:"DONE" as const,blockedReason:"",assigneeId:f.owner,milestoneId:null,dueAt:null,link:null,clientKey:randomUUID()};
    const task=await projectTasksService.save(f.projectId,f.member,input); await projectTasksService.save(f.projectId,f.member,input);
    const data=await read(f.projectId,f.owner,query.parse({})); const records=data.items.filter(i=>i.type==="TASK_COMPLETED"); expect(records).toHaveLength(1); expect(records[0]).toMatchObject({actor:{id:f.member},link:{kind:"TASK",id:task.id},suggestedRoles:[],provenance:"SYSTEM_RECORDED"});
  });
  it("projects screening and evidence actions with source IDs while keeping blinded metadata private",async()=>{
    const f=await fixture();
    for(const [type,entityKind] of [["SCREENING_PARTICIPATION","PAPER"],["EVIDENCE_EXTRACTED","EXTRACTION"]]) await db.projectActivity.create({data:{projectId:f.projectId,actorId:f.member,type,entityKind,entityId:randomUUID(),idempotencyKey:randomUUID(),metadata:{secretDecision:"DO NOT LEAK",assigneeId:f.owner}}});
    const data=await read(f.projectId,f.owner,query.parse({})); expect(data.items).toHaveLength(2); expect(data.items.every(i=>i.actor.id===f.member)).toBe(true); expect(JSON.stringify(data)).not.toContain("DO NOT LEAK"); expect(data.items.find(i=>i.type==="EVIDENCE_EXTRACTED")?.suggestedRoles).toEqual(["DATA_CURATION"]);
  });
  it("records a real independent screening submission once without leaking its blinded vote",async()=>{
    const f=await fixture();const paper=await db.paper.create({data:{title:"Research screening source",abstractText:"University populations and research methods.",publicationYear:2026,primaryProvider:"user",dataStatus:"active"}});
    await db.projectPaper.create({data:{projectId:f.projectId,paperId:paper.id,addedById:f.owner}});
    await screeningService.configure(f.projectId,f.owner,{screeningMode:"SINGLE_STAGE",reviewMode:"INDEPENDENT",requiredReviewers:2,consensusPolicy:"UNANIMOUS",expectedVersion:0,aiAssisted:false,inclusionCriteria:["University populations"],exclusionCriteria:["Wrong population"],researchQuestions:[],preferredAdjudicatorId:f.owner,clientKey:randomUUID()});
    const started=await screeningService.start(f.projectId,f.owner,{paperIds:[paper.id],phase:"TITLE_ABSTRACT",confirmRescreen:false,clientKey:randomUUID()});const roundId=started.roundIds![0]!;
    await screeningService.assign(f.projectId,f.owner,{roundIds:[roundId],reviewerIds:[f.member,f.peer],mode:"MANUAL",dueAt:null,clientKey:randomUUID()});
    const detail=await screeningService.detail(f.projectId,f.member,roundId);const input={assignmentId:detail.myAssignmentId!,expectedRevision:detail.assignments.find(a=>a.id===detail.myAssignmentId)!.revision,decision:"INCLUDE" as const,exclusionReason:"",comment:"Private independent criterion-based review",confirmed:true as const,clientKey:randomUUID()};
    await screeningService.submit(f.projectId,f.member,roundId,input);await screeningService.submit(f.projectId,f.member,roundId,input);
    const data=await read(f.projectId,f.owner,query.parse({memberId:f.member,category:"SCREENING"}));expect(data.total).toBe(1);expect(data.items[0]?.link).toEqual({kind:"PAPER",id:paper.id});expect(JSON.stringify(data)).not.toContain("Private independent");expect(JSON.stringify(data)).not.toContain('"decision":"INCLUDE"');
  });
  it("records real extraction and human synthesis with source links, excluding queued AI output",async()=>{
    const f=await fixture(),selection:{id:string;version:number}[]=[];
    const content={claim:"The source reports mixed learning outcomes",quotation:"Mixed learning outcomes.",locator:"Abstract",methodology:"Interviews",population:"Students",context:"University",results:"Mixed outcomes",limitations:"One institution",themes:["learning"]};
    for(let i=0;i<3;i++){
      const paper=await db.paper.create({data:{title:`Evidence study ${i}`,abstractText:"Mixed learning outcomes.",publicationYear:2026,primaryProvider:"user",dataStatus:"active"}});
      await db.projectPaper.create({data:{projectId:f.projectId,paperId:paper.id,addedById:f.owner,screeningStatus:"INCLUDED"}});
      const extraction=await projectEvidenceService.create(f.projectId,f.member,{...content,paperId:paper.id,origin:"HUMAN",clientKey:randomUUID()});
      const reviewed=await projectEvidenceService.review(f.projectId,f.owner,extraction.id,{state:"ACCEPTED",sourceConfirmed:true,expectedVersion:extraction.version,rationale:"Checked against the original study"});selection.push({id:reviewed.id,version:reviewed.version});
    }
    const saved=await projectSynthesisService.save(f.projectId,f.member,{commonFindings:"Studies report mixed learning outcomes [1] [2] [3].",contradictions:"",openQuestions:"Can the result transfer to another context? [1]",evidence:selection,expectedVersion:0});
    await projectSynthesisService.accept(f.projectId,f.owner,{expectedVersion:saved.version,rationale:"Compared the sources and their limitations"});
    const ai=await db.projectWorkspaceRevision.create({data:{projectId:f.projectId,entityKind:"SYNTHESIS",entityId:f.projectId,version:3,actorId:f.owner,snapshot:{status:"DRAFT",origin:"AI_SUGGESTED",commonFindings:"Unreviewed AI generated suggestions are not human research work",contradictions:"",openQuestions:"",sources:[]}}});
    const data=await read(f.projectId,f.owner,query.parse({}));expect(data.items.filter(r=>r.type==="EVIDENCE_EXTRACTED")).toHaveLength(3);expect(data.items.find(r=>r.type==="SYNTHESIS_WRITTEN")?.actor.id).toBe(f.member);expect(data.items.find(r=>r.type==="SYNTHESIS_REVIEWED")?.actor.id).toBe(f.owner);
    expect(data.items.find(r=>r.type==="SYNTHESIS_WRITTEN")?.link?.kind).toBe("SYNTHESIS");
    expect((await researchContributionArtifact(f.projectId,f.owner,"SYNTHESIS",saved.revisionId)).href).toContain("research=synthesis");
    expect(data.items.some(item=>item.sourceId===ai.id)).toBe(false);
  });
  it("retains two real review rounds without counting the review task twice or overwriting v1",async()=>{
    const f=await fixture(),one=await review(f),two=await review(f,2,one);
    const t=await db.projectTask.create({data:{projectId:f.projectId,createdById:f.owner,assigneeId:f.mentor,title:"Cần góp ý bản thảo (v1): Shared manuscript",targetKind:"submission",targetId:one.s.id,clientKey:randomUUID()}});
    await db.projectActivity.create({data:{projectId:f.projectId,actorId:f.mentor,type:"TASK_COMPLETED",entityKind:"TASK",entityId:t.id}});
    const first=await read(f.projectId,f.owner,query.parse({})),second=await read(f.projectId,f.owner,query.parse({}));
    expect(first.items).toHaveLength(2);expect(first.items.map(i=>i.sourceId).sort()).toEqual([one.hr.id,two.hr.id].sort());expect(first.items.map(i=>i.artifactVersion).sort()).toEqual([1,2]);expect(first.items.map(i=>i.id)).toEqual(second.items.map(i=>i.id));
    expect(first.profiles.find(p=>p.id===f.mentor)?.participantKind).toBe("MENTOR");
  });
  it("separates project and manuscript scope, links versions, and excludes unrelated declarations",async()=>{
    const f=await fixture(),a=await draft(f),b=await draft(f);
    await db.projectActivity.createMany({data:[f.owner,f.member].map(actorId=>({projectId:f.projectId,actorId,type:"MANUSCRIPT_WRITING_SESSION",entityKind:"MANUSCRIPT",entityId:a.d.id,idempotencyKey:randomUUID()}))});
    await work.save(f.projectId,f.member,claim(f,[{kind:"MANUSCRIPT",id:b.d.id}]));
    const data=await read(f.projectId,f.owner,query.parse({scopeKey:`DRAFT:${a.d.id}`}));expect(data.items).toHaveLength(2);expect(new Set(data.items.map(i=>i.actor.id)).size).toBe(2);expect(data.items.every(i=>i.manuscriptKeys.includes(`DRAFT:${a.d.id}`))).toBe(true);
  });
  it("keeps task-to-manuscript scope bound to the saved task version when its deliverable link changes",async()=>{
    const f=await fixture(),a=await draft(f),b=await draft(f);
    const input={title:"Complete manuscript methods",description:"Reproducible methodology write-up",status:"DONE" as const,blockedReason:"",assigneeId:f.owner,milestoneId:null,dueAt:null,link:{kind:"MANUSCRIPT" as const,id:a.d.id},clientKey:randomUUID()};
    const task=await projectTasksService.save(f.projectId,f.member,input);
    await projectTasksService.save(f.projectId,f.member,{...input,clientKey:undefined,expectedVersion:task.version,link:{kind:"MANUSCRIPT",id:b.d.id}},task.id);
    const old=await read(f.projectId,f.owner,query.parse({scopeKey:`DRAFT:${a.d.id}`}));
    expect(old.items.some(r=>r.type==="TASK_COMPLETED"&&r.sourceId===task.id)).toBe(true);
    const newer=await read(f.projectId,f.owner,query.parse({scopeKey:`DRAFT:${b.d.id}`}));
    expect(newer.items.some(r=>r.type==="TASK_COMPLETED")).toBe(false);expect(newer.items.some(r=>r.type==="TASK_ARTIFACT_LINKED")).toBe(true);
  });
  it("keeps manual provenance and immutable corrections, and exports only agreed manuscript roles",async()=>{
    const f=await fixture(),d=await draft(f),input=claim(f,[{kind:"MANUSCRIPT",id:d.d.id}]);
    const saved=await work.save(f.projectId,f.member,input);expect((await work.save(f.projectId,f.member,input)).id).toBe(saved.id);
    await work.submit(f.projectId,f.member,saved.id,1);expect((await statement(f.projectId,f.owner,`DRAFT:${d.d.id}`)).ready).toBe(false);
    await work.review(f.projectId,f.peer,saved.id,{expectedVersion:1,decision:"ACCEPT",note:"Reviewed the experiment protocol notes"});
    const result=await statement(f.projectId,f.owner,`DRAFT:${d.d.id}`);expect(result.ready).toBe(true);expect(result.statement).toContain("METHODOLOGY");expect(result.determinesAuthorship).toBe(false);
    const data=await read(f.projectId,f.owner,query.parse({}));expect(data.items[0]?.provenance).toBe("USER_DECLARED");
    await work.review(f.projectId,f.peer,saved.id,{expectedVersion:1,decision:"DISPUTE",note:"Evidence omits a protocol correction"});expect((await statement(f.projectId,f.owner,`DRAFT:${d.d.id}`)).statement).toBeNull();
  });
  it("isolates a mentor's projects and redacts every private draft and other member's activities",async()=>{
    const f=await fixture(),other=await fixture(f.mentor),r=await review(f);await review(other);await draft(f);
    await db.projectActivity.create({data:{projectId:f.projectId,actorId:f.owner,type:"PLAN_UPDATED",entityKind:"PLAN",entityId:randomUUID(),metadata:{private:"SECRET"}}});
    const result=await read(f.projectId,f.mentor,query.parse({}));expect(result.mentorScoped).toBe(true);expect(result.items).toHaveLength(1);expect(result.items[0]?.sourceId).toBe(r.hr.id);expect(result.manuscripts.map(m=>m.kind)).toEqual(["SUBMISSION"]);expect(JSON.stringify(result)).not.toContain("Private manuscript");
    await db.mentorAccess.update({where:{id:f.access.id},data:{revokedAt:new Date()}});await expect(read(f.projectId,f.mentor,query.parse({}))).rejects.toMatchObject({statusCode:404});
  });
  it("retains history after departure/archive, blocks outsiders and soft-deleted projects",async()=>{
    const f=await fixture();await db.projectActivity.create({data:{projectId:f.projectId,actorId:f.member,type:"PLAN_UPDATED"}});
    await db.projectMember.update({where:{projectId_userId:{projectId:f.projectId,userId:f.member}},data:{status:"LEFT"}});expect((await read(f.projectId,f.owner,query.parse({}))).items[0]?.actor.id).toBe(f.member);
    await expect(read(f.projectId,await user(),query.parse({}))).rejects.toMatchObject({statusCode:404});
    await db.project.update({where:{id:f.projectId},data:{status:"ARCHIVED"}});expect((await read(f.projectId,f.owner,query.parse({}))).total).toBe(1);
    await db.project.update({where:{id:f.projectId},data:{deletedAt:new Date(),deletedById:f.owner,purgeAt:new Date(Date.now()+86400000)}});await expect(read(f.projectId,f.owner,query.parse({}))).rejects.toMatchObject({statusCode:404});
  });
  it("retains a historical collaborator's personal declaration evidence after correction removes their name",async()=>{
    const f=await fixture();const input={...claim(f),participants:[{userId:f.member,roles:["METHODOLOGY" as const]},{userId:f.peer,roles:["FORMAL_ANALYSIS" as const]}]};
    const original=await work.save(f.projectId,f.member,input);
    await work.save(f.projectId,f.member,{...input,participants:[input.participants[0]!],expectedVersion:1,correctionReason:"Corrected the current attribution; prior version remains in history"},original.id);
    await db.projectMember.update({where:{projectId_userId:{projectId:f.projectId,userId:f.peer}},data:{status:"LEFT"}});
    const exported=await contributionProtectionService.getMyContributionHistory(f.projectId,f.peer);
    expect(exported.workContributions.find(c=>c.id===original.id)?.myRoles).toEqual(["FORMAL_ANALYSIS"]);expect(exported.privacyRedacted).toBe(true);
    expect((await work.detail(f.projectId,f.peer,original.id)).evidenceRefs).toEqual([]);
  });
  it("includes mentor reviews in the existing activity endpoint and its day counts",async()=>{
    const f=await fixture();await review(f);const result=await contributionActivityService.list(f.projectId,f.owner,activitySchema.parse({from:new Date(Date.now()-86400000).toISOString(),to:new Date(Date.now()+86400000).toISOString()}));expect(result.total).toBe(1);expect(result.items[0]?.type).toBe("MENTOR_REVIEW_SUBMITTED");expect(result.days.reduce((n,d)=>n+d.count,0)).toBe(1);
  });
  it("allows a mentor to declare external work under the existing contribution workflow without sharing private team artifacts",async()=>{
    const f=await fixture(),r=await review(f),d=await draft(f);
    const input={...claim(f),participants:[{userId:f.mentor,roles:["METHODOLOGY" as const]}],evidenceRefs:[{kind:"SUBMISSION" as const,id:r.s.id}]};
    const saved=await work.save(f.projectId,f.mentor,input);expect(saved.canManage).toBe(true);expect(saved.evidenceRefs).toEqual(input.evidenceRefs);
    await work.submit(f.projectId,f.mentor,saved.id,1);await work.review(f.projectId,f.owner,saved.id,{expectedVersion:1,decision:"ACCEPT",note:"Confirmed the methodology advice"});
    const result=await read(f.projectId,f.mentor,query.parse({}));expect(result.items.some(i=>i.sourceId===saved.id&&i.provenance==="USER_DECLARED")).toBe(true);
    await expect(work.save(f.projectId,f.mentor,{...input,clientKey:randomUUID(),evidenceRefs:[{kind:"MANUSCRIPT",id:d.d.id}]})).rejects.toMatchObject({statusCode:403});
    await expect(work.save(f.projectId,f.mentor,{...input,clientKey:randomUUID(),participants:[...input.participants,{userId:f.member,roles:[]}]})).rejects.toMatchObject({statusCode:403});
  });
  it("validates scope before returning data and rejects cross-project evidence even for project owners",async()=>{
    const f=await fixture(),other=await fixture(),d=await draft(other),r=await review(other);
    await expect(read(f.projectId,f.owner,query.parse({scopeKey:`DRAFT:${d.d.id}`}))).rejects.toMatchObject({statusCode:404});
    await expect(work.save(f.projectId,f.member,{...claim(f),evidenceRefs:[{kind:"HUMAN_REVIEW",id:r.hr.id}]})).rejects.toMatchObject({statusCode:400});
  });
  it("resolves declaration evidence through published revision and review IDs to the same manuscript",async()=>{
    const f=await fixture(),d=await draft(f),r=await review(f);
    await db.submissionRevision.update({where:{id:r.revision.id},data:{manuscriptSnapshotId:d.snap.id}});
    const input={...claim(f),evidenceRefs:[{kind:"HUMAN_REVIEW" as const,id:r.hr.id}]};const p=await work.save(f.projectId,f.member,input);await work.submit(f.projectId,f.member,p.id,1);
    const result=await read(f.projectId,f.owner,query.parse({scopeKey:`DRAFT:${d.d.id}`}));expect(result.items.some(i=>i.sourceId===p.id)).toBe(true);expect(result.items.some(i=>i.sourceId===r.hr.id)).toBe(true);
    expect(result.manuscripts.some(s=>s.key===`SUBMISSION:${r.s.id}`)).toBe(false);
    const attribution=await manuscriptAttributionService.getAttributionCheck(f.projectId,f.owner,d.d.id,d.snap.id);
    expect(attribution.detectedContributors.some(person=>person.userId===f.member)).toBe(true);
  });
  it("uses the existing version-bound review grant without requiring broad submission sharing",async()=>{
    const f=await fixture(),r=await review(f);
    await db.mentorResourceShare.updateMany({where:{accessId:f.access.id},data:{revokedAt:new Date()}});
    await db.mentorAccess.update({where:{id:f.access.id},data:{permissions:["CONTRIBUTIONS_VIEW"]}});
    expect((await read(f.projectId,f.mentor,query.parse({}))).items[0]?.sourceId).toBe(r.hr.id);
    await db.reviewerAssignment.update({where:{id:r.assignment.id},data:{status:"revoked"}});
    expect((await read(f.projectId,f.mentor,query.parse({}))).items).toEqual([]);
    await db.mentorAccess.update({where:{id:f.access.id},data:{permissions:[]}});
    await expect(read(f.projectId,f.mentor,query.parse({}))).rejects.toMatchObject({statusCode:404});
  });
  it("does not turn project-wide contributions or accepted mentor agreements into manuscript authorship evidence",async()=>{
    const f=await fixture(),d=await draft(f);const w=await work.save(f.projectId,f.member,claim(f));await work.submit(f.projectId,f.member,w.id,1);
    await db.mentorAgreement.create({data:{projectId:f.projectId,accessId:f.access.id,proposedById:f.owner,creditRoles:["SUPERVISION"],acknowledgement:"We intend to collaborate",status:"ACCEPTED",clientKey:randomUUID()}});
    const check=await manuscriptAttributionService.getAttributionCheck(f.projectId,f.owner,d.d.id,d.snap.id);
    expect(check.detectedContributors.some(p=>p.userId===f.member||p.userId===f.mentor)).toBe(false);
  });
  it("enforces authentication, scope and strict input through real HTTP routes and retires new percentage allocations",async()=>{
    const f=await fixture();const app=express();app.use(express.json());app.use("/projects",projectRouter);app.use(errorHandler);
    const server=createServer(app);server.listen(0,"127.0.0.1");await once(server,"listening");const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/projects/${f.projectId}/contributions`;
    const sessionId=randomUUID();await db.refreshToken.create({data:{userId:f.member,familyId:sessionId,tokenHash:hashOpaqueToken(randomUUID()),expiresAt:new Date(Date.now()+3600000)}});
    const headers={Authorization:`Bearer ${tokenService.signAccessToken({sub:f.member,systemRole:"USER",sessionId}).token}`,"Content-Type":"application/json"};
    try {
      expect((await fetch(`${base}/research`)).status).toBe(401);
      expect((await fetch(`${base}/research`,{headers})).status).toBe(200);
      expect((await fetch(`${base}/research?actorId=${f.owner}`,{headers})).status).toBe(400);
      expect((await fetch(`${base}/evaluation/runs`,{headers,method:"POST",body:"{}"})).status).toBe(409);
      expect((await fetch(`${base}/periods`,{headers,method:"POST",body:"{}"})).status).toBe(409);
      expect((await fetch(`${base}/activity`,{headers,method:"POST",body:JSON.stringify({actorUserId:f.owner,type:"EVIDENCE_EXTRACTED"})})).status).toBe(404);
    } finally { server.close();await once(server,"close"); }
  });
  it.skipIf(process.env.RESEARCH_CONTRIBUTION_UI!=="1")("serves disposable student and mentor browser QA without touching the local project database",async()=>{
    const f=await fixture(),d=await draft(f),r=await review(f);
    await db.user.update({where:{id:f.owner},data:{fullName:"Student research lead"}});
    await db.projectActivity.create({data:{projectId:f.projectId,actorId:f.owner,type:"MANUSCRIPT_WRITING_SESSION",entityKind:"MANUSCRIPT",entityId:d.d.id,idempotencyKey:randomUUID()}});
    const paper=await db.paper.create({data:{title:"Research evidence for contribution QA",abstractText:"Mixed learning outcomes.",publicationYear:2026,primaryProvider:"user",dataStatus:"active"}});
    await db.projectPaper.create({data:{projectId:f.projectId,paperId:paper.id,addedById:f.owner,screeningStatus:"INCLUDED"}});
    await projectEvidenceService.create(f.projectId,f.member,{paperId:paper.id,origin:"HUMAN",claim:"The study reports mixed learning outcomes",quotation:"Mixed learning outcomes.",locator:"Abstract",methodology:"Interviews",population:"Students",context:"University",results:"Mixed outcomes",limitations:"One institution",themes:["learning"],clientKey:randomUUID()});
    const proposal=await work.save(f.projectId,f.member,claim(f,[{kind:"MANUSCRIPT",id:d.d.id}]));await work.submit(f.projectId,f.member,proposal.id,1);await work.review(f.projectId,f.peer,proposal.id,{expectedVersion:1,decision:"ACCEPT",note:"Confirmed the documented method"});
    const app=express();let finish!:()=>void;const finished=new Promise<void>(resolve=>{finish=resolve;});
    app.get("/api/v1/__qa/finish",(_req,res)=>{res.json({finished:true});finish();});
    const accounts=new Map<string,{id:string;token:string}>();
    for(const [role,id] of [["student",f.owner],["mentor",f.mentor]]){const sessionId=randomUUID();await db.refreshToken.create({data:{userId:id!,familyId:sessionId,tokenHash:hashOpaqueToken(randomUUID()),expiresAt:new Date(Date.now()+3600000)}});accounts.set(role!,{id:id!,token:tokenService.signAccessToken({sub:id!,systemRole:"USER",sessionId}).token});}
    app.get("/api/v1/__qa/login/:role",async(req,res)=>{
      const account=accounts.get(req.params.role);if(!account){res.sendStatus(404);return;}
      const user=await db.user.findUniqueOrThrow({where:{id:account.id}});
      const state={state:{user:{id:user.id,_id:user.id,email:user.email,fullName:user.fullName,systemRole:"USER",role:"user",emailVerifiedAt:user.emailVerifiedAt,onboardingCompletedAt:user.onboardingCompletedAt},tokens:{accessToken:account.token,refreshToken:"disposable-qa-session"}},version:1};
      const destination=req.params.role==="mentor"?`/mentor-workspace?view=project&projectId=${f.projectId}&tab=contributions`:`/projects/${f.projectId}?tab=contributions&contributionTab=work`;
      res.type("html").send(`<script>localStorage.setItem('trend-auth',${JSON.stringify(JSON.stringify(state)).replaceAll('<','\\u003c')});localStorage.setItem('LumiGap.uiLanguage','vi');location.replace(${JSON.stringify(destination)});</script>`);
    });
    const {createApp}=await import("../../../app.js");app.use(createApp());const server=app.listen(0,"127.0.0.1");await once(server,"listening");
    const port=(server.address() as {port:number}).port;
    const {createServer:createVite}=await import("vite");
    const webRoot=new URL("../../../../../web",import.meta.url).pathname.replace(/^\/(\w:)/,"$1");
    const tailwind=(await import("tailwindcss")).default;const autoprefixer=(await import("autoprefixer")).default;
    const tailwindConfig=(await import("../../../../../web/tailwind.config.js")).default;
    const vite=await createVite({root:webRoot,configFile:`${webRoot}/vite.config.ts`,css:{postcss:{plugins:[tailwind({...tailwindConfig,content:[`${webRoot}/index.html`,`${webRoot}/src/**/*.{ts,tsx}`]}),autoprefixer()]}},server:{host:"127.0.0.1",port:13101,strictPort:true,proxy:{"/api":{target:`http://127.0.0.1:${port}`,changeOrigin:true,ws:true}}}});
    try {await vite.listen();console.log(`Contribution UI QA: http://127.0.0.1:13101/api/v1/__qa/login/student and /mentor; draft ${d.d.id}; submission ${r.s.id}`);await finished;}
    finally{await vite.close();server.close();await once(server,"close");}
  },25*60000);
});
