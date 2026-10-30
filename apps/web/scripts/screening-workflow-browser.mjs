import { createServer } from "vite";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Actual React workspace with fixture API responses, never the application database.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../../../docs/audits/2026-10-29-paper-review/", import.meta.url));
await mkdir(output, { recursive: true });
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom';
import { ScreeningWorkspace } from '/src/features/projects/components/screening-workspace.tsx';
import { useAuthStore } from '/src/stores/auth-store.ts'; import '/src/theme/globals.css'; import '/src/features/projects/project-research.css';
import { I18nProvider } from '/src/i18n/index.tsx';
useAuthStore.setState({user:{id:'owner'}});
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,{initialEntries:['/projects/project?tab=papers&source=paper']},React.createElement('main',{style:{maxWidth:'1240px',padding:'24px',margin:'0 auto'}},React.createElement(ScreeningWorkspace,{projectId:'project',readOnly:false}))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{ name: "screening-preview", configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url?.split("?")[0] !== "/__screening-preview.html") return next(); res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__screening-preview.html", html)); }); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = []; page.on("pageerror", error => failures.push(error.message));
  const people = [{ id: "owner", name: "Nguyễn Minh Anh" }, { id: "member", name: "Trần Thanh An" }];
  const settings = { version: 1, reviewMode: "SIMPLE", blindReview: false, resolutionPolicy: "ADJUDICATION", requiredReviewers: 1, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: ["Nghiên cứu về sinh viên đại học"], exclusionCriteria: ["Không có dữ liệu thực nghiệm"], researchQuestions: ["Học tập cộng tác ảnh hưởng thế nào đến kết quả nghiên cứu?"] };
  const review = { id: "review", assignmentId: "assignment", reviewerId: "member", revision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Đối tượng và phương pháp đáp ứng tiêu chí đã thống nhất.", submittedAt: "2026-10-29T02:00:00Z" };
  const round = { id: "round", paperId: "paper", number: 1, phase: "TITLE_ABSTRACT", version: 3, status: "AWAITING_FINALIZATION", active: true, settings, unblindedAt: "2026-10-29T02:00:00Z", independenceCompromised: false, assigned: 1, completed: 1, assignments: [{ id: "assignment", reviewerId: "member", name: people[1].name, revision: 1, completed: true, active: true, dueAt: null, overdue: false }], reviews: [review], myReview: null, myAssignmentId: null, hiddenReviews: false, finalDecision: null, finalizer: people[0], canReview: false, canManage: true, canFinalize: true, aiVisible: true };
  const paper = { paperId: "paper", title: "Học tập cộng tác và năng lực nghiên cứu của sinh viên đại học", abstractText: "Nghiên cứu xem xét mối liên hệ giữa việc học tập cộng tác và năng lực nghiên cứu của sinh viên. Dữ liệu được thu thập từ các nhóm nghiên cứu trong môi trường đại học, đối chiếu kết quả và kinh nghiệm làm việc nhóm theo thời gian.", doi: "10.1234/collaborative-learning", publicationYear: 2025, proposer: people[1], proposedAt: "2026-10-28T03:00:00Z", proposalReason: "Bài báo cung cấp cách đo lường phù hợp cho câu hỏi nghiên cứu thứ nhất.", updatedAt: "2026-10-29T02:00:00Z", canEditProposal: false, legacyStatus: "MAYBE", legacyProvenance: false, round };
  const board = { filters: { proposers: people, reviewers: people }, items: [paper, { ...paper, paperId: "other", title: "Khung đánh giá đóng góp trong các nhóm nghiên cứu nhỏ", round: null, legacyStatus: "UNDECIDED" }], progress: { total: 2, reviewed: 1, finalized: 0, legacy: 0 }, people, settings, canManage: true, myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 }, page: 1, pageSize: 20, total: 2, hasNext: false };
  let finalized = false;
  await page.route(/\/projects\/project\/research\/screening-v2\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/finalize")) {
      const input = request.postDataJSON(); assert.equal(input.confirmed, true); assert.equal(input.expectedVersion, 3); assert.equal(input.decision, "INCLUDED");
      finalized = true; round.status = "INCLUDED"; round.canFinalize = false; round.version = 4; round.finalDecision = { id: "final", version: 4, decision: "INCLUDED", source: "MANUAL", reason: input.reason, resolverId: "owner", createdAt: "2026-10-29T03:00:00Z" }; board.progress.finalized = 1;
      return route.fulfill({ json: { success: true, data: { roundId: "round", version: 4 } } });
    }
    const data = path.endsWith("/papers") ? board : path.endsWith("/papers/paper/rounds") ? { items: [round], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null } : path.endsWith("/rounds/round") ? round : path.endsWith("/ai") ? null : { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
    return route.fulfill({ json: { success: true, data } });
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/__screening-preview.html`);
  await page.getByText("Đã có quyết định cuối: 0/2 bài").waitFor();
  assert.equal(await page.getByText("Xác nhận mở vòng mới; kết quả cũ được giữ và trạng thái hiện tại sẽ tính lại.", { exact: true }).isVisible(), false);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.getByText("Chốt kết quả và quản lý vòng", { exact: true }).click();
  await page.getByLabel("Lý do (ít nhất 10 ký tự)", { exact: true }).fill("Đã đối chiếu dữ liệu và xác nhận bài phù hợp tiêu chí nghiên cứu.");
  await page.getByLabel("Tôi hiểu tác động và xác nhận thao tác.", { exact: true }).check();
  await page.getByRole("button", { name: "Xác nhận và lưu lịch sử", exact: true }).click();
  await page.getByRole("heading", { name: "Kết quả chính thức: Phù hợp", exact: true }).waitFor();
  assert.ok(finalized);
  await page.getByText("Đã có quyết định cuối: 1/2 bài").waitFor();
  await page.screenshot({ path: `${output}/finalized.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile view overflows horizontally");
  assert.deepEqual(failures, []);
  console.log("Screening browser checks passed: desktop, mobile, explicit finalization, updated progress, no page errors.");
} finally { await browser.close(); await server.close(); }
