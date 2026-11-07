import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Isolated visual fixture. Every API request is mocked or blocked.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter, Link, useSearchParams } from 'react-router-dom';
import { ProjectDiscussionPanel } from '/src/features/projects/components/project-discussion-panel.tsx';
import { MentorAccessWorkspace } from '/src/features/projects/components/mentor-access-workspace.tsx';
import { mentorAccessApi } from '/src/features/projects/api/mentor-access.api.ts';
import { I18nProvider } from '/src/i18n/index.tsx'; import { useAuthStore } from '/src/stores/auth-store.ts'; import '/src/theme/globals.css';
localStorage.setItem('lumigap.uiLanguage','vi');useAuthStore.setState({user:{id:'preview-owner',fullName:'Nhóm nghiên cứu'}});
const policy={requestId:'preview-request',relationshipId:'preview-relationship',version:1,preset:'ADVISOR',permissions:['MENTOR_CHAT','PAPERS_VIEW','PAPERS_COMMENT'],expiresAt:null,revokedAt:null,effective:true};
const workspace={viewerId:'preview-owner',projectId:'preview',title:'Đánh giá mô hình ngôn ngữ trong hỗ trợ nghiên cứu',canManage:true,readOnly:false,page:1,pageSize:10,total:2,hasNext:false,policies:[{policy:{...policy,id:'access-an'},mentorId:'an',mentorName:'TS. Nguyễn Minh An',invitationState:'ACCEPTED',shares:[]},{policy:{...policy,id:'access-binh'},mentorId:'binh',mentorName:'TS. Trần Ngọc Bình',invitationState:'ACCEPTED',shares:[]}]};
const feedback={ 'access-an':[{id:'preview-message',authorId:'an',authorName:'TS. Nguyễn Minh An',mentor:true,shareId:null,replyToId:null,kind:'MESSAGE',body:'Nhóm nên làm rõ cách chọn tập dữ liệu và tiêu chí đánh giá. Các em có thể gửi bản tóm tắt phương pháp để thầy góp ý trước buổi họp tới.',creditRoles:[],status:'PENDING',version:1,handledById:null,handledAt:null,response:'',createdAt:'2026-11-01T02:00:00Z'}], 'access-binh':[] };
const empty={items:[],total:0,page:1,pageSize:10,hasNext:false};
mentorAccessApi.workspace=async()=>workspace;mentorAccessApi.feedback=async(_p,id)=>({...empty,items:feedback[id]??[],total:feedback[id]?.length??0});mentorAccessApi.history=async()=>empty;mentorAccessApi.agreements=async()=>empty;
mentorAccessApi.comment=async(_p,id,input)=>{feedback[id].push({...feedback['access-an'][0],...input,id:crypto.randomUUID(),authorId:'preview-owner',authorName:'Nhóm nghiên cứu',mentor:false,createdAt:new Date().toISOString()});return {id:'preview-sent'};};
function Preview(){const [params]=useSearchParams();return React.createElement('main',{style:{maxWidth:'1050px',margin:'0 auto',padding:'24px 16px'}},React.createElement('p',{style:{fontSize:'12px',marginBottom:'12px',color:'hsl(var(--muted-foreground))'}},'Bản xem thử · dữ liệu giả lập · không gửi phản hồi thật'),React.createElement('nav',{style:{display:'flex',flexWrap:'wrap',gap:'20px',marginBottom:'24px'}},React.createElement(Link,{to:'/projects/preview?tab=chat&channel=mentors',style:{color:'hsl(var(--primary))'}},'Trò chuyện nhóm và AI'),React.createElement(Link,{to:'/projects/preview?tab=support',style:{color:'hsl(var(--primary))'}},'Tìm cố vấn / Quản lý quyền')),params.get('tab')==='support'?React.createElement(MentorAccessWorkspace,{projectId:'preview'}):React.createElement(ProjectDiscussionPanel,{projectId:'preview',paperCount:3}));}
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/projects/preview?tab=chat&channel=mentors']},React.createElement(Preview)))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8092, strictPort: true, open: false }, plugins: [{ name: "mentor-conversation-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture: API disabled"); return; }
    if (req.url?.split("?")[0] !== "/__mentor-conversation.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__mentor-conversation.html", html));
  });
} }] });
await server.listen(); console.log("Mentor conversation fixture: http://127.0.0.1:8092/__mentor-conversation.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
