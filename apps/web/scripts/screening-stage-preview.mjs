import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Real paper modal, isolated in-memory API. Never sends invitations to live users.
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử trao đổi Reviewer</title></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom';
import {ReadingPaperModal} from '/src/features/projects/components/reading-paper-modal.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import {I18nProvider} from '/src/i18n/index.tsx';
import '/src/theme/globals.css'; import '/src/features/projects/screening.css'; import '/src/features/projects/collaborative-library.css';
const now='2026-11-02T07:00:00Z'; const actor=new URLSearchParams(location.search).get('actor')==='b'?'b':'a';
useAuthStore.setState({user:{id:actor}});
const settings={version:1,workflowVersion:2,requiredReviewers:2,reviewMode:'COLLABORATIVE',blindReview:false,resolutionPolicy:'ADJUDICATION',consensusPolicy:'UNANIMOUS',aiAssisted:false,inclusionCriteria:['Nghiên cứu thực nghiệm trên sinh viên đại học'],exclusionCriteria:['Không đúng đối tượng nghiên cứu'],researchQuestions:['Phản hồi bằng AI ảnh hưởng thế nào đến kết quả học tập?'],stages:['TITLE_ABSTRACT'],authorizedAdjudicatorIds:[]};
if(new URLSearchParams(location.search).get('mode')==='independent')settings.reviewMode='INDEPENDENT';
const reviews=['a','b'].map((id,i)=>({id:'review-'+id,assignmentId:'assignment-'+id,reviewerId:id,revision:1,decision:i?'EXCLUDE':'INCLUDE',exclusionReason:i?'Không đúng đối tượng nghiên cứu':'',comment:i?'Tóm tắt chưa xác nhận quần thể là sinh viên đại học.':'Có nhóm so sánh và báo cáo kết quả học tập.',submittedAt:now,scope:'TITLE_ABSTRACT'}));
const people=[{id:'a',name:'Lê Anh'},{id:'b',name:'Trần Bình'}];
const round={id:'round',paperId:'paper',number:1,phase:'TITLE_ABSTRACT',version:4,status:'NEEDS_RESOLUTION',active:true,unblindedAt:now,independenceCompromised:false,assigned:2,completed:2,hiddenReviews:false,canReview:false,canManage:false,aiVisible:false,canFinalize:false,canReassess:true,canRequestAdjudication:true,discussionReady:false,myAssignmentId:'assignment-'+actor,myReview:reviews.find(r=>r.reviewerId===actor),reviews,assignments:people.map(p=>({id:'assignment-'+p.id,reviewerId:p.id,name:p.name,revision:1,completed:true,active:true,dueAt:null,overdue:false})),settings,finalizer:{id:'owner',name:'Chủ dự án'},classification:'CONFLICT',finalDecision:null};
const paper={paperId:'paper',title:'Phản hồi học tập bằng mô hình ngôn ngữ lớn trong giáo dục đại học',abstractText:'Nghiên cứu so sánh phản hồi bằng mô hình ngôn ngữ lớn với phản hồi truyền thống trong một học phần trực tuyến. Kết quả báo cáo mức tiến bộ của người học và những hạn chế trong thiết kế thực nghiệm. Hai reviewer cần đối chiếu quần thể và tiêu chí đã đăng ký.',authors:['Nguyễn Minh','Lê An'],publicationYear:2025,proposedAt:now,proposer:people[0],round,legacyStatus:'MAYBE',legacyProvenance:false};
const final=new URLSearchParams(location.search).get('final');
if(['INCLUDED','EXCLUDED'].includes(final)){
  for(const review of reviews){review.decision=final==='INCLUDED'?'INCLUDE':'EXCLUDE';review.exclusionReason=final==='EXCLUDED'?'Không đúng đối tượng nghiên cứu':'';}
  Object.assign(round,{status:final,aiVisible:true,canReassess:false,canRequestAdjudication:false,finalDecision:{id:'final',version:5,decision:final,source:'CONSENSUS',reason:'Hai reviewer đã thống nhất sau khi đối chiếu nguồn.',resolverId:null,createdAt:now}});
}
const state=new URLSearchParams(location.search).get('state')||'waiting';
settings.workflowVersion=11;settings.reviewMode='INDEPENDENT';settings.screeningMode='TWO_STAGE';settings.stages=['TITLE_ABSTRACT','FULL_TEXT'];
if(state==='waiting'){
 round.status='WAITING_FULLTEXT';round.outcome='WAITING_FULLTEXT';round.canReassess=false;round.canRequestAdjudication=false;round.canResumeFullText=true;
 round.finalDecision={id:'final',version:5,decision:'INCLUDED',source:'CONSENSUS',reason:'Đủ điều kiện chuyển đọc toàn văn, chưa chấp nhận cuối.',resolverId:null,createdAt:now};
 round.classification='AGREEMENT_INCLUDE';reviews.forEach(r=>{r.decision='INCLUDE';r.exclusionReason='';});
}else if(state==='clarification'){
 settings.screeningMode='SINGLE_STAGE';settings.stages=['TITLE_ABSTRACT'];round.status='NEEDS_MORE_INFO';round.outcome='NEEDS_CLARIFICATION';round.classification='NEEDS_CLARIFICATION';
 reviews.forEach((r,i)=>{r.decision=i?'INCLUDE':'UNSURE';r.exclusionReason='';});
}else if(state==='full'){
 paper.fullTextAvailable=true;round.number=2;round.phase='FULL_TEXT';round.status='INCLUDED';round.outcome='FINAL_INCLUDED';round.extractionReady=true;round.canReassess=false;round.canRequestAdjudication=false;round.classification='AGREEMENT_INCLUDE';
 reviews.forEach(r=>{r.decision='INCLUDE';r.scope='FULL_TEXT';r.fullTextReference='PDF, trang 4, mô tả người tham gia';r.exclusionReason='';});
 round.finalDecision={id:'final',version:5,decision:'INCLUDED',source:'CONSENSUS',reason:'Hai reviewer đã xác nhận từ toàn văn.',resolverId:null,createdAt:now};
}
for(const key of Object.keys(screeningApi)) screeningApi[key]=async()=>{throw new Error('Fixture denies unmocked API: '+key)};
screeningApi.resumeFullText=async()=>{throw {isAxiosError:true,response:{data:{error:{message:'Chưa có toàn văn. Đính kèm PDF trước khi tiếp tục.'}}}};};
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
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement(ReadingPaperModal,{projectId:'fixture',paperId:'paper',readOnly:false,onClose:()=>{}})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8096, strictPort: true, open: false }, plugins: [{ name: "screening-stage-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture denies live API"); return; }
    if (req.url?.split("?")[0] !== "/__stages.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__stages.html", html));
  });
} }] });
await server.listen();
console.log("Isolated discussion preview: http://127.0.0.1:8096/__stages.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
