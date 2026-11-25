// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({detail:undefined as any,save:vi.fn(),resubmit:vi.fn(),accept:vi.fn(),decline:vi.fn(),userId:"student"}));
vi.mock("@/features/reviews",()=>({useReviewRequest:()=>({data:mocks.detail,refetch:vi.fn()}),useReviewRequestAction:()=>({cancel:{},resubmit:{isPending:false,mutateAsync:mocks.resubmit},accept:{isPending:false,mutateAsync:mocks.accept},decline:{isPending:false,mutateAsync:mocks.decline}})}));
vi.mock("@/features/submissions",()=>({useSubmissionRevisions:()=>({data:[{_id:"v2",revisionNumber:2,createdAt:"2026-11-13T00:00:00Z"}]})}));
vi.mock("@/features/reviews/api/reviews.api",()=>({reviewsApi:{saveResponseDrafts:mocks.save}}));
vi.mock("@/stores/auth-store",()=>({useAuthStore:()=>({id:mocks.userId})}));
vi.mock("@/i18n",()=>({useI18n:()=>({t:(s:string)=>s})}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { ReviewRequestDetailPage } from "@/pages/reviews/review-request-detail";
let host:HTMLDivElement,root:Root;
function Location() { return <output>{useLocation().pathname}</output>; }
const render=async()=>act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><ReviewRequestDetailPage/><Location/></MemoryRouter>));
beforeEach(()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);mocks.userId="student";mocks.save.mockReset().mockResolvedValue(undefined);mocks.accept.mockReset().mockResolvedValue(undefined);mocks.decline.mockReset().mockResolvedValue(undefined);
  mocks.detail={id:"request",canRespond:true,status:"REVISION_REQUESTED",requester:{id:"student",fullName:"Student"},reviewer:{id:"mentor",fullName:"Mentor"},artifact:{submissionId:"submission",projectId:"project",title:"Study",revisionNumber:1},createdAt:"2026-11-01T00:00:00Z",templateVersion:{versionNumber:1,reviewMode:"GUIDED_FEEDBACK",criteria:[]},reviews:[{id:"review",roundNumber:1,requiredRevisions:[{id:"item",priority:"MAJOR",description:"Explain the sampling method",status:"OPEN",responses:[]}]}]};
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("preserves an unsaved response when server review data refreshes",async()=>{
  await render();const select=host.querySelector("select")!;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")!.set!.call(select,"v2");await act(async()=>select.dispatchEvent(new Event("change",{bubbles:true})));
  const textarea=host.querySelector("textarea")!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"We clarified section 2.");await act(async()=>textarea.dispatchEvent(new Event("input",{bubbles:true})));
  mocks.detail=JSON.parse(JSON.stringify(mocks.detail));await render();expect(host.querySelector("textarea")!.value).toBe("We clarified section 2.");expect(mocks.resubmit).not.toHaveBeenCalled();
});
it("restores server drafts with their exact manuscript revision and saves them without resolving the mentor item",async()=>{
  mocks.detail.reviews[0].requiredRevisions[0].responses=[{submissionRevisionId:"v2",responseText:"Sampling updated in section 2.",status:"DRAFT"}];await render();
  expect(host.querySelector("select")!.value).toBe("v2");expect(host.querySelector("textarea")!.value).toBe("Sampling updated in section 2.");
  const save=[...host.querySelectorAll("button")].find(b=>b.textContent==="Save response drafts")!;await act(async()=>save.click());
  expect(mocks.save).toHaveBeenCalledWith("request",{revisionId:"v2",responses:[{revisionItemId:"item",responseText:"Sampling updated in section 2."}]});expect(mocks.detail.reviews[0].requiredRevisions[0].status).toBe("OPEN");
});

it("opens the assigned review workspace directly from the mentor notification destination",async()=>{
  mocks.userId="mentor";mocks.detail.status="RESUBMITTED";mocks.detail.canRespond=false;mocks.detail.assignment={id:"assignment"};await render();
  expect(host.querySelector('a[href="/reviews/assignment"]')?.textContent).toBe("Open review workspace");expect(host.textContent).not.toContain("Respond and Submit Revision");
});
it("lets the invited mentor accept a requested manuscript directly from its queue destination", async () => {
  mocks.userId="mentor";mocks.detail.status="REQUESTED";mocks.detail.origin="MENTOR_GUIDANCE";mocks.detail.assignment={id:"assignment",status:"assigned"};await render();
  const accept=[...host.querySelectorAll("button")].find(button=>button.textContent==="mentorWorkspace.acceptReview");
  expect(accept).toBeDefined(); await act(async()=>accept!.click());
  expect(mocks.accept).toHaveBeenCalledWith("request");expect(host.querySelector("output")?.textContent).toBe("/reviews/assignment");
});
it("keeps the invitation retryable when accepting fails", async () => {
  mocks.userId="mentor";mocks.detail.status="REQUESTED";mocks.detail.assignment={id:"assignment",status:"assigned"};mocks.accept.mockRejectedValueOnce(new Error("Unavailable"));await render();
  const accept=[...host.querySelectorAll("button")].find(button=>button.textContent==="mentorWorkspace.acceptReview")!;
  expect(accept).toBeDefined();await act(async()=>accept.click());expect(host.querySelector("output")?.textContent).toBe("/");expect(host.textContent).toContain("mentorWorkspace.acceptReview");
});
it("does not offer the sender a reviewer acceptance action", async () => {
  mocks.detail.status="REQUESTED";mocks.detail.assignment={id:"assignment",status:"assigned"};await render();
  expect(host.textContent).not.toContain("mentorWorkspace.acceptReview");
});
