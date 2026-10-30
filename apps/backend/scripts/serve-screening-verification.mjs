// Full application + real PostgreSQL for manual browser verification, isolated from application data.
// Run: node --import tsx apps/backend/scripts/serve-screening-verification.mjs
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { randomUUID } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import console from "node:console";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const isolated = { ...process.env };
expand({ ...config({ path: join(root, ".env"), processEnv: isolated, quiet: true }), processEnv: isolated });
const original = new URL(isolated.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Local PostgreSQL required");
const testUrl = new URL(original); testUrl.pathname = "/lumigap_screening_workflow_v3_test";
if (testUrl.pathname === original.pathname) throw new Error("Provide the application URL; the test URL is derived separately");
Object.assign(process.env, isolated, { DATABASE_URL: testUrl.toString(), NODE_ENV: "test", LOG_LEVEL: "error", EMAIL_DELIVERY_MODE: "disabled", RATE_LIMIT_STORE: "memory", VITE_API_BASE: "/api/v1" });
const [{ createApp }, { getPrisma, disconnectPostgres }, { createProjectFixture }, { passwordService }, { screeningService }] = await Promise.all([
  import("../src/app.ts"), import("../src/infrastructure/database/prisma.ts"), import("../src/test-utils/project-fixture.ts"),
  import("../src/modules/auth/password.service.ts"), import("../src/modules/projects/screening.service.ts"),
]);
const db = getPrisma(), suffix = randomUUID(), password = randomUUID() + "A!8";
const accounts = [];
for (const [role, fullName] of [["owner", "Chủ nhóm kiểm thử"], ["member", "Thành viên kiểm thử"]]) {
  const email = `screening-${role}-${suffix}@example.org`;
  const user = await db.user.create({ data: { email, fullName, passwordHash: await passwordService.hash(password), emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
  await db.userEmail.create({ data: { userId: user.id, normalizedEmail: email, isPrimary: true, verifiedAt: new Date() } });
  await db.academicProfile.create({ data: { userId: user.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } });
  accounts.push({ id: user.id, email, role });
}
const [owner, member] = accounts;
const project = await createProjectFixture({ data: { title: "Kiểm thử workflow, nhóm hai người", ownerId: owner.id, status: "ACTIVE" } });
await db.projectMember.create({ data: { projectId: project.id, userId: member.id } });
const rounds = [];
const redesignMode = process.argv.includes("--redesign");
const libraryMode = process.argv.includes("--library") || redesignMode;
if (redesignMode) {
  const questions = [{ id: randomUUID(), text: "Quy trình có giữ riêng đánh giá của từng thành viên không?" }, { id: randomUUID(), text: "Minh chứng được truy nguyên và lưu phiên bản như thế nào?" }];
  await db.researchPlan.upsert({ where: { projectId: project.id }, create: { projectId: project.id, questions }, update: { questions } });
}
for (const simple of libraryMode ? [] : [true, false]) {
  const paper = await db.paper.create({ data: { title: simple ? "Bài kiểm thử đánh giá đơn giản" : "Bài kiểm thử bất đồng độc lập", abstractText: "Dữ liệu giả lập được đánh dấu cho kiểm thử giao diện, không phải kết quả nghiên cứu.", publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
  await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner.id, proposalReason: "Kiểm tra luồng đánh giá thực tế trên database test riêng." } });
  const { settings } = await screeningService.config(project.id, owner.id);
  await screeningService.configure(project.id, owner.id, { reviewMode: simple ? "SIMPLE" : "INDEPENDENT", blindReview: !simple, resolutionPolicy: "ADJUDICATION", requiredReviewers: simple ? 1 : 2, consensusPolicy: "UNANIMOUS", aiAssisted: false, expectedVersion: settings.version, researchQuestions: ["Workflow có hoạt động với hai thành viên không?"], inclusionCriteria: ["Đủ dữ liệu theo tiêu chí kiểm thử"], exclusionCriteria: ["Không đáp ứng tiêu chí"], clientKey: randomUUID() });
  const started = await screeningService.start(project.id, owner.id, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: randomUUID() });
  const roundId = started.roundIds[0];
  await screeningService.assign(project.id, owner.id, { roundIds: [roundId], mode: "MANUAL", reviewerIds: simple ? [member.id] : [owner.id, member.id], dueAt: null, clientKey: randomUUID() });
  if (simple) {
    const round = await screeningService.detail(project.id, owner.id, roundId);
    await screeningService.finalizer(project.id, owner.id, roundId, { finalizerId: member.id, expectedVersion: round.version, reason: "Giao thành viên chốt trong kiểm thử đơn giản", confirmed: true, clientKey: randomUUID() });
  }
  rounds.push({ simple, paperId: paper.id, roundId });
}
if (libraryMode) {
  for (const label of redesignMode ? Array.from({ length: 14 }, (_, index) => `${String(index + 1).padStart(2, "0")} · Kiểm tra luồng đọc và đánh giá`) : ["Phương pháp nghiên cứu", "Đối chiếu dữ liệu", "Phạm vi khảo sát"]) {
    const paper = await db.paper.create({ data: { title: `Tài liệu kiểm thử: ${label}`, abstractText: "Đây là dữ liệu kiểm thử workflow, không phải bài báo hoặc kết quả nghiên cứu thật. Dùng để kiểm tra ý kiến cá nhân, lựa chọn bài và snapshot phân tích với hai tài khoản.", publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner.id, proposalReason: "Dữ liệu kiểm thử thư viện cộng tác, cách ly khỏi dự án thật.", tags: ["Kiểm thử workflow"] } });
    if (redesignMode) await db.paperAuthor.create({ data: { paperId: paper.id, displayName: "Tác giả kiểm thử", position: 1 } });
    rounds.push({ paperId: paper.id });
  }
}
const web = fileURLToPath(new URL("../../web/", import.meta.url));
const backend = createApp(), app = express();
app.use((req, res, next) => req.url.startsWith("/api/") || req.url === "/health" ? backend(req, res, next) : next());
app.use(express.static(join(web, "dist")));
app.get(/.*/, (_req, res) => res.sendFile(join(web, "dist/index.html")));
const server = app.listen(4180, "127.0.0.1");
const folder = await mkdtemp(join(tmpdir(), "lumigap-screening-verification-"));
await writeFile(join(folder, "credentials.json"), JSON.stringify({ accounts, password, projectId: project.id, rounds }), { mode: 0o600 });
console.log(JSON.stringify({ url: `http://127.0.0.1:4180/projects/${project.id}?tab=papers`, credentialsFile: join(folder, "credentials.json"), database: testUrl.pathname }));
const shutdown = async () => { server.close(); await disconnectPostgres(); process.exit(0); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
