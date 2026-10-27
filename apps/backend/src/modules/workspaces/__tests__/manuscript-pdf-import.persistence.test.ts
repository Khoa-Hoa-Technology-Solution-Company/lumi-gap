import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const queue = vi.hoisted(() => ({ jobs: new Map<string, any>() }));
vi.mock("../../../infrastructure/queue.js", () => ({
  notificationQueue: { add: vi.fn() },
  aiJobsQueue: {
    getJob: async (id: string) => queue.jobs.get(id),
    add: async (name: string, data: unknown, options: { jobId: string }) => {
      if (!queue.jobs.has(options.jobId)) { const job = { id: options.jobId, name, data, state: "waiting", progress: {}, getState: async () => job.state, updateProgress: async (progress: unknown) => { job.progress = progress; } }; queue.jobs.set(job.id, job); }
      return queue.jobs.get(options.jobId);
    },
  },
}));
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { redis } from "../../../infrastructure/redis.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptPdfImport as service } from "../manuscript-pdf-import.js";
import { manuscriptService } from "../manuscript.service.js";
import { sourceText } from "../manuscript-source.js";
import * as compiler from "../manuscript-compiler.js";
import * as quality from "../manuscript-pdf-quality.js";

const enabled = process.env.PDF_IMPORT_INTEGRATION === "1";
function syntheticPdf(structured = false, pageCount = 2) {
  const stream = "0.2 0.5 0.7 rg 40 500 200 2 re f\nBT /F1 12 Tf 50 650 Td (Research results: 50% & 2_3. {Keep} #1 $5) Tj ET" + (structured ? "\n0 0 0 RG 50 450 m 450 450 l S 50 420 m 450 420 l S 50 390 m 450 390 l S 50 390 m 50 450 l S 250 390 m 250 450 l S 450 390 m 450 450 l S\nBT /F1 12 Tf 60 430 Td (Metric) Tj ET\nBT /F1 12 Tf 260 430 Td (Value) Tj ET\nBT /F1 12 Tf 60 400 Td (Accuracy) Tj ET\nBT /F1 12 Tf 260 400 Td (92.5%) Tj ET" : "");
  const pages = Array.from({ length: pageCount }, (_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages}] /Count ${pageCount} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let index = 0; index < pageCount; index++) objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${index === 0 ? "612 792" : "500 700"}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  );
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
describe.runIf(enabled).sequential("PDF conversion persistence and authorization", () => {
  const db = getPrisma();
  let owner: string, member: string, outsider: string, project: string, source: Buffer;
  const ids: string[] = [];
  beforeAll(async () => {
    if (!/^\/codex_github_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Disposable database required");
    for (const name of ["PDF owner", "PDF member", "PDF outsider"]) {
      const user = await db.user.create({ data: { email: `${randomUUID()}@pdf.invalid`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" } });
      if (!owner) owner = user.id; else if (!member) member = user.id; else outsider = user.id;
    }
    project = (await createProjectFixture({ data: { title: "PDF conversion", ownerId: owner, status: "ACTIVE" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
    source = syntheticPdf();
  });
  afterAll(async () => { for (const id of ids) await redis.del(...["source", "result", "error", "preview-pdf"].map(kind => `manuscript-pdf:${id}:${kind}`)); redis.disconnect(); await disconnectPostgres(); });
  async function create(actor = owner) {
    const input = { title: "Reconstructed paper", clientKey: randomUUID() };
    const run = await service.create(project, actor, input, source); ids.push(run.id); return { run, input };
  }
  async function completeConversion(id: string) { await service.process(id); queue.jobs.get(id).state = "completed"; }

  it("uploads once, queues no file contents, and does not create manuscripts before acceptance", async () => {
    const { run, input } = await create();
    expect((await service.create(project, owner, input, source)).id).toBe(run.id);
    expect(JSON.stringify(queue.jobs.get(run.id).data)).not.toContain("%PDF");
    expect(await redis.ttl(`manuscript-pdf:${run.id}:source`)).toBeGreaterThan(3500);
    await expect(service.create(project, owner, { ...input, title: "Changed title" }, source)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.create(project, owner, { ...input, mode: "structured" }, source)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.draftWorkspace.count({ where: { projectId: project } })).toBe(0);
    await expect(service.accept(project, owner, run.id)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("uses real PDF conversion then creates one persisted XeLaTeX manuscript with its private original", async () => {
    const { run } = await create(); await completeConversion(run.id);
    const result = await service.get(project, owner, run.id);
    expect(result).toMatchObject({ status: "ready", pageCount: 2 });
    expect(result).not.toHaveProperty("archive");
    expect(result.preview).toContain("50\\%");
    expect(result.compilation).toEqual({ status: "success" });
    const pdf = await service.previewPdf(project, owner, run.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await redis.ttl(`manuscript-pdf:${run.id}:preview-pdf`)).toBeGreaterThan(3400);
    expect(result).not.toHaveProperty("pdf");
    expect(await db.draftWorkspace.count({ where: { projectId: project } })).toBe(0);
    const [first, retry] = await Promise.all([service.accept(project, owner, run.id), service.accept(project, owner, run.id)]);
    expect(first.id).toBe(retry.id);
    const draft = await manuscriptService.detail(project, owner, first.id);
    expect(draft.compilerSettings?.engine).toBe("xelatex");
    expect(draft.files.map(file => file.path)).toEqual(expect.arrayContaining(["main.tex", "pages/page-1.tex", "original.pdf", "original-layout.tex"]));
    const main = await manuscriptService.fileContent(project, member, draft.id, draft.mainFileId!);
    expect(sourceText(Buffer.from(main.state!, "base64"))).toContain("\\input{pages/page-1.tex}");
    expect(await db.draftWorkspace.count({ where: { projectId: project } })).toBe(1);
    expect(await db.projectActivity.count({ where: { projectId: project, type: "MANUSCRIPT_IMPORTED" } })).toBe(1);
  });
  it("keeps previews private to their requester and prevents cross-project access", async () => {
    const { run } = await create();
    await expect(service.get(project, member, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.previewPdf(project, member, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.previewPdf(project, outsider, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get(project, outsider, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.create(project, outsider, { title: "No permission", clientKey: randomUUID() }, source)).rejects.toMatchObject({ statusCode: 404 });
    const other = await createProjectFixture({ data: { title: "Other", ownerId: owner, status: "ACTIVE" } });
    await expect(service.accept(other.id, owner, run.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it.runIf(process.env.PDF_IMPORT_COMPILER_INTEGRATION === "1")("compiles reconstructed pages with the original dimensions and text baselines", async () => {
    const { run } = await create(); await completeConversion(run.id);
    const result = JSON.parse((await redis.get(`manuscript-pdf:${run.id}:result`))!);
    const files = Object.entries(unzipSync(Buffer.from(result.archive, "base64"))).map(([path, bytes]) => ({ path, data: Buffer.from(bytes).toString("base64") }));
    const script = "import sys,os,urllib.request; r=urllib.request.Request('http://127.0.0.1:8020/compile',data=sys.stdin.buffer.read(),headers={'Content-Type':'application/json','X-Internal-Key':os.environ['INTERNAL_SERVICE_KEY']}); print(urllib.request.urlopen(r,timeout=75).read().decode())";
    const output = JSON.parse(execFileSync("docker", ["exec", "-i", "lumi-gap-manuscript-compiler-2025-1", "python3", "-c", script], { input: JSON.stringify({ engine: "xelatex", mainFile: "main.tex", files }), maxBuffer: 32 * 1024 * 1024, windowsHide: true }).toString());
    expect(output.success, output.diagnostics).toBe(true);
    const inspect = "import sys,json,base64,pdfplumber; from io import BytesIO; p=pdfplumber.open(BytesIO(base64.b64decode(sys.stdin.buffer.read()))); print(json.dumps([{'width':x.width,'height':x.height,'x':x.chars[0]['x0'],'baseline':x.chars[0]['matrix'][5],'text':x.extract_text()} for x in p.pages]))";
    const pages = JSON.parse(execFileSync("docker", ["exec", "-i", "lumi-gap-ai-reviewer-1", "python", "-c", inspect], { input: output.pdf, maxBuffer: 100_000, windowsHide: true }).toString());
    expect(pages).toHaveLength(2);
    expect(pages.map((page: { width: number; height: number }) => [page.width, page.height])).toEqual([[612, 792], [500, 700]]);
    for (const page of pages) { expect(page.x).toBeCloseTo(50, 1); expect(page.baseline).toBeCloseTo(650, 1); expect(page.text).toContain("50% & 2_3."); }
  });
  it("revokes queued processing, preview and acceptance when a member is removed", async () => {
    const { run } = await create(member); await completeConversion(run.id);
    await db.projectMember.update({ where: { projectId_userId: { projectId: project, userId: member } }, data: { status: "REMOVED" } });
    await expect(service.get(project, member, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.previewPdf(project, member, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.accept(project, member, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.process(run.id)).rejects.toThrow("Project access is no longer available");
  });
  it("rejects malformed uploads and expired conversions", async () => {
    await expect(service.create(project, owner, { title: "Invalid", clientKey: randomUUID() }, Buffer.from("not pdf"))).rejects.toMatchObject({ statusCode: 400 });
    const { run } = await create(); queue.jobs.get(run.id).data.expiresAt = Date.now() - 1;
    await expect(service.get(project, owner, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.accept(project, owner, run.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.previewPdf(project, owner, run.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each(["failed", "unavailable"] as const)("retains the conversion without substituting the original when compilation is %s", async status => {
    const mock = vi.spyOn(compiler, "compileSourceFiles");
    if (status === "failed") mock.mockResolvedValueOnce({ pdf: null, sync: null, result: { success: false, diagnostics: "main.tex:5: test error", toolchain: "TeX Live 2025 / test", pdf: null } });
    else mock.mockRejectedValueOnce(new Error("Compiler temporarily down"));
    try {
      const { run } = await create(); await completeConversion(run.id);
      expect((await service.get(project, owner, run.id)).compilation?.status).toBe(status);
      await expect(service.previewPdf(project, owner, run.id)).rejects.toMatchObject({ statusCode: 404 });
      expect(await redis.get(`manuscript-pdf:${run.id}:preview-pdf`)).toBeNull();
      expect((await service.accept(project, owner, run.id)).id).toBeTruthy();
    } finally { mock.mockRestore(); }
  });
  it("persists a Docling manuscript with editable tables and compiles its actual sources", async () => {
    const run = await service.create(project, owner, { title: "Editable tables", clientKey: randomUUID(), mode: "structured" }, syntheticPdf(true));
    ids.push(run.id); await completeConversion(run.id);
    const result = await service.get(project, owner, run.id);
    expect(result).toMatchObject({ status: "ready", mode: "structured" });
    expect(result.layout).toMatchObject({ pageCount: 2, tableCount: 2, unmappedBlocks: 0 });
    expect(result.compilation?.status).toBe("success");
    expect(result.comparison).toMatchObject({ status: "compared", sourcePages: 2, generatedPages: 2, comparedPages: 2 });
    expect(result.preview).toContain("\\begin{tabular}");
    expect(result).not.toHaveProperty("blocks");
    const imported = await service.accept(project, owner, run.id);
    const detail = await manuscriptService.detail(project, owner, imported.id);
    expect(detail.files.map(file => file.path)).toContain("source-map.txt");
    if (process.env.PDF_IMPORT_COMPILER_INTEGRATION === "1") {
      const stored = JSON.parse((await redis.get(`manuscript-pdf:${run.id}:result`))!);
      const files = Object.entries(unzipSync(Buffer.from(stored.archive, "base64"))).map(([path, bytes]) => ({ path, data: Buffer.from(bytes).toString("base64") }));
      const script = "import sys,os,urllib.request; r=urllib.request.Request('http://127.0.0.1:8020/compile',data=sys.stdin.buffer.read(),headers={'Content-Type':'application/json','X-Internal-Key':os.environ['INTERNAL_SERVICE_KEY']}); print(urllib.request.urlopen(r,timeout=75).read().decode())";
      const output = JSON.parse(execFileSync("docker", ["exec", "-i", "lumi-gap-manuscript-compiler-2025-1", "python3", "-c", script], { input: JSON.stringify({ engine: "xelatex", mainFile: "main.tex", files }), maxBuffer: 32 * 1024 * 1024, windowsHide: true }).toString());
      expect(output.success, output.diagnostics).toBe(true);
      const inspect = "import sys,base64,pdfplumber; from io import BytesIO; p=pdfplumber.open(BytesIO(base64.b64decode(sys.stdin.buffer.read()))); print('\\n'.join(x.extract_text() or '' for x in p.pages))";
      const text = execFileSync("docker", ["exec", "-i", "lumi-gap-ai-reviewer-1", "python", "-c", inspect], { input: output.pdf, maxBuffer: 100_000, windowsHide: true }).toString();
      expect(text).toContain("Accuracy"); expect(text).toContain("92.5%"); expect(text).toContain("50% & 2_3.");
    }
  });
  it("converts, previews and imports a 100-page PDF without losing its last page", async () => {
    const run = await service.create(project, owner, { title: "Long research document", clientKey: randomUUID() }, syntheticPdf(false, 100));
    ids.push(run.id); await completeConversion(run.id);
    expect(await service.get(project, owner, run.id)).toMatchObject({ status: "ready", pageCount: 100, compilation: { status: "success" } });
    const preview = await service.previewPdf(project, owner, run.id);
    const inspect = "import sys,base64; from io import BytesIO; from pypdf import PdfReader; print(len(PdfReader(BytesIO(base64.b64decode(sys.stdin.buffer.read()))).pages))";
    expect(execFileSync("docker", ["exec", "-i", "lumi-gap-ai-reviewer-1", "python", "-c", inspect], { input: preview.toString("base64"), windowsHide: true }).toString().trim()).toBe("100");
    const imported = await service.accept(project, owner, run.id);
    const detail = await manuscriptService.detail(project, owner, imported.id);
    expect(detail.files.map(file => file.path)).toContain("pages/page-100.tex");
  }, 60_000);
  it("retains the actual compiled PDF when structured comparison is unavailable", async () => {
    const mock = vi.spyOn(quality, "comparePdfOutput").mockRejectedValueOnce(new Error("comparison unavailable"));
    try {
      const run = await service.create(project, owner, { title: "Comparison fallback", clientKey: randomUUID(), mode: "structured" }, syntheticPdf(true));
      ids.push(run.id); await completeConversion(run.id);
      expect(await service.get(project, owner, run.id)).toMatchObject({ compilation: { status: "success" }, comparison: { status: "unavailable" } });
      expect((await service.previewPdf(project, owner, run.id)).subarray(0, 5).toString()).toBe("%PDF-");
    } finally { mock.mockRestore(); }
  });
  it.runIf(process.env.PDF_IMPORT_AI_INTEGRATION === "1")("uses the configured AI for structural labels without changing manuscript text", async () => {
    const run = await service.create(project, owner, { title: "AI structure check", clientKey: randomUUID(), mode: "structured", ai: "true" }, source);
    ids.push(run.id); await completeConversion(run.id);
    const result = await service.get(project, owner, run.id);
    expect(result.warnings).toContain("AI_STRUCTURE_REVIEW");
    expect(result.preview).toContain("50\\% \\& 2\\_3");
  }, 90_000);
});
