import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { Worker } from "bullmq";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { makeConnection, QUEUE_NAMES } from "../../../infrastructure/queue.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { manuscriptRouter } from "../manuscript.routes.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { compilerEndpoint, processCompilation } from "../manuscript-compiler.js";
import { compileSchema } from "../dto/manuscript.schema.js";
import { sourceState } from "../manuscript-source.js";
import { zipSync, strToU8 } from "fflate";

const auth = vi.hoisted(() => ({ sub: "" }));
vi.mock("../../../common/middleware/auth.js", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { sub: auth.sub }; next(); } }));
vi.mock("../../authorization/authorization.middleware.js", () => ({ requireResearchWorkflow: (_req: any, _res: any, next: () => void) => next() }));
const isolated = process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /\/codex_mentorship_[a-f0-9]+_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!isolated).sequential("real manuscript compilation (disposable DB, Redis and compiler)", () => {
  const db = getPrisma(), app = express(), server = createServer(app);
  let owner: string, member: string, outsider: string, mentor: string, relationship: string, project: string, id: string, snapshot: string, compilation: string, main: string, origin: string;
  let worker: Worker;
  app.use(express.json()); app.use("/projects/:projectId/manuscripts", manuscriptRouter); app.use(errorHandler);
  const call = (path: string, body?: unknown) => fetch(`${origin}/projects/${project}/manuscripts/${id}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const seal = async () => (await writing.snapshot(project, owner, id, { label: "Compile test", clientKey: crypto.randomUUID(), minimumSequences: {} })).id;
  async function complete(jobId: string) {
    for (let i = 0; i < 150; i++) {
      const row = await db.manuscriptCompilation.findUniqueOrThrow({ where: { id: jobId } });
      if (["SUCCESS", "FAILED", "TIMED_OUT"].includes(row.status)) return row;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("Compiler did not finish");
  }
  beforeAll(async () => {
    const users = await Promise.all(["Owner", "Member", "Outsider", "Mentor"].map(fullName => db.user.create({ data: { fullName, email: `${crypto.randomUUID()}@compile.invalid`, emailVerifiedAt: new Date() } })));
    [owner, member, outsider, mentor] = users.map(user => user.id) as [string, string, string, string];
    await db.academicProfile.create({ data: { userId: mentor, primaryPosition: "LECTURER", academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    const p = await createProjectFixture({ data: { title: "Private team manuscript", ownerId: owner, status: "ACTIVE", visibility: "PRIVATE" } }); project = p.id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
    const request = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    relationship = (await db.mentorRelationship.create({ data: { projectId: project, mentorUserId: mentor, sourceRequestId: request.id } })).id;
    const draft = await writing.create(project, owner, { title: "Compile shared LaTeX", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() }); id = draft.id; main = draft.mainFileId!;
    auth.sub = owner; snapshot = await seal();
    server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    worker = new Worker(QUEUE_NAMES.manuscriptCompile, async job => { try { await processCompilation(job.data.compilationId); } catch (error) { await db.manuscriptCompilation.update({ where: { id: job.data.compilationId }, data: { status: "FAILED", diagnostics: String(error) } }); throw error; } }, { connection: makeConnection(), concurrency: 1 });
  });
  afterAll(async () => { await worker?.close(); if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  it("compiles an immutable snapshot through HTTP, BullMQ and the real engine, and downloads private PDF", async () => {
    const response = await call(`/snapshots/${snapshot}/compile`, { engine: "pdflatex" }); expect(response.status).toBe(202);
    compilation = (await response.json()).data.id;
    const result = await complete(compilation); expect(result.status, result.diagnostics).toBe("SUCCESS"); expect(result.checksum).toHaveLength(64);
    const pdf = await call(`/compilations/${compilation}/pdf`); expect(pdf.status).toBe(200); expect(pdf.headers.get("cache-control")).toContain("no-store"); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const state = (await (await call("/compilations")).json()).data;
    expect(state.successful).toMatchObject({ id: compilation, snapshotId: snapshot, sourceVersion: 1, engine: "pdflatex" }); expect(state.successful.pdfData).toBeUndefined();
  });
  it("deduplicates concurrent team requests and rejects invalid engine and IDs", async () => {
    const requests = await Promise.all([writing.compile(project, owner, id, snapshot), writing.compile(project, member, id, snapshot)]);
    expect(requests.map(row => row.id)).toEqual([compilation, compilation]);
    expect((await call(`/snapshots/${snapshot}/compile`, { engine: "sh" })).status).toBe(400);
    expect((await call("/compilations/invalid/pdf")).status).toBe(400);
  });
  it("imports ZIP over HTTP, compiles biblatex with LuaLaTeX and follows private SyncTeX both ways", async () => {
    auth.sub = owner;
    const source = "\\documentclass{article}\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{references.bib}\n\\begin{document}\n\\input{sections/intro}\n\\printbibliography\n\\end{document}";
    const bytes = zipSync({ "main.tex": strToU8(source), "sections/intro.tex": strToU8("\\section{Introduction}\nSynthetic team evidence \\parencite{demo}.\n"), "references.bib": strToU8("@misc{demo,title={Synthetic Source},author={Demo Team},date={2026}}") });
    const form = new FormData(); form.append("archive", new Blob([bytes]), "source.zip"); form.append("title", "Imported LuaLaTeX research"); form.append("mainFile", "main.tex"); form.append("clientKey", crypto.randomUUID());
    const response = await fetch(`${origin}/projects/${project}/manuscripts/import`, { method: "POST", body: form });
    expect(response.status).toBe(201); const imported = (await response.json()).data;
    const sealed = await writing.snapshot(project, owner, imported.id, { label: "Imported baseline", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const job = await writing.compile(project, owner, imported.id, sealed.id, "lualatex");
    const compiled = await complete(job.id); expect(compiled.status, compiled.diagnostics).toBe("SUCCESS");
    expect(compiled.syncTexData?.length).toBeGreaterThan(0);
    expect((await writing.compilations(project, member, imported.id)).successful?.engine).toBe("lualatex");
    const locations = await writing.syncTex(project, member, imported.id, job.id, { direction: "forward", path: "sections/intro.tex", line: 2 });
    expect(locations[0]).toMatchObject({ page: 1 });
    const point = locations[0]!;
    const sources = await writing.syncTex(project, member, imported.id, job.id, { direction: "inverse", page: point.page!, x: point.x!, y: point.y! });
    expect(sources.some(source => source.path === "sections/intro.tex")).toBe(true);
    await expect(writing.syncTex(project, outsider, imported.id, job.id, { direction: "forward", path: "main.tex", line: 1 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.syncTex(project, owner, imported.id, job.id, { direction: "forward", path: "private.tex", line: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("compiles a newly created Vietnamese manuscript with either supported engine", async () => {
    const draft = await writing.create(project, owner, { title: "Nghiên cứu phản hồi bền vững", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const sealed = await writing.snapshot(project, owner, draft.id, { label: "Vietnamese template", clientKey: crypto.randomUUID(), minimumSequences: {} });
    for (const engine of ["pdflatex", "xelatex"] as const) {
      const job = await writing.compile(project, owner, draft.id, sealed.id, engine);
      const result = await complete(job.id);
      expect(result.status, result.diagnostics).toBe("SUCCESS");
      expect(result.diagnostics).not.toContain("Missing character:");
    }
  });
  it("accepts only registered releases and rejects arbitrary endpoints", () => {
    expect(compileSchema.parse({}).texLiveVersion).toBeUndefined();
    expect(compileSchema.safeParse({ texLiveVersion: "http://localhost/private" }).success).toBe(false);
    expect(compileSchema.safeParse({ texLiveVersion: "2026" }).success).toBe(false);
    expect(() => compilerEndpoint("unknown")).toThrow();
  });
  it.skipIf(!process.env.MANUSCRIPT_COMPILER_2025_URL)("compiles Unicode through the newer XeLaTeX paper-size driver", async () => {
    const draft = await writing.create(project, owner, { title: "Nghiên cứu phản hồi bền vững", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const sealed = await writing.snapshot(project, owner, draft.id, { label: "New Unicode driver", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const job = await writing.compile(project, owner, draft.id, sealed.id, "xelatex", "2025");
    const result = await complete(job.id); expect(result.status, result.diagnostics).toBe("SUCCESS");
    expect(result.diagnostics).not.toContain("Missing character:");
  });
  it.skipIf(!process.env.MANUSCRIPT_COMPILER_2025_URL)("compiles with both releases, separates caches and uses the matching SyncTeX service", async () => {
    const draft = await writing.create(project, owner, { title: "Compiler release comparison", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const sealed = await writing.snapshot(project, owner, draft.id, { label: "Same source", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const jobs: string[] = [];
    for (const release of ["2022", "2025"] as const) {
      const job = await writing.compile(project, owner, draft.id, sealed.id, "pdflatex", release);
      const result = await complete(job.id);
      expect(result.status, result.diagnostics).toBe("SUCCESS");
      expect(result.toolchain).toContain("TeX Live " + release);
      expect(result.texLiveVersion).toBe(release);
      expect((await writing.compile(project, member, draft.id, sealed.id, "pdflatex", release)).id).toBe(job.id);
      expect((await writing.syncTex(project, member, draft.id, job.id, { direction: "forward", path: "main.tex", line: 14 })).length).toBeGreaterThan(0);
      jobs.push(job.id);
    }
    expect(jobs[0]).not.toBe(jobs[1]);
  });
  it.skipIf(!process.env.MANUSCRIPT_COMPILER_2025_URL)("compiles a larger multi-file source with bibliography and cross-references", async () => {
    const files: Record<string, Uint8Array> = {
      "main.tex": strToU8("\\documentclass{article}\n\\usepackage{amsmath,booktabs,hyperref}\n\\begin{document}\n\\tableofcontents\n" + Array.from({ length: 12 }, (_, n) => "\\input{sections/chapter" + n + "}").join("\n") + "\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}"),
      "references.bib": strToU8("@article{fixture,title={Synthetic compilation fixture},author={Test, Example},journal={Test Journal},year={2024}}"),
    };
    for (let n = 0; n < 12; n++) files["sections/chapter" + n + ".tex"] = strToU8("\\section{Synthetic chapter " + n + "}\\label{sec:" + n + "}\n" + ("This is fictional compiler test content, with a source citation \\cite{fixture} and a reference to Section~\\ref{sec:0}. ").repeat(180) + "\n\\[\\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}\\]\n\\begin{tabular}{lr}Name & Value \\\\ Test & 42 \\\\\\end{tabular}\n");
    const form = new FormData(); form.set("archive", new Blob([zipSync(files)], { type: "application/zip" }), "large-source.zip"); form.set("title", "Large synthetic compiler fixture"); form.set("clientKey", crypto.randomUUID());
    auth.sub = owner;
    const response = await fetch(origin + "/projects/" + project + "/manuscripts/import", { method: "POST", body: form });
    expect(response.status).toBe(201); const imported = (await response.json()).data;
    const sealed = await writing.snapshot(project, owner, imported.id, { label: "Larger fixture", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const started = performance.now(), job = await writing.compile(project, owner, imported.id, sealed.id, "pdflatex", "2025"), result = await complete(job.id);
    expect(result.status, result.diagnostics).toBe("SUCCESS");
    expect(result.pdfData!.length).toBeGreaterThan(10000);
    expect(result.diagnostics).not.toMatch(/Citation .* undefined|Reference .* undefined/);
    console.info("Larger fixture: source bytes=%d, PDF bytes=%d, elapsed=%dms", Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0), result.pdfData!.length, Math.round(performance.now() - started));
  });
  it.each(["BLANK", "IEEE_CONFERENCE", "PRESENTATION", "THESIS", "ELSEVIER", "SPRINGER", "APS"] as const)("creates and compiles the actual %s template", async template => {
    const draft = await writing.create(project, owner, { title: "Nghiên cứu của nhóm", documentType: "RESEARCH_PAPER", template, description: "", clientKey: crypto.randomUUID() });
    const sealed = await writing.snapshot(project, owner, draft.id, { label: "Template baseline", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const job = await writing.compile(project, owner, draft.id, sealed.id, "pdflatex");
    const result = await complete(job.id); expect(result.status, result.diagnostics).toBe("SUCCESS");
  });
  it("uses persisted manuscript compiler settings when the compile request omits choices", async () => {
    const draft = await writing.create(project, owner, { title: "Stored compiler preference", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    await writing.compilerSettings(project, owner, draft.id, { engine: "xelatex", texLiveVersion: "2022", expectedRevision: 1 });
    const sealed = await writing.snapshot(project, owner, draft.id, { label: "Stored settings", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const job = await writing.compile(project, member, draft.id, sealed.id);
    expect(job.engine).toBe("xelatex"); expect(job.texLiveVersion).toBe("2022");
    const result = await complete(job.id); expect(result.status, result.diagnostics).toBe("SUCCESS");
  });
  it("compiles private SVG/EPS figures and CSV/TikZ data without shell escape", async () => {
    const files = {
      "main.tex": strToU8("\\documentclass{article}\n\\usepackage{graphicx,pgfplots}\n\\pgfplotsset{compat=1.18}\n\\begin{document}\n\\includegraphics[width=2cm]{figures/chart.svg}\n\\includegraphics[width=2cm]{figures/plot.eps}\n\\input{figures/chart.tikz}\n\\end{document}"),
      "figures/chart.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="5" y="5" width="70" height="70" fill="blue"/></svg>'),
      "figures/plot.eps": strToU8("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 80 80\nnewpath 0 0 moveto 80 80 lineto 2 setlinewidth stroke\nshowpage\n%%EOF"),
      "figures/chart.tikz": strToU8("\\begin{tikzpicture}\\begin{axis}\\addplot table[col sep=comma,x=x,y=y]{data/results.csv};\\end{axis}\\end{tikzpicture}"),
      "data/results.csv": strToU8("x,y\n0,0\n1,2\n2,4\n"),
    };
    const draft = await writing.importZip(project, owner, { title: "Vector and data project", mainFile: "main.tex", clientKey: crypto.randomUUID() }, zipSync(files));
    for (const release of ["2022", ...(process.env.MANUSCRIPT_COMPILER_2025_URL ? ["2025"] : [])] as Array<"2022" | "2025">) {
      const version = await writing.snapshot(project, owner, draft.id, { label: "Vector build", clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true });
      const job = await writing.compile(project, owner, draft.id, version.id, "pdflatex", release);
      const result = await complete(job.id); expect(result.status, result.diagnostics).toBe("SUCCESS");
      expect(result.pdfData?.length).toBeGreaterThan(1000);
    }
  });
  it("reuses saved compile sources across team requests, validates receipts and preserves manual versions", async () => {
    const input = { label: "Repeat compile", clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true };
    const sealed = await Promise.all([writing.snapshot(project, owner, id, input), writing.snapshot(project, member, id, { ...input, clientKey: crypto.randomUUID() })]);
    expect(sealed.map(row => row.id)).toEqual([snapshot, snapshot]);
    await expect(writing.snapshot(project, owner, id, { ...input, minimumSequences: { [main]: 999 } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(writing.snapshot(project, outsider, id, input)).rejects.toMatchObject({ statusCode: 404 });
    const manual = await writing.snapshot(project, member, id, { ...input, clientKey: crypto.randomUUID(), reuseUnchanged: false });
    expect(manual.id).not.toBe(snapshot);
  });
  it("allows recompiling an unchanged source at the version limit while rejecting a new manual version", async () => {
    const draft = await writing.create(project, owner, { title: "Version quota fixture", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const input = { label: "Saved", clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true };
    const first = await writing.snapshot(project, owner, draft.id, input);
    const row = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: first.id } });
    await db.manuscriptSnapshot.createMany({ data: Array.from({ length: 99 }, () => ({ workspaceId: draft.id, projectId: project, label: "Quota fixture", sourceVersion: row.sourceVersion, manifest: row.manifest!, checksum: row.checksum, createdById: owner, clientKey: crypto.randomUUID() })) });
    const reused = await writing.snapshot(project, member, draft.id, { ...input, clientKey: crypto.randomUUID() });
    expect((await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: reused.id } })).checksum).toBe(row.checksum);
    expect(await db.manuscriptSnapshot.count({ where: { workspaceId: draft.id } })).toBe(100);
    await expect(writing.snapshot(project, owner, draft.id, { ...input, clientKey: crypto.randomUUID(), reuseUnchanged: false })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("uses the sealed source even after the live source changes, then reports real source errors and preserves the last PDF", async () => {
    await db.manuscriptFile.update({ where: { id: main }, data: { crdtState: sourceState("\\documentclass{article}\n\\begin{document}\n\\unknownLumiGapCommand\n\\end{document}") } });
    await db.draftWorkspace.update({ where: { id }, data: { version: { increment: 1 } } });
    expect((await writing.compile(project, owner, id, snapshot)).id).toBe(compilation);
    const failedSnapshot = await seal(), job = await writing.compile(project, owner, id, failedSnapshot);
    const result = await complete(job.id); expect(result.status).toBe("FAILED"); expect(result.diagnostics).toContain("main.tex:3:"); expect(result.pdfData).toBeNull();
    const state = await writing.compilations(project, owner, id); expect(state.latest?.id).toBe(job.id); expect(state.successful?.id).toBe(compilation);
  });
  it("protects PDFs/status from outsiders, cross-project requests and removed members", async () => {
    auth.sub = outsider; expect((await call("/compilations")).status).toBe(404); expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404); expect((await call(`/snapshots/${snapshot}/compile`, {})).status).toBe(404);
    const other = await createProjectFixture({ data: { title: "Other private project", ownerId: outsider } });
    await expect(writing.compilationPdf(other.id, outsider, id, compilation)).rejects.toMatchObject({ statusCode: 404 });
    auth.sub = member; expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(200);
    await db.projectMember.update({ where: { projectId_userId: { projectId: project, userId: member } }, data: { status: "REMOVED" } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
  });
  it("persists structured compiler timeouts, preserves the successful PDF and allows retry", async () => {
    const request = globalThis.fetch;
    // Exercise the internal compiler contract without imposing a 60-second test wait.
    const compilerFetch = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => String(input).endsWith('/compile') && init?.headers && 'X-Internal-Key' in init.headers
      ? Promise.resolve(new Response(JSON.stringify({ success: false, errorCode: "TIMED_OUT", diagnostics: "Compilation time limit exceeded.", toolchain: "TeX Live 2022 / Test timeout response", pdf: null }), { status: 200 }))
      : request(input, init));
    const timeoutSnapshot = await seal();
    try {
      const job = await writing.compile(project, owner, id, timeoutSnapshot);
      const result = await complete(job.id);
      expect(result.status).toBe("TIMED_OUT"); expect(result.pdfData).toBeNull();
      const state = await writing.compilations(project, owner, id);
      expect(state.latest?.status).toBe("TIMED_OUT"); expect(state.successful?.id).toBe(compilation);
    } finally { compilerFetch.mockRestore(); }
    const retry = await writing.compile(project, owner, id, timeoutSnapshot);
    expect((await complete(retry.id)).status).toBe("FAILED"); // Original invalid LaTeX reaches the real compiler again.
  });
  it("grants mentors only the shared snapshot PDF and revokes access when mentorship ends", async () => {
    auth.sub = mentor; expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
    await db.projectDiscussion.create({ data: { projectId: project, authorId: owner, category: "MENTOR_QUESTION", title: "Review sealed draft", body: "Please review", targetKind: "MANUSCRIPT_SNAPSHOT", targetId: snapshot, mentorRelationshipId: relationship, clientKey: crypto.randomUUID() } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(200);
    expect((await call(`/compilations?snapshotId=${snapshot}`)).status).toBe(200);
    expect((await call("/compilations")).status).toBe(404);
    expect((await call(`/snapshots/${snapshot}/compile`, {})).status).toBe(404);
    await db.mentorRelationship.update({ where: { id: relationship }, data: { status: "ENDED", endedAt: new Date(), endReason: "Test complete" } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
  });
});
