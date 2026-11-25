// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({save:vi.fn(),submit:vi.fn(),workspace:{data:{assignment:{submissionId:{id:"submission",title:"Pinned study",currentRevisionNumber:1}},artifactRevision:{id:"v1",revisionNumber:1,contentType:"MARKDOWN"},artifactContent:"Immutable methods",roundNumber:1,review:{status:"DRAFT",overallAssessment:null},responses:[{criterionKey:"method",comment:"",evidence:null,assessment:null,performanceLevelId:null,notApplicable:false}],requiredRevisions:[] as Array<{priority:"MINOR";description:string;locator:null;criterionKey:null;quotation:null}>,previousRevisionItems:[],criteria:[{id:"c",key:"method",title:"Methods",required:true,allowNotApplicable:false,weight:1,levels:[{id:"good",label:"Good",score:4}]}],templateVersion:{reviewMode:"RUBRIC_ASSESSMENT",guidelines:[]}}}}));
vi.mock("@/features/reviews",()=>({useReviewWorkspace:()=>mocks.workspace,useSaveReview:()=>({mutateAsync:mocks.save,isPending:false}),useSubmitReview:()=>({mutateAsync:mocks.submit,isPending:false})}));
vi.mock("@/i18n",()=>({useI18n:()=>({t:(s:string)=>s})}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock("@/features/submissions",()=>({submissionsApi:{}}));
vi.mock("@/features/submissions/components/content-comparison",()=>({ContentComparison:()=>null}));
import { ReviewWorkspacePage } from "@/pages/reviews/review-workspace";
let root:Root,host:HTMLDivElement;
beforeEach(async()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.useFakeTimers();mocks.save.mockReset().mockResolvedValue({});
  mocks.workspace.data.requiredRevisions = [];
  mocks.workspace.data.artifactRevision.id = "v1";
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<QueryClientProvider client={new QueryClient()}><MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><ReviewWorkspacePage/></MemoryRouter></QueryClientProvider>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function write(value:string){const field=host.querySelectorAll("textarea")[4]!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,value);await act(async()=>field.dispatchEvent(new Event("input",{bubbles:true})));}
it("does not preselect scores or create mentor approval when the workspace opens",()=>{
  expect(host.textContent).toContain("Not assessed");expect(host.querySelector('[aria-pressed="true"]')).toBeNull();expect(mocks.save).not.toHaveBeenCalled();expect(mocks.submit).not.toHaveBeenCalled();
});
it("does not mark newer edits as saved when an older autosave finishes",async()=>{
  let finish!:(v:object)=>void;mocks.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await write("First draft comment");await act(async()=>{vi.advanceTimersByTime(1200);});expect(mocks.save).toHaveBeenCalledTimes(1);
  await write("Newer comment while save is in flight");await act(async()=>finish({}));
  const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
  await act(async()=>{vi.advanceTimersByTime(1200);});expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({overallComment:"Newer comment while save is in flight"}));
});

it.each(["manual", "automatic"])("saves a reopened draft with null database fields through %s saving", async mode => {
  if (mode === "automatic") {
    await write("Keep this real draft comment");
    await act(async () => { vi.advanceTimersByTime(1200); });
  } else {
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("reviewWorkspace.saveDraft"))!.click());
  }
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const wire = JSON.parse(JSON.stringify(mocks.save.mock.calls[0]![0]));
  expect(wire).not.toHaveProperty("overallAssessment");
  expect(wire.responses[0]).not.toHaveProperty("assessment");
  expect(wire.responses[0]).not.toHaveProperty("performanceLevelId");
  expect(wire.expectedRevisionId).toBe("v1");
  expect(wire.expectedRoundNumber).toBe(1);
  expect(host.textContent).toContain("reviewWorkspace.draftSaved");
});

it("omits null optional revision-item fields without dropping the requested change", async () => {
  // Reinitialize from the next assigned revision, as when reopening saved feedback.
  mocks.workspace.data = {...mocks.workspace.data, requiredRevisions: [{ priority: "MINOR", description: "Clarify the dataset split", locator: null, criterionKey: null, quotation: null }], artifactRevision: {...mocks.workspace.data.artifactRevision, id: "v2"}};
  await act(async () => root.render(<QueryClientProvider client={new QueryClient()}><MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><ReviewWorkspacePage/></MemoryRouter></QueryClientProvider>));
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("reviewWorkspace.saveDraft"))!.click());
  const wire = JSON.parse(JSON.stringify(mocks.save.mock.calls[0]![0]));
  expect(wire.requiredRevisions).toEqual([{priority: "MINOR", description: "Clarify the dataset split"}]);
  mocks.workspace.data.artifactRevision.id = "v1";
});

it("preserves edits after an autosave failure and waits for an explicit retry or new edit", async () => {
  mocks.save.mockRejectedValueOnce(new Error("Offline"));
  await write("Keep my feedback after an error");
  await act(async () => { vi.advanceTimersByTime(1200); });
  expect(host.textContent).toContain("reviewWorkspace.autosaveFailed");
  await act(async () => { vi.advanceTimersByTime(12000); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll("textarea")[4]!.value).toBe("Keep my feedback after an error");
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("reviewWorkspace.saveDraft"))!.click());
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("reviewWorkspace.draftSaved");
});

it("does not block newer edits when an earlier autosave fails", async () => {
  let fail!: (reason: Error) => void;
  mocks.save.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await write("Earlier feedback");
  await act(async () => { vi.advanceTimersByTime(1200); });
  await write("New feedback typed while the earlier request was pending");
  await act(async () => fail(new Error("Older request failed")));
  await act(async () => { vi.advanceTimersByTime(1200); });
  expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({overallComment: "New feedback typed while the earlier request was pending"}));
  expect(host.textContent).toContain("reviewWorkspace.draftSaved");
});
