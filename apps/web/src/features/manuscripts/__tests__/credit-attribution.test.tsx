// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreditRolePicker } from "@/features/projects/components/credit-role-picker";
import { AttributionAuthorFields } from "../components/attribution-author-fields";
import { CreditStatement } from "../components/credit-statement";
import { ManuscriptAttributionDialog } from "../components/manuscript-attribution-dialog";
import { creditRoleMetadata, creditRoles } from "@trend/shared-types";
import { creditAttributionEn, creditAttributionVi } from "@/i18n/locales/credit-attribution";
import { getNotificationDestination } from "@/features/notifications/utils/notification-destination";
const mocks=vi.hoisted(()=>({changed:vi.fn(),get:vi.fn(),save:vi.fn(),decide:vi.fn(),publish:vi.fn(),statement:vi.fn()}));
vi.mock('@/i18n',()=>({useI18n:()=>({language:'vi',t:(key:string)=>creditAttributionVi[key]||key})}));
vi.mock('../manuscripts.api',()=>({manuscriptsApi:{attributionCheck:mocks.get,saveAttributionCheck:mocks.save,decideAttributionCheck:mocks.decide,publish:mocks.publish,creditStatement:mocks.statement}}));
let root:Root,host:HTMLDivElement,client:QueryClient;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.resetAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false}}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();client.clear();vi.unstubAllGlobals();});
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});}
async function render(node:ReactNode){await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>));await settle();}
async function click(text:string){const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(text));expect(button).toBeDefined();await act(async()=>button!.click());await settle();}
const authors=[{userId:'A',order:1,creditRoles:['SOFTWARE' as const],displayName:'Student A',email:'a@example.invalid',affiliation:'QA University',corresponding:true},{userId:'B',order:2,creditRoles:['DATA_CURATION' as const],displayName:'Student B'}];
const policy={name:'Venue policy',version:'1',requireAcknowledgementPermission:true};
it('shows exactly fourteen canonical roles with Vietnamese descriptions and official source links',async()=>{await render(<CreditRolePicker value={['SOFTWARE']} onChange={mocks.changed}/>);expect(document.querySelectorAll('input[type=checkbox]')).toHaveLength(14);expect(Object.keys(creditRoleMetadata)).toHaveLength(14);expect(document.body.textContent).toContain('Phát triển phần mềm');expect([...document.querySelectorAll('a')].every(a=>a.href.startsWith('https://credit.niso.org/contributor-roles/'))).toBe(true);});
it('changes only a selected role and never assigns other roles from an example',async()=>{await render(<CreditRolePicker value={['SOFTWARE']} onChange={mocks.changed}/>);const labels=[...document.querySelectorAll('label')];const label=labels.find(l=>l.textContent?.includes('Thực hiện nghiên cứu'));await act(async()=>label!.querySelector('input')!.click());expect(mocks.changed).toHaveBeenCalledWith(['SOFTWARE','INVESTIGATION']);expect(creditRoles).toContain('WRITING_REVIEW_EDITING');});
it('shows only declared roles as source links during read-only attribution review',async()=>{await render(<CreditRolePicker value={['SOFTWARE','INVESTIGATION']} disabled onChange={mocks.changed}/>);expect(document.querySelectorAll('input')).toHaveLength(0);expect(document.querySelectorAll('a')).toHaveLength(2);expect(document.body.textContent).toContain('Phát triển phần mềm');expect(document.body.textContent).not.toContain('Huy động kinh phí');expect(mocks.changed).not.toHaveBeenCalled();});
it('keeps author order explicit and moves authors without calculating from allocation',async()=>{await render(<AttributionAuthorFields authors={authors} onAuthors={mocks.changed} acknowledgements={[]} onAcknowledgements={()=>{}} policy={policy} onPolicy={()=>{}} disabled={false}/>);await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Đưa tác giả ra sau"]')!.click());expect(mocks.changed.mock.calls[0]![0].map((a:{userId:string;order:number})=>[a.userId,a.order])).toEqual([['B',1],['A',2]]);});
it('selects one corresponding author and preserves all role declarations',async()=>{await render(<AttributionAuthorFields authors={authors} onAuthors={mocks.changed} acknowledgements={[]} onAcknowledgements={()=>{}} policy={policy} onPolicy={()=>{}} disabled={false}/>);await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click());const changed=mocks.changed.mock.calls[0]![0];expect(changed.filter((a:{corresponding:boolean})=>a.corresponding).map((a:{userId:string})=>a.userId)).toEqual(['B']);expect(changed[0].creditRoles).toEqual(['SOFTWARE']);});
it('does not retrieve or expose a final statement before readiness',async()=>{await render(<CreditStatement projectId="p" manuscriptId="m" snapshotId="s" enabled={false}/>);expect(mocks.statement).not.toHaveBeenCalled();expect(document.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);});
it('generates the exact selected snapshot statement only on explicit request',async()=>{mocks.statement.mockResolvedValue({text:'Student A: Software.',latex:'\\section*{CRediT}',snapshotId:'s'});await render(<CreditStatement projectId="p" manuscriptId="m" snapshotId="s" enabled/>);expect(mocks.statement).not.toHaveBeenCalled();await click('Tạo tuyên bố');expect(mocks.statement).toHaveBeenCalledWith('p','m','s');expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Student A: Software.');});
it('has complete English and Vietnamese translations',()=>{expect(Object.keys(creditAttributionEn).sort()).toEqual(Object.keys(creditAttributionVi).sort());expect(Object.values(creditAttributionVi).every(v=>v.length>0)).toBe(true);});
it('routes authors and former contributors to the scoped review page without granting workspace membership',()=>{expect(getNotificationDestination({type:'MANUSCRIPT_ATTRIBUTION_REVIEW',targetKind:'project',targetId:'project',manuscriptId:'manuscript',manuscriptSnapshotId:'snapshot'},false)).toBe('/projects/project/manuscripts/manuscript/attribution/snapshot');});
it('retains server-authenticated identity and expected version for an attribution decision',async()=>{
  const check={checkId:'check-3',version:3,snapshotChecksum:'abc',status:'PENDING_CONFIRMATION',proposedAuthors:authors,acknowledgements:[],omittedContributors:[],detectedContributors:[],decisions:[],blockingReasons:[],readyForInternalSubmission:false,viewerCanManage:false,viewerCanDecide:true,publicationPolicy:policy};
  mocks.get.mockResolvedValue(check);mocks.decide.mockResolvedValue(check);
  await render(<ManuscriptAttributionDialog projectId="p" manuscriptId="m" snapshotId="s" snapshotLabel="Snapshot 1" sourceVersion={1} canWrite={false}/>);await click('Pre-Submission Attribution Check');await settle();await click('Confirm My Attribution');expect(mocks.decide).toHaveBeenCalledWith('p','m','check-3',{decision:'CONFIRM',note:'',expectedVersion:3,expectedDecisionId:null});
});
it('saves a linked acknowledgement without retaining author metadata from the read DTO and unlocks confirmation',async()=>{
  const check={checkId:'check-3',version:3,snapshotChecksum:'abc',status:'PENDING_CONFIRMATION',proposedAuthors:authors.map(author=>({...author,rationale:'',name:'Read-only name',confirmed:false,decision:null})),acknowledgements:[],omittedContributors:[],detectedContributors:[{userId:'B',name:'Student B',sources:[],membershipStatus:'ACTIVE',allocationPercentage:null}],decisions:[],blockingReasons:[],readyForInternalSubmission:false,viewerCanManage:true,viewerCanDecide:true,hasSucceededCompilation:false,publicationPolicy:policy};
  mocks.get.mockResolvedValue(check);mocks.save.mockImplementation(async(_project,_manuscript,_snapshot,input)=>({...check,...input,checkId:'check-4',version:4}));
  await render(<ManuscriptAttributionDialog projectId="p" manuscriptId="m" snapshotId="s" snapshotLabel="Snapshot 1" sourceVersion={1} canWrite/>);await click('Pre-Submission Attribution Check');await settle();await click('Ghi lời cảm ơn');
  const label=[...document.querySelectorAll('label')].find(element=>element.textContent?.includes('Tóm tắt đóng góp'))!;const textarea=label.querySelector('textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Prepared and documented the study dataset');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('Save Attribution Declaration');const input=mocks.save.mock.calls[0]![3];expect(input.expectedVersion).toBe(3);expect(input.acknowledgements[0].userId).toBe('B');expect(input.proposedAuthors.map((a:{userId:string})=>a.userId)).toEqual(['A']);expect(input.proposedAuthors[0]).not.toHaveProperty('confirmed');expect(input.proposedAuthors[0]).not.toHaveProperty('name');
  const confirm=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Confirm My Attribution'));expect(confirm?.disabled).toBe(false);
});
it('shows each blocking concern with its actual reason, next screen and translated evidence source',async()=>{
  mocks.get.mockResolvedValue({checkId:'check-3',version:3,snapshotChecksum:'abc',status:'DISPUTED',proposedAuthors:authors,acknowledgements:[],omittedContributors:[],detectedContributors:[{userId:'A',name:'Student A',sources:['Manuscript workspace creator'],membershipStatus:'ACTIVE',allocationPercentage:null}],decisions:[],blockingReasons:['2 unresolved contribution or attribution dispute/clarification item(s) must be resolved before submission.'],unresolvedDisputes:[{source:'WORK_CORRECTION',userId:'A',summary:'Dataset attribution is incomplete'},{source:'WORK_CORRECTION',userId:'A',summary:'Experiment evidence needs correction'}],readyForInternalSubmission:false,viewerCanManage:false,viewerCanDecide:true,publicationPolicy:policy});
  await render(<ManuscriptAttributionDialog projectId="p" manuscriptId="m" snapshotId="s" snapshotLabel="Saved version" sourceVersion={1} canWrite={false} defaultOpen/>);
  expect(document.body.textContent).toContain('Dataset attribution is incomplete');
  expect(document.body.textContent).toContain('Experiment evidence needs correction');
  expect(document.body.textContent).toContain('Mở Kết quả đóng góp');
  expect(document.body.textContent).toContain('Người tạo bản thảo');
  expect(document.body.textContent).not.toContain('Manuscript workspace creator');
});
