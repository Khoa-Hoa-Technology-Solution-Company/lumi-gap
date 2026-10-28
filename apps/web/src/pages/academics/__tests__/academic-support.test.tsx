// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcademicSupportPage, MentorProjectPanel } from '../academic-support';
const mocks=vi.hoisted(()=>({mine:vi.fn(),preferences:vi.fn(),savePreferences:vi.fn(),opportunities:vi.fn(),respond:vi.fn(),offer:vi.fn(),draft:vi.fn(),saveDraft:vi.fn(),projects:vi.fn(),workspace:vi.fn(),list:vi.fn(),mentors:vi.fn(),guidance:vi.fn()}));
const state=vi.hoisted(()=>({role:'LECTURER'}));
vi.mock('@/features/projects/api/academic-support.api',()=>({academicSupportApi:mocks}));
vi.mock('@/features/projects/api/projects.api',()=>({projectsApi:{list:mocks.projects}}));
vi.mock('@/features/auth/api/auth.api',()=>({authApi:{academicOnboardingOptions:async()=>({researchAreas:[]})}}));
vi.mock('@/features/academic-profile/hooks/use-academic-profile',()=>({useAcademicProfile:()=>({data:{academicRole:state.role},isLoading:false,isError:false})}));
vi.mock('@/features/academic-profile/components/position-verification-panel',()=>({PositionVerificationPanel:()=> <p>Verify position</p>}));
vi.mock('@/features/projects/components/mentor-discovery-settings',()=>({MentorDiscoverySettings:()=>null}));
vi.mock('@/features/projects/components/mentor-preview',()=>({MentorPreviewContent:({preview}:any)=><p>{preview.summary}</p>,MentorInvitationSender:({sender}:any)=><p>{sender.fullName}</p>}));
vi.mock('@/stores/auth-store',()=>({useAuthStore:Object.assign((select:any)=>select({user:{id:'mentor'}}),{getState:()=>({user:{id:'mentor'}})})}));
vi.mock('@/i18n',()=>({useI18n:()=>({language:'en',t:(key:string)=>key})}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
const meta={page:1,pageSize:10,total:1,totalPages:1};
const project={id:'project',title:'Student research team',summary:'Shared project introduction',researchAreas:['Security'],expertise:[],stage:'PLANNING',mentoringNeeds:'Help with experiments',availableRoles:['PRIMARY']};
const invitation={kind:'REQUEST',id:'request',projectId:'project',project,mentorUser:{_id:'mentor',fullName:'Demo mentor'},requestedBy:{_id:'leader',fullName:'Student leader'},mentorRole:'PRIMARY',direction:'PROJECT_TO_LECTURER',status:'PENDING',message:'Please guide our research',attachments:[],actions:{accept:true,decline:true,cancel:false,end:false,openProject:false}};
let host:HTMLDivElement,root:Root,client:QueryClient;
async function tick(){await act(async()=>{await new Promise(r=>setTimeout(r,30));});}
function LocationProbe(){return <output data-testid="current-location">{useLocation().pathname}</output>;}
async function mount(url='/academic-support?view=incoming'){await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><AcademicSupportPage/><LocationProbe/></MemoryRouter></QueryClientProvider>));await tick();await tick();}
function button(label:string){return [...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.startsWith(label))!;}
async function click(label:string){await act(async()=>button(label).click());await tick();}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.role='LECTURER';
mocks.preferences.mockResolvedValue({canEnable:true,acceptingMentorships:true,emailEnabled:false,locale:'en'});
mocks.mine.mockImplementation(async({view}:any)=>({requests:view==='incoming'?[invitation]:[],relationships:[],counts:{incoming:1,active:0,pending:1},requestMeta:meta,relationshipMeta:meta}));
mocks.opportunities.mockResolvedValue({items:[project],meta});mocks.respond.mockResolvedValue({});mocks.offer.mockResolvedValue({});mocks.projects.mockResolvedValue([]);
mocks.draft.mockResolvedValue({message:'I can help with experiments',mentorRole:'PRIMARY',attachments:[],version:1});mocks.saveDraft.mockImplementation(async(_p:any,_d:any,input:any)=>({...input,attachments:[],version:2}));
client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();});
async function mountMentorFinder(total = 13) {
  mocks.workspace.mockResolvedValue({project:{...project,discovery:'CLOSED'},accessRole:'TEAM',canManage:false,canProvideFeedback:true,guidance:[]});
  mocks.list.mockResolvedValue({relationships:[],requests:[],counts:{active:0,pending:0},policy:{maxActiveMentors:2,maxPendingRequests:3},requestMeta:meta,relationshipMeta:meta});
  mocks.mentors.mockImplementation(async (_id, input) => ({ items: Array.from({length: Math.max(0, Math.min(input.pageSize, total - (input.page - 1) * input.pageSize))}, (_, index) => ({ _id:`mentor-${(input.page - 1) * input.pageSize + index}`,fullName:`Lecturer ${(input.page - 1) * input.pageSize + index + 1}`,matchedTerms:[],expertiseAreas:[],researchInterests:[] })), meta:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize)} }));
  await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter><MentorProjectPanel projectId="project"/></MemoryRouter></QueryClientProvider>));await tick();await tick();
}
it('paginates mentor results on the server and keeps search filters across pages',async()=>{
  await mountMentorFinder();
  expect(host.querySelectorAll('.mentor-result')).toHaveLength(6);
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{page:1,pageSize:6});
  const pager=()=>host.querySelector<HTMLElement>('[aria-label="Mentor pagination"]')!;
  const next=()=>[...pager().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Next')!;
  await act(async()=>next().click());await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{page:2,pageSize:6});
  expect(host.querySelector('.mentor-result')?.textContent).toContain('Lecturer 7');
  const input=host.querySelector<HTMLInputElement>('[aria-label="Search available mentors"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'learning');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{await new Promise(r=>setTimeout(r,340));});await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{q:'learning',page:1,pageSize:6});
  await act(async()=>next().click());await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{q:'learning',page:2,pageSize:6});
  const size=pager().querySelector('select')!;
  await act(async()=>{size.value='12';size.dispatchEvent(new Event('change',{bubbles:true}));});await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{q:'learning',page:1,pageSize:12});
  expect(host.querySelectorAll('.mentor-result')).toHaveLength(12);
});
it('shows a disabled single-page pager rather than hiding pagination for short mentor lists',async()=>{
  await mountMentorFinder(2);
  const pager=host.querySelector('[aria-label="Mentor pagination"]')!;
  expect(pager).not.toBeNull();
  const buttons=[...pager.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons.find(b=>b.textContent==='Previous')!.disabled).toBe(true);
  expect(buttons.find(b=>b.textContent==='Next')!.disabled).toBe(true);
  expect(pager.querySelector('[aria-current="page"]')?.textContent).toBe('1');
});
it('returns to the last available mentor page when the directory shrinks after refetch',async()=>{
  await mountMentorFinder();
  await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('[aria-label="Mentor pagination"] button')].find(b=>b.textContent==='3')!.click();});await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{page:3,pageSize:6});
  mocks.mentors.mockImplementation(async(_id,input)=>({items:[],meta:{page:input.page,pageSize:input.pageSize,total:0,totalPages:0}}));
  await act(async()=>{await client.invalidateQueries({queryKey:['academic-support','mentor','mentor-search']});});await tick();await tick();
  expect(mocks.mentors).toHaveBeenLastCalledWith('project',{page:1,pageSize:6});
  expect(host.querySelector('[aria-label="Mentor pagination"]')).toBeNull();
});
it('shows both lecturer flows prominently and hides the student mentor finder',async()=>{await mount();expect(button('Find teams to mentor')).toBeDefined();expect(button('Incoming Requests').textContent).toContain('1');expect(host.querySelector('#mentorship-project')).toBeNull();expect(host.querySelector('h3')?.textContent).toBe(project.title);expect(mocks.projects).not.toHaveBeenCalled();});
it('loads discover deep links with team needs and an offer action',async()=>{await mount('/academic-support?view=discover');expect(host.textContent).toContain(project.mentoringNeeds);expect(button('Offer Mentorship')).toBeDefined();expect(mocks.opportunities).toHaveBeenCalledWith({q:'',area:undefined,page:1});expect(button('Find teams to mentor').getAttribute('aria-current')).toBe('page');});
it('requires explicit confirmation before accepting an invitation',async()=>{await mount();await click('Accept');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Accept mentorship');expect(mocks.respond).not.toHaveBeenCalled();await click('Confirm');expect(mocks.respond).toHaveBeenCalledWith(expect.objectContaining({id:'request'}),'accept','');});
it('preserves the confirmation and note if accepting fails',async()=>{mocks.respond.mockRejectedValue({response:{data:{error:{message:'Position filled'}}}});await mount();await click('Accept');const note=document.querySelector<HTMLTextAreaElement>('[aria-label="Note"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Meet weekly');note.dispatchEvent(new Event('input',{bubbles:true}));});await click('Confirm');expect(document.querySelector('[role="alert"]')?.textContent).toContain('Position filled');expect(note.value).toBe('Meet weekly');expect(document.querySelector('[role="dialog"]')).not.toBeNull();});
it('opens an offer draft without sending it until confirmed',async()=>{await mount('/academic-support?view=discover');await click('Offer Mentorship');expect(mocks.offer).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Offer Mentorship');await click('Send offer');expect(mocks.offer).toHaveBeenCalledWith('project','I can help with experiments',expect.any(String),{mentorRole:'PRIMARY',attachmentIds:[]});});
it('explains disabled discovery and exposes availability settings',async()=>{mocks.preferences.mockResolvedValue({canEnable:true,acceptingMentorships:false,emailEnabled:false});await mount('/academic-support?view=discover');expect(host.textContent).toContain('Enable mentoring availability');expect(host.querySelector<HTMLDetailsElement>('#mentoring-settings')?.open).toBe(true);expect(mocks.opportunities).not.toHaveBeenCalled();});
it('shows a retriable discovery error without falsely showing an empty state',async()=>{mocks.opportunities.mockRejectedValue(new Error('Offline'));await mount('/academic-support?view=discover');expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.textContent).not.toContain('No projects are seeking mentors right now.');expect(button('Try again')).toBeDefined();});
it('loads active and sent views through the existing API',async()=>{await mount();await click('Teams you mentor');expect(mocks.mine).toHaveBeenLastCalledWith({page:1,view:'active'});await click('Sent mentorship offers');expect(mocks.mine).toHaveBeenLastCalledWith({page:1,view:'outgoing'});});
it('does not expose lecturer discovery or load opportunities for students',async()=>{state.role='STUDENT';await mount('/academic-support?view=discover');expect(button('Find teams to mentor')).toBeUndefined();expect(mocks.opportunities).not.toHaveBeenCalled();expect(host.querySelector('#mentorship-project')).not.toBeNull();});
it('expands shared team details without fetching private project data or sending an offer',async()=>{mocks.opportunities.mockResolvedValue({items:[{...project,expertise:['Experimental design']}],meta});await mount('/academic-support?view=discover');const details=host.querySelector<HTMLElement>('#team-detail-project')!;expect(details.hidden).toBe(true);await click('View team details');expect(details.hidden).toBe(false);expect(details.textContent).toContain('Experimental design');expect(details.textContent).toContain('Primary mentor');expect(host.querySelectorAll('.team-opportunity-summary')).toHaveLength(1);expect(mocks.offer).not.toHaveBeenCalled();expect(mocks.projects).not.toHaveBeenCalled();await click('Show less');expect(details.hidden).toBe(true);});
it('filters discovery on the server and clears both fields together',async()=>{await mount('/academic-support?view=discover');await click('Research Area');expect(host.querySelector<HTMLElement>('#team-area-filter')!.hidden).toBe(false);const search=host.querySelector<HTMLInputElement>('[aria-label="Search mentor opportunities"]')!,area=host.querySelector<HTMLInputElement>('#team-area-input')!;await act(async()=>{for(const [field,value] of [[search,'learning'],[area,'Education']] as const){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));}});await act(async()=>{await new Promise(r=>setTimeout(r,360));});await tick();expect(mocks.opportunities).toHaveBeenLastCalledWith({q:'learning',area:'Education',page:1});await click('Clear filters');await act(async()=>{await new Promise(r=>setTimeout(r,360));});await tick();expect(search.value).toBe('');expect(area.value).toBe('');expect(mocks.opportunities).toHaveBeenLastCalledWith({q:'',area:undefined,page:1});});
it('opens availability settings from the header without changing preferences',async()=>{await mount('/academic-support?view=discover');expect(host.querySelector<HTMLDetailsElement>('#mentoring-settings')!.open).toBe(false);await act(async()=>host.querySelector<HTMLAnchorElement>('.lecturer-availability')!.click());expect(host.querySelector<HTMLDetailsElement>('#mentoring-settings')!.open).toBe(true);expect(mocks.savePreferences).not.toHaveBeenCalled();});
it('opens an active project on its dedicated guidance page',async()=>{mocks.mine.mockResolvedValue({requests:[],relationships:[{...invitation,kind:'RELATIONSHIP',status:'ACTIVE',startedAt:'2026-10-21T08:00:00Z',actions:{openProject:true,end:true}}],counts:{incoming:0,active:1},requestMeta:meta,relationshipMeta:meta});await mount('/academic-support?view=active');await click('Open project');expect(host.querySelector('[data-testid="current-location"]')?.textContent).toBe('/academic-support/projects/project');expect(host.querySelector('.mentor-workspace')).toBeNull();});
it('redirects old lecturer project links to the dedicated guidance page',async()=>{await mount('/academic-support?projectId=project');expect(host.querySelector('[data-testid="current-location"]')?.textContent).toBe('/academic-support/projects/project');});
it('keeps an unsent team update mounted when the mentor workspace background request fails',async()=>{
  mocks.workspace.mockResolvedValue({project:{...project,discovery:'CLOSED'},accessRole:'TEAM',canManage:false,canProvideFeedback:true,guidance:[]});
  mocks.list.mockResolvedValue({relationships:[],requests:[],counts:{active:0,pending:0},policy:{maxActiveMentors:2,maxPendingRequests:3},requestMeta:meta,relationshipMeta:meta});
  mocks.mentors.mockResolvedValue({items:[],meta});
  await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter><MentorProjectPanel projectId="project"/></MemoryRouter></QueryClientProvider>));await tick();
  const note=host.querySelector<HTMLTextAreaElement>('#mentor-guidance-note')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Keep this follow-up question');note.dispatchEvent(new Event('input',{bubbles:true}));});
  mocks.workspace.mockRejectedValue(new Error('Background request interrupted'));
  await act(async()=>{await client.invalidateQueries({queryKey:['academic-support','mentor','workspace','project']});});await tick();
  expect(host.querySelector('#mentor-guidance-note')).toBe(note);expect(note.value).toBe('Keep this follow-up question');expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
