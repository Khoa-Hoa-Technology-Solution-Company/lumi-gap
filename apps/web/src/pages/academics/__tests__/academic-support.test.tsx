// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcademicSupportPage, MentorProjectPanel, ConsentComposer } from '../academic-support';
const mocks=vi.hoisted(()=>({mine:vi.fn(),preferences:vi.fn(),savePreferences:vi.fn(),opportunities:vi.fn(),respond:vi.fn(),offer:vi.fn(),draft:vi.fn(),saveDraft:vi.fn(),projects:vi.fn(),workspace:vi.fn(),list:vi.fn(),mentors:vi.fn(),guidance:vi.fn(),settings:vi.fn(),request:vi.fn(),requestDetail:vi.fn()}));
const accessMocks=vi.hoisted(()=>({workspace:vi.fn(),feedback:vi.fn(),history:vi.fn(),agreements:vi.fn(),comment:vi.fn()}));
vi.mock('@/features/projects/api/mentor-access.api',()=>({mentorAccessApi:accessMocks}));
const state=vi.hoisted(()=>({role:'LECTURER'}));
vi.mock('@/features/projects/api/academic-support.api',()=>({academicSupportApi:mocks}));
vi.mock('@/features/projects/api/projects.api',()=>({projectsApi:{list:mocks.projects}}));
vi.mock('@/features/auth/api/auth.api',()=>({authApi:{academicOnboardingOptions:async()=>({researchAreas:[]})}}));
vi.mock('@/features/academic-profile/hooks/use-academic-profile',()=>({useAcademicProfile:()=>({data:{academicRole:state.role},isLoading:false,isError:false})}));
vi.mock('@/features/academic-profile/components/position-verification-panel',()=>({PositionVerificationPanel:()=> <p>Verify position</p>}));
vi.mock('@/features/projects/components/mentor-discovery-settings',()=>({MentorDiscoverySettings:()=>null}));
vi.mock('@/features/projects/components/mentor-preview',()=>({MentorPreviewContent:({preview}:any)=><p>{preview.summary}</p>,MentorInvitationSender:({sender}:any)=><p>{sender.fullName}</p>,MentorInvitationAccessNotice:()=><p>Project access starts after acceptance</p>}));
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
accessMocks.workspace.mockResolvedValue({viewerId:'mentor',projectId:'project',title:project.title,canManage:false,readOnly:false,policies:[],page:1,pageSize:20,total:0,hasNext:false});
for (const method of ['feedback','history','agreements'] as const) accessMocks[method].mockResolvedValue({items:[],total:0,page:1,pageSize:20,hasNext:false});
mocks.preferences.mockResolvedValue({canEnable:true,acceptingMentorships:true,emailEnabled:false,locale:'en'});
mocks.mine.mockImplementation(async({view}:any)=>({requests:view==='incoming'?[invitation]:[],relationships:[],counts:{incoming:1,active:0,pending:1},requestMeta:meta,relationshipMeta:meta}));
mocks.opportunities.mockResolvedValue({items:[project],meta});mocks.respond.mockResolvedValue({});mocks.offer.mockResolvedValue({});mocks.projects.mockResolvedValue([]);
mocks.requestDetail.mockResolvedValue(invitation);
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
it('shows the approved abstract before opening any dialog, and repeats the topic brief before consent',async()=>{
  await mount();
  expect(host.textContent).toContain(project.summary);
  expect(host.textContent).toContain('Guidance requested');
  expect(button('Open project')).toBeUndefined();
  await click('Accept');
  const dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain(project.summary);
  expect(dialog.textContent).toContain(invitation.message);
  expect(dialog.textContent).toContain('Primary mentor');
  expect(dialog.textContent).toContain('Project access starts after acceptance');
  expect(mocks.respond).not.toHaveBeenCalled();
  expect(mocks.projects).not.toHaveBeenCalled();
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it('lets the lecturer review an invitation then accept through a separate explicit confirmation',async()=>{
  await mount(); await click('View Project Preview');
  const preview=document.querySelector('[role="dialog"]')!;
  expect(preview.textContent).toContain('Research mentorship invitation');
  expect(preview.textContent).toContain(project.summary);
  expect(preview.textContent).toContain('Invited role');
  await act(async()=>{[...preview.querySelectorAll('button')].find(b=>b.textContent==='Accept mentorship')!.click();});await tick();
  expect(mocks.respond).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await click('Confirm');expect(mocks.respond).toHaveBeenCalledWith(expect.objectContaining({id:'request'}),'accept','');
});
it('shows the sender the current approved abstract immediately instead of stale project data',async()=>{
  mocks.settings.mockResolvedValue({...project,summary:'Approved abstract from settings',version:1,discovery:'CLOSED'});
  mocks.list.mockResolvedValue({positions:{PRIMARY:{status:'VACANT',pendingRequests:0},SECONDARY:{status:'LOCKED',pendingRequests:0}},policy:{maxPendingPerRole:3}});
  await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter><ConsentComposer project={{...project,discovery:'CLOSED',stage:'PLANNING',availableRoles:['PRIMARY']}} mentor={{_id:'lecturer',fullName:'Lecturer'}} onClose={()=>{}} /></MemoryRouter></QueryClientProvider>));await tick();await tick();
  const dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('details')?.open).toBe(true);
  expect(dialog.textContent).toContain('Approved abstract from settings');
  expect(dialog.textContent).not.toContain('Shared project introduction');
  expect(dialog.textContent).toContain('Project access starts after acceptance');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('preserves the confirmation and note if accepting fails',async()=>{mocks.respond.mockRejectedValue({response:{data:{error:{message:'Position filled'}}}});await mount();await click('Accept');const note=document.querySelector<HTMLTextAreaElement>('[aria-label="Note"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Meet weekly');note.dispatchEvent(new Event('input',{bubbles:true}));});await click('Confirm');expect(document.querySelector('[role="alert"]')?.textContent).toContain('Position filled');expect(note.value).toBe('Meet weekly');expect(document.querySelector('[role="dialog"]')).not.toBeNull();});
it('waits for the current brief and submits the reviewed policy instead of the stale list item',async()=>{
  let resolve!: (value:unknown)=>void;
  mocks.requestDetail.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  await mount();await click('Accept');
  expect(button('Confirm').disabled).toBe(true);expect(mocks.respond).not.toHaveBeenCalled();
  const current={...invitation,previewToken:'b'.repeat(64),project:{...project,summary:'Updated approved abstract'},accessPolicy:{id:'access',version:2,preset:'ADVISOR',permissions:[],expiresAt:null}};
  await act(async()=>resolve(current));await tick();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Updated approved abstract');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('The invitation has changed.');
  await click('Confirm');expect(mocks.respond).toHaveBeenCalledWith(current,'accept','');
});
it('keeps the note and blocks confirmation until a failed detail check can be retried',async()=>{
  mocks.requestDetail.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(invitation);
  await mount();await click('Accept');
  const note=document.querySelector<HTMLTextAreaElement>('[aria-label="Note"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Please meet weekly');note.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(button('Confirm').disabled).toBe(true);expect(mocks.respond).not.toHaveBeenCalled();
  await click('Reload invitation');expect(note.value).toBe('Please meet weekly');
  await click('Confirm');expect(mocks.respond).toHaveBeenCalledWith(invitation,'accept','Please meet weekly');
});
it('does not accept a withdrawn or expired invitation returned by the fresh check',async()=>{
  mocks.requestDetail.mockResolvedValue({...invitation,status:'CANCELED_BY_PROJECT',actions:{...invitation.actions,accept:false}});
  await mount();await click('Accept');expect(button('Confirm').disabled).toBe(true);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('This invitation can no longer be accepted.');
  await click('Confirm');expect(mocks.respond).not.toHaveBeenCalled();
});
it('refreshes stale permissions after a conflict and retains the note for explicit confirmation',async()=>{
  const current={...invitation,accessPolicy:{id:'access',version:2,preset:'ADVISOR',permissions:[],expiresAt:null}};
  mocks.requestDetail.mockResolvedValueOnce(invitation).mockResolvedValue(current);
  mocks.respond.mockRejectedValueOnce({response:{status:409,data:{error:{message:'Policy changed'}}}}).mockResolvedValue({});
  await mount();await click('Accept');
  const note=document.querySelector<HTMLTextAreaElement>('[aria-label="Note"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Keep this note');note.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('Confirm');await tick();expect(note.value).toBe('Keep this note');
  expect(mocks.respond).toHaveBeenCalledTimes(1);
  await click('Confirm');expect(mocks.respond).toHaveBeenLastCalledWith(current,'accept','Keep this note');
});
it('sends one confirmation when the button is clicked twice before React updates',async()=>{
  let finish!:()=>void; mocks.respond.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));
  await mount();await click('Accept');const confirm=button('Confirm');
  await act(async()=>{confirm.click();confirm.click();});await tick();expect(mocks.respond).toHaveBeenCalledTimes(1);
  await act(async()=>finish());await tick();
});
it('sends one lecturer offer when clicked twice before React updates',async()=>{
  let finish!:()=>void;mocks.offer.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));
  await mount('/academic-support?view=discover');await click('Offer Mentorship');const send=button('Send offer');
  await act(async()=>{send.click();send.click();});await tick();expect(mocks.offer).toHaveBeenCalledTimes(1);
  await act(async()=>finish());await tick();
});
it('explains and blocks sending when all mentoring positions are unavailable',async()=>{
  mocks.settings.mockResolvedValue({...project,version:1,discovery:'CLOSED'});
  mocks.list.mockResolvedValue({positions:{PRIMARY:{status:'ASSIGNED',pendingRequests:0},SECONDARY:{status:'LOCKED',pendingRequests:0}},policy:{maxPendingPerRole:3}});
  await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter><ConsentComposer project={{...project,discovery:'CLOSED',stage:'PLANNING',availableRoles:['PRIMARY']}} mentor={{_id:'lecturer',fullName:'Lecturer'}} onClose={()=>{}} /></MemoryRouter></QueryClientProvider>));await tick();await tick();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('No mentoring position is available.');
  expect(button('Send Invitation').disabled).toBe(true);expect(mocks.request).not.toHaveBeenCalled();
});
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
  accessMocks.workspace.mockResolvedValue({viewerId:'mentor',projectId:'project',title:project.title,canManage:false,readOnly:false,page:1,pageSize:20,total:1,hasNext:false,policies:[{mentorId:'lecturer',mentorName:'Lecturer',invitationState:'ACCEPTED',policy:{id:'access',requestId:'request',relationshipId:'relation',version:1,preset:'ADVISOR',permissions:['MENTOR_CHAT'],expiresAt:null,revokedAt:null,effective:true},shares:[]}]});
  await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter><MentorProjectPanel projectId="project"/></MemoryRouter></QueryClientProvider>));await tick();await tick();
  const note=[...host.querySelectorAll('label')].find(l=>l.textContent?.startsWith('Nội dung phản hồi'))!.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Keep this follow-up question');note.dispatchEvent(new Event('input',{bubbles:true}));});
  accessMocks.workspace.mockRejectedValue(new Error('Background request interrupted'));
  await act(async()=>{await client.invalidateQueries({queryKey:['mentor-access','mentor','project','workspace']});});await tick();
  expect(host.querySelector('textarea')).toBe(note);expect(note.value).toBe('Keep this follow-up question');expect(host.querySelector('[role="alert"]')).not.toBeNull();
});

it('opens an exact invitation outside the first list page without entering the restricted workspace',async()=>{
  mocks.mine.mockResolvedValue({requests:[],relationships:[],counts:{incoming:15,active:0,pending:15},requestMeta:{...meta,total:15,totalPages:2},relationshipMeta:meta});
  await mount('/academic-support?view=incoming&invitationProjectId=project&requestId=request');
  expect(mocks.requestDetail).toHaveBeenCalledWith('project','request');
  expect(host.textContent).toContain(project.summary);
  expect(mocks.workspace).not.toHaveBeenCalled();
  await click('Accept'); await click('Confirm');
  expect(mocks.respond).toHaveBeenCalledWith(expect.objectContaining({id:'request'}),'accept','');
});
it('renders a notification invitation once when it is also in the current list page',async()=>{
  await mount('/academic-support?view=incoming&invitationProjectId=project&requestId=request');
  expect(host.querySelectorAll('.mentorship-list li')).toHaveLength(1);
  expect(host.textContent).not.toContain('No mentorship requests or active mentors.');
  await click('Teams you mentor');
  expect(button('Accept')).toBeUndefined();
});
it('keeps an unauthorized deep link closed and allows a safe retry',async()=>{
  mocks.mine.mockResolvedValue({requests:[],relationships:[],counts:{incoming:0,active:0,pending:0},requestMeta:meta,relationshipMeta:meta});
  mocks.requestDetail.mockRejectedValue({response:{status:403,data:{error:{message:'Not authorized'}}}});
  await mount('/academic-support?view=incoming&invitationProjectId=other&requestId=private');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Not authorized');
  expect(button('Accept')).toBeUndefined();
  await click('Try again');
  expect(mocks.requestDetail).toHaveBeenCalledTimes(2);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
