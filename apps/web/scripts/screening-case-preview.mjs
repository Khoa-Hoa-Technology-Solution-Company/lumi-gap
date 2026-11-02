import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated visual QA: real components, in-memory fixtures, all live API calls denied.
const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kiểm thử hồ sơ phân xử</title></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter,Routes,Route} from 'react-router-dom';
import Adjudication from '/src/features/projects/components/screening-adjudication.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import '/src/theme/globals.css';
const mode=new URLSearchParams(location.search).get('mode') || 'reviewer';
const actor=mode==='reviewer'?(new URLSearchParams(location.search).get('reviewer')==='b'?'b':'a'):mode==='coordinator'?'owner':'mentor';
useAuthStore.setState({user:{id:actor}});
const now=new Date().toISOString();
const invitation={id:'invite',userId:'mentor',name:'TS. Nguyễn Minh',role:'PRIMARY_MENTOR',status:'ASSIGNED',createdAt:now,respondedAt:mode==='invited'?null:now};
const data={id:'case',version:4,packetVersion:1,active:true,status:mode==='coordinator'?'WAITING_ASSIGNMENT':mode==='reviewer'?'COLLECTING':'ASSIGNED',lockedAt:mode==='reviewer'?null:now,canStart:mode==='ready',deadline:new Date(Date.now()+48*3600000).toISOString(),ready:mode!=='reviewer',createdAt:now,requestedByIds:['a'],invitation:['coordinator','reviewer'].includes(mode)?null:invitation,invitations:['coordinator','reviewer'].includes(mode)?[]:[invitation],conflicts:[],
statements:[{reviewerId:'a',name:'Lê Anh',completed:mode==='ready',hidden:mode!=='ready'&&actor!=='a',revision:0,useExisting:mode!=='ready',text:'Bài có nhóm so sánh và báo cáo kết quả học tập. Tôi đề nghị chọn vì phù hợp câu hỏi nghiên cứu.',history:[]},{reviewerId:'b',name:'Trần Bình',completed:mode==='ready',hidden:mode!=='ready'&&actor!=='b',revision:0,useExisting:mode!=='ready',text:'Tôi chưa thấy xác nhận người tham gia là sinh viên đại học. Cần đọc toàn văn trước khi quyết định.',history:[]}],
candidates:mode==='coordinator'?[{id:'member-1',name:'Phạm Linh',role:'MEMBER'},{id:'member-2',name:'Vũ An',role:'MEMBER'}]:[],canRespond:false,canStatement:mode==='reviewer',canCoordinate:mode==='coordinator',canReport:mode==='reviewer',canResolve:mode==='ready'};
const packet={roundId:'r',paperId:'paper',phase:'TITLE_ABSTRACT',roundVersion:6,protocol:{version:3,workflowVersion:8,stages:['TITLE_ABSTRACT','FULL_TEXT'],allowConservativeFullText:false},
paper:{title:'Mô hình ngôn ngữ lớn hỗ trợ phản hồi học tập cho sinh viên đại học',abstractText:'Nghiên cứu so sánh phản hồi bằng mô hình ngôn ngữ lớn và phản hồi truyền thống trong một học phần trực tuyến. Kết quả báo cáo mức tiến bộ của người học và các giới hạn của thiết kế thực nghiệm. Cần đối chiếu quần thể nghiên cứu với tiêu chí đã đăng ký.',doi:'10.1234/example',publicationYear:2025},
inclusionCriteria:['Nghiên cứu thực nghiệm có đối tượng là sinh viên đại học','Có đánh giá kết quả hoặc trải nghiệm học tập'],exclusionCriteria:['Không đúng quần thể nghiên cứu'],researchQuestions:['Phản hồi bằng AI ảnh hưởng thế nào đến kết quả học tập của sinh viên?'],
reviews:[{id:'one',reviewerId:'a',reviewerName:'Lê Anh',decision:'INCLUDE',comment:'Có nhóm so sánh và báo cáo kết quả học tập. Quần thể được mô tả là người học của học phần.',exclusionReason:'',revision:1,scope:'TITLE_ABSTRACT',fullTextReference:null},{id:'two',reviewerId:'b',reviewerName:'Trần Bình',decision:'EXCLUDE',comment:'Tóm tắt chưa xác nhận tất cả người học là sinh viên đại học. Cần đọc mô tả người tham gia trong toàn văn.',exclusionReason:'Không đúng quần thể nghiên cứu',revision:2,scope:'TITLE_ABSTRACT',fullTextReference:null}],
allReviews:[{id:'initial-a',reviewerId:'a',revision:1,decision:'INCLUDE',comment:'Đối tượng đáp ứng tiêu chí ban đầu.',exclusionReason:'',submittedAt:now},{id:'initial-b',reviewerId:'b',revision:1,decision:'UNSURE',comment:'Chưa đủ thông tin về quần thể.',exclusionReason:'',submittedAt:now},{id:'revised-b',reviewerId:'b',revision:2,decision:'EXCLUDE',comment:'Đã đối chiếu tóm tắt sau thảo luận.',exclusionReason:'Không đúng quần thể nghiên cứu',submittedAt:now}],discussion:[{id:'discussion',actorName:'Lê Anh',comment:'Chúng ta cần đối chiếu quần thể thực tế với tiêu chí đã đăng ký.',createdAt:now}],sources:[]};
if(new URLSearchParams(location.search).has('long')){packet.reviews[1].exclusionReason='Nghiên cứu chưa xác nhận quần thể và cách lựa chọn người tham gia. '.repeat(100)+'DOI-'+ 'x'.repeat(500);}
const view={version:8,status:'ADJUDICATING',case:data,packet,thread:[],finalDecision:null,resolution:null,canResolve:data.canResolve};
const refresh=()=>{view.canResolve=data.canResolve;};
screeningApi.adjudication=async()=>structuredClone(view);
screeningApi.caseAction=async(_p,_r,payload)=>{
if(payload.action==='START'){data.status='IN_PROGRESS';data.canStart=false;}
if(payload.action==='STATEMENT'){const s=data.statements.find(s=>s.reviewerId===actor);Object.assign(s,{completed:true,hidden:false,revision:s.revision+1,text:payload.text,useExisting:payload.useExisting,submittedAt:new Date().toISOString()});}
if(payload.action==='SELECT'){data.invitation={...invitation,userId:payload.candidateId,name:data.candidates.find(c=>c.id===payload.candidateId).name,role:'MEMBER',status:'ASSIGNED'};data.invitations.push(data.invitation);data.status='ASSIGNED';}
if(payload.action==='REPORT_CONFLICT'){data.status='COI_REVIEW';data.conflicts.push({id:'report',reason:payload.reason,resolvedAt:null,resolution:null,upheld:null});data.canReport=false;data.canResolve=false;}
data.version++;refresh();return {version:data.version};};
screeningApi.action=async(_p,_r,_action,payload)=>{if(payload.expectedVersion!==view.version||payload.expectedCaseVersion!==data.version)throw new Error('Phiên bản đã thay đổi');view.status=payload.decision;data.status='COMPLETED';data.active=false;data.canResolve=false;view.canResolve=false;view.version++;view.finalDecision={decision:payload.decision,reason:payload.reason,exclusionReason:payload.exclusionReason,sourceMaterial:payload.sourceMaterial,resolverName:'TS. Nguyễn Minh',createdAt:new Date().toISOString()};return {version:view.version};};
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/academic-support/projects/p/screening/r']},React.createElement('nav',{style:{padding:'12px',textAlign:'center',fontSize:'13px'}},'Kiểm thử với dữ liệu giả lập · ',...['reviewer','ready','coordinator'].map(m=>React.createElement('a',{key:m,href:'?mode='+m,style:{margin:'0 8px',textDecoration:'underline'}},m))),React.createElement(Routes,null,React.createElement(Route,{path:'/academic-support/projects/:projectId/screening/:roundId',element:React.createElement(Adjudication)})))));
</script></body></html>`;
const server = await createServer({ root, cacheDir: join(tmpdir(), "lumigap-case-preview-vite"), configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8092, strictPort: true, open: false }, plugins: [{ name: "screening-case-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__case.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__case.html", html));
  });
} }] });
await server.listen();
console.log("Isolated case preview: http://127.0.0.1:8092/__case.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
