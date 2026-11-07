import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
// In-memory legacy recovery fixture. No live review or project mutations.
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử vòng đánh giá cũ</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ReadingPaperModal} from '/src/features/projects/components/reading-paper-modal.tsx';import {screeningApi} from '/src/features/projects/api/screening.api.ts';import {useAuthStore} from '/src/stores/auth-store.ts';import {I18nProvider} from '/src/i18n/index.tsx';
import '/src/theme/globals.css';import '/src/features/projects/screening.css';import '/src/features/projects/collaborative-library.css';
const actor=new URLSearchParams(location.search).get('actor')==='member'?'c':'owner';useAuthStore.setState({user:{id:actor}});
const people=[{id:'owner',name:'Chủ dự án Demo'},{id:'a',name:'Reviewer A'},{id:'b',name:'Reviewer B'},{id:'c',name:'Reviewer C'}];
const settings={workflowVersion:9,version:1,reviewMode:'INDEPENDENT',requiredReviewers:2,blindReview:true,resolutionPolicy:'ADJUDICATION',consensusPolicy:'UNANIMOUS',aiAssisted:false,stages:['TITLE_ABSTRACT','FULL_TEXT'],researchQuestions:[],inclusionCriteria:[],exclusionCriteria:[]};
const old={id:'legacy',paperId:'paper',number:1,version:1,phase:'TITLE_ABSTRACT',status:'IN_REVIEW',active:true,legacyNeedsAudit:true,settings:{...settings,workflowVersion:5},assigned:3,completed:2,assignments:['a','b','c'].map(id=>({id:'assignment-'+id,reviewerId:id,name:people.find(p=>p.id===id).name,revision:1,completed:id!=='c',active:true,dueAt:null,overdue:false})),reviews:[],myReview:null,hiddenReviews:true,myAssignmentId:actor==='c'?'assignment-c':null,canReview:false,canClaim:false,canManage:actor==='owner',canFinalize:false,canReopenOwn:false,aiVisible:false,unblindedAt:null,independenceCompromised:false,finalDecision:null,finalizer:{id:'',name:'Chưa chỉ định'}};
let current=old;
const paper=()=>({paperId:'paper',title:'Nghiên cứu minh họa: đánh giá tài liệu khoa học',abstractText:'Nghiên cứu minh họa để kiểm tra cách xử lý vòng đánh giá cũ có ba phân công. Dữ liệu trên màn hình là dữ liệu giả lập.',authors:['Nhóm nghiên cứu Demo'],publicationYear:2025,proposedAt:'2026-10-01T00:00:00Z',proposalReason:'Nguồn để đối chiếu phương pháp nghiên cứu.',proposer:people[0],legacyProvenance:false,updatedAt:'2026-10-01T00:00:00Z',canEditProposal:false,round:structuredClone(current)});
for(const key of Object.keys(screeningApi))screeningApi[key]=async()=>{throw Error('Fixture denies unmocked API: '+key)};
screeningApi.board=async()=>({items:[paper()],settings,people,canManage:actor==='owner'});screeningApi.detail=async(_project,id)=>structuredClone(id==='legacy'?old:current);
screeningApi.rounds=async()=>({items:current.id==='legacy'?[old]:[current,old],total:current.id==='legacy'?1:2,page:1,pageSize:10,hasNext:false,legacy:null});screeningApi.ai=async()=>null;
screeningApi.start=async(_project,payload)=>{if(actor!=='owner'||!payload.confirmRescreen)throw Error('Owner confirmation required');old.active=false;current={...old,id:'new-round',active:true,number:2,legacyNeedsAudit:false,settings,status:'NOT_REVIEWED',assigned:0,completed:0,assignments:[],canClaim:true,myAssignmentId:null};return {roundIds:[current.id]}};
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement('p',{style:{padding:16}},'Kiểm thử khôi phục vòng cũ · Dữ liệu giả lập'),React.createElement(ReadingPaperModal,{projectId:'fixture-project',paperId:'paper',readOnly:false,onClose:()=>{}})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8094, strictPort: true, open: false }, plugins: [{ name: "legacy-recovery-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__legacy.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__legacy.html", html));
  });
} }] });
await server.listen();console.log("Legacy recovery fixture: http://127.0.0.1:8094/__legacy.html");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.close(); process.exit(0); });
