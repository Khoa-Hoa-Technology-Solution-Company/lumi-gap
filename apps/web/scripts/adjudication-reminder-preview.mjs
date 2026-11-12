import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử nhắc ý kiến phân xử</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MyWorkView} from '/src/features/projects/components/my-work-view.tsx';import {screeningApi} from '/src/features/projects/api/screening.api.ts';import {useAuthStore} from '/src/stores/auth-store.ts';import {I18nProvider} from '/src/i18n/index.tsx';
import '/src/theme/globals.css';import '/src/features/projects/collaborative-library.css';
useAuthStore.setState({user:{id:'a'}});
const title='Mô hình ngôn ngữ lớn hỗ trợ phản hồi học tập cho sinh viên đại học';
const deadline=new Date(Date.now()+24*3600000).toISOString();const now=new Date().toISOString();
const summary={myActiveClaims:[],pendingConsensus:[],pendingAdjudications:[],pendingDiscussions:[],myTrackedDisputes:[{paperId:'paper',roundId:'round',title,phase:'TITLE_ABSTRACT',status:'ADJUDICATING',caseStatus:'COLLECTING',myDecision:'INCLUDE',needsMyStatement:true,deadline}],myCompletedEvaluations:[],myProposalsCount:0,recentProposals:[],eligibleQueueCount:0,nextEligiblePaperId:null,discoveryGoal:{enabled:false,target:2,period:'WEEK',paused:false,currentCount:0,remaining:2},capacityAdvice:{queueStatus:'EMPTY_QUEUE',message:'Hiện không có suất phù hợp để bạn nhận. Kiểm tra các hồ sơ đang cần ý kiến.'}};
const data={id:'case',version:1,packetVersion:1,myReviewerId:'a',active:true,status:'COLLECTING',ready:false,deadline,createdAt:now,requestedByIds:['b'],invitation:null,invitations:[],statements:[{reviewerId:'a',name:'Lê Anh',completed:false,hidden:false,revision:0},{reviewerId:'b',name:'Trần Bình',completed:false,hidden:true,revision:0}],conflicts:[],candidates:[],canRespond:false,canStatement:true,canCoordinate:false,canReport:false,canResolve:false};
const view={version:1,status:'ADJUDICATING',case:data,packet:{roundId:'round',paperId:'paper',phase:'TITLE_ABSTRACT',roundVersion:1,paper:{title,abstractText:'Tóm tắt nghiên cứu dùng cho kiểm thử giao diện.',publicationYear:2025,doi:null},reviews:[],researchQuestions:[],inclusionCriteria:[],exclusionCriteria:[]},canResolve:false,finalDecision:null};
if(new URLSearchParams(location.search).get('mode')==='queue'){summary.eligibleQueueCount=1;summary.completedPersonalReviews=8;summary.myTrackedDisputes=[];summary.capacityAdvice={queueStatus:'NORMAL',message:'Nhóm có thể tiếp tục đánh giá tài liệu trong hàng đợi.'};}
if(new URLSearchParams(location.search).get('mode')==='my-work'){
  summary.myEvaluations=['WAITING_REVIEWER','CONFLICT','ADJUDICATING','INCLUDED','EXCLUDED'].map((groupStatus,index)=>({paperId:index===2?'paper':'study-'+index,roundId:index===2?'round':'round-'+index,title:["Evaluating retrieval methods for evidence-based education","So sánh phương pháp học máy trong giáo dục đại học",title,"A systematic review of feedback in higher education","Benchmarking retrieval-augmented generation for medicine"][index],phase:'TITLE_ABSTRACT',publicationYear:2024,journalName:null,myDecision:'INCLUDE',submittedAt:now,groupStatus,finalDecision:index===4?'EXCLUDED':index===3?'INCLUDED':null,isAdjudicated:index===4,resolverName:index===4?'Người phân xử minh họa':null,decidedAt:index===4?now:null}));
  summary.acceptedPapers=summary.myEvaluations.filter(e=>e.groupStatus==='INCLUDED').map(e=>({...e,submittedAt:undefined,acceptedAt:now}));
  summary.pendingDiscussions=[{paperId:'study-1',roundId:'round-1',title:summary.myEvaluations[1].title,classification:'CONFLICT',phase:'TITLE_ABSTRACT',status:'NEEDS_RESOLUTION'}];
}
screeningApi.workspaceSummary=async()=>structuredClone(summary);screeningApi.adjudication=async()=>structuredClone(view);
screeningApi.caseAction=async(_project,_round,payload)=>{if(payload.action==='STATEMENT'){Object.assign(data.statements[0],{completed:true,text:payload.text,useExisting:payload.useExisting,revision:1});summary.myTrackedDisputes[0].needsMyStatement=false;}return {version:++data.version};};
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement('main',{style:{maxWidth:1180,margin:'auto',padding:'24px 16px'}},React.createElement('p',{style:{fontSize:12,marginBottom:16}},'Kiểm thử với dữ liệu giả lập'),React.createElement('h1',{style:{fontSize:24,fontWeight:600,marginBottom:20}},'Việc của tôi'),React.createElement(MyWorkView,{projectId:'fixture-project',readOnly:false,onOpenPaper:()=>{},onSwitchView:()=>{}}))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8093, strictPort: true, open: false }, plugins: [{ name: "reminder-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__reminder.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__reminder.html", html));
  });
} }] });
await server.listen();console.log("Reminder fixture: http://127.0.0.1:8093/__reminder.html");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
