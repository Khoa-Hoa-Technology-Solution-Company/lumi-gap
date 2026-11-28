// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({workspace:vi.fn(),sharePaper:vi.fn(),unshare:vi.fn(),resource:vi.fn(),feedback:vi.fn(),comment:vi.fn(),inbox:vi.fn()}));
vi.mock("../api/mentor-access.api",()=>({mentorAccessApi:mocks}));
vi.mock("@/i18n",()=>({useI18n:()=>({t:(s:string)=>s})}));
vi.mock("@/stores/auth-store",()=>({useAuthStore:(select:(s:unknown)=>unknown)=>select({user:{id:"owner"}})}));
import { MentorPaperSharing, MentorSharedPaper, MentorSharedResourceInbox } from "../components/mentor-paper-sharing";
let host:HTMLDivElement,root:Root,client:QueryClient;
const policy={id:"access",version:2,effective:true,permissions:["MENTOR_CHAT"],revokedAt:null};
const mentor={mentorId:"mentor",mentorName:"TS. Test",invitationState:"ACCEPTED",policy,shares:[]};
const resource={id:"share",kind:"PAPER" as const,resourceId:"paper",sectionKey:"",title:"Research paper",createdAt:"2026-11-20T00:00:00Z",revokedAt:null,accessMode:"VIEW" as const,canUnshare:true};
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()===label)!;
async function render(node:React.ReactNode){await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>));await act(async()=>{await vi.dynamicImportSettled();});}
async function flush(){await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));}
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.resetAllMocks();mocks.workspace.mockResolvedValue({canManage:true,readOnly:false,policies:[mentor]});mocks.sharePaper.mockResolvedValue(resource);mocks.feedback.mockResolvedValue({items:[]});mocks.resource.mockResolvedValue({...resource,content:"Shared abstract only",canComment:false});mocks.inbox.mockResolvedValue({items:[],hasNext:false});host=document.createElement("div");document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false}}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();client.clear();vi.unstubAllGlobals();});
async function openSharing(){await render(<MentorPaperSharing projectId="project" paperId="paper"/>);await act(async()=>button("Chia sẻ với cố vấn").click());await flush();}
it("defaults to view-and-comment without permission presets or technical settings",async()=>{await openSharing();expect(document.querySelectorAll('input[type="radio"]')[0]).toHaveProperty("checked",true);expect(document.body.textContent).not.toMatch(/Observer|Advisor|Reviewer|Hạn truy cập|Lý do thay đổi/);await act(async()=>button("Chia sẻ").click());expect(mocks.sharePaper).toHaveBeenCalledWith("project","access",{kind:"PAPER",resourceId:"paper",accessMode:"COMMENT",expectedVersion:2});});
it("excludes pending and ineffective mentors",async()=>{mocks.workspace.mockResolvedValue({policies:[{...mentor,invitationState:"PENDING",policy:{...policy,effective:false}}]});await openSharing();expect(document.body.textContent).toContain("Chưa có cố vấn đã chấp nhận");expect(button("Chia sẻ")).toBeUndefined();});
it("supports view-only and sends only resource identity and intended access",async()=>{await openSharing();await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click());await act(async()=>button("Chia sẻ").click());expect(mocks.sharePaper.mock.calls[0]![2]).toEqual({kind:"PAPER",resourceId:"paper",accessMode:"VIEW",expectedVersion:2});});
it("retains the selected mode and error state when saving fails",async()=>{mocks.sharePaper.mockRejectedValue(new Error("offline"));await openSharing();await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click());await act(async()=>button("Chia sẻ").click());await flush();expect(document.querySelectorAll('input[type="radio"]')[1]).toHaveProperty("checked",true);expect(document.querySelector('[role="alert"]')?.textContent).toContain("Nội dung bạn chọn vẫn được giữ");});
it("does not offer a comment composer for view-only access",async()=>{await render(<MentorSharedPaper projectId="project" accessId="access" resource={resource}/>);await act(async()=>{const element=host.querySelector('details')!;element.open=true;element.dispatchEvent(new Event('toggle'));});await flush();expect(host.textContent).toContain("Shared abstract only");expect(host.querySelector('textarea')).toBeNull();});
it("hides cached private content when a refresh reports revoked access",async()=>{await render(<MentorSharedPaper projectId="project" accessId="access" resource={resource}/>);await act(async()=>{const element=host.querySelector('details')!;element.open=true;element.dispatchEvent(new Event('toggle'));});await flush();mocks.resource.mockRejectedValue(new Error("revoked"));await act(async()=>{await client.refetchQueries({queryKey:["mentor-access"]});});await flush();expect(host.textContent).not.toContain("Shared abstract only");expect(host.textContent).toContain("Tài liệu không còn được chia sẻ");});
it("shows an empty global resource inbox without useless controls or duplicate review requests",async()=>{await render(<MentorSharedResourceInbox/>);await flush();expect(host.textContent).toContain("Chưa có tài liệu nào được chia sẻ với bạn");expect(host.textContent).toContain("Khi nhóm nghiên cứu chia sẻ tài liệu");expect(host.querySelector('input,select,nav')).toBeNull();});

it("preserves an existing view-only mode when reopening and saving the sharing dialog",async()=>{
 mocks.workspace.mockResolvedValue({policies:[{...mentor,shares:[resource]}]});await openSharing();
 expect(document.querySelectorAll('input[type="radio"]')[1]).toHaveProperty("checked",true);
 await act(async()=>button("Lưu thay đổi").click());expect(mocks.sharePaper.mock.calls[0]![2]).toMatchObject({accessMode:"VIEW"});
});
it("resets the unsaved selection to the next mentor's actual share mode",async()=>{
 mocks.workspace.mockResolvedValue({policies:[mentor,{...mentor,mentorId:"second-mentor",mentorName:"Second mentor",policy:{...policy,id:"second-access"},shares:[resource]}]});await openSharing();
 const select=document.querySelector('select')!;await act(async()=>{select.value="second-access";select.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(document.querySelectorAll('input[type="radio"]')[1]).toHaveProperty("checked",true);
});
it("requests and paginates feedback for only the opened paper",async()=>{
 mocks.feedback.mockImplementation(async(_project:string,_access:string,page:number)=>({items:[{id:"feedback-"+page,shareId:"share",authorName:"Mentor",body:page===1?"Newest paper comment":"Older paper comment"}],hasNext:page===1,page}));
 await render(<MentorSharedPaper projectId="project" accessId="access" resource={resource}/>);
 await act(async()=>{const element=host.querySelector('details')!;element.open=true;element.dispatchEvent(new Event('toggle'));});await flush();
 expect(mocks.feedback).toHaveBeenCalledWith("project","access",1,"share");expect(host.textContent).toContain("Newest paper comment");
 await act(async()=>button("Trang sau").click());await flush();expect(mocks.feedback).toHaveBeenCalledWith("project","access",2,"share");
 expect(host.textContent).toContain("Older paper comment");expect(host.textContent).not.toContain("Newest paper comment");
});

it("hides revoke when the current member did not share the paper",async()=>{
 mocks.workspace.mockResolvedValue({canManage:false,policies:[{...mentor,shares:[{...resource,canUnshare:false}]}]});await openSharing();
 expect(document.body.textContent).not.toContain("Ngừng chia sẻ");expect(button("Lưu thay đổi")).toBeDefined();
});

it("submits an optional note without widening the grant",async()=>{
 await openSharing();const textarea=document.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"Please assess this method");textarea.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>button("Chia sẻ").click());
 expect(mocks.sharePaper.mock.calls[0]![2]).toEqual({kind:"PAPER",resourceId:"paper",accessMode:"COMMENT",expectedVersion:2,message:"Please assess this method"});
});

it("searches via the server and displays author matches outside the currently visible title",async()=>{
 mocks.inbox.mockResolvedValue({items:[{id:"share",projectId:"project",projectTitle:"Methods project",sharedByName:"Student",accessId:"access",resource:{...resource,paper:{authors:["Nguyen"],publicationYear:2026}}}],unfilteredTotal:1,projects:[{id:"project",title:"Methods project"}],hasNext:false});
 await render(<MentorSharedResourceInbox/>);await flush();
 const input=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"Nguyen");input.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await flush();
 expect(mocks.inbox).toHaveBeenLastCalledWith(1,{q:"Nguyen"});expect(host.textContent).toContain("Research paper");
 const select=host.querySelector('select')!;
 await act(async()=>{select.value="project";select.dispatchEvent(new Event("change",{bubbles:true}));});await flush();
 expect(mocks.inbox).toHaveBeenLastCalledWith(1,{q:"Nguyen",projectId:"project"});
});

it("hides cached inbox content when access refresh fails",async()=>{
 mocks.inbox.mockResolvedValue({items:[{id:"share",projectId:"project",projectTitle:"Methods project",sharedByName:"Student",accessId:"access",category:"REFERENCE_PAPER",permissionMode:"VIEW_ONLY",resource}],unfilteredTotal:1,projects:[]});
 await render(<MentorSharedResourceInbox/>);await flush();expect(host.textContent).toContain("Research paper");
 mocks.inbox.mockRejectedValue(Error("forbidden"));await act(async()=>{await client.refetchQueries({queryKey:["mentor-access"]});});await flush();
 expect(host.textContent).not.toContain("Research paper");expect(host.textContent).toContain("Chưa thể tải danh sách tài liệu được chia sẻ.");
});

it("uses safe original source links and makes the lack of a shared PDF clear",async()=>{
 mocks.resource.mockResolvedValue({...resource,content:"Abstract",canComment:false,paper:{authors:["Author"],publicationYear:2026,doi:"10.1234/example",source:"Journal",originalUrl:"javascript:alert(1)"}});
 await render(<MentorSharedPaper projectId="project" accessId="access" resource={resource} initiallyOpen/>);await flush();
 expect(host.querySelector('a')).toBeNull();expect(host.textContent).toContain("Chưa có PDF được chia sẻ");expect(host.textContent).toContain("10.1234/example");
});

it("aggregates multi-type resources distinctly, routes manuscripts to the read-only viewer with returnTo, and disambiguates multiple review requests",async()=>{
 mocks.inbox.mockResolvedValue({
  items:[
   {
    id:"review-sub-1",
    projectId:"11111111-1111-4111-8111-111111111111",
    projectTitle:"LumiGap Core",
    sharedByName:"Nguyễn Đình Thành",
    accessId:"access-1",
    category:"MANUSCRIPT_REPORT",
    permissionMode:"REVIEW_ASSIGNED",
    documentType:"RESEARCH_PAPER",
    originalFileName:"lumigap_v2.pdf",
    latestRevisionNumber:2,
    latestRevisionId:"rev-2",
    sharedVersionCount:2,
    reviewRequests:[
     {requestId:"req-2",assignmentId:"assign-2",revisionId:"rev-2",revisionNumber:2,status:"RESUBMITTED",createdAt:"2026-11-24T10:00:00Z"},
     {requestId:"req-1",assignmentId:"assign-1",revisionId:"rev-1",revisionNumber:1,status:"COMPLETED",createdAt:"2026-11-18T10:00:00Z"},
    ],
    resource:{id:"rev-2",kind:"SUBMISSION",resourceId:"sub-1",sectionKey:"",title:"LumiGap Core Manuscript",hasPdf:true,createdAt:"2026-11-24T10:00:00Z",revokedAt:null},
   },
   {
    id:"paper-share-1",
    projectId:"11111111-1111-4111-8111-111111111111",
    projectTitle:"LumiGap Core",
    sharedByName:"Nguyễn Đình Thành",
    accessId:"access-1",
    category:"REFERENCE_PAPER",
    permissionMode:"COMMENT",
    resource:{...resource,id:"paper-share-1",title:"Cited Reference Paper",canComment:true,paper:{authors:["Smith J."],publicationYear:2025,doi:"10.1000/ref",source:"IEEE",originalUrl:null}},
   },
  ],
  total:2,
  unfilteredTotal:2,
  hasNext:false,
  projects:[{id:"11111111-1111-4111-8111-111111111111",title:"LumiGap Core"}],
  categoryCounts:{ALL:2,MANUSCRIPT_REPORT:1,REFERENCE_PAPER:1,RESEARCH_PLAN:0,RESEARCH_GAP:0},
 });
 await render(<MentorSharedResourceInbox/>);await flush();

 // Distinct type labels and permission badges without inline accordion walls
 expect(host.textContent).toContain("Bản thảo nghiên cứu");
 expect(host.textContent).toContain("mentorResources.type.PAPER");
 expect(host.textContent).toContain("Được giao phản biện");
 expect(host.textContent).toContain("Xem và góp ý");
 expect(host.querySelector("details")).toBeNull();

 // Read-only manuscript destination never points to /projects/:id?tab=submissions
 const manuscriptLink = [...host.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.textContent?.includes("LumiGap Core Manuscript"))!;
 expect(manuscriptLink.getAttribute("href")).toContain("/mentor-workspace?view=manuscript");
 expect(manuscriptLink.getAttribute("href")).toContain("requestId=req-2");
 expect(manuscriptLink.getAttribute("href")).toContain("revisionId=rev-2");
 expect(manuscriptLink.getAttribute("href")).toContain("reader=1");
 expect(manuscriptLink.getAttribute("href")).toContain("returnTo=");
 expect(manuscriptLink.getAttribute("href")).not.toContain("/projects/");

 // Category pill click triggers server category query
 const paperTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes("Bài báo tham khảo"))!;
 await act(async()=>paperTab.click());await flush();
 expect(mocks.inbox).toHaveBeenLastCalledWith(1,{q:"",category:"REFERENCE_PAPER"});

 // Sort change triggers server sort query
 const selects = host.querySelectorAll<HTMLSelectElement>("select");
 await act(async()=>{selects[1]!.value="title";selects[1]!.dispatchEvent(new Event("change",{bubbles:true}));});await flush();
 expect(mocks.inbox).toHaveBeenLastCalledWith(1,{q:"",category:"REFERENCE_PAPER",sort:"title"});

 // Multi-request disambiguation dialog lists both review requests cleanly
 const pickerBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("yêu cầu phản biện"))!;
 await act(async()=>pickerBtn.click());await flush();
 expect(document.body.textContent).toContain("Chọn yêu cầu phản biện");
 expect(document.body.textContent).toContain("v2");
 expect(document.body.textContent).toContain("v1");
});

it("opens a focused read-only reader dialog for shared reference papers and gaps",async()=>{
 mocks.inbox.mockResolvedValue({
  items:[
   {
    id:"gap-share-1",
    projectId:"11111111-1111-4111-8111-111111111111",
    projectTitle:"LumiGap Core",
    sharedByName:"Student",
    accessId:"access-1",
    category:"RESEARCH_GAP",
    permissionMode:"VIEW_ONLY",
    resource:{id:"gap-share-1",kind:"GAP",resourceId:"gap-1",sectionKey:"",title:"Unexplored Multi-Center Bias",createdAt:"2026-11-24T10:00:00Z",revokedAt:null},
   },
  ],
  total:1,
  unfilteredTotal:1,
  hasNext:false,
  projects:[{id:"11111111-1111-4111-8111-111111111111",title:"LumiGap Core"}],
  categoryCounts:{ALL:1,MANUSCRIPT_REPORT:0,REFERENCE_PAPER:0,RESEARCH_PLAN:0,RESEARCH_GAP:1},
 });
 mocks.resource.mockResolvedValue({id:"gap-share-1",kind:"GAP",resourceId:"gap-1",sectionKey:"",title:"Unexplored Multi-Center Bias",content:"Approved gap synthesis content.",createdAt:"2026-11-24T10:00:00Z",revokedAt:null,canComment:false});
 await render(<MentorSharedResourceInbox/>);await flush();
 const openGapBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === "Xem cơ hội nghiên cứu")!;
 await act(async()=>openGapBtn.click());await flush();
 expect(document.body.textContent).toContain("Approved gap synthesis content.");
 expect(document.body.textContent).toContain("Chế độ chỉ đọc");
});
