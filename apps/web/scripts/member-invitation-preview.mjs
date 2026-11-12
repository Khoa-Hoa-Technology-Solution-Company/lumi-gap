import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Isolated visual fixture: no real invitations, sessions or project changes.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const inbox = process.argv.includes("--inbox");
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom';
import { ProjectsListPage } from '/src/pages/projects/projects-list.tsx';
import { ProjectTeamSettings } from '/src/features/projects/components/project-team-settings.tsx';
import { projectsApi } from '/src/features/projects/api/projects.api.ts';
import { academicSupportApi } from '/src/features/projects/api/academic-support.api.ts';
import { api } from '/src/services/api-client.ts';
import { I18nProvider } from '/src/i18n/index.tsx'; import { useAuthStore } from '/src/stores/auth-store.ts';
import '/src/theme/globals.css';
import '/src/features/projects/project-workspace.css';
localStorage.setItem('lumigap.uiLanguage','vi');
useAuthStore.setState({user:{id:'preview-owner',fullName:'Chủ dự án Demo'}});
const members=[{targetKind:'User',targetId:{_id:'preview-owner',fullName:'Chủ dự án Demo',email:'owner@lumigap.test'},role:'OWNER'}];
const project={_id:'preview-project',title:'Đánh giá tài liệu độc lập (Demo)',ownerId:'preview-owner',accessRole:'OWNER',visibility:'PRIVATE',status:'PLANNING',version:1,members,papers:[],memberCount:1,paperCount:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const invitations=[{id:'preview-pending',email:'pending@lumigap.test',invitedEmail:'pending@lumigap.test',invitedUser:{fullName:'Thành viên Demo'},projectId:'preview-project',projectTitle:project.title,role:'MEMBER',status:'PENDING',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+604800000).toISOString()}];
projectsApi.list=async()=>[project];
projectsApi.listMyInvitations=async()=>invitations;
projectsApi.respondToInvitation=async()=>{invitations.splice(0);};
projectsApi.team=async()=>({members,invitations,memberMeta:{page:1,total:members.length,totalPages:1},invitationMeta:{page:1,total:invitations.length,totalPages:1}});
projectsApi.inviteMember=async(_id,recipient)=>{invitations.push({id:'preview-invite',email:recipient.email||'member@lumigap.test',status:'PENDING',expiresAt:new Date(Date.now()+604800000).toISOString()});};
academicSupportApi.list=async()=>({relationships:[],requests:[],counts:{active:0}});
api.get=async()=>({data:{data:[]}});
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/projects/preview-project?tab=members']},React.createElement('main',{style:{maxWidth:'1060px',padding:'20px',margin:'0 auto'}},React.createElement('p',{style:{marginBottom:'16px',fontSize:'12px'}},'Giao diện kiểm thử với tài khoản và dữ liệu giả lập'),${inbox ? 'React.createElement(ProjectsListPage,{invitationsOnly:true})' : 'React.createElement(ProjectTeamSettings,{project})'})))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "member-invitation-fixture", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture blocks API requests"); return; }
    if (req.url?.split("?")[0] !== "/__member-invitation.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__member-invitation.html", html));
  });
} }] });
await server.listen();
console.log("Member invitation fixture: http://127.0.0.1:8091/__member-invitation.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
