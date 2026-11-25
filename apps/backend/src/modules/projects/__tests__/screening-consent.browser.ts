import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect as baseExpect } from "@playwright/test";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { authService } from "../../auth/auth.service.js";

const expect = baseExpect.configure({ timeout: 20000 });

/** Full app, signed sessions, real API and a freshly migrated, isolated PostgreSQL database. */
export async function screeningConsentBrowser(db: PrismaClient, input: {
  projectId: string; roundId: string; paperId: string; owner: string; a: string; b: string; stranger: string;
}) {
  const output = resolve(process.cwd(), "../../docs/audits/2026-11-22-screening-consent");
  await mkdir(output, { recursive: true });
  const tokens = new Map<string, string>(), errors: string[] = [], steps: string[] = [];
  const network: Array<{ url: string; status: number }> = [];
  const matrix: Array<{ actor: string; method: string; endpoint: string; status: number }> = [];
  for (const userId of [input.owner, input.a, input.b, input.stranger]) {
    const sessionId = randomUUID();
    await db.refreshToken.create({ data: { userId, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    tokens.set(userId, tokenService.signAccessToken({ sub: userId, systemRole: "USER", sessionId }).token);
  }
  const { createApp } = await import("../../../app.js");
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const route = `/projects/${input.projectId}/research/screening-v2/rounds/${input.roundId}`;
  const api = async (actor: string, endpoint: string, status: number, body?: unknown) => {
    const response = await fetch(base + "/api/v1" + endpoint, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + tokens.get(actor), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    matrix.push({ actor: actor === input.stranger ? "outsider" : actor === input.owner ? "owner" : "reviewer", method: body ? "POST" : "GET", endpoint, status: response.status });
    expect(response.status, await response.text()).toBe(status);
  };
  const webRoot = resolve(process.cwd(), "../web");
  const { createServer } = await import("vite");
  const tailwind = (await import("tailwindcss")).default, autoprefixer = (await import("autoprefixer")).default;
  const config = (await import(pathToFileURL(resolve(webRoot, "tailwind.config.js")).href)).default;
  const vite = await createServer({ root: webRoot, configFile: resolve(webRoot, "vite.config.ts"), cacheDir: resolve(webRoot, ".cache/screening-consent-vite"), css: { postcss: { plugins: [tailwind({ ...config, content: [`${webRoot}/index.html`, `${webRoot}/src/**/*.{ts,tsx}`] }), autoprefixer()] } }, server: { host: "127.0.0.1", port: 13109, strictPort: true, proxy: { "/api": { target: base, changeOrigin: true, ws: true } } } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await api(input.stranger, route, 404);
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: input.roundId } });
    await api(input.owner, route + "/agreement", 403, { expectedVersion: row.version, decision: "CLOSED_UNRESOLVED", reason: "Owner cannot decide for the reviewers", confirmed: true, clientKey: randomUUID() });
    await api(input.a, route.replace(input.projectId, randomUUID()), 404);
    steps.push("Actual API rejects outsider, cross-project round and unassigned owner actions");
    await vite.listen(); browser = await chromium.launch({ headless: true });
    const setup = async (actor: string) => {
      const context = await browser!.newContext({ viewport: { width: 1440, height: 960 } });
      const user = await authService.me(actor);
      await context.addInitScript(({ user, token }) => { localStorage.setItem("trend-auth", JSON.stringify({ version: 1, state: { user, tokens: { accessToken: token, refreshToken: "isolated-test-only" } } })); localStorage.setItem("LumiGap.uiLanguage", "vi"); }, { user, token: tokens.get(actor)! });
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror", e => errors.push(e.message)); page.on("response", response => { if (response.url().includes("/api/") || response.status() >= 400) network.push({ url: response.url(), status: response.status() }); }); return page;
    };
    const a = await setup(input.a), b = await setup(input.b), owner = await setup(input.owner);
    const location = `http://127.0.0.1:13109/projects/${input.projectId}?tab=papers&view=my-work&round=${input.roundId}&section=discussion&paper=${input.paperId}`;
    try {
      await a.goto(location, { waitUntil: "domcontentloaded", timeout: 60000 });
      const conflict = a.locator(".screening-conflict-container"); await conflict.waitFor({ state: "visible", timeout: 90000 });
      for (const [name, width, height] of [["desktop", 1440, 960], ["tablet", 1024, 768], ["mobile", 390, 844]] as const) {
        await a.setViewportSize({ width, height });
        await conflict.evaluate(el => el.scrollIntoView({ block: "start" }));
        expect(await conflict.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await a.screenshot({ path: resolve(output, `conflict-${name}.png`), fullPage: false, animations: "disabled" });
      }
      await a.evaluate("document.documentElement.classList.add('dark')");
      await a.screenshot({ path: resolve(output, "conflict-mobile-dark.png"), fullPage: false, animations: "disabled" });
      await a.evaluate("document.documentElement.classList.remove('dark')"); await a.setViewportSize({ width: 1440, height: 960 });
      await conflict.locator(".screening-discussion textarea").fill("Cùng đối chiếu phương pháp nghiên cứu và phạm vi dữ liệu.");
      await conflict.getByRole("button", { name: "Gửi bình luận", exact: true }).click();
      await expect.poll(() => db.screeningAudit.count({ where: { roundId: input.roundId, type: "DISCUSSION" } })).toBe(1);
      steps.push("Original discussion stores the message against the correct paper and round");
      await conflict.getByRole("button", { name: "Đề nghị kết thúc do không đạt đồng thuận", exact: true }).click();
      const dialog = a.getByRole("dialog", { name: "Đề nghị kết thúc đánh giá", exact: true });
      const reason = "Chưa thống nhất về khả năng áp dụng dữ liệu sau khi cùng đối chiếu tiêu chí. ".repeat(5);
      await dialog.getByRole("textbox", { name: "Lý do chưa thể thống nhất" }).fill(reason);
      await a.setViewportSize({ width: 390, height: 844 });
      await a.screenshot({ path: resolve(output, "closure-dialog-mobile.png"), fullPage: false, animations: "disabled" });
      let fail = true;
      await a.route("**/agreement", async request => { if (fail && request.request().method() === "POST") { fail = false; await request.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "UNAVAILABLE", message: "Kiểm tra khôi phục bản nháp" } }) }); } else await request.continue(); });
      await dialog.getByRole("button", { name: "Gửi đề nghị", exact: true }).click(); await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(dialog.getByRole("textbox")).toHaveValue(reason);
      await dialog.getByRole("button", { name: "Gửi đề nghị", exact: true }).click(); await expect(dialog).toHaveCount(0);
      await a.unroute("**/agreement");
      await expect(conflict.getByText("Chờ xác nhận kết thúc", { exact: true })).toBeVisible();
      await expect(conflict.getByRole("button", { name: "Đồng ý kết thúc", exact: true })).toHaveCount(0);
      const pendingEvent = await db.screeningAudit.findFirstOrThrow({ where: { roundId: input.roundId, type: "AGREEMENT_PROPOSED" } });
      const currentRound = await db.screeningRound.findUniqueOrThrow({ where: { id: input.roundId } });
      const responsePayload = { expectedVersion: currentRound.version, proposalId: (pendingEvent.details as { proposalId: string }).proposalId, confirmed: true, clientKey: randomUUID() };
      await api(input.a, route + "/agreement/confirm", 409, responsePayload);
      await api(input.owner, route + "/agreement/confirm", 403, { ...responsePayload, clientKey: randomUUID() });
      await api(input.stranger, route + "/agreement/confirm", 404, { ...responsePayload, clientKey: randomUUID() });
      await b.goto(location, { waitUntil: "domcontentloaded", timeout: 60000 });
      await expect(b.getByRole("button", { name: "Đồng ý kết thúc", exact: true })).toBeVisible();
      await b.screenshot({ path: resolve(output, "recipient-pending-confirmation.png"), fullPage: false, animations: "disabled" });
      await b.setViewportSize({ width: 390, height: 844 });
      const pendingPanel = b.getByRole("region", { name: "Đề nghị kết thúc đánh giá", exact: true });
      await pendingPanel.scrollIntoViewIfNeeded();
      expect(await pendingPanel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await b.evaluate("document.documentElement.classList.add('dark')");
      await b.screenshot({ path: resolve(output, "pending-confirmation-mobile-dark.png"), fullPage: false, animations: "disabled" });
      await b.evaluate("document.documentElement.classList.remove('dark')"); await b.setViewportSize({ width: 1440, height: 960 });
      await b.getByRole("button", { name: "Tiếp tục thảo luận", exact: true }).click();
      await expect.poll(() => db.screeningAudit.count({ where: { roundId: input.roundId, type: "AGREEMENT_DECLINED" } })).toBe(1);
      await a.reload(); await expect(a.getByRole("button", { name: "Đề nghị kết thúc do không đạt đồng thuận", exact: true })).toBeVisible();
      await a.getByRole("button", { name: "Đề nghị kết thúc do không đạt đồng thuận", exact: true }).click();
      await dialog.getByRole("textbox").fill(reason); await dialog.getByRole("button", { name: "Gửi đề nghị", exact: true }).click(); await expect(dialog).toHaveCount(0);
      await b.reload(); await b.getByRole("button", { name: "Đồng ý kết thúc", exact: true }).click();
      await expect.poll(async () => (await db.screeningRound.findUniqueOrThrow({ where: { id: input.roundId } })).status).toBe("CLOSED_UNRESOLVED");
      await expect(b.locator('[data-screening-section="closed-unresolved"]')).toBeVisible();
      await b.screenshot({ path: resolve(output, "closed-without-consensus-desktop.png"), fullPage: false, animations: "disabled" });
      await b.setViewportSize({ width: 390, height: 844 });
      const closedPanel = b.locator('[data-screening-section="closed-unresolved"]');
      await closedPanel.evaluate(el => el.scrollIntoView({ block: "start" }));
      expect(await closedPanel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await b.screenshot({ path: resolve(output, "closed-without-consensus-mobile.png"), fullPage: false, animations: "disabled" });
      steps.push("Sender proposes; recipient rejects, then accepts a fresh proposal; closure is distinct from exclusion");
      await owner.goto(location, { waitUntil: "domcontentloaded", timeout: 60000 });
      await owner.getByRole("button", { name: "Đánh giá lại", exact: true }).click();
      const rescreen = owner.getByRole("dialog", { name: "Đánh giá lại bài báo", exact: true });
      await owner.setViewportSize({ width: 390, height: 844 });
      await expect(rescreen).toBeVisible();
      expect(await rescreen.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await owner.screenshot({ path: resolve(output, "rescreen-dialog-mobile.png"), fullPage: false, animations: "disabled" });
      await owner.setViewportSize({ width: 1440, height: 960 });
      await rescreen.getByRole("textbox").fill("Đã tìm được nguồn toàn văn mới, nhóm cần kiểm tra lại phạm vi nghiên cứu.");
      await rescreen.getByRole("button", { name: "Bắt đầu đánh giá lại", exact: true }).click(); await expect(rescreen).toHaveCount(0);
      await expect(owner.getByRole("status", { name: "Thông tin đánh giá lại", exact: true })).toBeVisible();
      await owner.screenshot({ path: resolve(output, "rescreening-desktop.png"), fullPage: false, animations: "disabled" });
      await owner.setViewportSize({ width: 390, height: 844 });
      const banner = owner.getByRole("status", { name: "Thông tin đánh giá lại", exact: true });
      await banner.scrollIntoViewIfNeeded();
      expect(await banner.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await owner.screenshot({ path: resolve(output, "rescreening-mobile.png"), fullPage: false, animations: "disabled" });
      expect(await db.screeningRound.count({ where: { projectId: input.projectId, paperId: input.paperId } })).toBe(2);
      expect(await db.screeningReview.count({ where: { projectId: input.projectId } })).toBe(2);
      steps.push("Owner opens a fresh attempt from the result; URL and page show the new round and retain original ballots");
      expect(errors).toEqual([]);
    } catch (error) {
      await a.screenshot({ path: resolve(output, "failure-a.png"), fullPage: true }).catch(() => {});
      await b.screenshot({ path: resolve(output, "failure-b.png"), fullPage: true }).catch(() => {});
      await writeFile(resolve(output, "failure-dom.html"), await a.content());
      await writeFile(resolve(output, "failure-ui.txt"), (await a.locator("body").innerText()) + "\n\nREVIEWER B\n" + (await b.locator("body").innerText())); throw error;
    }
  } finally {
    await writeFile(resolve(output, "browser-results.json"), JSON.stringify({ source: "Complete application + signed sessions + real PostgreSQL", steps, errors, matrix, network }, null, 2) + "\n");
    await browser?.close(); await vite.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
