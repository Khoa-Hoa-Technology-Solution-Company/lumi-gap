import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { creditRoles, creditRoleMetadata, escapeCreditLatex, type CreditRole, type SaveManuscriptAttributionInput } from "@trend/shared-types";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptAttributionService as attribution, manuscriptAttributionDecisionSchema } from "../manuscript-attribution.service.js";
import { workContributionsService as work } from "../../projects/work-contributions.service.js";
import { projectMentorshipService as mentorship } from "../../projects/project-mentorship.service.js";
import { assertVerifiedAttributionForPublish } from "../manuscript-attribution.service.js";
import express from "express";
import { once } from "node:events";
import { manuscriptRouter } from "../manuscript.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { mentorAccessService } from "../../projects/mentor-access.service.js";
import { researchIntegrityService } from "../../projects/research-integrity.service.js";
import { submissionService } from "../../submissions/submission.service.js";
import { notificationService } from "../../notifications/notification.service.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) }, manuscriptCompileQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.CREDIT_ATTRIBUTION_INTEGRATION === "1";
if (enabled && new URL(process.env.DATABASE_URL!).pathname !== "/lumigap_credit_attribution_test") throw new Error("Use the dedicated contribution test database");
describe.skipIf(!enabled).sequential("CRediT and snapshot attribution on isolated PostgreSQL", () => {
  const db = getPrisma(); let users: string[];
  beforeAll(async () => { users = []; for (let i=0;i<5;i++) { const user = await db.user.create({ data: { fullName: `Researcher ${i}`, email: `${randomUUID()}@credit.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } }); await db.academicProfile.create({ data: { userId:user.id, academicRole:i===3?"LECTURER":"RESEARCHER", primaryPosition:i===3?"LECTURER":"RESEARCH_STAFF", roleVerificationStatus:i===3?"VERIFIED":"SELF_DECLARED", positionStatus:i===3?"VERIFIED":"NOT_SUBMITTED", supportAvailability:{enabled:true} } }); users.push(user.id); } });
  afterAll(disconnectPostgres);
  async function fixture() {
    const project = await createProjectFixture({ data: { title:"Attribution study", ownerId:users[0], status:"ACTIVE", mentorshipSummary:"An approved research introduction for a transparent contribution study." } });
    for (const userId of users.slice(1,3)) await db.projectMember.create({ data:{projectId:project.id,userId} });
    const manuscript=await writing.create(project.id,users[0],{title:"Research manuscript",template:"BLANK",documentType:"RESEARCH_PAPER",description:"",clientKey:randomUUID()});
    const snapshot=await writing.snapshot(project.id,users[0],manuscript.id,{label:"Research version",clientKey:randomUUID(),minimumSequences:{}});
    return { project:project.id, manuscript:manuscript.id, snapshot:snapshot.id };
  }
  type F=Awaited<ReturnType<typeof fixture>>;
  const person=(userId:string,order:number,roles:CreditRole[]=["METHODOLOGY"])=>({userId,order,creditRoles:roles,displayName:`Researcher ${order}`,email:`author-${order}@example.invalid`,affiliation:"Test institution",corresponding:order===1});
  const declaration=(authors=users.slice(0,3)):SaveManuscriptAttributionInput=>({proposedAuthors:authors.map((id,i)=>person(id,i+1)),acknowledgements:[],omittedContributors:[],publicationPolicy:{name:"Team journal policy",version:"2026-1",requireAcknowledgementPermission:true}});
  const save=(f:F,input=declaration())=>attribution.saveAttributionCheck(f.project,users[0],f.manuscript,f.snapshot,input);
  const view=(f:F,actor=users[0])=>attribution.getAttributionCheck(f.project,actor,f.manuscript,f.snapshot);
  async function confirm(f:F,checkId:string,actor:string,decision:"CONFIRM"|"CLARIFY"|"DISPUTE"="CONFIRM") {const current=await view(f,actor);return attribution.decideAttributionCheck(f.project,actor,f.manuscript,checkId,{expectedDecisionId:current.decisions.filter(d=>d.userId===actor).at(-1)?.id ?? null,decision,note:decision==="CONFIRM"?"I reviewed this exact version and my attribution":"My scientific contribution or author order requires correction"});}
  async function record(f:F,creator:string,participants=[creator],roles:CreditRole[]=["SOFTWARE","INVESTIGATION"]) {return work.save(f.project,creator,{title:"Research model work",description:"Implemented and evaluated the documented scientific research model",source:"MANUAL",workDate:new Date().toISOString(),participants:participants.map(userId=>({userId,roles})),evidence:"Experiment protocol and reproducibility notes",evidenceRefs:[],clientKey:randomUUID()});}
  it("has exactly the official fourteen roles, persistent IDs and safe LaTeX escaping",()=>{
    expect(Object.keys(creditRoleMetadata).sort()).toEqual([...creditRoles].sort());expect(new Set(Object.values(creditRoleMetadata).map(role=>role.id)).size).toBe(14);
    expect(creditRoleMetadata.DATA_CURATION.name).toBe("Data curation");expect(escapeCreditLatex("A&B_1%\\input{x}")).toBe("A\\&B\\_1\\%\\textbackslash{}input\\{x\\}");
  });
  it("records shared work with independent acknowledgement and deduplicated evidence",async()=>{
    const f=await fixture(),task=await db.projectTask.create({data:{projectId:f.project,title:"Model experiment",createdById:users[0],clientKey:randomUUID()}});
    const input={title:"Model experiment record",description:"Implemented the experiment and recorded reproducible results",source:"WORKSPACE" as const,workDate:new Date().toISOString(),participants:[{userId:users[0],roles:["SOFTWARE" as const]},{userId:users[1],roles:["INVESTIGATION" as const]}],evidence:"Experiment report",evidenceRefs:[{kind:"TASK" as const,id:task.id},{kind:"TASK" as const,id:task.id}],clientKey:randomUUID()};
    const row=await work.save(f.project,users[0],input);expect(row.evidenceRefs).toHaveLength(1);expect((await work.save(f.project,users[0],input)).id).toBe(row.id);
    await work.submit(f.project,users[0],row.id,1);await expect(work.review(f.project,users[0],row.id,{expectedVersion:1,decision:"ACCEPT",note:""})).rejects.toMatchObject({statusCode:403});
    await work.review(f.project,users[2],row.id,{expectedVersion:1,decision:"ACCEPT",note:"Reviewed the reproducibility record"});expect((await work.review(f.project,users[1],row.id,{expectedVersion:1,decision:"ACKNOWLEDGE",note:"My experiment work is recorded accurately"})).status).toBe("ACCEPTED");
    await expect(work.detail(f.project,users[4],row.id)).rejects.toMatchObject({statusCode:404});
    const repeated=await work.save(f.project,users[0],{...input,clientKey:randomUUID()});await work.submit(f.project,users[0],repeated.id,1);
    const overview=await work.overview(f.project,users[0]);expect(overview.distinctArtifactCount).toBe(1);expect(overview.people.find(p=>p.userId===users[0])?.declaredRoles).toEqual(["SOFTWARE"]);
  });
  it("allows owner proposals without inventing a contribution for the owner",async()=>{
    const f=await fixture(),row=await record(f,users[0],[users[1]],["DATA_CURATION"]);expect(row.participants.map(p=>p.userId)).toEqual([users[1]]);
    await work.submit(f.project,users[0],row.id,1);await expect(work.review(f.project,users[0],row.id,{expectedVersion:1,decision:"ACKNOWLEDGE",note:""})).rejects.toMatchObject({statusCode:403});
    expect((await work.review(f.project,users[1],row.id,{expectedVersion:1,decision:"ACKNOWLEDGE",note:"I agree with my assigned role"})).reviews.some(r=>r.userId===users[1])).toBe(true);
  });
  it("requires individual approvals and never infers authorship from a role or ownership",async()=>{
    const f=await fixture(),check=await save(f);expect(check.pendingAuthorIds).toHaveLength(3);expect(check.decisions).toHaveLength(0);
    const notice=(await notificationService.list(users[1],"USER")).find(item=>item.type==="MANUSCRIPT_ATTRIBUTION_REVIEW"&&item.manuscriptSnapshotId===f.snapshot);expect(notice).toMatchObject({manuscriptId:f.manuscript,manuscriptSnapshotId:f.snapshot});
    expect(manuscriptAttributionDecisionSchema.safeParse({decision:"CONFIRM",userId:users[1]}).success).toBe(false);
    await expect(attribution.decideAttributionCheck(f.project,users[4],f.manuscript,check.checkId!,{decision:"CONFIRM",note:""})).rejects.toMatchObject({statusCode:403});
    for(const actor of users.slice(0,3))await confirm(f,check.checkId!,actor);
    expect((await view(f)).readyForInternalSubmission).toBe(true);
    const statement=await attribution.statement(f.project,users[0],f.manuscript,f.snapshot);expect(statement.authors.map(a=>a.userId)).toEqual(users.slice(0,3));expect(statement.authors[0].roles[0].id).toBe(creditRoleMetadata.METHODOLOGY.id);
    const sealed=await writing.publish(f.project,users[0],f.manuscript,f.snapshot,users.slice(0,3));expect(sealed.revisionId).toBeTruthy();
    await expect(save(f,{...declaration(),expectedVersion:check.version})).rejects.toMatchObject({statusCode:409});await expect(confirm(f,check.checkId!,users[0],"DISPUTE")).rejects.toMatchObject({statusCode:409});
  });
  it("keeps omissions reviewable and preserves disputes across author-list and snapshot changes",async()=>{
    const f=await fixture(),row=await record(f,users[1]);await work.submit(f.project,users[1],row.id,1);
    const check=await save(f,{...declaration([users[0]]),omittedContributors:[{userId:users[1],justification:"Contribution reviewed as non-author under the venue policy"}]});expect(check.detectedContributors.some(c=>c.userId===users[1])).toBe(true);
    await confirm(f,check.checkId!,users[1],"DISPUTE");
    const revised=await save(f,{...declaration(),expectedVersion:check.version});expect(revised.unresolvedDisputes.some(d=>d.userId===users[1])).toBe(true);
    const next=await writing.snapshot(f.project,users[0],f.manuscript,{label:"Changed declaration",clientKey:randomUUID(),minimumSequences:{}}),second={...f,snapshot:next.id};
    const newer=await save(second);expect(newer.readyForInternalSubmission).toBe(false);expect(newer.unresolvedDisputes.some(d=>d.userId===users[1])).toBe(true);
    await expect(confirm(f,check.checkId!,users[1])).rejects.toMatchObject({statusCode:409});
    for(const actor of users.slice(0,3))await confirm(second,newer.checkId!,actor);
    expect((await view(second)).readyForInternalSubmission).toBe(true);
  });
  it("retains work disputes through correction drafts until the affected reviewer acknowledges",async()=>{
    const f=await fixture(),row=await record(f,users[0],[users[0],users[1]]);await work.submit(f.project,users[0],row.id,1);
    await work.review(f.project,users[1],row.id,{expectedVersion:1,decision:"DISPUTE",note:"My investigation contribution was described inaccurately"});
    const corrected=await work.save(f.project,users[0],{title:row.title,description:row.description+"; corrected experiment attribution",source:"MANUAL",workDate:row.workDate,participants:row.participants,evidence:row.evidence,evidenceRefs:[],expectedVersion:1,correctionReason:"Corrected attribution after participant review"},row.id);
    expect((await view(f)).unresolvedDisputes.some(d=>d.source==="WORK_CORRECTION")).toBe(true);
    await work.submit(f.project,users[0],row.id,corrected.version);await work.review(f.project,users[1],row.id,{expectedVersion:2,decision:"ACKNOWLEDGE",note:"The correction resolves my concern"});expect((await view(f)).unresolvedDisputes).toHaveLength(0);
    expect((await work.detail(f.project,users[1],row.id)).history.some(h=>h.action==="DISPUTE")).toBe(true);
  });
  it("does not bypass a newer snapshot objection by sealing an earlier approved snapshot",async()=>{
    const f=await fixture(),original=await save(f);
    for(const actor of users.slice(0,3))await confirm(f,original.checkId!,actor);
    const next=await writing.snapshot(f.project,users[0],f.manuscript,{label:"Later authorship review",clientKey:randomUUID(),minimumSequences:{}}),later={...f,snapshot:next.id},changed=await save(later);
    await confirm(later,changed.checkId!,users[1],"DISPUTE");
    expect((await view(f)).unresolvedDisputes.some(item=>item.userId===users[1])).toBe(true);
    await expect(writing.publish(f.project,users[0],f.manuscript,f.snapshot,users.slice(0,3))).rejects.toMatchObject({statusCode:409});
    await expect(attribution.statement(f.project,users[0],f.manuscript,f.snapshot)).rejects.toMatchObject({statusCode:409});
    await confirm(later,changed.checkId!,users[1]);
    expect((await view(later)).pendingAuthorIds).toEqual(expect.arrayContaining([users[0],users[2]]));
    expect((await view(f)).readyForInternalSubmission).toBe(true);
  });
  it("lists only contributions still awaiting this viewer before counting and pagination",async()=>{
    const f=await fixture(),row=await record(f,users[0],[users[0],users[1]]),other=await record(f,users[0],[users[0],users[1]]);
    for(const id of [row.id,other.id])await work.submit(f.project,users[0],id,1);
    const pending=(actor:string)=>work.list(f.project,actor,{page:1,pageSize:1,q:"",filter:"PENDING"});
    expect((await pending(users[0])).total).toBe(0);
    expect(await pending(users[1])).toMatchObject({total:2,hasNext:true});
    await work.review(f.project,users[1],row.id,{expectedVersion:1,decision:"ACKNOWLEDGE",note:"My assigned role is correct"});
    expect(await pending(users[1])).toMatchObject({total:1,hasNext:false});
    await work.review(f.project,users[2],other.id,{expectedVersion:1,decision:"ACCEPT",note:"Compared the documented research work"});
    expect((await pending(users[2])).items.map(item=>item.id)).toEqual([row.id]);
    await work.review(f.project,users[1],other.id,{expectedVersion:1,decision:"ACKNOWLEDGE",note:"My other assigned role is correct"});
    expect((await pending(users[1])).total).toBe(0);
  });
  it("rejects stale saves, duplicate concurrent decisions and changed author order approvals",async()=>{
    const f=await fixture(),check=await save(f);await Promise.all([confirm(f,check.checkId!,users[0]),confirm(f,check.checkId!,users[0])]);expect(await db.manuscriptAttributionDecision.count({where:{checkId:check.checkId!,userId:users[0]}})).toBe(1);
    const same=await save(f,{...declaration(),expectedVersion:check.version});expect(same.checkId).toBe(check.checkId);
    const changed=await save(f,{...declaration([users[1],users[0],users[2]]),expectedVersion:check.version});expect(changed.pendingAuthorIds).toHaveLength(3);
    await expect(save(f,{...declaration(),expectedVersion:check.version})).rejects.toMatchObject({statusCode:409});await expect(attribution.decideAttributionCheck(f.project,users[0],f.manuscript,changed.checkId!,{decision:"CONFIRM",note:"",expectedVersion:1})).rejects.toMatchObject({statusCode:409});
  });
  it("retains exact-version consent when only the display order of the same CRediT roles changes",async()=>{
    const f=await fixture(),input=declaration();
    input.proposedAuthors[0].creditRoles=["SOFTWARE","INVESTIGATION"];
    input.acknowledgements=[{name:"External contributor",contributionSummary:"Reviewed the study design",permissionNote:"Written permission retained by the team",creditRoles:["SUPERVISION","WRITING_REVIEW_EDITING"]}];
    const check=await save(f,input);
    for(const actor of users.slice(0,3))await confirm(f,check.checkId!,actor);
    const reordered=structuredClone(input);reordered.expectedVersion=check.version;reordered.proposedAuthors[0].creditRoles.reverse();reordered.acknowledgements![0].creditRoles!.reverse();
    const unchanged=await save(f,reordered);
    expect(unchanged.checkId).toBe(check.checkId);expect(unchanged.pendingAuthorIds).toEqual([]);
    expect(unchanged.readyForInternalSubmission).toBe(true);
    reordered.proposedAuthors[0].creditRoles=["SOFTWARE"];
    const material=await save(f,reordered);expect(material.checkId).not.toBe(check.checkId);expect(material.pendingAuthorIds).toHaveLength(3);
  });
  it("requires acknowledgement permission and corresponding author metadata under the selected policy",async()=>{
    const f=await fixture(),input={...declaration([users[0]]),acknowledgements:[{userId:users[1],name:"Data contributor",contributionSummary:"Prepared the research dataset",creditRoles:["DATA_CURATION" as const]}]};
    const check=await save(f,input);await confirm(f,check.checkId!,users[0]);expect((await view(f)).pendingAcknowledgementIds).toEqual([users[1]]);await confirm(f,check.checkId!,users[1]);expect((await view(f)).readyForInternalSubmission).toBe(true);
    const changed=await save(f,{...input,expectedVersion:check.version,proposedAuthors:[{userId:users[0],order:1,creditRoles:["SOFTWARE"]}]});expect(changed.blockingReasons.join(" ")).toContain("corresponding author");await expect(attribution.statement(f.project,users[0],f.manuscript,f.snapshot)).rejects.toMatchObject({statusCode:409});
  });
  it("records scoped mentor work without membership or unrelated evidence access",async()=>{
    const f=await fixture(),request=await mentorship.request(f.project,users[0],{mentorUserId:users[3],message:"Please provide scientific methodology guidance"});await mentorship.accept(f.project,request.id,users[3],undefined,request.accessPolicy?.version,request.previewToken);
    const row=await record(f,users[3],[users[3]],["SUPERVISION","WRITING_REVIEW_EDITING"]);await work.submit(f.project,users[3],row.id,1);expect((await work.list(f.project,users[3],{page:1,pageSize:20,q:"",filter:"TEAM"})).items.map(r=>r.id)).toEqual([row.id]);expect(await db.projectMember.count({where:{projectId:f.project,userId:users[3]}})).toBe(0);
    await expect(work.save(f.project,users[3],{title:"Forged shared work",description:"Attempted unrelated private evidence reference",source:"WORKSPACE",workDate:new Date().toISOString(),participants:[{userId:users[3],roles:["SOFTWARE"]}],evidence:"",evidenceRefs:[{kind:"MANUSCRIPT",id:f.manuscript}],clientKey:randomUUID()})).rejects.toMatchObject({statusCode:403});
  });
  it("keeps former contributors involved without opening cross-project data",async()=>{
    const f=await fixture(),other=await fixture(),row=await record(f,users[1]);await work.submit(f.project,users[1],row.id,1);await db.projectMember.update({where:{projectId_userId:{projectId:f.project,userId:users[1]}},data:{status:"LEFT"}});
    const check=await save(f);expect((await view(f,users[1])).viewerCanDecide).toBe(true);await confirm(f,check.checkId!,users[1],"DISPUTE");await expect(attribution.getAttributionCheck(other.project,users[1],f.manuscript,f.snapshot)).rejects.toMatchObject({statusCode:404});
    const pdf=Buffer.from('%PDF-1.4\nSynthetic test document\n%%EOF');await db.manuscriptCompilation.create({data:{snapshotId:f.snapshot,requestedById:users[0],status:"SUCCESS",pdfData:pdf,checksum:createHash("sha256").update(pdf).digest("hex"),toolchain:"Synthetic PDF access fixture",completedAt:new Date()}});
    expect(Buffer.from(await attribution.reviewPdf(f.project,users[1],f.manuscript,f.snapshot))).toEqual(pdf);
    await expect(writing.viewSnapshot(f.project,users[1],f.manuscript,f.snapshot)).rejects.toMatchObject({statusCode:404});
    await expect(attribution.reviewPdf(f.project,users[4],f.manuscript,f.snapshot)).rejects.toMatchObject({statusCode:404});
    await expect(db.$transaction(tx=>assertVerifiedAttributionForPublish(tx,f.project,f.manuscript,f.snapshot,users.slice(0,3)))).rejects.toMatchObject({statusCode:409});
  });
  it("detects evidence tampering after acknowledgement and requires renewed review",async()=>{
    const f=await fixture(),task=await db.projectTask.create({data:{projectId:f.project,title:"Dataset preparation",createdById:users[0],clientKey:randomUUID()}});
    const input={title:"Dataset curation",description:"Cleaned and documented a reproducible study dataset",source:"WORKSPACE" as const,workDate:new Date().toISOString(),participants:[{userId:users[1],roles:["DATA_CURATION" as const]}],evidence:"Dataset protocol",evidenceRefs:[{kind:"TASK" as const,id:task.id}],clientKey:randomUUID()};
    const row=await work.save(f.project,users[1],input);await work.submit(f.project,users[1],row.id,1);await work.review(f.project,users[2],row.id,{expectedVersion:1,decision:"ACCEPT",note:"Compared the documented deliverable"});
    await db.projectTask.update({where:{id:task.id},data:{title:"Replaced scientific evidence",version:{increment:1}}});
    expect((await view(f)).unresolvedDisputes.some(d=>d.source==="CHANGED_CONTRIBUTION_EVIDENCE")).toBe(true);
    await expect(work.review(f.project,users[0],row.id,{expectedVersion:1,decision:"ACCEPT",note:""})).rejects.toMatchObject({statusCode:409});
  });
  it("authenticates the real API, rejects impersonation and keeps exports private",async()=>{
    const f=await fixture(),check=await save(f),familyId=randomUUID();
    await db.refreshToken.create({data:{userId:users[0],familyId,tokenHash:hashOpaqueToken(randomUUID()),expiresAt:new Date(Date.now()+3600000)}});
    const token=tokenService.signAccessToken({sub:users[0],systemRole:"USER",sessionId:familyId}).token;
    const app=express();app.use(express.json());app.use('/projects/:projectId/manuscripts',manuscriptRouter);app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/projects/${f.project}/manuscripts/${f.manuscript}`,headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    try {
      expect((await fetch(`${base}/snapshots/${f.snapshot}/credit-statement`)).status).toBe(401);
      expect((await fetch(`${base}/attribution-checks/${check.checkId}/decisions`,{method:'POST',headers,body:JSON.stringify({decision:'CONFIRM',userId:users[1]})})).status).toBe(400);
      const response=await fetch(`${base}/attribution-checks/${check.checkId}/decisions`,{method:'POST',headers,body:JSON.stringify({decision:'CONFIRM',expectedVersion:check.version})});expect(response.status).toBe(201);expect((await response.json()).data.pendingAuthorIds).toEqual(users.slice(1,3));
      expect((await fetch(`${base}/snapshots/${f.snapshot}/credit-statement`,{headers})).status).toBe(409);
    } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it("completes three students and one lecturer: work, feedback evidence, authorship, export and seal",async()=>{
    const f=await fixture(),request=await mentorship.request(f.project,users[0],{mentorUserId:users[3],message:"Please critically review the scientific methods"});await mentorship.accept(f.project,request.id,users[3],undefined,request.accessPolicy?.version,request.previewToken);
    const access=await db.mentorAccess.findUniqueOrThrow({where:{requestId:request.id}});
    const shared=await mentorAccessService.share(f.project,users[0],access.id,{expectedVersion:access.version,kind:"MANUSCRIPT",resourceId:f.manuscript,sectionKey:`snapshot:${f.snapshot}`,title:"Approved methodology section",content:"We compare models with stratified validation and report sensitivity analyses."});
    const feedback=await mentorAccessService.comment(f.project,users[3],access.id,{shareId:shared.id,replyToId:null,kind:"COMMENT",body:"The validation protocol needs patient-level separation to avoid leakage; report uncertainty and repeat the analysis with independent splits.",creditRoles:[],clientKey:randomUUID()});
    const roleSets:CreditRole[][]=[["SOFTWARE","INVESTIGATION"],["DATA_CURATION"],["WRITING_ORIGINAL_DRAFT"],["SUPERVISION","WRITING_REVIEW_EDITING"]];
    for(let i=0;i<4;i++){
      const input={title:`Scientific work ${i}`,description:"Documented research work with participant-reviewed evidence",source:"WORKSPACE" as const,workDate:new Date().toISOString(),participants:[{userId:users[i],roles:roleSets[i]}],evidence:i===3?"Substantive review of the approved methodology version":"Research work documented by the team",evidenceRefs:i===3?[{kind:"MENTOR_FEEDBACK" as const,id:feedback.id}]:[],clientKey:randomUUID()};
      const record=await work.save(f.project,users[i],input);await work.submit(f.project,users[i],record.id,1);await work.review(f.project,users[i===0?1:0],record.id,{expectedVersion:1,decision:"ACCEPT",note:"Reviewed the contribution against the documented work"});
    }
    expect((await work.overview(f.project,users[0])).people.find(p=>p.userId===users[3])?.independentlyAcknowledgedRoles).toEqual(["SUPERVISION","WRITING_REVIEW_EDITING"]);
    const input=declaration(users.slice(0,4));input.proposedAuthors=input.proposedAuthors.map((author,i)=>({...author,creditRoles:roleSets[i]}));const check=await save(f,input);
    await expect(writing.publish(f.project,users[0],f.manuscript,f.snapshot,users.slice(0,4))).rejects.toMatchObject({statusCode:409});
    for(const actor of users.slice(0,4))await confirm(f,check.checkId!,actor);
    const statement=await attribution.statement(f.project,users[0],f.manuscript,f.snapshot);expect(statement.text).toContain("Data curation");expect(statement.text).toContain("Supervision");expect(statement.authors).toHaveLength(4);
    const sealed=await writing.publish(f.project,users[0],f.manuscript,f.snapshot,users.slice(0,4));expect((await db.submissionRevision.findUniqueOrThrow({where:{id:sealed.revisionId}})).attributionCheckId).toBe(check.checkId);
    const restored=await submissionService.createVersion(sealed.submissionId,{sourceRevisionId:sealed.revisionId,expectedRevisionNumber:1,summary:"Restore the exact sealed research version"},users[0],"USER");
    expect((await db.submissionRevision.findUniqueOrThrow({where:{id:restored.id}})).attributionCheckId).toBe(check.checkId);
    expect(await db.projectMember.count({where:{projectId:f.project,userId:users[3]}})).toBe(0);
  });
  it("does not let an unaccused owner unilaterally close another contributor's integrity dispute",async()=>{
    const f=await fixture(),incident=await researchIntegrityService.createCase(f.project,users[1],{kind:"ATTRIBUTION_DISPUTE",targetKind:"MANUSCRIPT_ATTRIBUTION",respondentUserId:users[2],title:"Disputed author order",description:"The proposed author order does not reflect the agreed research contributions"});
    expect((await researchIntegrityService.getCase(f.project,users[0],incident.id)).viewerCanResolve).toBe(false);
    await expect(researchIntegrityService.resolveCase(f.project,users[0],incident.id,{resolutionSummary:"Owner attempts to close a colleague's complaint"})).rejects.toMatchObject({statusCode:403});
    expect((await view(f)).unresolvedDisputes.some(d=>d.source==="ATTRIBUTION_DISPUTE")).toBe(true);
  });
  it("rejects a stale response that would replace another tab's decision",async()=>{
    const f=await fixture(),check=await save(f);await confirm(f,check.checkId!,users[0]);
    await expect(attribution.decideAttributionCheck(f.project,users[0],f.manuscript,check.checkId!,{decision:"DISPUTE",note:"A stale second-tab response",expectedDecisionId:null})).rejects.toMatchObject({statusCode:409});
    await confirm(f,check.checkId!,users[0],"DISPUTE");expect((await view(f)).unresolvedDisputes.some(d=>d.userId===users[0])).toBe(true);
  });
});
