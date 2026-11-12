import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Screening semantic colors fixture</title></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {ScreeningStatus} from '/src/features/projects/components/screening-common.tsx';
import {WorkPaperCard,EvaluationSummary} from '/src/features/projects/components/screening-paper-card.tsx';
import {workPaperTone} from '/src/features/projects/my-work-model.ts';
import '/src/theme/globals.css';import '/src/features/projects/screening.css';import '/src/features/projects/collaborative-library.css';
const h=React.createElement;
const states=[
['NOT_REVIEWED','Chờ đánh giá'],['IN_REVIEW','Đang đánh giá'],
['NEEDS_RESOLUTION','Cần làm rõ','NEEDS_CLARIFICATION'],['NEEDS_RESOLUTION','Có bất đồng','CONFLICT'],
['ADJUDICATING','Đang phân xử',null,'IN_PROGRESS'],['NEEDS_MORE_INFO','Cần bổ sung thông tin',null,'NEEDS_MORE_INFO'],
['INCLUDED','Được chấp nhận',null,'COMPLETED'],['EXCLUDED','Đã loại',null,'COMPLETED'],['BACKGROUND','Tài liệu nền']];
function Fixture(){const [dark,setDark]=React.useState(false);React.useEffect(()=>{document.documentElement.classList.toggle('dark',dark)},[dark]);
return h('main',{style:{maxWidth:1100,padding:'24px 16px',margin:'auto'}},h('h1',{style:{fontWeight:650,fontSize:24}},'Quy tắc màu trạng thái'),h('p',{className:'text-sm text-muted-foreground mb-4'},'Dữ liệu giả lập để so sánh component thực tế, không ghi vào Project.'),
h('button',{onClick:()=>setDark(!dark),className:'border rounded px-3 py-2 mb-4'},dark?'Giao diện sáng':'Giao diện tối'),
h('div',{style:{display:'grid',gap:16}},states.map(([status,label,classification,caseStatus],index)=>{
 const paper={paperId:String(index),roundId:String(index),title:label,roundNumber:1,phase:'TITLE_ABSTRACT',status,classification,caseStatus,completed:index<2?index:2,required:2};
 const round={status,classification,settings:{},adjudicationCase:caseStatus?{status:caseStatus}:null,extractionReady:status==='INCLUDED'};
 const evaluation={...paper,myDecision:'INCLUDE',groupStatus:status};
 return h('section',{key:index,'data-scenario':status+'-'+(classification??caseStatus??''),className:'grid gap-3 border-b pb-4 md:grid-cols-2'},
 h(WorkPaperCard,{paper,status:label,tone:workPaperTone(paper),onOpen:()=>{},actions:h('span',{className:'text-xs text-muted-foreground'},'Xem bài báo')},h(EvaluationSummary,{item:evaluation,paper})),
 h('div',{className:'flex flex-col items-start justify-center gap-3'},h('p',{className:'text-xs text-muted-foreground'},'Chi tiết vòng · Tôi đã đề xuất · Thư viện'),
 ...['screening-state','proposal-preview','library-selection-state'].map((className,i)=>h(ScreeningStatus,{key:i,status,round,className}))))}))) }
createRoot(document.getElementById('root')).render(h(Fixture));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8096, strictPort: true, open: false }, plugins: [{ name: "screening-status-preview", configureServer(vite) {
  vite.middlewares.use(async (req,res,next)=>{
    if(req.url?.startsWith('/api/')){res.statusCode=403;res.end('Fixture has no live API');return;}
    if(req.url?.split('?')[0]!=='/__statuses.html')return next();
    res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__statuses.html',html));
  });
} }] });
await server.listen();console.log('Screening status fixture: http://127.0.0.1:8096/__statuses.html');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
