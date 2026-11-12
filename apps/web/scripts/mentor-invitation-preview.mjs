import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Local visual fixture. No real account, invitation or project is modified.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom';
import { MentorshipList } from '/src/pages/academics/academic-support.tsx';
import { academicSupportApi } from '/src/features/projects/api/academic-support.api.ts';
import { I18nProvider } from '/src/i18n/index.tsx'; import { useAuthStore } from '/src/stores/auth-store.ts';
import '/src/theme/globals.css';
localStorage.setItem('lumigap.uiLanguage','vi');
useAuthStore.setState({user:{id:'preview-mentor'}});
const project={id:'preview-project',title:'Ứng dụng mô hình ngôn ngữ lớn trong hỗ trợ nghiên cứu khoa học của sinh viên',summary:'Nghiên cứu tìm hiểu khả năng ứng dụng các mô hình ngôn ngữ lớn vào tìm kiếm, phân tích tài liệu và cộng tác nghiên cứu. Nhóm dự kiến so sánh kết quả với quy trình thủ công, đánh giá độ chính xác và khảo sát trải nghiệm của sinh viên.',researchAreas:['Artificial Intelligence'],expertise:['Experimental Design'],mentoringNeeds:'Góp ý phương pháp nghiên cứu và đánh giá tính khả thi.',stage:'PLANNING',discovery:'CLOSED',teamMemberCount:4};
const item={kind:'REQUEST',id:'preview-invitation',projectId:project.id,project,mentorRole:'PRIMARY',mentorUser:{_id:'preview-mentor',fullName:'Giảng viên xem trước'},requestedBy:{_id:'preview-owner',fullName:'Nguyễn Minh An',academicRole:'STUDENT',institutionName:'Nhóm nghiên cứu sinh viên'},direction:'PROJECT_TO_LECTURER',status:'PENDING',message:'Nhờ giảng viên góp ý về thiết kế thực nghiệm và phản biện bản thảo trước khi công bố.',attachments:[],expiresAt:'2026-11-07T12:00:00Z',actions:{accept:true,decline:true,cancel:false,openProject:false,end:false},accessPolicy:{id:'preview-access',requestId:'preview-invitation',relationshipId:null,version:1,preset:'ADVISOR',permissions:['MENTOR_CHAT'],expiresAt:null,revokedAt:null,effective:false}};
function PreviewFlow(){
  const [current,setCurrent]=React.useState(item);
  academicSupportApi.requestDetail=async()=>({...current,previewToken:'b'.repeat(64),accessPolicy:{...current.accessPolicy,version:2}});
  academicSupportApi.respond=async(_item,kind,note)=>{const updated={...current,status:kind==='accept'?'ACCEPTED':'DECLINED',responseNote:note,actions:{...current.actions,accept:false,decline:false}};setCurrent(updated);return updated;};
  return React.createElement(MentorshipList,{items:[current]});
}
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement('main',{style:{maxWidth:'840px',padding:'24px',margin:'0 auto'}},React.createElement('p',{style:{marginBottom:'16px',fontSize:'12px'}},'Bản xem trước với dữ liệu giả lập'),React.createElement(PreviewFlow))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "mentor-invitation-visual-fixture", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ success: false, error: { message: "Visual fixture: actions are disabled" } })); return; }
    if (req.url?.split("?")[0] !== "/__mentor-invitation.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__mentor-invitation.html", html));
  });
} }] });
await server.listen();
console.log("Mentor invitation fixture: http://127.0.0.1:8091/__mentor-invitation.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
