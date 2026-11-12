// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicantEvidence, MentorshipApplicantPool, MentorshipApplicationDialog } from "../components/mentorship-applicants";
import type { MentorProjectPreview } from "@trend/shared-types";
const api=vi.hoisted(()=>({list:vi.fn(),detail:vi.fn(),action:vi.fn(),note:vi.fn(),apply:vi.fn()}));
vi.mock('../api/mentorship-applications.api',()=>({mentorshipApplicationsApi:api}));
vi.mock('@/stores/auth-store',()=>({useAuthStore:Object.assign((select:any)=>select({user:{id:'owner'}}),{getState:()=>({user:{id:'owner'}})})}));
vi.mock('@/i18n',()=>({useI18n:()=>({t:(key:string)=>key})}));
vi.mock('../components/workspace-common',()=>({canLeaveWorkspace:async()=>true,useUnsavedWorkspace:()=>{}}));
const evidence={method:'STRUCTURED_TERMS_V1',profileVisible:true,verifiedLecturer:true,topics:[{term:'Computer vision',source:'PROFILE_DECLARATION'}],methodologies:['Survey'],mentoringNeeds:[],publications:[],identities:[],missing:['No relevant public publications are available in the local evidence.'],requestedTopics:['Computer vision'],requestedMethodologies:['Survey']};
const item=(i:number)=>({id:`a${i}`,projectId:'project',project:{title:'Research project'},lecturer:{id:`lecturer-${i}`,name:`Lecturer ${i}`,verifiedLecturer:true},mentorRole:'PRIMARY',message:'I can support your study design',areas:[],methodologies:['Survey'],capabilities:['Study design'],availability:'Feedback each week',status:'APPLIED',version:1,canManage:true,canInvite:true,canClarify:true,canWithdraw:false,notes:[],events:[],evidence});
let root:Root,host:HTMLDivElement,client:QueryClient;
const tick=async()=>act(async()=>{await new Promise(r=>setTimeout(r,25));});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.startsWith(text))!;
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);api.list.mockResolvedValue({items:[1,2,3,4].map(item),meta:{page:1,pageSize:10,total:4,totalPages:1}});api.detail.mockImplementation(async(_p,id)=>item(Number(id.slice(1))));api.note.mockResolvedValue(item(1));client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();});
async function mount(onInvite=vi.fn()){await act(async()=>root.render(<QueryClientProvider client={client}><MentorshipApplicantPool projectId="project" onInvite={onInvite}/></QueryClientProvider>));await tick();await tick();}
it('compares two or three applicants with evidence and prevents selection of a fourth',async()=>{
  await mount();const boxes=[...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  for(const checkbox of boxes.slice(0,3))await act(async()=>checkbox.click());
  expect(boxes[3]!.disabled).toBe(true);expect(button('Compare applicants').disabled).toBe(false);
  await act(async()=>button('Compare applicants').click());await tick();await tick();
  expect(api.detail).toHaveBeenCalledTimes(3);const dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelectorAll('article')).toHaveLength(3);expect(dialog.textContent).toContain('No relevant public publications');
  expect(dialog.textContent).not.toContain('%');expect(dialog.textContent).toContain('Feedback each week');
});
it('shortlists, asks a private clarification and passes the current application to the existing invitation composer',async()=>{
  const invite=vi.fn();await mount(invite);await act(async()=>button('Review applicant evidence').click());await tick();await tick();
  api.action.mockResolvedValue({...item(1),status:'SHORTLISTED',version:2});
  await act(async()=>button('Shortlist applicant').click());await tick();expect(api.action).toHaveBeenCalledWith('project',expect.objectContaining({id:'a1',version:1}),'SHORTLIST');
  const text=document.querySelector<HTMLTextAreaElement>('#application-question')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(text,'Can you review our survey every week?');text.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Send clarification').click());await tick();expect(api.note).toHaveBeenCalledWith('project','a1','Can you review our survey every week?',expect.any(String));
  await act(async()=>button('Prepare official invitation').click());expect(invite).toHaveBeenCalledWith(expect.objectContaining({id:'a1'}));
});
it('keeps typed clarification on failure and offers recovery for failed evidence loading',async()=>{
  await mount();api.detail.mockRejectedValue(new Error('Offline'));await act(async()=>button('Review applicant evidence').click());await tick();await tick();expect(document.querySelector('[role="alert"]')).not.toBeNull();expect(button('Try again')).toBeDefined();
  api.detail.mockResolvedValue(item(1));await act(async()=>button('Try again').click());await tick();await tick();
  const text=document.querySelector<HTMLTextAreaElement>('#application-question')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(text,'Question retained on error');text.dispatchEvent(new Event('input',{bubbles:true}));});api.note.mockRejectedValue(new Error('Offline'));await act(async()=>button('Send clarification').click());await tick();expect(text.value).toBe('Question retained on error');expect(document.querySelector('[role="alert"]')).not.toBeNull();
});
it('renders external academic metadata as text, with no academic quality percentage',async()=>{
  await act(async()=>root.render(<ApplicantEvidence evidence={{...evidence,publications:[{title:'<img src=x onerror=alert(1)>',source:'MANUAL',matchedTerms:['Computer vision'],attribution:'SELF_DECLARED'}]} as any}/>));
  expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain('<img src=x');expect(host.textContent).toContain('Authorship self-declared');expect(host.textContent).not.toContain('%');
});
it('submits the available secondary role when the primary role is no longer recruiting',async()=>{
  const project:MentorProjectPreview={id:'project',title:'Research project',summary:'Approved research preview',stage:'PLANNING',discovery:'SEEKING_MENTOR',expertise:[],researchAreas:[],mentoringNeeds:'Weekly feedback',availableRoles:['SECONDARY']};
  api.apply.mockResolvedValue({id:'new-application'});
  await act(async()=>root.render(<QueryClientProvider client={client}><MentorshipApplicationDialog project={project} onClose={vi.fn()}/></QueryClientProvider>));
  const role=document.querySelector<HTMLSelectElement>('#application-role')!;
  expect(role.value).toBe('SECONDARY');
  expect([...role.options].filter(option=>!option.disabled).map(option=>option.value)).toEqual(['SECONDARY']);
  for(const [id,value] of [['application-message','I can guide your research methodology and analysis'],['application-availability','Feedback once every week']]){
    const text=document.getElementById(id!) as HTMLTextAreaElement;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(text,value);text.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  await act(async()=>button('Submit application').click());await tick();
  expect(api.apply).toHaveBeenCalledWith('project',expect.objectContaining({mentorRole:'SECONDARY'}));
});
