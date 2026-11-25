import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { projectMentorshipService as consent } from "../project-mentorship.service.js";
import { mentorAccessService as sharing } from "../mentor-access.service.js";
import { manuscriptService as writing } from "../../workspaces/manuscript.service.js";
import { submissionService as submissions } from "../../submissions/submission.service.js";
import { reviewRequestService as requests } from "../../reviews/review-request.service.js";
import { projectTeamChatService as teamChat } from "../project-team-chat.service.js";

vi.mock("../../../infrastructure/queue.js", () => {
  const queue = () => ({ add: vi.fn().mockResolvedValue({}), getJob: vi.fn().mockResolvedValue(null) });
  return { QUEUE_NAMES: {}, notificationQueue: queue(), aiJobsQueue: queue(), apiSyncQueue: queue(), openAlexIngestQueue: queue(), corpusValidationQueue: queue(), embeddingQueue: queue(), paperAnalysisQueue: queue(), reportQueue: queue(), gapsQueue: queue(), taggingQueue: queue(), topicBackfillQueue: queue(), manuscriptCompileQueue: queue(), communitySummaryQueue: queue(), hasLiveJob: vi.fn().mockResolvedValue(false) };
});
const enabled = process.env.MENTOR_WORKSPACE_INTEGRATION === "1";
if (enabled && !/^\/codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw Error("Use the isolated mentor workspace runner");

describe.skipIf(!enabled).sequential("mentor permissions audit through the complete application", () => {
  const db = getPrisma(), output = resolve(process.cwd(), "../../docs/audits/2026-11-20-mentor-permissions-verification");
  const rows: { role: string; method: string; endpoint: string; expected: number[]; actual: number; pass: boolean }[] = [];
  const secrets = ["AUDIT_PRIVATE_DESCRIPTION", "AUDIT_PRIVATE_EVIDENCE", "AUDIT_PRIVATE_TEAM_MESSAGE", "AUDIT_UNSHARED_PAPER"];
  const tokens = new Map<string,string>();
  let server: ReturnType<import("express").Express["listen"]>, base: string;
  let owner: string, member: string, mentor: string, outsider: string, project: string, foreign: string;
  let invitation: string, access: string, manuscript: string, mainFile: string, snapshot: string, paper: string, otherPaper: string, file: string, share: string;
  async function user(name: string, lecturer = false) {
    const u = await db.user.create({data:{email:"audit-"+randomUUID()+"@example.invalid",fullName:name,emailVerifiedAt:new Date(),onboardingCompletedAt:new Date(),admissionBasis:"INVITATION"}});
    await db.academicProfile.create({data:{userId:u.id,academicRole:lecturer?"LECTURER":"STUDENT",primaryPosition:lecturer?"LECTURER":"STUDENT",roleVerificationStatus:lecturer?"VERIFIED":"SELF_DECLARED",positionStatus:lecturer?"VERIFIED":"NOT_SUBMITTED",supportAvailability:{enabled:lecturer},reviewAvailability:{enabled:lecturer,maximumActiveReviews:20}}});
    const sessionId=randomUUID();await db.refreshToken.create({data:{userId:u.id,familyId:sessionId,tokenHash:hashOpaqueToken(randomUUID()),expiresAt:new Date(Date.now()+3600000)}});
    tokens.set(u.id,tokenService.signAccessToken({sub:u.id,systemRole:"USER",sessionId}).token);return u.id;
  }
  const version = async () => (await db.mentorAccess.findUniqueOrThrow({where:{id:access}})).version;
  const root = () => "/projects/"+project;
  const resource = () => root()+"/mentor-access/"+access+"/shares/"+share;
  async function check(role: string, actor: string | null, endpoint: string, expected: number[], options: { method?: string; body?: unknown; private?: boolean } = {}) {
    const method=options.method??"GET";
    const response=await fetch(base+"/api/v1"+endpoint,{method,headers:{...(actor?{authorization:"Bearer "+tokens.get(actor)}:{}),"content-type":"application/json"},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});
    const text=await response.text(); rows.push({role,method,endpoint,expected,actual:response.status,pass:expected.includes(response.status)});
    expect(expected, role+" "+method+" "+endpoint+" responded "+response.status+" "+text.slice(0,250)).toContain(response.status);
    if(options.private)for(const secret of secrets)expect(text,role+" leaked "+secret+" through "+endpoint).not.toContain(secret);
    return {response,text,data:()=>JSON.parse(text).data};
  }
  async function privateRoutes(role: string, actor: string, team = false) {
    for(const path of [root(),root()+"/workspace",root()+"/research/papers",root()+"/research/evidence/workspace",root()+"/research/files/"+file,root()+"/team-chat",root()+"/chat?scope=private",root()+"/manuscripts/"+manuscript,root()+"/manuscripts/"+manuscript+"/files/"+mainFile,root()+"/manuscripts/"+manuscript+"/snapshots/"+snapshot]) await check(role,actor,path,team?[200]:[403,404],{private:!team});
  }
  const comment = (body="Scoped paper comment") => ({kind:"COMMENT",shareId:share,replyToId:null,creditRoles:[],body,clientKey:randomUUID()});
  beforeAll(async()=>{
    owner=await user("Audit project owner");member=await user("Audit student member");mentor=await user("Audit academic mentor",true);outsider=await user("Audit unrelated lecturer",true);
    project=(await createProjectFixture({data:{ownerId:owner,title:"Mentor Permissions Audit",status:"ACTIVE",visibility:"PRIVATE",description:secrets[0],mentorshipSummary:"A reproducible study of research methods and evaluation design.",mentorshipNeeds:"Methodology and analysis",mentorshipDiscovery:"SEEKING_MENTOR"}})).id;
    foreign=(await createProjectFixture({data:{ownerId:outsider,title:"Unrelated private project",status:"ACTIVE",visibility:"PRIVATE"}})).id;
    await db.projectMember.create({data:{projectId:project,userId:member}});
    for(const title of ["Audit shared research paper",secrets[3]!]){const p=await db.paper.create({data:{title,primaryProvider:"user",publicationYear:2026,abstractText:"Research design and evaluation evidence"}});await db.projectPaper.create({data:{projectId:project,paperId:p.id,addedById:owner}});if(!paper)paper=p.id;else otherPaper=p.id;}
    const paperPdf=new Uint8Array(Buffer.from("%PDF-1.4\nPrivate pinned Paper PDF\n%%EOF"));
    file=(await db.projectPaperFile.create({data:{projectId:project,paperId:paper,uploadedById:owner,content:paperPdf,sha256:"d".repeat(64),byteSize:paperPdf.length}})).id;
    await db.projectEvidenceItem.create({data:{projectId:project,paperId:paper,claim:secrets[1]!,origin:"HUMAN",extractedById:owner,clientKey:randomUUID()}});
    await teamChat.sendMessage(project,owner,secrets[2]!,randomUUID());
    manuscript=(await writing.create(project,owner,{title:"Audit private working manuscript",template:"BLANK",documentType:"RESEARCH_PAPER",description:"",clientKey:randomUUID()})).id;
    mainFile=(await writing.detail(project,owner,manuscript)).mainFileId!;
    snapshot=(await writing.snapshot(project,owner,manuscript,{label:"Unshared manuscript version",clientKey:randomUUID(),minimumSequences:{},reuseUnchanged:true})).id;
    const sent=await consent.request(project,owner,{mentorUserId:mentor,message:"Please help us with research methodology and evaluation design",idempotencyKey:randomUUID()});invitation=sent.id;
    access=(await db.mentorAccess.findUniqueOrThrow({where:{requestId:invitation}})).id;
    const {createApp}=await import("../../../app.js");server=createApp().listen(0,"127.0.0.1");await once(server,"listening");base="http://127.0.0.1:"+(server.address() as {port:number}).port;
  },60000);
  afterAll(async()=>{await mkdir(output,{recursive:true});await writeFile(resolve(output,"api-security-matrix.json"),JSON.stringify({source:"complete createApp + signed sessions + isolated PostgreSQL",rows},null,2)+"\n");if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}await disconnectPostgres();});

  it("denies unauthenticated, pending and outside accounts through production routers, while owner/member retain access",async()=>{
    await check("ANONYMOUS",null,root()+"/mentor-access",[401],{private:true});
    await privateRoutes("OWNER",owner,true);await privateRoutes("MEMBER",member,true);await privateRoutes("PENDING_MENTOR",mentor);await privateRoutes("OUTSIDER",outsider);
    const view=await check("PENDING_MENTOR",mentor,root()+"/mentorships/"+invitation,[200],{private:true});expect(view.text).toContain("reproducible study");
    await check("PENDING_MENTOR",mentor,root()+"/mentor-access",[404],{private:true});
    await expect(submissions.create({projectId:project,title:"Unauthorized pending review",mentorId:mentor,contentSnapshot:"Do not deliver"},undefined,owner,"user")).rejects.toMatchObject({statusCode:403});
  });
  it("accepts once with safe defaults and unassigned academic responsibility, without exposing private project responses",async()=>{
    await consent.accept(project,invitation,mentor,"Agreed",await version());
    expect((await db.mentorAccess.findUniqueOrThrow({where:{id:access}})).permissions).toEqual(["OVERVIEW_VIEW","MENTOR_CHAT"]);
    expect((await db.mentorRelationship.findFirstOrThrow({where:{sourceRequestId:invitation}})).mentorRole).toBe("UNASSIGNED");
    expect(await db.projectMember.count({where:{projectId:project,userId:mentor}})).toBe(0);
    const result=await check("ACCEPTED_UNSHARED",mentor,root()+"/mentor-access",[200],{private:true});expect(result.data().policies[0].shares).toEqual([]);
    await privateRoutes("ACCEPTED_UNSHARED",mentor);
    await check("ACCEPTED_UNSHARED",mentor,root()+"/mentor-access/"+access+"/shares/"+randomUUID(),[404],{private:true});
    await check("ACCEPTED_UNSHARED",mentor,root()+"/team-chat/events",[403,404],{private:true});
    const message={kind:"MESSAGE",shareId:null,replyToId:null,creditRoles:[],body:"Hello from accepted mentor",clientKey:randomUUID()};
    await check("ACCEPTED_UNSHARED",mentor,root()+"/mentor-access/"+access+"/feedback",[201],{method:"POST",body:message});
    const received=await check("OWNER",owner,root()+"/mentor-access/"+access+"/feedback",[200]);expect(received.text).toContain(message.body);
    await check("ACCEPTED_UNSHARED",mentor,root()+"/mentor-access/"+access,[403],{method:"PUT",body:{preset:"REVIEWER",permissions:["MENTOR_CHAT"],expiresAt:null,expectedVersion:await version(),reason:"Unauthorized self grant"}});
  });
  it("enforces view-only across resource, private PDF, comments and other project APIs",async()=>{
    share=(await sharing.share(project,member,access,{kind:"PAPER",resourceId:paper,accessMode:"VIEW",expectedVersion:await version()})).id;
    const viewed=await check("PAPER_VIEW",mentor,resource(),[200],{private:true});expect(viewed.data().canComment).toBe(false);
    const pdf=await check("PAPER_VIEW",mentor,resource()+"/pdf",[200]);expect(pdf.text).toContain("Private pinned Paper PDF");expect(pdf.response.headers.get("cache-control")).toBe("private, no-store");
    await check("PAPER_VIEW",mentor,root()+"/mentor-access/"+access+"/feedback",[403],{method:"POST",body:comment()});
    await privateRoutes("PAPER_VIEW",mentor);
    await check("OUTSIDER",outsider,resource(),[404],{private:true});await check("OUTSIDER",outsider,resource()+"/pdf",[404],{private:true});
    await check("CROSS_PROJECT",mentor,resource().replace(project,foreign),[404],{private:true});
  });
  it("permits scoped comments, rejects write/admin bypasses and preserves feedback on downgrade",async()=>{
    await sharing.share(project,owner,access,{kind:"PAPER",resourceId:paper,accessMode:"COMMENT",expectedVersion:await version()});
    const payload=comment("Persisted academic feedback on the shared paper");
    await check("PAPER_COMMENT",mentor,root()+"/mentor-access/"+access+"/feedback",[201],{method:"POST",body:payload});
    await check("PAPER_COMMENT_RETRY",mentor,root()+"/mentor-access/"+access+"/feedback",[201],{method:"POST",body:payload});
    expect(await db.mentorFeedback.count({where:{accessId:access,clientKey:payload.clientKey}})).toBe(1);
    await check("PAPER_COMMENT",mentor,root()+"/papers/"+paper,[403,404],{method:"DELETE"});
    await check("PAPER_COMMENT",mentor,root()+"/research/screening/"+paper+"/vote",[403,404],{method:"PUT",body:{phase:"TITLE_ABSTRACT",decision:"INCLUDED",reason:"Unauthorized decision",expectedVersion:1}});
    await check("PAPER_COMMENT",mentor,root()+"/members/"+member,[403,404],{method:"DELETE",body:{reason:"Unauthorized removal"}});
    await sharing.share(project,owner,access,{kind:"PAPER",resourceId:paper,accessMode:"VIEW",expectedVersion:await version()});
    await check("DOWNGRADED_VIEW",mentor,root()+"/mentor-access/"+access+"/feedback",[403],{method:"POST",body:comment()});
    const feedback=await check("DOWNGRADED_VIEW",mentor,root()+"/mentor-access/"+access+"/feedback?shareId="+share,[200]);expect(feedback.text).toContain(payload.body);
  });
  it("keeps review access independent, rejects wrong manuscript/version/reviewer IDs, and closes cancelled review only",async()=>{
    const sent=await submissions.create({projectId:project,title:"Audit delivered review v1",mentorId:mentor,contentSnapshot:"# Methods\nExplicitly shared manuscript v1 evidence."},undefined,owner,"user");
    const assignment=await db.reviewerAssignment.findFirstOrThrow({where:{submissionId:sent.submission.id,reviewerId:mentor}});const request=assignment.reviewRequestId!;
    await check("REVIEW_V1",mentor,"/review-requests/"+request+"/accept",[204],{method:"POST"});
    await check("REVIEW_V1",mentor,"/reviews/"+assignment.id,[200]);
    await check("OTHER_REVIEWER",outsider,"/reviews/"+assignment.id,[404],{private:true});
    await check("REVIEW_V1",mentor,"/submissions/"+sent.submission.id+"/revisions/"+randomUUID()+"/download",[404],{private:true});
    await check("REVIEW_V1",mentor,"/projects/"+foreign+"/manuscripts/"+manuscript,[404],{private:true});
    await check("REVIEW_V1",mentor,root()+"/manuscripts/"+manuscript+"/snapshots/"+randomUUID(),[404],{private:true});
    await db.reviewRequest.update({where:{id:request},data:{dueAt:new Date(Date.now()-86400000)}});
    await requests.cancel(request,owner);
    await check("CANCELLED_REVIEW",mentor,"/reviews/"+assignment.id,[403,404],{private:true});
    await check("REMAINING_DIRECT_SHARE",mentor,resource(),[200]);await check("REMAINING_DIRECT_SHARE",mentor,resource()+"/pdf",[200]);
    expect(await db.reviewRequest.count({where:{id:request,status:"CANCELLED"}})).toBe(1);
  });
  it("revokes direct access, file and aggregate projections without deleting previous comments",async()=>{
    await sharing.unshare(project,owner,access,share,{expectedVersion:await version(),confirmed:true,reason:"Audit revoke direct share"});
    await check("REVOKED_PAPER",mentor,resource(),[404],{private:true});await check("REVOKED_PAPER",mentor,resource()+"/pdf",[404],{private:true});
    await check("REVOKED_PAPER",mentor,root()+"/mentor-access/"+access+"/feedback?shareId="+share,[404],{private:true});
    const inbox=await check("REVOKED_PAPER",mentor,"/projects/academic-support/resources",[200]);expect(inbox.data().items).toEqual([]);
    expect(await db.mentorFeedback.count({where:{shareId:share}})).toBe(1);
  });
  it("ends the relationship and denies new reads, writes, files and aggregates while retaining history",async()=>{
    share=(await sharing.share(project,owner,access,{kind:"PAPER",resourceId:otherPaper,accessMode:"COMMENT",expectedVersion:await version()})).id;
    const relation=await db.mentorRelationship.findFirstOrThrow({where:{sourceRequestId:invitation}});await consent.end(project,relation.id,owner);
    await check("ENDED_MENTOR",mentor,root()+"/mentor-access",[404],{private:true});await check("ENDED_MENTOR",mentor,resource(),[404],{private:true});
    await check("ENDED_MENTOR",mentor,root()+"/mentor-access/"+access+"/feedback",[404],{method:"POST",body:comment()});
    const inbox=await check("ENDED_MENTOR",mentor,"/projects/academic-support/resources",[200]);expect(inbox.data().items).toEqual([]);
    const queue=await check("ENDED_MENTOR",mentor,"/projects/academic-support/workspace",[200]);expect(queue.data().items).toEqual([]);expect(queue.data().projects).toEqual([]);
    expect(await db.mentorFeedback.count({where:{accessId:access}})).toBeGreaterThan(0);expect(await db.mentorAccessEvent.count({where:{accessId:access}})).toBeGreaterThan(0);
  });
  it.skipIf(process.env.MENTOR_PERMISSIONS_BROWSER !== "1")("verifies invitation, paper sharing, chat and manuscript feedback through the full product UI",async()=>{
    const p=await createProjectFixture({data:{ownerId:owner,title:"Browser Mentor Sharing Audit",status:"ACTIVE",visibility:"PRIVATE",description:"PRIVATE BROWSER STUDY PLAN",mentorshipSummary:"A reproducible study evaluating research design and analytical methods.",mentorshipNeeds:"Research methods",mentorshipDiscovery:"SEEKING_MENTOR"}});
    await db.projectMember.create({data:{projectId:p.id,userId:member}});
    const source=await db.paper.create({data:{title:"Full application evaluation paper",primaryProvider:"user",publicationYear:2026,abstractText:"Study methods, comparison groups and transparent evaluation."}});await db.projectPaper.create({data:{projectId:p.id,paperId:source.id,addedById:owner}});
    const {PDFDocument,StandardFonts}=await import("pdf-lib"),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([595,842]);page.drawText("Immutable paper shared for academic guidance",{x:40,y:770,size:16,font});page.drawText("Study methods and evaluation evidence.",{x:40,y:730,size:12,font});const content=new Uint8Array(await pdf.save());
    const {createHash}=await import("node:crypto");await db.projectPaperFile.create({data:{projectId:p.id,paperId:source.id,uploadedById:owner,content,sha256:createHash("sha256").update(content).digest("hex"),byteSize:content.length}});
    const sent=await consent.request(p.id,owner,{mentorUserId:mentor,message:"Please guide our study methods and evaluation design",idempotencyKey:randomUUID()});
    const {mentorPermissionsBrowser}=await import("./mentor-permissions.browser.js");
    await mentorPermissionsBrowser(db,{base,projectId:p.id,paperId:source.id,paperTitle:source.title,invitationId:sent.id,owner:{id:owner,token:tokens.get(owner)!},mentor:{id:mentor,token:tokens.get(mentor)!},outsider:{id:outsider,token:tokens.get(outsider)!},createReview:async()=>{
      const delivered=await submissions.create({projectId:p.id,title:"Full UI manuscript version one",mentorId:mentor,contentSnapshot:"# Methods\nAn immutable manuscript revision shared explicitly for mentor feedback."},undefined,owner,"user");
      const assignment=await db.reviewerAssignment.findFirstOrThrow({where:{submissionId:delivered.submission.id,reviewerId:mentor}});return {requestId:assignment.reviewRequestId!,assignmentId:assignment.id};
    }});
  },240000);

});
