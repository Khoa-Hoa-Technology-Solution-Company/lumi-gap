import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { disconnectRedis } from "../../../infrastructure/redis.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { reviewRequestService as requests } from "../review-request.service.js";
import { scientificIntegrityService } from "../../projects/scientific-integrity.service.js";
import { reviewTemplateService as templates } from "../review-template.service.js";
import { reviewService as reviews } from "../review.service.js";
import { submissionService as submissions } from "../../submissions/submission.service.js";
import { scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";
import express from "express";
import { submissionRouter } from "../../submissions/submission.routes.js";
import { humanReviewRouter, reviewRequestRouter } from "../review.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService } from "../../auth/token.service.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.MENTOR_REVIEW_INTEGRATION === "1";
if (enabled && !/^\/(?:lumigap_mentor_review_test(?:_[a-z0-9]+)?|codex_mentor_workspace_[a-f0-9]{12}_test)$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw Error("Isolated mentor database required");
describe.skipIf(!enabled).sequential("mentor manuscript guidance with real PostgreSQL", () => {
  const db = getPrisma(); let owner: string, coauthor: string, mentor: string, outsider: string, project: string, submission: string, v1: string, v2: string, v3: string, policy: string, request: string, assignment: string, template: string;
  let firstReview: string, firstItems: string[], firstSnapshot: unknown;
  let server: ReturnType<express.Express["listen"]>, url: string;
  const sessions = new Map<string,string>();
  const headers = (id: string) => ({authorization:`Bearer ${tokenService.signAccessToken({sub:id,systemRole:"USER",sessionId:sessions.get(id)!}).token}`,"Content-Type":"application/json"});
  beforeAll(async () => {
    const ids = [];
    for (const role of ["STUDENT", "LECTURER", "LECTURER", "STUDENT"]) {
      const user = await db.user.create({ data: { email: `${randomUUID()}@mentor.test`, fullName: `${role} guide`, emailVerifiedAt: new Date(), accountStatus: "ACTIVE", admissionBasis: "INVITATION" } }); ids.push(user.id);
      await db.academicProfile.create({ data: { userId: user.id, academicRole: role, roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", reviewAvailability: { enabled: true, maximumActiveReviews: 20 } } });
    }
    [owner, mentor, outsider, coauthor] = ids;
    for (const id of ids) { const familyId=randomUUID(); sessions.set(id,familyId); await db.refreshToken.create({data:{userId:id,familyId,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+3600000)}}); }
    const app=express();app.use(express.json());app.use('/submissions',submissionRouter);app.use('/reviews',humanReviewRouter);app.use('/review-requests',reviewRequestRouter);app.use(errorHandler);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',()=>r()));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const p = await createProjectFixture({ data: { ownerId: owner, title: "Mentor manuscript acceptance", status: "ACTIVE" } }); project = p.id;
    const mr = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: mentor, requestedBy: owner, status: "ACCEPTED" } });
    const relationship = await db.mentorRelationship.create({ data: { projectId: project, mentorUserId: mentor, sourceRequestId: mr.id } });
    const access = await db.mentorAccess.create({ data: { projectId: project, requestId: mr.id, relationshipId: relationship.id, mentorUserId: mentor, configuredById: owner, permissions: ["SUBMISSIONS_VIEW"] } }); policy = access.id;
    const created = await submissions.create({ projectId: project, title: "Immutable educational study", submissionType: "RESEARCH_PAPER", contentSnapshot: "# Methods\n\nDataset split is not yet specified.", authorIds: [owner] }, undefined, owner, "user");
    submission = created.submission.id; v1 = created.revision.id;
    await db.projectMember.create({data:{projectId:project,userId:coauthor,role:"MEMBER"}});
    await db.submissionAuthor.create({data:{submissionId:submission,userId:coauthor,position:1}});
    await db.mentorResourceShare.create({ data: { projectId: project, accessId: policy, kind: "SUBMISSION", resourceId: submission, sharedById: owner, title: "Shared study", content: "Owner shares this manuscript for guidance" } });
    template = (await db.reviewTemplate.findFirstOrThrow({ where: { name: { startsWith: "LumiGap Scientific Manuscript Review Rubric v1.0" }, artifactType: "RESEARCH_PAPER" } })).activeVersionId!;
  });
  afterAll(async () => { if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));} await disconnectRedis(); await disconnectPostgres(); });
  async function payload(assessment: AcademicReviewInput["overallAssessment"], revisionItems = true): Promise<AcademicReviewInput> {
    const workspace = await reviews.getReview(assignment, mentor);
    return { clientKey: randomUUID(), expectedRevisionId: workspace.artifactRevision!.id, expectedRoundNumber: workspace.roundNumber, overallAssessment: assessment, overallComment: "The methodology needs a reproducible split and documented leakage prevention.", integrityChecks: Object.fromEntries(scientificIntegrityChecks.map(c => [c.key, { status: "CHECKED" as const }])), responses: workspace.criteria.map(c => ({ criterionKey: c.key, performanceLevelId: c.levels.find(l => l.score === 4)!.id, comment: "Supported, with the bounded improvements described below." })), requiredRevisions: revisionItems ? [{ priority: "MAJOR", description: "Specify train, validation and test proportions, and prevent data leakage.", criterionKey: "methodology", locator: "Methods section" }, { priority: "MINOR", description: "Clarify the source and collection period of the dataset.", locator: "Dataset section" }] : [] };
  }
  it("publishes artifact-specific system rubrics with eight weighted criteria, five anchored levels and no integrity score", async () => {
    const rows = await db.reviewTemplate.findMany({ where: { name: { startsWith: "LumiGap Scientific Manuscript Review Rubric v1.0" } } }); expect(rows).toHaveLength(7);
    const criteria = await db.reviewCriterion.findMany({ where: { versionId: template }, orderBy: { order: "asc" } });
    expect(criteria.map(c => c.weight)).toEqual([10,10,10,20,15,15,10,10]); expect(criteria.some(c => c.key === "integrity")).toBe(false);
    expect(await db.reviewCriterionLevel.count({ where: { criterionId: { in: criteria.map(c => c.id) } } })).toBe(40);
  });
  it("keeps active mentors in guidance and grants only their delivered version even when labelled peer review", async () => {
    const unshared = await submissions.create({projectId:project,title:"Unshared manuscript",submissionType:"RESEARCH_PAPER",contentSnapshot:"Unshared private text",authorIds:[owner]},undefined,owner,"user");
    const scoped=await requests.create({submissionId:unshared.submission.id,reviewerId:mentor,templateVersionId:template,purpose:"PEER_REVIEW"},owner);
    expect(scoped.origin).toBe("MENTOR_GUIDANCE"); await requests.cancel(scoped.id,owner);
    await expect(requests.create({submissionId:submission,reviewerId:outsider,templateVersionId:template,purpose:"MENTOR_GUIDANCE"},owner)).rejects.toMatchObject({statusCode:403});
  });
  it("binds the assigned mentor request to v1 without requiring AI pre-review", async () => {
    const created = await fetch(`${url}/review-requests`,{method:"POST",headers:headers(owner),body:JSON.stringify({submissionId:submission,reviewerId:mentor,templateVersionId:template,purpose:"MENTOR_GUIDANCE",dueAt:new Date(Date.now()+7*86400000).toISOString()})});
    expect(created.status).toBe(201); const row = (await created.json()).data;
    request = row.id; assignment = row.assignment.id;
    expect(row.artifact.revisionId).toBe(v1); expect(row.origin).toBe("MENTOR_GUIDANCE");
    await requests.accept(request, mentor);
    expect((await fetch(`${url}/reviews/${assignment}`)).status).toBe(401);
    const response = await fetch(`${url}/reviews/${assignment}`, {headers:headers(mentor)}); expect(response.status).toBe(200);
    expect((await fetch(`${url}/reviews/${assignment}`,{headers:headers(outsider)})).status).toBe(404);
    const workspace = (await response.json()).data; expect(workspace.responses).toEqual([]); expect(workspace.review).toBeUndefined(); expect(workspace.artifactContent).toContain("not yet specified");
    await expect(reviews.getReview(assignment, outsider)).rejects.toMatchObject({statusCode:404});
  });
  it("saves an incomplete draft, rejects missing required scores, fabricated excerpts and high-score integrity concerns", async () => {
    await expect(reviews.saveReview(assignment,mentor,{responses:[]},false)).rejects.toMatchObject({statusCode:400});
    expect((await fetch(`${url}/reviews/${assignment}`,{method:"PUT",headers:headers(mentor),body:JSON.stringify({responses:[],expectedRevisionId:v1,expectedRoundNumber:1})})).status).toBe(200);
    expect((await fetch(`${url}/reviews/${assignment}/submit`,{method:"POST",headers:headers(owner),body:JSON.stringify(await payload("STRONG",false))})).status).toBe(403);
    await expect(reviews.saveReview(assignment, mentor, { responses: [], expectedRevisionId:v1,expectedRoundNumber:1,overallAssessment: "STRONG", overallComment: "Ready" }, true)).rejects.toMatchObject({statusCode:400});
    const input = await payload("STRONG", false); input.integrityChecks!.data = { status: "CONCERN", note: "Source data provenance must be examined by a human." };
    await expect(reviews.saveReview(assignment, mentor, input, true)).rejects.toMatchObject({statusCode:409});
    const invented = await payload("MAJOR_REVISION"); invented.requiredRevisions![0]!.quotation = "invented excerpt";
    await expect(reviews.saveReview(assignment, mentor, invented, true)).rejects.toMatchObject({statusCode:400});
    await expect(reviews.saveReview(assignment, owner, await payload("STRONG",false), true)).rejects.toMatchObject({statusCode:403});
  });
  it("submits actionable major/minor guidance atomically and deduplicates identical submission retries", async () => {
    const input = await payload("MAJOR_REVISION");
    const results = await Promise.all([0,1].map(()=>fetch(`${url}/reviews/${assignment}/submit`,{method:"POST",headers:headers(mentor),body:JSON.stringify(input)})));
    expect(results.map(r=>r.status)).toEqual([200,200]); const [a,b] = await Promise.all(results.map(async r=>(await r.json()).data));
    expect(a.review.id).toBe(b.review.id); firstReview=a.review.id; firstItems=a.requiredRevisions.map(i=>i.id);
    expect(a.review.revisionId).toBe(v1);expect(a.review.weightedScore).toBe(4);expect(a.requiredRevisions).toHaveLength(2);
    expect((await db.reviewRequest.findUniqueOrThrow({where:{id:request}})).status).toBe("REVISION_REQUESTED");
    expect(await db.notification.count({where:{userId:coauthor,targetUuid:request,type:"REVISION_REQUESTED"}})).toBe(1);
    firstSnapshot = await db.humanReview.findUniqueOrThrow({where:{id:firstReview}});
  });
  it("creates immutable v2, requires responses to every item, and pins rereview while v3 is authored", async () => {
    const revised = await submissions.createVersion(submission,{content:"# Methods\n\nWe use 60/20/20 partitions, group by participant and prevent leakage.",summary:"Document split and data collection",expectedRevisionNumber:1},owner,"user");v2=revised.id;
    await expect(requests.resubmit(request,owner,{revisionId:v2,responses:[]})).rejects.toMatchObject({statusCode:400});
    const resubmitInput = {revisionId:v2,responses:firstItems.map(id=>({revisionItemId:id,responseText:"Addressed in Methods and Dataset sections of v2."}))};
    expect((await requests.detail(request,coauthor)).canRespond).toBe(true);
    const draft = await fetch(`${url}/review-requests/${request}/responses`,{method:"PUT",headers:headers(coauthor),body:JSON.stringify(resubmitInput)});expect(draft.status).toBe(204);
    expect((await requests.detail(request,owner)).reviews[0]!.requiredRevisions[0]!.responses[0]!.status).toBe("DRAFT");
    expect((await reviews.getReview(assignment,mentor)).requiredRevisions).toHaveLength(2);
    expect((await requests.detail(request,mentor)).reviews[0]!.requiredRevisions[0]!.responses).toEqual([]);
    expect(JSON.stringify(await submissions.history(submission,mentor,"user"))).not.toContain('"DRAFT"');
    const sent = await fetch(`${url}/review-requests/${request}/resubmit`,{method:"POST",headers:headers(owner),body:JSON.stringify(resubmitInput)});expect(sent.status).toBe(204);
    await requests.resubmit(request,owner,resubmitInput);
    await expect(requests.resubmit(request,owner,{revisionId:v2,responses:[]})).rejects.toMatchObject({statusCode:409});
    expect(await db.reviewRevisionResponse.count({where:{submissionRevisionId:v2}})).toBe(2);
    expect(await db.notification.count({where:{userId:mentor,type:"REVISION_RESUBMITTED",targetKind:"review_request",targetUuid:request}})).toBe(1);
    const third=await submissions.createVersion(submission,{content:"# Methods\n\nA v3 draft while the mentor reads v2.",summary:"Continue drafting without replacing the review target",expectedRevisionNumber:2},owner,"user");v3=third.id;
    expect((await reviews.getReview(assignment,mentor)).artifactRevision!.id).toBe(v2);
    expect(await db.humanReview.findUniqueOrThrow({where:{id:firstReview}})).toEqual(firstSnapshot);
  });
  it("allows only the mentor to accept or reopen changes and prevents unresolved readiness", async () => {
    await expect(requests.resolveRevisionItem(request,firstItems[0],"ACCEPTED",owner)).rejects.toMatchObject({statusCode:403});
    await requests.resolveRevisionItem(request,firstItems[0],"ACCEPTED",mentor,v2); await requests.resolveRevisionItem(request,firstItems[1],"REOPENED",mentor,v2);
    await expect(reviews.saveReview(assignment,mentor,await payload("STRONG",false),true)).rejects.toMatchObject({statusCode:409});
    await reviews.saveReview(assignment,mentor,await payload("MINOR_REVISION",false),true);
    await requests.resubmit(request,owner,{revisionId:v3,responses:[{revisionItemId:firstItems[1],responseText:"v3 clarifies the collection period and source in Dataset."}]});
    await expect(requests.resolveRevisionItem(request,firstItems[1],"ACCEPTED",mentor,v2)).rejects.toMatchObject({statusCode:409});
    const verified=await fetch(`${url}/review-requests/${request}/revision-items/${firstItems[1]}`,{method:"PATCH",headers:headers(mentor),body:JSON.stringify({status:"ACCEPTED",expectedRevisionId:v3})});expect(verified.status).toBe(204);
  });
  it("marks only the reviewed current revision ready internally and leaves authorship/publication systems untouched", async () => {
    const result=await reviews.saveReview(assignment,mentor,await payload("STRONG",false),true);
    expect(result.review.revisionId).toBe(v3);expect((await db.reviewRequest.findUniqueOrThrow({where:{id:request}})).status).toBe("COMPLETED");
    expect((await db.submission.findUniqueOrThrow({where:{id:submission}})).status).toBe("READY_TO_ADVANCE");
    expect(await db.humanReview.count({where:{assignmentId:assignment,status:"SUBMITTED"}})).toBe(3);
    expect(await db.submissionAuthor.count({where:{submissionId:submission}})).toBe(2);
    expect((await db.submissionRevision.findUniqueOrThrow({where:{id:v1}})).checksumSha256).toBe(createHash("sha256").update("# Methods\n\nDataset split is not yet specified.").digest("hex"));
  });
  it("keeps author consent and CRediT gates closed after mentor readiness", async () => {
    let overview=await scientificIntegrityService.getOverview(project,owner);
    expect(overview.submissionChecklist.readyForOfficialSubmission).toBe(false);
    await scientificIntegrityService.confirmCredit(project,owner,{decision:"CONFIRM"});
    overview=await scientificIntegrityService.getOverview(project,owner);
    expect(overview.contributions.authors.find(a=>a.userId===owner)!.confirmationStatus).toBe("PENDING");
    await scientificIntegrityService.confirmAuthorship(project,owner,{decision:"CONFIRM"});
    overview=await scientificIntegrityService.getOverview(project,owner);
    expect(overview.contributions.authors.find(a=>a.userId===owner)!.confirmationStatus).toBe("CONFIRMED");
    expect(overview.contributions.authors.find(a=>a.userId===coauthor)!.confirmationStatus).toBe("PENDING");
    expect(overview.submissionChecklist.readyForOfficialSubmission).toBe(false);
    await scientificIntegrityService.confirmCredit(project,coauthor,{decision:"CONFIRM"});
    await scientificIntegrityService.confirmAuthorship(project,coauthor,{decision:"CONFIRM"});
    expect((await scientificIntegrityService.getOverview(project,owner)).submissionChecklist.readyForOfficialSubmission).toBe(true);
    await scientificIntegrityService.updateMemberCredit(project,owner,{memberUserId:owner,creditRoles:["INVESTIGATION"]});
    expect((await scientificIntegrityService.getOverview(project,owner)).submissionChecklist.readyForOfficialSubmission).toBe(false);
  });
  it("keeps published template criteria immutable and available while a new draft is edited", async () => {
    const source = await templates.detail((await db.reviewTemplateVersion.findUniqueOrThrow({where:{id:template}})).templateId,owner);
    const created = await templates.create({name:"Versioned guidance "+randomUUID(),source:"PERSONAL",artifactType:"RESEARCH_PAPER",reviewMode:"RUBRIC_ASSESSMENT",publish:true,guidelines:[],criteria:[{key:"method",title:"Methods",weight:1,required:true,allowNotApplicable:true,levels:[{label:"Weak",score:2},{label:"Good",score:4}]}]},owner,"USER");
    const original=created.activeVersion!;
    const draft=await templates.saveVersion(created.id,{reviewMode:"RUBRIC_ASSESSMENT",guidelines:[],criteria:[{key:"new_method",title:"New methods",required:true,allowNotApplicable:false,levels:[{label:"Weak",score:2},{label:"Good",score:4}]}]},owner,"USER");
    expect(draft!.versionNumber).toBe(2);
    const visible=await templates.detail(created.id,owner);expect(visible.status).toBe("PUBLISHED");expect(visible.activeVersion).toEqual(original);
    await templates.publish(created.id,owner,"USER");expect((await templates.detail(created.id,owner)).versions.find(v=>v?.id===original.id)).toEqual(original);
    expect(source.activeVersion!.criteria).toHaveLength(8);
  });
  it("blocks stale and cross-project edits without changing submitted history", async () => {
    await expect(reviews.saveReview(assignment,mentor,{responses:[],expectedRevisionId:v1,expectedRoundNumber:1},false)).rejects.toMatchObject({statusCode:409});
    await expect(requests.saveResponseDrafts(request,outsider,{revisionId:v3,responses:[]})).rejects.toMatchObject({statusCode:403});
    expect(await db.humanReview.findUniqueOrThrow({where:{id:firstReview}})).toEqual(firstSnapshot);
  });
  it("upgrades an existing mentor task once without erasing legacy feedback or fabricating scores", async () => {
    const legacy=await submissions.create({projectId:project,title:"Legacy assigned mentor adapter",submissionType:"RESEARCH_PAPER",contentSnapshot:"A pinned legacy mentor manuscript",authorIds:[owner]},undefined,owner,"user");
    await db.mentorResourceShare.create({data:{projectId:project,accessId:policy,kind:"SUBMISSION",resourceId:legacy.submission.id,sharedById:owner,title:"Legacy manuscript",content:"Explicitly shared"}});
    const legacyAssignment=await db.reviewerAssignment.create({data:{submissionId:legacy.submission.id,reviewerId:mentor,assignedById:owner,artifactRevisionId:legacy.revision.id,anonymousCode:`mentor-${legacy.submission.id}`,status:"assigned"}});
    await db.projectTask.create({data:{projectId:project,assigneeId:mentor,createdById:owner,title:"Cần góp ý bản thảo (v1): Legacy manuscript",targetKind:"submission",targetId:legacy.submission.id,clientKey:randomUUID()}});
    await db.reviewerAssignment.update({where:{id:legacyAssignment.id},data:{status:"accepted"}});
    await db.mentorResourceShare.updateMany({where:{resourceId:legacy.submission.id},data:{revokedAt:new Date()}});
    await db.mentorAccess.update({where:{id:policy},data:{revokedAt:new Date()}});
    await expect(reviews.getReview(legacyAssignment.id,mentor)).rejects.toMatchObject({statusCode:403});
    await expect(reviews.saveReview(legacyAssignment.id,mentor,{responses:[]},false)).rejects.toMatchObject({statusCode:409});
    await db.mentorAccess.update({where:{id:policy},data:{revokedAt:null}});
    await db.mentorResourceShare.updateMany({where:{resourceId:legacy.submission.id},data:{revokedAt:null}});
    const a=await requests.prepareMentorReview(legacy.submission.id,mentor), b=await requests.prepareMentorReview(legacy.submission.id,mentor);expect(a).toEqual(b);
    const workspace=await reviews.getReview(a.assignmentId,mentor);expect(workspace.artifactRevision!.id).toBe(legacy.revision.id);expect(workspace.responses).toEqual([]);expect(workspace.request!.origin).toBe("MENTOR_GUIDANCE");
    expect(await db.reviewRequest.count({where:{submissionId:legacy.submission.id}})).toBe(1);
    expect((await db.projectTask.findFirstOrThrow({where:{targetId:legacy.submission.id,assigneeId:mentor}})).status).toBe("IN_PROGRESS");
    const legacyInput={result:"READY_TO_ADVANCE",overallComment:"Cannot bypass the checklist",rubricScores:[{criterionKey:"integrity",score:5}],paragraphComments:[{comment:"Legacy source feedback",evidence:"Paragraph 1"}]};
    const response=await fetch(`${url}/submissions/${legacy.submission.id}/feedback`,{method:"POST",headers:headers(mentor),body:JSON.stringify(legacyInput)});expect(response.status).toBe(201);expect(response.headers.get("Deprecation")).toBe("true");const draft=(await response.json()).data;
    expect(draft).toMatchObject({submitted:false,requiresCompletion:true,assignmentId:a.assignmentId});
    const saved=await reviews.getReview(a.assignmentId,mentor);expect(saved.responses).toEqual([]);expect(saved.review!.status).toBe("DRAFT");expect(saved.review!.overallComment).toContain("Legacy source feedback");
    expect(await db.humanReview.count({where:{submissionId:legacy.submission.id,status:"SUBMITTED"}})).toBe(0);
    await submissions.submitFeedback(legacy.submission.id,{result:"FEEDBACK_GIVEN",overallComment:"Retry preserves one draft"},mentor,"user");
    expect(await db.humanReview.count({where:{submissionId:legacy.submission.id}})).toBe(1);
    await reviews.saveReview(a.assignmentId,mentor,{responses:[{criterionKey:"methodology",comment:"A modern structured draft"}],expectedRevisionId:legacy.revision.id,expectedRoundNumber:1},false);
    await expect(submissions.submitFeedback(legacy.submission.id,{result:"FEEDBACK_GIVEN",overallComment:"Stale legacy client"},mentor,"user")).rejects.toMatchObject({statusCode:409});
  });
  it("revoked manuscript sharing blocks assigned mentor reads and history downloads without granting project membership", async () => {
    await db.mentorAccess.update({where:{id:policy},data:{revokedAt:new Date()}});
    await expect(reviews.getReview(assignment,mentor)).rejects.toMatchObject({statusCode:403});
    await expect(requests.detail(request,mentor)).rejects.toMatchObject({statusCode:403});
    await expect(submissions.history(submission,mentor,"user")).rejects.toMatchObject({statusCode:403});
    expect(await db.projectMember.count({where:{projectId:project,userId:mentor}})).toBe(0);
  });
});
