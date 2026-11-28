// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResearchContributionResult } from "@trend/shared-types";
import { ResearchContributionsPanel } from "../components/research-contributions-panel";
import { ProjectContributionsWorkspace } from "../components/project-contributions-workspace";
import { researchContributionEn, researchContributionVi } from "@/i18n/locales/research-contribution";

const mocks=vi.hoisted(()=>({research:vi.fn(),statement:vi.fn(),artifact:vi.fn(),activity:vi.fn()}));
vi.mock("../api/contributions.api",()=>({contributionsApi:mocks}));
vi.mock("@/stores/auth-store",()=>({useAuthStore:(select:(state:unknown)=>unknown)=>select({user:{id:"me"}})}));
vi.mock("@/i18n",()=>({useI18n:()=>({language:"en",t:(key:string,params:Record<string,string|number>={})=>{
  let text=researchContributionEn[key as keyof typeof researchContributionEn]??key;for(const[k,v]of Object.entries(params))text=text.replaceAll(`{{${k}}}`,String(v));return text;
}})}));
let root:Root,host:HTMLDivElement,client:QueryClient,data:ResearchContributionResult;
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  data={items:[{id:"REVIEW:r1",projectId:"p",actor:{id:"mentor",name:"Actual mentor"},participantKind:"MENTOR",type:"MENTOR_REVIEW_SUBMITTED",category:"MANUSCRIPT",description:"Explain your methodology with a comparison group.",createdAt:"2026-11-17T09:00:00Z",provenance:"SYSTEM_RECORDED",sourceType:"HUMAN_REVIEW",sourceId:"r1",manuscriptKeys:["SUBMISSION:s1"],manuscriptVersionId:"v1",artifactVersion:1,link:null,suggestedRoles:["WRITING_REVIEW_EDITING"],declaredRoles:[],status:"RECORDED",evidence:""}],
    profiles:[{id:"mentor",name:"Actual mentor",participantKind:"MENTOR",recordCount:1,suggestedRoles:["WRITING_REVIEW_EDITING"]},{id:"me",name:"Actual student",participantKind:"MEMBER",recordCount:0,suggestedRoles:[]}],manuscripts:[{key:"SUBMISSION:s1",title:"Actual manuscript",kind:"SUBMISSION"}],currentActorId:"me",mentorScoped:false,total:1,page:1,pageSize:20,hasNext:false};
  mocks.research.mockImplementation(async()=>structuredClone(data));mocks.statement.mockResolvedValue({ready:false,statement:null,pendingCount:1,contributors:[],determinesAuthorship:false,scopeKey:"SUBMISSION:s1"});mocks.activity.mockResolvedValue({items:[],total:0,hasNext:false,days:[],members:[],timeZone:"UTC"});
  host=document.createElement("div");document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();});
async function mount(element:React.ReactNode,url="/projects/p"){await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}>{element}</MemoryRouter></QueryClientProvider>));await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});}
async function settle(){for(let i=0;i<3;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});}
it("uses three evidence-based sections with no percentage allocation as the default",async()=>{
  await mount(<ProjectContributionsWorkspace projectId="p" currentUserId="me" isOwner readOnly={false}/>);
  const tabs=host.querySelector(".contribution-tabs")!;expect(tabs.querySelectorAll("button")).toHaveLength(3);expect(tabs.querySelector('[aria-current="page"]')?.textContent).toBe("Contributions");expect(tabs.textContent).not.toContain("allocation");
  expect(tabs.textContent).toContain("Research integrity");expect(tabs.textContent).toContain("Contribution recognition");expect(host.textContent).not.toContain("100%");
});
it("separates mentors and members, identifies source provenance, and labels suggestions as unconfirmed",async()=>{
  await mount(<ResearchContributionsPanel projectId="p"/>);
  expect(host.querySelector(".research-contribution-profiles")?.textContent).toContain("Mentors / Supervisors");expect(host.querySelector(".research-contribution-profiles")?.textContent).toContain("Research members");expect(host.textContent).toContain("System recorded");expect(host.textContent).toContain("Suggested CRediT roles, not confirmed");expect(host.textContent).not.toContain("%");expect(host.textContent).not.toContain("First author");
});
it("filters by the real contributor rather than assignee and resets pagination",async()=>{
  await mount(<ResearchContributionsPanel projectId="p"/>);
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>(".research-contribution-profiles button")].find(b=>b.textContent?.includes("Actual mentor"))!.click());await settle();expect(mocks.research).toHaveBeenLastCalledWith("p",expect.objectContaining({memberId:"mentor",page:1}));
});
it("requires a manuscript selection and sends the selected scope to the backend",async()=>{
  await mount(<ResearchContributionsPanel projectId="p" manuscript/>);
  expect(host.textContent).not.toContain("Explain your methodology");expect(mocks.statement).not.toHaveBeenCalled();
  const select=host.querySelector<HTMLSelectElement>("select")!;await act(async()=>{select.value="SUBMISSION:s1";select.dispatchEvent(new Event("change",{bubbles:true}));});await settle();
  expect(mocks.research).toHaveBeenLastCalledWith("p",expect.objectContaining({scopeKey:"SUBMISSION:s1",page:1}));expect(host.textContent).toContain("Actual mentor");expect(host.textContent).toContain("A statement is available once");expect(host.textContent).not.toContain("Download contribution statement");
});
it("offers a statement only after backend-confirmed agreement without declaring authorship",async()=>{
  mocks.statement.mockResolvedValue({ready:true,statement:"Actual student: Methodology.",pendingCount:0,contributors:[],determinesAuthorship:false,scopeKey:"SUBMISSION:s1"});
  await mount(<ResearchContributionsPanel projectId="p" manuscript/>);
  const select=host.querySelector<HTMLSelectElement>("select")!;await act(async()=>{select.value="SUBMISSION:s1";select.dispatchEvent(new Event("change",{bubbles:true}));});await settle();
  expect(host.querySelector("pre")?.textContent).toBe("Actual student: Methodology.");expect(host.textContent).toContain("It does not determine author eligibility");
});
it("does not fetch a shared team statement for a mentor",async()=>{
  data.mentorScoped=true;await mount(<ResearchContributionsPanel projectId="p" manuscript/>);
  const select=host.querySelector<HTMLSelectElement>("select")!;await act(async()=>{select.value="SUBMISSION:s1";select.dispatchEvent(new Event("change",{bubbles:true}));});await settle();expect(mocks.statement).not.toHaveBeenCalled();
});
it("renders escaped evidence text and an honest empty state",async()=>{
  data.items[0]!.description='<script>alert("private")</script>';await mount(<ResearchContributionsPanel projectId="p"/>);expect(host.querySelector("script")).toBeNull();expect(host.textContent).toContain('<script>alert("private")</script>');
  data.items=[];data.total=0;client.clear();await mount(<ResearchContributionsPanel projectId="other"/>);expect(host.textContent).toContain("No research contributions match this scope");
});
it("hides records after an access error and allows retry",async()=>{
  mocks.research.mockRejectedValue(new Error("Access ended"));await mount(<ResearchContributionsPanel projectId="p"/>);expect(host.textContent).not.toContain("Actual mentor");expect(host.querySelector("button")).not.toBeNull();
});
it("removes cached private manuscript choices when a later refresh loses access",async()=>{
  await mount(<ResearchContributionsPanel projectId="p" manuscript/>);
  expect(host.textContent).toContain("Actual manuscript");
  mocks.research.mockRejectedValue(new Error("Access ended"));
  await act(async()=>{await client.invalidateQueries({queryKey:["project-workspace","me","p","research-contributions"]});});await settle();
  expect(host.textContent).not.toContain("Actual manuscript");expect(host.textContent).not.toContain("Actual mentor");
});
it("keeps source reviews and external declarations inside the mentor sidebar",async()=>{
  data.mentorScoped=true;data.items[0]!.link={kind:"HUMAN_REVIEW",id:"r1"};mocks.artifact.mockResolvedValue({href:"/reviews/assignment"});
  await mount(<ResearchContributionsPanel projectId="p"/>,"/mentor-workspace?view=project&projectId=p&tab=contributions");await settle();
  expect(host.querySelector('a[href="/mentor-workspace?view=review&assignmentId=assignment"]')).not.toBeNull();
  expect(host.querySelector('a[href*="contributionTab=declarations"][href*="view=project"]')).not.toBeNull();
});
it("has complete Vietnamese translations with the same interpolation keys",()=>{
  for(const key of Object.keys(researchContributionEn) as (keyof typeof researchContributionEn)[]){expect(researchContributionVi[key]).toBeTruthy();expect([...researchContributionVi[key].matchAll(/{{([^}]+)}}/g)].map(x=>x[1])).toEqual([...researchContributionEn[key].matchAll(/{{([^}]+)}}/g)].map(x=>x[1]));}
});
