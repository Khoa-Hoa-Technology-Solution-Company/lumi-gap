import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Disposable fixture with no live API access. Both reviewers are simulated locally.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom';
import {ScreeningAgreementPanel} from '/src/features/projects/components/screening-agreement.tsx';
import {useResearchResource} from '/src/features/projects/hooks/use-project-research.ts';
import {screeningApi} from '/src/features/projects/api/screening.api.ts'; import {useAuthStore} from '/src/stores/auth-store.ts';
import '/src/theme/globals.css'; import '/src/features/projects/screening.css';
useAuthStore.setState({user:{id:'a'}});
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
let version=8, proposal=null, final=false;
const assignments=[{reviewerId:'a',name:'Reviewer A'},{reviewerId:'b',name:'Reviewer B'}];
screeningApi.detail=async()=>({id:'r',version,phase:'TITLE_ABSTRACT',settings:{workflowVersion:5},hiddenReviews:false,assignments,canProposeAgreement:!final,agreement:proposal?{...structuredClone(proposal),canDecline:!final&&proposal.proposedById!==useAuthStore.getState().user.id,canConfirm:!final&&!proposal.confirmedByIds.includes(useAuthStore.getState().user.id)}:null});
screeningApi.proposeAgreement=async(_p,_r,payload)=>{if(payload.expectedVersion!==version)throw new Error('Stale version');version++;proposal={id:'proposal-'+version,decision:payload.decision,reason:payload.reason,proposedById:useAuthStore.getState().user.id,requiredReviewerIds:['a','b'],confirmedByIds:[useAuthStore.getState().user.id],reviewIds:['one','two'],createdAt:new Date().toISOString()};return {id:proposal.id,version};};
screeningApi.confirmAgreement=async(_p,_r,payload)=>{if(payload.expectedVersion!==version||payload.proposalId!==proposal?.id)throw new Error('Stale proposal');const actor=useAuthStore.getState().user.id;if(!proposal.confirmedByIds.includes(actor))proposal.confirmedByIds.push(actor);version++;final=proposal.confirmedByIds.length===2;return {version};};
screeningApi.declineAgreement=async(_p,_r,payload)=>{if(payload.expectedVersion!==version||payload.proposalId!==proposal?.id)throw new Error('Stale proposal');version++;proposal=null;return {version};};
function App(){const actor=useAuthStore(s=>s.user.id);const query=useResearchResource('fixture',['round'],()=>screeningApi.detail());return React.createElement('main',{className:'screening-workspace mx-auto max-w-2xl space-y-4 p-5', 'data-no-i18n':true},
React.createElement('p',{className:'text-xs text-muted-foreground'},'Dữ liệu giả lập · Không thay đổi dự án thật'),
React.createElement('h1',{className:'text-xl font-semibold'},'Giải quyết bất đồng sàng lọc'),
React.createElement('p',null,'AI hỗ trợ phản hồi học tập cho sinh viên đại học'),
React.createElement('div',{className:'space-y-1 rounded-md bg-muted p-3 text-sm'},React.createElement('p',null,'Phiếu cá nhân A: Không phù hợp'),React.createElement('p',null,'Phiếu cá nhân B: Phù hợp')),
React.createElement('button',{className:'rounded border px-3 py-2 text-sm',onClick:()=>useAuthStore.setState({user:{id:actor==='a'?'b':'a'}})},'Đang là reviewer '+actor.toUpperCase()+' · Chuyển tài khoản giả lập'),
query.data?React.createElement(ScreeningAgreementPanel,{projectId:'fixture',round:query.data,readOnly:false}):null,
final?React.createElement('p',{role:'status',className:'rounded-md bg-muted p-3 text-sm'},'Đã ghi quyết định chung. Hai phiếu cá nhân được giữ nguyên.'):null);}
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client},React.createElement(MemoryRouter,null,React.createElement(App))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 8091, strictPort: true, open: false }, plugins: [{ name: "screening-agreement-preview", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/")) { res.statusCode = 403; res.end("Fixture has no live API"); return; }
    if (req.url?.split("?")[0] !== "/__agreement.html") return next();
    res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__agreement.html", html));
  });
} }] });
await server.listen();
console.log("Agreement preview: http://127.0.0.1:8091/__agreement.html");
const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
