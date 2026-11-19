// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({blob:vi.fn()}));
vi.mock("@/features/submissions",()=>({submissionsApi:{revisionBlob:mocks.blob}}));
vi.mock("@/i18n",()=>({useI18n:()=>({t:(s:string)=>s})}));
import { AssignedRevisionReader } from "../components/assigned-revision-reader";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);mocks.blob.mockReset();URL.createObjectURL=vi.fn(()=>"blob:test");URL.revokeObjectURL=vi.fn();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("reads only the pinned PDF, offers retry on failure, and releases the object URL",async()=>{
  mocks.blob.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Blob(["PDF"]));
  await act(async()=>root.render(<AssignedRevisionReader submissionId="paper" revisionId="v1" contentType="PDF"/>));
  expect(host.textContent).toContain("Could not load the assigned PDF.");
  await act(async()=>host.querySelector("button")!.click());expect(mocks.blob).toHaveBeenLastCalledWith("paper","v1",expect.any(AbortSignal));
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("blob:test");
  await act(async()=>root.render(<AssignedRevisionReader submissionId="paper" revisionId="v2" contentType="MARKDOWN" text="Exact text"/>));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");expect(host.textContent).toBe("Exact text");
});
it("does not display a stale PDF after leaving its revision",async()=>{
  let finish!:(blob:Blob)=>void;mocks.blob.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<AssignedRevisionReader submissionId="paper" revisionId="v1" contentType="PDF"/>));
  await act(async()=>root.render(<AssignedRevisionReader submissionId="paper" revisionId="v2" contentType="MARKDOWN" text="New version"/>));
  await act(async()=>finish(new Blob(["old"])));expect(URL.createObjectURL).not.toHaveBeenCalled();expect(host.textContent).toBe("New version");
});
it("navigates real Markdown sections without changing manuscript content or offering fake annotations", async () => {
  await act(async () => root.render(<AssignedRevisionReader submissionId="study" revisionId="v1" contentType="MARKDOWN" text={"# Introduction\nOriginal text\n## Methods\nActual comparison group"} />));
  const select = host.querySelector("select")!;
  expect([...select.options].map(option => option.textContent)).toContain("Methods");
  const section = [...host.querySelectorAll("pre")].find(element => element.textContent?.startsWith("## Methods"))!;
  section.scrollIntoView = vi.fn();
  await act(async () => { select.value = "1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(section.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  expect(host.textContent).toContain("Actual comparison group"); expect(host.querySelector("textarea")).toBeNull();
});
