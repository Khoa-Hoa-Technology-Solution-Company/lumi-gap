import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Disposable UI fixture: all API calls are local in-memory functions, never real project writes.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter,Routes,Route} from 'react-router-dom';
import Adjudication from '/src/features/projects/components/screening-adjudication.tsx';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import '/src/theme/globals.css';
useAuthStore.setState({user:{id:'preview-lecturer'}});
const view={version:5,status:'ADJUDICATING',canResolve:true,finalDecision:null,packet:{roundId:'r',paperId:'paper',phase:'TITLE_ABSTRACT',roundVersion:4,
paper:{title:'Mô hình ngôn ngữ lớn hỗ trợ phản hồi học tập cho sinh viên đại học',abstractText:'Nghiên cứu khảo sát hiệu quả phản hồi bằng mô hình ngôn ngữ lớn trong một học phần trực tuyến. Nhóm tác giả so sánh kết quả học tập và phản hồi của sinh viên giữa hai phương pháp, đồng thời phân tích các giới hạn của thiết kế thực nghiệm.',doi:null,publicationYear:2025},
inclusionCriteria:['Nghiên cứu thực nghiệm có đối tượng là sinh viên đại học','Có đánh giá kết quả học tập hoặc trải nghiệm học tập'],exclusionCriteria:['Bài bình luận không có dữ liệu thực nghiệm'],researchQuestions:['Phản hồi bằng AI có giúp cải thiện kết quả học tập của sinh viên?'],
reviews:[{id:'one',decision:'INCLUDE',comment:'Phương pháp có nhóm so sánh và báo cáo kết quả học tập. Đối tượng được mô tả là sinh viên của học phần.',exclusionReason:'',revision:1,scope:'TITLE_ABSTRACT',fullTextReference:null},{id:'two',decision:'EXCLUDE',comment:'Tóm tắt chưa làm rõ tất cả người tham gia có phải sinh viên đại học hay không. Cần đối chiếu tiêu chí quần thể.',exclusionReason:'Chưa xác minh đúng đối tượng nghiên cứu',revision:1,scope:'TITLE_ABSTRACT',fullTextReference:null}]}};
if(new URLSearchParams(location.search).get('mode')==='source')Object.assign(view.packet,{sourceUrl:'https://example.org/paper-original-page',researchQuestions:[],inclusionCriteria:[],exclusionCriteria:[]});
screeningApi.adjudication=async()=>structuredClone(view);
screeningApi.action=async(_project,_round,_action,payload)=>{if(payload.expectedVersion!==view.version)throw new Error('Stale fixture');view.status=payload.decision;view.canResolve=false;view.version++;view.finalDecision={decision:payload.decision,reason:payload.reason,createdAt:new Date().toISOString()};return {version:view.version};};
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/academic-support/projects/p/screening/r']},React.createElement('p',{style:{textAlign:'center',padding:'12px',fontSize:'12px'}},'Dữ liệu giả lập · Không thay đổi dự án thật'),React.createElement(Routes,null,React.createElement(Route,{path:'/academic-support/projects/:projectId/screening/:roundId',element:React.createElement(Adjudication)})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "screening-packet-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__screening.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__screening.html", html));
  });
} }] });
await server.listen();
console.log("Scoped screening preview: http://127.0.0.1:8091/__screening.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
