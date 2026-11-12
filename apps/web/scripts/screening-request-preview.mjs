import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Real paper modal, isolated in-memory API. Never sends invitations to live users.
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử yêu cầu phân xử</title></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom';
import {ReadingPaperModal} from '/src/features/projects/components/reading-paper-modal.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import {I18nProvider} from '/src/i18n/index.tsx';
import '/src/theme/globals.css'; import '/src/features/projects/screening.css'; import '/src/features/projects/collaborative-library.css';
const now=new Date().toISOString(); const actor=new URLSearchParams(location.search).get('actor')==='b'?'b':'a';
useAuthStore.setState({user:{id:actor}});
const settings={version:1,workflowVersion:2,requiredReviewers:2,reviewMode:'COLLABORATIVE',blindReview:false,resolutionPolicy:'ADJUDICATION',consensusPolicy:'UNANIMOUS',aiAssisted:false,inclusionCriteria:['Nghiên cứu thực nghiệm trên sinh viên đại học'],exclusionCriteria:['Không đúng đối tượng nghiên cứu'],researchQuestions:['Phản hồi bằng AI ảnh hưởng thế nào đến kết quả học tập?'],stages:['TITLE_ABSTRACT'],authorizedAdjudicatorIds:[]};
const reviews=['a','b'].map((id,i)=>({id:'review-'+id,assignmentId:'assignment-'+id,reviewerId:id,revision:1,decision:i?'EXCLUDE':'INCLUDE',exclusionReason:i?'Không đúng đối tượng nghiên cứu':'',comment:i?'Tóm tắt chưa xác nhận quần thể là sinh viên đại học.':'Có nhóm so sánh và báo cáo kết quả học tập.',submittedAt:now,scope:'TITLE_ABSTRACT'}));
const people=[{id:'a',name:'Lê Anh'},{id:'b',name:'Trần Bình'}];
const round={id:'round',paperId:'paper',number:1,phase:'TITLE_ABSTRACT',version:4,status:'NEEDS_RESOLUTION',active:true,unblindedAt:now,independenceCompromised:false,assigned:2,completed:2,hiddenReviews:false,canReview:false,canManage:false,aiVisible:false,canFinalize:false,canReassess:true,canRequestAdjudication:true,discussionReady:false,myAssignmentId:'assignment-'+actor,myReview:reviews.find(r=>r.reviewerId===actor),reviews,assignments:people.map(p=>({id:'assignment-'+p.id,reviewerId:p.id,name:p.name,revision:1,completed:true,active:true,dueAt:null,overdue:false})),settings,finalizer:{id:'owner',name:'Chủ dự án'},classification:'CONFLICT',finalDecision:null};
const paper={paperId:'paper',title:'Phản hồi học tập bằng mô hình ngôn ngữ lớn trong giáo dục đại học',abstractText:'Nghiên cứu so sánh phản hồi bằng mô hình ngôn ngữ lớn với phản hồi truyền thống trong một học phần trực tuyến. Kết quả báo cáo mức tiến bộ của người học và những hạn chế trong thiết kế thực nghiệm. Hai reviewer cần đối chiếu quần thể và tiêu chí đã đăng ký.',authors:['Nguyễn Minh','Lê An'],publicationYear:2025,round,legacyStatus:'MAYBE',legacyProvenance:false};
for(const key of Object.keys(screeningApi)) screeningApi[key]=async()=>{throw new Error('Fixture denies unmocked API: '+key)};
screeningApi.board=async()=>({items:[structuredClone(paper)],settings,people});
screeningApi.detail=async()=>structuredClone(round);
screeningApi.rounds=async()=>({items:[structuredClone(round)],total:1,page:1,pageSize:10,hasNext:false,legacy:null});
screeningApi.history=async()=>({items:[],total:0,page:1,pageSize:20,hasNext:false});
screeningApi.requestAdjudication=async()=>{round.canRequestAdjudication=false;round.status='ADJUDICATING';round.version++;round.adjudicationCase={id:'case',status:'INVITED',ready:false,deadline:new Date(Date.now()+48*3600000).toISOString(),requestedByIds:[actor],disputePoints:[],createdAt:now,assignedAdjudicator:{id:'mentor',name:'TS. Nguyễn Minh',mentor:true,role:'PRIMARY_MENTOR'}};return {caseId:'case'};};
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement(ReadingPaperModal,{projectId:'fixture',paperId:'paper',readOnly:false,onClose:()=>{}})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8093, strictPort: true, open: false }, plugins: [{ name: "screening-request-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture denies live API"); return; }
    if (req.url?.split("?")[0] !== "/__request.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__request.html", html));
  });
} }] });
await server.listen();
console.log("Isolated request preview: http://127.0.0.1:8093/__request.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
