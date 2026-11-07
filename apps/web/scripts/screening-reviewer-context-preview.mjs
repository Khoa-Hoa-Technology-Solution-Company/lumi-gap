import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
// Synthetic four-person team. No live API, invitations or scientific decisions.
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import {I18nProvider} from '/src/i18n/index.tsx';
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom';
import {ScreeningPaperDetail} from '/src/features/projects/components/screening-round.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import '/src/theme/globals.css'; import '/src/features/projects/screening.css'; import '/src/features/projects/collaborative-library.css';
const people=[{id:'owner',name:'Chủ dự án Demo'},{id:'a',name:'Reviewer A'},{id:'b',name:'Reviewer B'},{id:'c',name:'Thành viên C'}];
const assignments=['a','b'].map(id=>({id:'assignment-'+id,reviewerId:id,name:people.find(p=>p.id===id).name,revision:1,completed:false,active:true,dueAt:null,overdue:false}));
const settings={workflowVersion:5,version:1,reviewMode:'INDEPENDENT',requiredReviewers:2,blindReview:true,resolutionPolicy:'ADJUDICATION',consensusPolicy:'UNANIMOUS',researchQuestions:[],inclusionCriteria:[],exclusionCriteria:[],aiAssisted:false,stages:['TITLE_ABSTRACT','FULL_TEXT']};
useAuthStore.setState({user:{id:'a'}});
function round(){const actor=useAuthStore.getState().user.id;return {id:'round',paperId:'paper',number:1,version:1,phase:'TITLE_ABSTRACT',status:'NOT_REVIEWED',active:true,settings,assignments,assigned:2,completed:0,reviews:[],hiddenReviews:true,myReview:null,myAssignmentId:actor==='a'?'assignment-a':null,canReview:actor==='a',canManage:actor==='owner',canFinalize:false,aiVisible:false,unblindedAt:null,independenceCompromised:false,finalDecision:null,finalizer:{id:'',name:'Chưa chỉ định'},finalizerAssigned:false};}
screeningApi.detail=async()=>round();
const empty=()=>({items:[],total:0,page:1,pageSize:20,hasNext:false});
screeningApi.rounds=async()=>empty(); screeningApi.history=async()=>empty(); screeningApi.ai=async()=>null;
const paper={paperId:'paper',title:'Ứng dụng AI hỗ trợ nghiên cứu của sinh viên',abstractText:'Nghiên cứu khảo sát cách sinh viên sử dụng AI để tìm và đánh giá tài liệu. Nhóm đối chiếu kết quả đánh giá độc lập theo quy trình chung.',authors:['Nhóm nghiên cứu Demo'],publicationYear:2026,proposedAt:new Date().toISOString(),proposer:people[0],proposalReason:'Tài liệu cần xem xét cho câu hỏi nghiên cứu của nhóm.',updatedAt:new Date().toISOString(),canEditProposal:false,legacyProvenance:false,round:round()};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function App(){const actor=useAuthStore(s=>s.user.id);return React.createElement('main',{className:'screening-workspace mx-auto max-w-6xl space-y-4 p-5','data-no-i18n':true},React.createElement('p',{className:'text-xs text-muted-foreground'},'Giao diện kiểm thử · Nhóm 4 người, phân công 2 reviewer · Dữ liệu giả lập'),React.createElement('button',{className:'rounded border px-3 py-2 text-sm',onClick:()=>useAuthStore.setState({user:{id:actor==='a'?'owner':'a'}})},actor==='a'?'Đang là Reviewer A · Xem với vai trò chủ dự án':'Đang là chủ dự án · Xem với vai trò Reviewer A'),React.createElement(ScreeningPaperDetail,{key:actor,projectId:'fixture',paper:{...paper,round:round()},people,readOnly:false}));}
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client},React.createElement(MemoryRouter,null,React.createElement(App)))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "reviewer-context-fixture", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__reviewer-context.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__reviewer-context.html", html));
  });
} }] });
await server.listen();
console.log("Reviewer context preview: http://127.0.0.1:8091/__reviewer-context.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
