import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Local-only fixture: every API used here is replaced; /api requests are blocked.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom';
import { MentorRecruitmentPlan } from '/src/features/projects/components/mentor-recruitment-plan.tsx';
import { ConsentComposer } from '/src/pages/academics/academic-support.tsx';
import { academicSupportApi } from '/src/features/projects/api/academic-support.api.ts';
import { I18nProvider } from '/src/i18n/index.tsx'; import { useAuthStore } from '/src/stores/auth-store.ts';
import '/src/theme/globals.css';
localStorage.setItem('lumigap.uiLanguage','vi'); useAuthStore.setState({user:{id:'preview-owner'}});
const project={id:'preview-project',title:'Đánh giá mô hình ngôn ngữ trong hỗ trợ nghiên cứu sinh viên',summary:'Nghiên cứu so sánh các phương pháp đánh giá mô hình ngôn ngữ, đo độ chính xác và khảo sát trải nghiệm của sinh viên.',researchAreas:['Artificial Intelligence'],expertise:['Experimental Design'],mentoringNeeds:'Góp ý thiết kế nghiên cứu và đánh giá thực nghiệm.',stage:'PLANNING',discovery:'CLOSED',teamMemberCount:4};
let plan={id:'preview-plan',version:3,parallelInvitations:true,autoSend:false,closedRoles:[],canManage:true,currentMentors:[],currentInvitations:[{mentorRole:'PRIMARY',fullName:'PGS. Nguyễn Minh An'}],positions:{PRIMARY:{role:'PRIMARY',status:'INVITING',pendingRequests:1},SECONDARY:{role:'SECONDARY',status:'VACANT',pendingRequests:0}},candidates:[
{id:'a',mentorUserId:'lecturer-a',fullName:'PGS. Nguyễn Minh An',mentorRole:'PRIMARY',priority:1,status:'PENDING',requestId:'preview-request',canSend:false},
{id:'c',mentorUserId:'lecturer-c',fullName:'TS. Lê Hoàng Cường',mentorRole:'PRIMARY',priority:2,status:'PLANNED',canSend:false},
{id:'b',mentorUserId:'lecturer-b',fullName:'TS. Trần Ngọc Bình',mentorRole:'SECONDARY',priority:1,status:'READY',canSend:true},
{id:'d',mentorUserId:'lecturer-d',fullName:'TS. Phạm Thu Dung',mentorRole:'SECONDARY',priority:2,status:'PLANNED',canSend:false}]};
academicSupportApi.plan=async()=>plan;
academicSupportApi.changePlan=async(_id,input)=>{if(input.expectedVersion!==plan.version)throw Error('Stale fixture');plan={...plan,version:plan.version+1};if(input.action==='configure')plan.parallelInvitations=input.parallelInvitations;if(input.action==='restart')plan={...plan,candidates:[],currentInvitations:[],closedRoles:[]};if(input.action==='remove')plan.candidates=plan.candidates.filter(c=>c.id!==input.candidateId);return plan;};
academicSupportApi.list=async()=>({requests:[],relationships:[],counts:{pending:1,active:0,incoming:0},positions:plan.positions,policy:{maxActiveMentors:2,maxPendingRequests:2,maxPendingPerRole:1,expiryDays:14},requestMeta:{page:1,pageSize:10,total:0,totalPages:0},relationshipMeta:{page:1,pageSize:10,total:0,totalPages:0}});
academicSupportApi.settings=async()=>({...project,version:1,previewToken:'a'.repeat(64),invitationSender:{_id:'preview-owner',fullName:'Nguyễn Hoài Nam',academicRole:'STUDENT'}});
academicSupportApi.draft=async()=>({message:'',mentorRole:'SECONDARY',attachments:[],version:0});
academicSupportApi.saveDraft=async(_id,_direction,input)=>({...input,attachments:[],version:input.expectedVersion+1});
academicSupportApi.request=async()=>{throw {response:{data:{error:{message:'Bản xem thử không gửi lời mời thật.'}}}}};
function Preview(){const [selected,setSelected]=React.useState();return React.createElement(React.Fragment,null,React.createElement(MentorRecruitmentPlan,{projectId:project.id,onSend:(candidate,version)=>setSelected({candidate,version})}),selected&&React.createElement(ConsentComposer,{project,mentor:{_id:selected.candidate.mentorUserId,fullName:selected.candidate.fullName},planned:selected,onClose:()=>setSelected(undefined)}));}
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement('main',{style:{maxWidth:'1120px',padding:'24px',margin:'0 auto'}},React.createElement('p',{style:{marginBottom:'16px',fontSize:'12px'}},'Bản xem thử · dữ liệu giả lập · không gửi lời mời thật'),React.createElement(Preview))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "mentor-plan-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Local fixture: API disabled"); return; }
    if (req.url?.split("?")[0] !== "/__mentor-plan.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__mentor-plan.html", html));
  });
} }] });
await server.listen(); console.log("Mentor plan fixture: http://127.0.0.1:8091/__mentor-plan.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
