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
const resource={id:"share",kind:"PAPER" as const,resourceId:"paper",sectionKey:"",title:"Research paper",createdAt:"2026-11-20T00:00:00Z",revokedAt:null,accessMode:"VIEW" as const};
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
it("shows an empty global resource inbox without duplicating review requests",async()=>{await render(<MentorSharedResourceInbox/>);await flush();expect(host.textContent).toContain("Chưa có tài liệu nào được chia sẻ với bạn");expect(host.textContent).toContain("Việc cần xử lý");});

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
