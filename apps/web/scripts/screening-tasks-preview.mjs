import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Screening Tasks fixture</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceTasksPanel} from '/src/features/projects/components/workspace-tasks.tsx';import {screeningApi} from '/src/features/projects/api/screening.api.ts';import {useAuthStore} from '/src/stores/auth-store.ts';import {I18nProvider} from '/src/i18n/index.tsx';
import {workspaceApi} from '/src/features/projects/api/workspace.api.ts';
import '/src/theme/globals.css';import '/src/features/projects/workspace-coordination.css';import '/src/features/projects/collaborative-library.css';
useAuthStore.setState({user:{id:'a'}});
const now=new Date().toISOString(),deadline=new Date(Date.now()+86400000).toISOString();
const evaluation=(paperId,title,groupStatus)=>({paperId,roundId:paperId+'-round',title,phase:'TITLE_ABSTRACT',roundNumber:1,publicationYear:2025,journalName:null,myDecision:'INCLUDE',submittedAt:now,groupStatus,finalDecision:null,isAdjudicated:false,resolverName:null,decidedAt:null});
const evaluations=[evaluation('opinion','Benchmarking retrieval-augmented generation for medicine','ADJUDICATING'),evaluation('waiting','Mô hình ngôn ngữ lớn hỗ trợ phản hồi học tập cho sinh viên đại học','WAITING_REVIEWER'),{...evaluation('final','Opening the black box of AI-Medicine','EXCLUDED'),isAdjudicated:true,resolverName:'Người phân xử minh họa',groupReason:'Đối tượng nghiên cứu không đáp ứng tiêu chí đã thống nhất của nhóm.',decidedAt:now,finalDecision:'EXCLUDED'}];
const summary={myActiveClaims:[{paperId:'review',roundId:'review-round',title:'A systematic review of feedback and assessment in higher education',phase:'TITLE_ABSTRACT',assignmentId:'claim',publicationYear:2024,dueAt:deadline,expiresInSeconds:86400,canExtend:true,canRelease:true}],pendingConsensus:[],pendingDiscussions:[{paperId:'conflict',roundId:'conflict-round',title:'So sánh phương pháp học máy trong giáo dục đại học',classification:'CONFLICT',status:'NEEDS_RESOLUTION'}],pendingAdjudications:[{paperId:'assigned',roundId:'assigned-round',title:'Large language models for sustainable assessment and feedback',status:'ADJUDICATING',caseStatus:'ASSIGNED'}],myTrackedDisputes:[{...evaluations[0],status:'ADJUDICATING',caseStatus:'COLLECTING',needsMyStatement:true,deadline}],myEvaluations:evaluations,myProposalsCount:0,recentProposals:[],eligibleQueueCount:0,nextEligiblePaperId:null,discoveryGoal:{enabled:false,target:2,period:'WEEK',paused:false,currentCount:0,remaining:2},capacityAdvice:{queueStatus:'NORMAL',message:''}};
screeningApi.workspaceSummary=async()=>structuredClone(summary);
summary.automaticTasks=[
 ['review','REVIEW','TODO','A systematic review of feedback and assessment in higher education','Chờ bạn gửi phiếu',deadline],
 ['opinion','STATEMENT','TODO','Benchmarking retrieval-augmented generation for medicine','Chờ bạn gửi quan điểm riêng',deadline],
 ['assigned','ADJUDICATION','IN_PROGRESS','Large language models for sustainable assessment and feedback','Đang xem xét hồ sơ',null],
 ['blocked','ADJUDICATION','BLOCKED','Opening the black box of AI-Medicine','Chờ điều phối xem xét xung đột lợi ích',null],
 ['finished','REVIEW','DONE','Mô hình ngôn ngữ lớn hỗ trợ phản hồi học tập','Đã gửi phiếu đánh giá',null],
 ['expired','STATEMENT','EXPIRED','Ứng dụng học máy trong giáo dục','Hết hạn gửi quan điểm; không bổ sung ý kiến',null],
].map(([id,actionType,status,title,reason,dueAt])=>({id,paperId:id,roundId:id+'-round',assigneeId:'a',actionType,status,title,reason,dueAt,phase:'TITLE_ABSTRACT',roundNumber:1,roundStatus:'IN_REVIEW',roundActive:true,endedAt:['DONE','EXPIRED'].includes(status)?now:null,updatedAt:now}));
const empty={items:[],total:0,page:1,pageSize:20,hasNext:false};
const manual={id:'manual',title:'Viết phần tổng quan nghiên cứu',description:'',status:'TODO',blockedReason:'',priority:'MEDIUM',assignee:{id:'a',name:'Người nghiên cứu'},creator:{id:'a',name:'Người nghiên cứu'},milestoneId:null,dueAt:null,completedAt:null,completedBy:null,deletedAt:null,version:1,createdAt:now,updatedAt:now,parentTaskId:null,checklist:[],sortOrder:1,subtaskCount:0,completedSubtaskCount:0,link:null};
workspaceApi.taskBoard=async(_id,query)=>({boardVersion:1,columns:Object.fromEntries(['TODO','IN_PROGRESS','BLOCKED','DONE'].map(status=>[status,{...empty,items:status==='TODO'&&(!query.q||manual.title.includes(query.q))?[manual]:[],total:status==='TODO'?1:0}]))});
workspaceApi.tasks=async()=>({...empty,items:[manual],total:1});workspaceApi.milestones=async()=>empty;workspaceApi.people=async()=>({...empty,items:[{id:'a',name:'Người nghiên cứu'}]});
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/projects/fixture?tab=tasks&'+location.search.slice(1)]},React.createElement('main',{style:{maxWidth:1100,margin:'auto',padding:'24px 16px'}},React.createElement(WorkspaceTasksPanel,{projectId:'fixture',readOnly:false}))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8094, strictPort: true, open: false }, plugins: [{ name: "screening-tasks-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__tasks.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__tasks.html", html));
  });
} }] });
await server.listen(); console.log("Tasks fixture: http://127.0.0.1:8094/__tasks.html");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
