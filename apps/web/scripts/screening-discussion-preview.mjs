import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Real paper modal, isolated in-memory API. Never sends invitations to live users.
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const port = Number(process.argv.find(arg => arg.startsWith("--port="))?.split("=")[1] ?? 8093);
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử trao đổi Reviewer</title></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom';
import {ReadingPaperModal} from '/src/features/projects/components/reading-paper-modal.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import {notificationsApi} from '/src/features/notifications/api/notifications.api.ts';
import {I18nProvider} from '/src/i18n/index.tsx';
import '/src/theme/globals.css'; import '/src/features/projects/screening.css'; import '/src/features/projects/collaborative-library.css';
const now='2026-11-02T07:00:00Z'; const actor=new URLSearchParams(location.search).get('actor')==='b'?'b':'a';
useAuthStore.setState({user:{id:actor}});
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
const settings={version:1,workflowVersion:2,requiredReviewers:2,reviewMode:'COLLABORATIVE',blindReview:false,resolutionPolicy:'ADJUDICATION',consensusPolicy:'UNANIMOUS',aiAssisted:false,inclusionCriteria:['Nghiên cứu thực nghiệm trên sinh viên đại học'],exclusionCriteria:['Không đúng đối tượng nghiên cứu'],researchQuestions:['Phản hồi bằng AI ảnh hưởng thế nào đến kết quả học tập?'],stages:['TITLE_ABSTRACT'],authorizedAdjudicatorIds:[]};
if(new URLSearchParams(location.search).get('mode')==='independent')settings.reviewMode='INDEPENDENT';
const reviews=['a','b'].map((id,i)=>({id:'review-'+id,assignmentId:'assignment-'+id,reviewerId:id,revision:1,decision:i?'EXCLUDE':'INCLUDE',exclusionReason:i?'Không đúng đối tượng nghiên cứu':'',comment:i?'Tóm tắt chưa xác nhận quần thể là sinh viên đại học.':'Có nhóm so sánh và báo cáo kết quả học tập.',submittedAt:now,scope:'TITLE_ABSTRACT'}));
const people=[{id:'a',name:'Lê Anh'},{id:'b',name:'Trần Bình'}];
const round={id:'round',paperId:'paper',number:1,phase:'TITLE_ABSTRACT',version:4,status:'NEEDS_RESOLUTION',active:true,unblindedAt:now,independenceCompromised:false,assigned:2,completed:2,hiddenReviews:false,canReview:false,canManage:false,aiVisible:false,canFinalize:false,canReassess:true,canRequestAdjudication:true,discussionReady:false,myAssignmentId:'assignment-'+actor,myReview:reviews.find(r=>r.reviewerId===actor),reviews,assignments:people.map(p=>({id:'assignment-'+p.id,reviewerId:p.id,name:p.name,revision:1,completed:true,active:true,dueAt:null,overdue:false})),settings,finalizer:{id:'owner',name:'Chủ dự án'},classification:'CONFLICT',finalDecision:null};
const paper={paperId:'paper',title:'Phản hồi học tập bằng mô hình ngôn ngữ lớn trong giáo dục đại học',abstractText:'Nghiên cứu so sánh phản hồi bằng mô hình ngôn ngữ lớn với phản hồi truyền thống trong một học phần trực tuyến. Kết quả báo cáo mức tiến bộ của người học và những hạn chế trong thiết kế thực nghiệm. Hai reviewer cần đối chiếu quần thể và tiêu chí đã đăng ký.',authors:['Nguyễn Minh','Lê An'],publicationYear:2025,proposedAt:now,proposer:people[0],round,legacyStatus:'MAYBE',legacyProvenance:false};
const scenario=new URLSearchParams(location.search).get('scenario');
if(scenario==='clarification'){
  round.classification='NEEDS_MORE_INFORMATION';round.status='NEEDS_MORE_INFO';
  reviews.forEach(r=>{r.decision='UNSURE';r.exclusionReason='';r.comment='Tóm tắt chưa xác nhận đối tượng nghiên cứu. Cần đối chiếu toàn văn.';});
}
if(scenario==='review'){
  Object.assign(round,{status:'IN_REVIEW',classification:null,unblindedAt:null,hiddenReviews:true,completed:0,reviews:[],myReview:null,canReview:true,canReassess:false,canRequestAdjudication:false});
  round.assignments.forEach(a=>{a.completed=false;});
}
if(scenario==='long')reviews[1].exclusionReason='Không đáp ứng tiêu chí quần thể nghiên cứu. '.repeat(500)+'Nguồn đã đối chiếu: phần Participants, trang 4.';
const final=new URLSearchParams(location.search).get('final');
if(['INCLUDED','EXCLUDED'].includes(final)){
  for(const review of reviews){review.decision=final==='INCLUDED'?'INCLUDE':'EXCLUDE';review.exclusionReason=final==='EXCLUDED'?'Không đúng đối tượng nghiên cứu':'';}
  Object.assign(round,{status:final,aiVisible:true,canReassess:false,canRequestAdjudication:false,finalDecision:{id:'final',version:5,decision:final,source:'CONSENSUS',reason:'Hai reviewer đã thống nhất sau khi đối chiếu nguồn.',resolverId:null,createdAt:now}});
}
for(const key of Object.keys(screeningApi)) screeningApi[key]=async()=>{throw new Error('Fixture denies unmocked API: '+key)};
screeningApi.board=async()=>({items:[structuredClone(paper)],settings,people});
screeningApi.detail=async()=>structuredClone(round);
screeningApi.rounds=async()=>({items:[structuredClone(round)],total:1,page:1,pageSize:10,hasNext:false,legacy:null});
const initialMessages=[
{actorId:'a',comment:'Mình thấy nghiên cứu có nhóm so sánh. Bạn đang vướng tiêu chí nào về đối tượng nghiên cứu?'},
{actorId:'b',comment:'Tóm tắt chỉ ghi người học trực tuyến, chưa xác nhận là sinh viên đại học theo tiêu chí của dự án.'},
{actorId:'a',comment:'Đúng, mình sẽ kiểm tra lại phần Participants trong toàn văn và đối chiếu tiêu chí quần thể.'},
{actorId:'b',comment:'Mình đề nghị ghi rõ vị trí nguồn khi tìm thấy thông tin này, để cả hai cùng kiểm chứng.'},
{actorId:'a',comment:'Mình đang mở toàn văn. Sau khi kiểm tra, mình sẽ sửa phiếu nếu căn cứ chưa đủ.'}
].map((item,i)=>({id:'msg-'+i,type:'DISCUSSION',actorId:item.actorId,actorName:people.find(p=>p.id===item.actorId).name,createdAt:new Date(Date.parse(now)+i*60000).toISOString(),details:{comment:item.comment}}));
const storageKey='lumigap-discussion-ui-fixture';
const readMessages=()=>JSON.parse(localStorage.getItem(storageKey)||'null')||initialMessages;
screeningApi.history=async(_project,_round,page,kind)=>{const items=kind==='DISCUSSION'?readMessages().slice().reverse():[];return {items:items.slice((page-1)*20,page*20),total:items.length,page,pageSize:20,hasNext:page*20<items.length};};
screeningApi.action=async(_project,_round,action,payload)=>{if(action!=='comments')throw Error('Fixture comments only');const items=readMessages();items.push({id:crypto.randomUUID(),type:'DISCUSSION',actorId:actor,actorName:people.find(p=>p.id===actor).name,createdAt:new Date().toISOString(),details:{comment:payload.comment}});localStorage.setItem(storageKey,JSON.stringify(items));return {};};

screeningApi.requestAdjudication=async()=>{round.canRequestAdjudication=false;round.status='ADJUDICATING';round.version++;round.adjudicationCase={id:'case',status:'INVITED',ready:false,deadline:new Date(Date.now()+48*3600000).toISOString(),requestedByIds:[actor],disputePoints:[],createdAt:now,assignedAdjudicator:{id:'mentor',name:'TS. Nguyễn Minh',mentor:true,role:'PRIMARY_MENTOR'}};return {caseId:'case'};};
let notices=new URLSearchParams(location.search).has('unread')?readMessages().filter(m=>m.actorId!==actor).slice(-2).map(m=>({id:'notice-'+m.id,type:'SCREENING_DISCUSSION_MESSAGE',title:'Reviewer còn lại đã gửi trao đổi mới',message:'Mở trao đổi',targetKind:'project',targetId:'fixture',paperId:'paper',screeningRoundId:'round',screeningMessageId:m.id,isRead:false,createdAt:m.createdAt})):[];
notificationsApi.list=async()=>structuredClone(notices);
notificationsApi.read=async(id)=>{notices=notices.map(n=>n.id===id?{...n,isRead:true}:n);};
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement(ReadingPaperModal,{projectId:'fixture',paperId:'paper',readOnly:false,onClose:()=>{}})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port, strictPort: true, open: false }, plugins: [{ name: "screening-discussion-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture denies live API"); return; }
    if (req.url?.split("?")[0] !== "/__discussion.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__discussion.html", html));
  });
} }] });
await server.listen();
console.log(`Isolated discussion preview: http://127.0.0.1:${port}/__discussion.html`);
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
