import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect as baseExpect } from "@playwright/test";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { authService } from "../../auth/auth.service.js";

const expect = baseExpect.configure({ timeout: 15000 });
type Account = { id: string; token: string };
export async function mentorPermissionsBrowser(db: PrismaClient, input: {
  base: string; projectId: string; paperId: string; paperTitle: string; invitationId: string;
  owner: Account; mentor: Account; outsider: Account;
  createReview: () => Promise<{ requestId: string; assignmentId: string }>;
}) {
  const { createServer } = await import("vite");
  const webRoot=resolve(process.cwd(),"../web"), output=resolve(process.cwd(),"../../docs/audits/2026-11-20-mentor-permissions-verification");
  const tailwind=(await import("tailwindcss")).default,autoprefixer=(await import("autoprefixer")).default;
  const config=(await import(pathToFileURL(resolve(webRoot,"tailwind.config.js")).href)).default;
  const vite=await createServer({root:webRoot,configFile:resolve(webRoot,"vite.config.ts"),cacheDir:resolve(webRoot,".cache/mentor-permissions-audit-vite"),css:{postcss:{plugins:[tailwind({...config,content:[`${webRoot}/index.html`,`${webRoot}/src/**/*.{ts,tsx}`]}),autoprefixer()]}},server:{host:"127.0.0.1",port:13106,strictPort:true,proxy:{"/api":{target:input.base,changeOrigin:true,ws:true}}}});
  await mkdir(output,{recursive:true});
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  const errors:string[]=[],steps:string[]=[];
  const root="http://127.0.0.1:13106",project="/projects/"+input.projectId;
  try {
    await vite.listen();browser=await chromium.launch({headless:true});
    const setup=async(account:Account)=>{const context=await browser!.newContext({viewport:{width:1440,height:960}});const user=await authService.me(account.id);await context.addInitScript(({user,token})=>{localStorage.setItem("trend-auth",JSON.stringify({version:1,state:{user,tokens:{accessToken:token,refreshToken:"isolated-audit-only"}}}));localStorage.setItem("LumiGap.uiLanguage","en");},{user,token:account.token});const page=await context.newPage();page.setDefaultTimeout(30000);page.on("pageerror",e=>errors.push(e.message));return page;};
    const a=await setup(input.owner),b=await setup(input.mentor);
    try {
      await a.goto(root+project+"?tab=support&view=requests",{waitUntil:"domcontentloaded",timeout:60000});
      await a.getByRole("button",{name:"View sent invitation",exact:true}).first().click();
      await expect(a.getByRole("dialog")).toContainText("Waiting for the lecturer's response");
      await expect(a.getByRole("dialog").getByRole("button",{name:"Accept supervision",exact:true})).toHaveCount(0);
      await a.screenshot({path:resolve(output,"owner-pending-invitation.png"),fullPage:true,animations:"disabled"});await a.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).first().click();
      await b.goto(root+"/mentor-workspace?view=incoming",{waitUntil:"domcontentloaded",timeout:60000});
      await b.getByRole("button",{name:"Accept",exact:true}).click();await b.getByRole("dialog").getByRole("button",{name:"Confirm",exact:true}).click();
      await expect.poll(()=>db.mentorRelationship.count({where:{projectId:input.projectId,mentorUserId:input.mentor.id,status:"ACTIVE"}})).toBe(1);steps.push("Mentor accepts invitation in the full application");
      const relationship=await db.mentorRelationship.findFirstOrThrow({where:{projectId:input.projectId,mentorUserId:input.mentor.id,status:"ACTIVE"}});
      const access=await db.mentorAccess.findUniqueOrThrow({where:{requestId:input.invitationId}});
      expect(access.permissions).toEqual(["OVERVIEW_VIEW","MENTOR_CHAT"]);expect(relationship.mentorRole).toBe("UNASSIGNED");
      await a.goto(root+project+"?tab=papers&view=library&source="+input.paperId,{waitUntil:"domcontentloaded",timeout:60000});
      await a.getByRole("button",{name:"Share with supervisor",exact:true}).click();
      const dialog=a.getByRole("dialog").filter({has:a.getByRole("heading",{name:"Share paper",exact:true})});
      await expect(dialog.getByRole("radio",{name:"Read and comment",exact:true})).toBeChecked();
      expect(await dialog.getByRole("checkbox").count()).toBe(0);
      await dialog.getByRole("combobox").focus();await a.keyboard.press("Tab");expect(await dialog.evaluate(el=>el.contains(el.ownerDocument.activeElement))).toBe(true);
      for(const [name,width,height]of [["desktop",1440,960],["tablet",1024,768],["mobile",390,844]]as const){await a.setViewportSize({width,height});expect(await a.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);await a.screenshot({path:resolve(output,"full-share-"+name+".png"),fullPage:false,animations:"disabled"});}
      await a.evaluate("document.documentElement.classList.add('dark')");await a.screenshot({path:resolve(output,"full-share-mobile-dark.png"),fullPage:false,animations:"disabled"});await a.evaluate("document.documentElement.classList.remove('dark')");await a.setViewportSize({width:1440,height:960});
      let loseResponse=true;
      await a.route("**/mentor-access/*/shares",async route=>{if(route.request().method()==="POST"&&loseResponse){loseResponse=false;await route.fetch();await route.abort("failed");}else await route.continue();});
      await dialog.getByRole("button",{name:"Share",exact:true}).click();await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(dialog.getByRole("radio",{name:"Read and comment",exact:true})).toBeChecked();
      await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);await a.unroute("**/mentor-access/*/shares");
      expect(await db.mentorResourceShare.count({where:{accessId:access.id,resourceId:input.paperId,revokedAt:null}})).toBe(1);
      expect(await db.notification.count({where:{type:"MENTOR_RESOURCE_SHARED",targetUuid:input.projectId,userId:input.mentor.id}})).toBe(1);steps.push("Paper sharing recovers from a lost response without duplicate grants or notifications");
      await b.goto(root+"/mentor-workspace?view=resources",{waitUntil:"domcontentloaded",timeout:60000});await b.getByText(input.paperTitle,{exact:true}).click();await b.locator("canvas").first().waitFor();
      await b.getByRole("textbox",{name:"Comment on this paper",exact:true}).fill("Browser academic comment retained after permission changes.");await b.getByRole("button",{name:"Send comment",exact:true}).click();await expect(b.getByText("Browser academic comment retained after permission changes.",{exact:true})).toBeVisible();
      await b.screenshot({path:resolve(output,"full-mentor-paper-comment.png"),fullPage:true,animations:"disabled"});steps.push("Mentor reads the pinned PDF and persists paper feedback through the full workspace");
      await a.getByRole("button",{name:"Share with supervisor",exact:true}).click();await dialog.getByRole("radio",{name:"Read only",exact:true}).check();await dialog.getByRole("button",{name:"Save changes",exact:true}).click();await expect(dialog).toHaveCount(0);
      await b.reload();await b.getByText(input.paperTitle,{exact:true}).click();await expect(b.getByText("Browser academic comment retained after permission changes.",{exact:true})).toBeVisible();await expect(b.getByRole("textbox",{name:"Comment on this paper",exact:true})).toHaveCount(0);await b.setViewportSize({width:390,height:844});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);await b.screenshot({path:resolve(output,"full-mentor-paper-view-mobile.png"),fullPage:true,animations:"disabled"});await b.setViewportSize({width:1440,height:960});
      await a.goto(root+project+"?tab=chat&channel=mentors&mentorAccess="+access.id,{waitUntil:"domcontentloaded"});
      await b.goto(root+"/mentor-workspace?view=project&projectId="+input.projectId+"&tab=chat&channel=mentors&mentorAccess="+access.id,{waitUntil:"domcontentloaded"});
      await a.getByRole("textbox",{name:"Tin nhắn với cố vấn và nhóm",exact:true}).fill("Owner and mentor discuss methodology in their scoped channel.");await a.getByRole("textbox",{name:"Tin nhắn với cố vấn và nhóm",exact:true}).press("Enter");
      await expect(b.getByRole("log").getByText("Owner and mentor discuss methodology in their scoped channel.",{exact:true})).toBeVisible();
      await b.getByRole("textbox",{name:"Tin nhắn với cố vấn và nhóm",exact:true}).fill("Mentor acknowledges the methods discussion.");await b.getByRole("textbox",{name:"Tin nhắn với cố vấn và nhóm",exact:true}).press("Enter");await expect(a.getByRole("log").getByText("Mentor acknowledges the methods discussion.",{exact:true})).toBeVisible();await b.screenshot({path:resolve(output,"full-mentor-chat.png"),fullPage:true,animations:"disabled"});steps.push("Owner and mentor exchange persisted messages in both directions without a paper permission setup");
      const review=await input.createReview();await b.goto(root+"/mentor-workspace?view=work",{waitUntil:"domcontentloaded"});
      await b.locator('a[href*="'+review.requestId+'"]').first().click();
      await b.getByRole("button",{name:"Accept and open manuscript",exact:true}).click();
      await b.goto(root+"/mentor-workspace?view=review&assignmentId="+review.assignmentId,{waitUntil:"domcontentloaded"});
      await b.getByRole("textbox",{name:/Overall Comment/}).fill("Browser mentor feedback for the explicitly shared manuscript revision.");await b.locator('input[name="mentor-feedback-outcome"][value="COMMENT"]').check();
      await b.getByRole("button",{name:"Submit Review",exact:true}).click();await b.getByRole("dialog").getByRole("button",{name:"Submit final review",exact:true}).click();await expect(b.getByText("This review round is submitted and immutable.",{exact:true})).toBeVisible();
      await b.screenshot({path:resolve(output,"full-mentor-review-submitted.png"),fullPage:true,animations:"disabled"});
      await a.goto(root+"/review-requests/"+review.requestId,{waitUntil:"domcontentloaded"});await expect(a.getByText("Browser mentor feedback for the explicitly shared manuscript revision.",{exact:true}).first()).toBeVisible();steps.push("Mentor opens the assigned review from the global queue and the student receives immutable version-bound feedback");
      const outsider=await setup(input.outsider);const deniedResponse=outsider.waitForResponse(response=>response.url().includes("/api/v1/reviews/"+review.assignmentId)&&[403,404].includes(response.status()));await outsider.goto(root+"/mentor-workspace?view=review&assignmentId="+review.assignmentId,{waitUntil:"domcontentloaded"});await deniedResponse;await expect(outsider.getByRole("textbox",{name:/Overall Comment/})).toHaveCount(0);await expect(outsider.getByText("Browser mentor feedback for the explicitly shared manuscript revision.",{exact:true})).toHaveCount(0);await outsider.close();
      await a.goto(root+project+"?tab=support&view=access",{waitUntil:"domcontentloaded"});await a.getByRole("button",{name:"Ngừng chia sẻ",exact:true}).first().waitFor();await expect(a.getByText("Advanced permissions & sharing",{exact:true})).toHaveCount(0);await expect(a.getByText("Chọn quyền, nội dung và hạn truy cập riêng cho từng cố vấn. Lịch sử vẫn được giữ khi thu hồi.",{exact:true})).toHaveCount(0);await a.screenshot({path:resolve(output,"full-owner-shared-resources.png"),fullPage:true,animations:"disabled"});await a.getByRole("button",{name:"Ngừng chia sẻ",exact:true}).first().click();await a.getByRole("dialog").getByRole("checkbox").check();await a.getByRole("dialog").getByRole("button",{name:"Xác nhận ngừng chia sẻ",exact:true}).click();
      await b.goto(root+"/mentor-workspace?view=resources",{waitUntil:"domcontentloaded"});await expect(b.getByText("No resources have been shared with you yet.",{exact:true})).toBeVisible();await b.screenshot({path:resolve(output,"full-mentor-revoked.png"),fullPage:true,animations:"disabled"});
      expect(await db.mentorFeedback.count({where:{accessId:access.id,body:"Browser academic comment retained after permission changes."}})).toBe(1);steps.push("Revocation removes the paper from the global inbox while feedback remains persisted");
      expect(errors).toEqual([]);
    } catch(error) {await a.screenshot({path:resolve(output,"failure-owner.png"),fullPage:true,animations:"disabled"});await b.screenshot({path:resolve(output,"failure-mentor.png"),fullPage:true,animations:"disabled"});await writeFile(resolve(output,"failure-ui.txt"),"OWNER\n"+await a.locator("body").innerText()+"\nMENTOR\n"+await b.locator("body").innerText());throw error;}
  } finally {await writeFile(resolve(output,"full-browser-results.json"),JSON.stringify({source:"full app routes + real API + isolated PostgreSQL; no component harness or mocked API responses",steps,pageErrors:errors},null,2)+"\n");await browser?.close();await vite.close();}
}
