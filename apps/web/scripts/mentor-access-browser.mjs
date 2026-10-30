import { createServer } from "vite";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Visual/component smoke test. API fixtures never contact the application DB.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../../../docs/audits/2026-10-28-mentor-access/", import.meta.url));
await mkdir(output, { recursive: true });
process.chdir(root);
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { MemoryRouter } from 'react-router-dom';
import { MentorAccessWorkspace } from '/src/features/projects/components/mentor-access-workspace.tsx';
import { useAuthStore } from '/src/stores/auth-store.ts'; import '/src/theme/globals.css';
import { I18nProvider } from '/src/i18n/index.tsx';
useAuthStore.setState({user:{id:'owner'}});
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(MemoryRouter,null,React.createElement('main',{style:{maxWidth:'1000px',padding:'24px',margin:'0 auto'}},React.createElement(MentorAccessWorkspace,{projectId:'project'}))))));
</script></body></html>`;
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{ name: "mentor-visual-test", configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url?.split("?")[0] !== "/__mentor-preview.html") return next(); res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml("/__mentor-preview.html", html)); }); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const failures = []; page.on("pageerror", error => { failures.push(error.message); console.error(error.message); });
  const policy = { id: "access", requestId: "request", relationshipId: "relationship", version: 2, preset: "ADVISOR", permissions: ["MANUSCRIPTS_VIEW", "MANUSCRIPTS_COMMENT", "MENTOR_CHAT"], expiresAt: "2026-12-30T17:00:00Z", revokedAt: null, effective: true };
  const resource = { id: "abstract", kind: "MANUSCRIPT", resourceId: "manuscript", sectionKey: "abstract", title: "Tóm tắt: Đánh giá phương pháp học tập", createdAt: "2026-10-28T08:00:00Z", revokedAt: null };
  const workspace = { viewerId: "owner", projectId: "project", title: "Nghiên cứu phương pháp học tập", canManage: true, readOnly: false, page: 1, pageSize: 20, total: 1, hasNext: false, policies: [{ policy, mentorId: "mentor", mentorName: "TS. Nguyễn Minh Anh", invitationState: "ACCEPTED", shares: [resource] }] };
  let revoked = false;
  await page.route(/\/projects\/project\/mentor-access(?:[/?]|$)/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (revoked) return route.fulfill({ status: 403, json: { success: false, error: { message: "Quyền truy cập đã thay đổi" } } });
    const data = path.endsWith("/mentor-access") || path.endsWith("/mentor-access/") ? workspace : path.endsWith("/shares/abstract") ? { ...resource, content: "Nghiên cứu đánh giá mức độ hiệu quả của phương pháp học tập cộng tác. Phần tóm tắt này đã được nhóm duyệt để trao đổi với cố vấn." } : { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
    return route.fulfill({ json: { success: true, data } });
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/__mentor-preview.html`);
  await page.getByRole("heading", { name: "Quyền và cộng tác với cố vấn" }).waitFor();
  await page.getByText("Phần bản thảo · Tóm tắt:", { exact: false }).click();
  await page.getByText("Nghiên cứu đánh giá mức độ hiệu quả", { exact: false }).waitFor();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Cấu hình quyền và chia sẻ" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: `${output}/permissions.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), "Mobile view overflows horizontally");
  revoked = true;
  await page.getByRole("heading", { name: "Không gian cố vấn chưa khả dụng" }).waitFor({ timeout: 12000 });
  assert.equal(await page.getByText(resource.title, { exact: true }).count(), 0);
  assert.deepEqual(failures, []);
  console.log("Mentor browser checks passed: desktop, mobile, permissions, lazy section loading and revoked access.");
} finally { await browser.close(); await server.close(); }
