import { beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import sharp from "sharp";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptSuggestions as suggestions } from "../manuscript-suggestions.js";
import { manuscriptRepository as repository } from "../manuscript-repository.js";
import { manuscriptSync } from "../manuscript-sync.js";
import { citationKey, hashBytes, sourceDocument, sourceText } from "../manuscript-source.js";
import { projectDiscussionsService as discussions } from "../../projects/project-discussions.service.js";
import { reviewTemplateService } from "../../reviews/review-template.service.js";
import { reviewRequestService } from "../../reviews/review-request.service.js";
import { reviewService } from "../../reviews/review.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const isolated = (process.env.NODE_ENV === "test" && process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):[0-9]+\/codex_mentorship_[a-f0-9]{12}_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "")) || process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("manuscripts in disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string, mentor: string, reviewer: string;
  async function actor(name: string, lecturer = false) {
    const user = await db.user.create({ data: { fullName: name, email: `writing-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", academicRole: lecturer ? "LECTURER" : "RESEARCHER", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true }, reviewAvailability: { enabled: true, maximumActiveReviews: 10 } } }); return user.id;
  }
  async function draft() {
    const project = await createProjectFixture({ data: { title: "Collaborative research", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const manuscript = await writing.create(project.id, owner, { title: "Methods study", documentType: "RESEARCH_PROPOSAL", template: "PROPOSAL", description: "", clientKey: crypto.randomUUID() });
    const detail = await writing.detail(project.id, owner, manuscript.id); return { project: project.id, id: manuscript.id, detail, file: detail.mainFileId! };
  }
  async function update(d: Awaited<ReturnType<typeof draft>>, user: string, edit: (text: Y.Text) => void, fileId = d.file) {
    const row = await writing.fileContent(d.project, user, d.id, fileId), doc = sourceDocument(Buffer.from(row.state!, "base64"));
    const vector = Y.encodeStateVector(doc); edit(doc.getText("source"));
    const input = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") }; doc.destroy();
    return { input, result: await writing.applyUpdate(d.project, user, d.id, fileId, input) };
  }
  beforeAll(async () => { owner = await actor("Owner"); member = await actor("Member"); outsider = await actor("Outsider"); mentor = await actor("Mentor", true); reviewer = await actor("Reviewer", true); });

  it("persists manuscript-specific compiler settings with revision checks and revoked access", async () => {
    const d = await draft(), other = await draft();
    const previous = d.detail.compilerSettings!;
    const saved = await writing.compilerSettings(d.project, owner, d.id, { engine: "xelatex", texLiveVersion: "2022", expectedRevision: previous.revision });
    expect((await writing.detail(d.project, member, d.id)).compilerSettings).toEqual(saved);
    expect((await writing.detail(d.project, owner, d.id)).version).toBe(d.detail.version);
    expect((await writing.detail(other.project, owner, other.id)).compilerSettings?.engine).toBe("pdflatex");
    await expect(writing.compilerSettings(d.project, member, d.id, { engine: "lualatex", texLiveVersion: "2022", expectedRevision: previous.revision })).rejects.toMatchObject({ statusCode: 409 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(writing.compilerSettings(d.project, member, d.id, { engine: "pdflatex", texLiveVersion: "2022", expectedRevision: saved.revision })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("restores comments, replies and pending suggestions with original authors and usable anchors", async () => {
    const d = await draft(), input = await proposal(d);
    await writing.compilerSettings(d.project, owner, d.id, { engine: "xelatex", texLiveVersion: "2022", expectedRevision: 1 });
    await suggestions.create(d.project, member, d.id, input);
    const doc = sourceDocument(Buffer.from((await writing.fileContent(d.project, owner, d.id, d.file)).state!, "base64"));
    const start = Y.createRelativePositionFromTypeIndex(doc.getText("source"), input.from), end = Y.createRelativePositionFromTypeIndex(doc.getText("source"), input.to);
    const thread = await writing.comment(d.project, member, d.id, { body: "Team-only comment", clientKey: crypto.randomUUID(), fileId: d.file, quote: input.original, start, end }); doc.destroy();
    await discussions.reply(d.project, owner, thread.id, { body: "Review reply", clientKey: crypto.randomUUID(), mentions: [], replyToId: null });
    const version = await writing.snapshot(d.project, owner, d.id, { label: "Full collaboration", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await writing.compilerSettings(d.project, owner, d.id, { engine: "lualatex", texLiveVersion: "2022", expectedRevision: 2 });
    expect((await writing.snapshots(d.project, owner, d.id))[0]?.collaboration).toEqual({ comments: 1, suggestions: 1 });
    const exported = await repository.source(d.project, owner, d.id, version.id);
    expect(JSON.stringify(exported)).not.toContain("Team-only comment");
    const restored = await writing.restore(d.project, owner, d.id, version.id, { title: "Restored collaboration", clientKey: crypto.randomUUID() });
    expect((await writing.detail(d.project, owner, restored.id)).compilerSettings?.engine).toBe("xelatex");
    const comments = await writing.comments(d.project, owner, restored.id), proposals = await suggestions.list(d.project, owner, restored.id);
    expect(comments[0]?.author.id).toBe(member); expect(comments[0]?.messages[0]?.body).toBe("Review reply");
    expect(comments[0]?.context.fileId).toBe(restored.mainFileId);
    expect(proposals[0]?.author.id).toBe(member);
    await suggestions.resolve(d.project, owner, restored.id, proposals[0]!.id, "ACCEPTED", proposals[0]!.revision);
    expect(sourceText(Buffer.from((await writing.fileContent(d.project, owner, restored.id, restored.mainFileId!)).state!, "base64"))).toContain(input.replacement);
    expect((await suggestions.list(d.project, owner, d.id))[0]?.status).toBe("PENDING");
  });

  it("applies an inspected bundle atomically, rejects stale versions, and keeps a recoverable source snapshot", async () => {
    const d = await draft(), sealed = await writing.snapshot(d.project, owner, d.id, { label: "Before remote pull", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const bundle = await repository.source(d.project, owner, d.id, sealed.id);
    const files = bundle.files.filter(file => file.path !== "lumigap-version.json").map(file => file.path === "main.tex" ? { ...file, content: Buffer.from(Buffer.from(file.content, "base64").toString("utf8") + "\n% Incoming remote change\n").toString("base64") } : file);
    const bytes = Buffer.from(JSON.stringify({ files })), input = { expectedVersion: d.detail.version, mainFile: "main.tex", clientKey: crypto.randomUUID() };
    const applied = await manuscriptSync.apply(d.project, owner, d.id, input, bytes);
    expect(applied.version).toBe(d.detail.version + 1);
    expect((await manuscriptSync.apply(d.project, owner, d.id, input, bytes)).version).toBe(applied.version);
    expect(sourceText(Buffer.from((await writing.fileContent(d.project, member, d.id, d.file)).state!, "base64"))).toContain("Incoming remote change");
    await expect(manuscriptSync.apply(d.project, owner, d.id, { ...input, clientKey: crypto.randomUUID() }, bytes)).rejects.toMatchObject({ statusCode: 409 });
    expect((await writing.viewSnapshot(d.project, owner, d.id, sealed.id)).manifest?.files.find(file => file.id === d.file)?.text).not.toContain("Incoming remote change");
    const binding = { repository: "team/research", branch: "main", head: "a".repeat(40), baseline: [{ path: "figures/figure.png", sha: "b".repeat(40) }], expectedRevision: 0, expectedVersion: applied.version };
    await expect(manuscriptSync.bind(d.project, owner, d.id, { ...binding, baseline: [{ path: "../secret.tex", sha: "b".repeat(40) }] })).rejects.toMatchObject({ statusCode: 400 });
    const saved = await manuscriptSync.bind(d.project, owner, d.id, binding);
    expect((await manuscriptSync.binding(d.project, member, d.id))?.revision).toBe(saved.revision);
    await expect(manuscriptSync.bind(d.project, owner, d.id, binding)).rejects.toMatchObject({ statusCode: 409 });
    await expect(manuscriptSync.binding(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("retains large tracked scopes without changing canonical source before acceptance", async () => {
    const d = await draft(); await update(d, owner, text => { text.delete(0, text.length); text.insert(0, "A".repeat(20000)); });
    const row = await writing.fileContent(d.project, owner, d.id, d.file);
    const result = await suggestions.create(d.project, member, d.id, { fileId: d.file, sourceSequence: row.sequence, from: 0, to: 20000, original: "A".repeat(20000), replacement: "B".repeat(20000), note: "Large tracked edit", clientKey: crypto.randomUUID() });
    expect((await writing.fileContent(d.project, owner, d.id, d.file)).state).toBe(row.state);
    await suggestions.resolve(d.project, owner, d.id, result.id, "ACCEPTED", result.revision);
    expect(sourceText(Buffer.from((await writing.fileContent(d.project, owner, d.id, d.file)).state!, "base64"))).toBe("B".repeat(20000));
  });

  async function proposal(d: Awaited<ReturnType<typeof draft>>, replacement = "Revised title", range?: { from: number; to: number }) {
    const row = await writing.fileContent(d.project, owner, d.id, d.file), source = sourceText(Buffer.from(row.state!, "base64"));
    const from = range?.from ?? source.indexOf("Methods study"), to = range?.to ?? from + "Methods study".length;
    return { fileId: d.file, from, to, original: source.slice(from, to), replacement, sourceSequence: row.sequence, note: "Clarify the title", clientKey: crypto.randomUUID() };
  }
  it("round-trips repository source through a sealed bundle and atomic import without granting access", async () => {
    const d = await draft(), version = await writing.snapshot(d.project, owner, d.id, { label: "Repository export", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const bundle = await repository.source(d.project, member, d.id, version.id);
    const importInput = { title: "Imported source", mainFile: "", clientKey: crypto.randomUUID() };
    const imported = await repository.import(d.project, member, importInput, Buffer.from(JSON.stringify(bundle)));
    expect((await repository.import(d.project, member, importInput, Buffer.from(JSON.stringify(bundle)))).id).toBe(imported.id);
    expect((await writing.detail(d.project, owner, imported.id)).files.filter(file => file.kind !== "FOLDER").map(file => file.path)).toEqual(d.detail.files.filter(file => file.kind !== "FOLDER").map(file => file.path));
    await expect(repository.source(d.project, outsider, d.id, version.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.import(d.project, member, { title: "Unsafe import", mainFile: "", clientKey: crypto.randomUUID() }, Buffer.from(JSON.stringify({ files: [{ path: "../main.tex", content: Buffer.from("test").toString("base64") }] })))).rejects.toMatchObject({ statusCode: 400 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(repository.source(d.project, member, d.id, version.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("persists suggestions without changing source, preserves retry identity, and records one atomic acceptance", async () => {
    const d = await draft(), input = await proposal(d), before = await writing.fileContent(d.project, owner, d.id, d.file);
    const suggested = await suggestions.create(d.project, member, d.id, input);
    expect((await suggestions.create(d.project, member, d.id, input)).id).toBe(suggested.id);
    await expect(suggestions.create(d.project, member, d.id, { ...input, note: "Changed" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await writing.fileContent(d.project, owner, d.id, d.file)).state).toBe(before.state);
    const concurrent = await Promise.all([suggestions.resolve(d.project, owner, d.id, suggested.id, "ACCEPTED"), suggestions.resolve(d.project, member, d.id, suggested.id, "ACCEPTED")]);
    expect(concurrent.filter(result => result.source)).toHaveLength(1);
    const after = await writing.fileContent(d.project, owner, d.id, d.file);
    expect(after.sequence).toBe(before.sequence + 1);
    expect(sourceText(Buffer.from(after.state!, "base64"))).toContain("Revised title");
    const [entry] = await suggestions.list(d.project, owner, d.id);
    expect(entry).toMatchObject({ author: { id: member }, status: "ACCEPTED" });
    expect(entry?.resolvedBy?.id).toBeTruthy();
    await expect(suggestions.resolve(d.project, owner, d.id, suggested.id, "REJECTED")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects without editing, refuses stale or removed source, and rebases unrelated edits safely", async () => {
    const d = await draft(), rejected = await suggestions.create(d.project, owner, d.id, await proposal(d));
    const before = await writing.fileContent(d.project, owner, d.id, d.file);
    await suggestions.resolve(d.project, member, d.id, rejected.id, "REJECTED");
    expect((await writing.fileContent(d.project, owner, d.id, d.file)).state).toBe(before.state);
    const proposed = await suggestions.create(d.project, member, d.id, await proposal(d));
    await update(d, owner, text => text.insert(text.length, "\n% Unrelated edit\n"));
    await suggestions.resolve(d.project, owner, d.id, proposed.id, "ACCEPTED");
    const staleInput = await proposal(d, "Third title", { from: 0, to: 20 }), stale = await suggestions.create(d.project, member, d.id, staleInput);
    await update(d, owner, text => text.insert(2, "changed"));
    await expect(suggestions.resolve(d.project, owner, d.id, stale.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    expect((await suggestions.list(d.project, owner, d.id)).find(row => row.id === stale.id)?.status).toBe("PENDING");
    await expect(suggestions.create(d.project, member, d.id, { ...staleInput, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("autosaves only the author's pending proposal and refuses acceptance of an unseen revision", async () => {
    const d = await draft(), input = await proposal(d), created = await suggestions.create(d.project, member, d.id, input);
    const before = await writing.fileContent(d.project, owner, d.id, d.file);
    await expect(suggestions.update(d.project, owner, d.id, created.id, { expectedRevision: 1, replacement: "Not my proposal" })).rejects.toMatchObject({ statusCode: 404 });
    const saved = await suggestions.update(d.project, member, d.id, created.id, { expectedRevision: 1, replacement: "Autosaved title" });
    expect(saved.revision).toBe(2);
    expect(await suggestions.update(d.project, member, d.id, created.id, { expectedRevision: 1, replacement: "Autosaved title" })).toEqual(saved);
    expect((await writing.fileContent(d.project, owner, d.id, d.file)).state).toBe(before.state);
    await expect(suggestions.resolve(d.project, owner, d.id, created.id, "ACCEPTED", 1)).rejects.toMatchObject({ statusCode: 409 });
    await suggestions.resolve(d.project, owner, d.id, created.id, "ACCEPTED", 2);
    expect(sourceText(Buffer.from((await writing.fileContent(d.project, owner, d.id, d.file)).state!, "base64"))).toContain("Autosaved title");
    await expect(suggestions.update(d.project, member, d.id, created.id, { expectedRevision: 2, replacement: "Too late" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("serializes competing autosaves and rejects reverted proposals without changing source", async () => {
    const d = await draft(), input = await proposal(d), row = await suggestions.create(d.project, member, d.id, input);
    const results = await Promise.allSettled([suggestions.update(d.project, member, d.id, row.id, { expectedRevision: 1, replacement: "First window" }), suggestions.update(d.project, member, d.id, row.id, { expectedRevision: 1, replacement: "Second window" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    const reverted = await suggestions.update(d.project, member, d.id, row.id, { expectedRevision: 2, replacement: input.original });
    expect(reverted.revision).toBe(3);
    const before = await writing.fileContent(d.project, owner, d.id, d.file);
    await expect(suggestions.resolve(d.project, owner, d.id, row.id, "ACCEPTED", 3)).rejects.toMatchObject({ statusCode: 409 });
    await suggestions.resolve(d.project, owner, d.id, row.id, "REJECTED", 3);
    expect((await writing.fileContent(d.project, owner, d.id, d.file)).state).toBe(before.state);
  });
  it("locks autosave against source edits, revocation and review resolution", async () => {
    const d = await draft(), row = await suggestions.create(d.project, member, d.id, await proposal(d));
    const results = await Promise.allSettled([suggestions.update(d.project, member, d.id, row.id, { expectedRevision: 1, replacement: "Updated during review" }), suggestions.resolve(d.project, owner, d.id, row.id, "ACCEPTED", 1)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [saved] = await suggestions.list(d.project, owner, d.id);
    expect(saved?.status === "ACCEPTED" ? saved.replacement : saved?.revision).toBe(saved?.status === "ACCEPTED" ? "Revised title" : 2);
    const stale = await suggestions.create(d.project, member, d.id, await proposal(d, "New", { from: 0, to: 10 }));
    await update(d, owner, text => text.insert(3, "Changed"));
    await expect(suggestions.update(d.project, member, d.id, stale.id, { expectedRevision: 1, replacement: "Stale" })).rejects.toMatchObject({ statusCode: 409 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(suggestions.update(d.project, member, d.id, stale.id, { expectedRevision: 1, replacement: "Revoked" })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("blocks outsiders, revoked members, cross-project files and archived manuscript suggestions", async () => {
    const d = await draft(), other = await draft(), input = await proposal(d);
    await expect(suggestions.create(d.project, outsider, d.id, input)).rejects.toMatchObject({ statusCode: 404 });
    await expect(suggestions.list(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(suggestions.create(d.project, member, d.id, { ...input, fileId: other.file })).rejects.toMatchObject({ statusCode: 404 });
    const row = await suggestions.create(d.project, member, d.id, input);
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(suggestions.resolve(d.project, member, d.id, row.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 404 });
    await db.draftWorkspace.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    await expect(suggestions.resolve(d.project, owner, d.id, row.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("imports a source ZIP atomically, preserves paths and citations, deduplicates retries, exports and searches authorized source", async () => {
    const d = await draft();
    const jpeg = await sharp({ create: { width: 5, height: 5, channels: 3, background: "white" } }).jpeg().toBuffer();
    const source = "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
    const zip = zipSync({ "main.tex": strToU8(source), "sections/intro.tex": strToU8("Evidence from the shared team.\n\\cite{team2026}\n"), "references.bib": strToU8("@misc{team2026,title={Synthetic Reference}}"), "figures/Research (1).jpg": jpeg, "README.md": strToU8("Ignored README") });
    const input = { title: "Imported team research", mainFile: "", clientKey: crypto.randomUUID() };
    const imported = await writing.importZip(d.project, owner, input, zip);
    expect(await writing.importZip(d.project, owner, input, zip)).toMatchObject({ id: imported.id, ignoredFiles: ["README.md"] });
    await expect(writing.importZip(d.project, owner, { ...input, title: "Different" }, zip)).rejects.toMatchObject({ statusCode: 409 });
    const detail = await writing.detail(d.project, member, imported.id);
    expect(detail.files).toHaveLength(4);
    expect(detail.files.find(file => file.id === detail.mainFileId)?.path).toBe("main.tex");
    const output = unzipSync(await writing.export(d.project, member, imported.id));
    expect(strFromU8(output["main.tex"]!)).toBe(source);
    expect(output["figures/Research (1).jpg"]?.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(await writing.search(d.project, member, imported.id, "shared team")).toMatchObject({ truncated: false, matches: [{ path: "sections/intro.tex", line: 1 }] });
    await expect(writing.search(d.project, outsider, imported.id, "shared team")).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.importZip(d.project, mentor, { ...input, clientKey: crypto.randomUUID() }, zip)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: member } }, data: { status: "REMOVED" } });
    await expect(writing.search(d.project, member, imported.id, "shared team")).rejects.toMatchObject({ statusCode: 404 });
    const before = await db.draftWorkspace.count({ where: { projectId: d.project } });
    await expect(writing.importZip(d.project, owner, { ...input, clientKey: crypto.randomUUID() }, zipSync({ "main.tex": strToU8("a".repeat(500001)) }))).rejects.toThrow();
    expect(await db.draftWorkspace.count({ where: { projectId: d.project } })).toBe(before);
  });

  it("persists custom class and bibliography style files through snapshots, source export and restore", async () => {
    const d = await draft();
    const sources = [
      { path: "teamarticle.cls", content: "\\ProvidesClass{teamarticle}\\LoadClass{article}" },
      { path: "teamstyle.bst", content: "% A project-local BibTeX style\nENTRY { title } {} {}\nREAD\n" },
    ];
    for (const source of sources) await writing.createFile(d.project, owner, d.id, { ...source, kind: "TEXT", clientKey: crypto.randomUUID() });
    const sealed = await writing.snapshot(d.project, member, d.id, { label: "Template sources", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const zip = unzipSync(await writing.export(d.project, member, d.id, sealed.id));
    for (const source of sources) expect(strFromU8(zip[source.path]!)).toBe(source.content);
    const restored = await writing.restore(d.project, owner, d.id, sealed.id, { title: "Restored template", clientKey: crypto.randomUUID() });
    const detail = await writing.detail(d.project, member, restored.id);
    expect(detail.files.map(file => file.path)).toEqual(expect.arrayContaining(sources.map(source => source.path)));
  });
  it("creates multiple canonical manuscripts, preserves legacy workspace uniqueness and retries", async () => {
    const d = await draft(), input = { title: "Second manuscript", description: "", documentType: "THESIS" as const, template: "REPORT" as const, clientKey: crypto.randomUUID() };
    const second = await writing.create(d.project, member, input); expect((await writing.list(d.project, owner))).toHaveLength(2);
    expect((await writing.list(d.project, owner)).every(row => row.latestFeedback === null)).toBe(true);
    expect((await writing.create(d.project, member, input)).id).toBe(second.id);
    await expect(writing.create(d.project, member, { ...input, title: "Changed" })).rejects.toMatchObject({ statusCode: 409 });
    await db.draftWorkspace.create({ data: { projectId: d.project, createdById: owner, name: "Legacy" } });
    await expect(db.draftWorkspace.create({ data: { projectId: d.project, createdById: owner, name: "Duplicate legacy" } })).rejects.toThrow();
  });
  it("merges concurrent insert/delete, checks receipts, causal completeness and attribution", async () => {
    const d = await draft(), state = (await writing.fileContent(d.project, owner, d.id, d.file)).state!;
    const a = sourceDocument(Buffer.from(state, "base64")), b = sourceDocument(Buffer.from(state, "base64"));
    const vector = Y.encodeStateVector(a); a.getText("source").insert(10, "ALPHA"); b.getText("source").delete(8, 3); b.getText("source").insert(8, "BETA");
    const ua = Y.encodeStateAsUpdate(a, vector), ub = Y.encodeStateAsUpdate(b, vector);
    const ia = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(ua).toString("base64") }, ib = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(ub).toString("base64") };
    await Promise.all([writing.applyUpdate(d.project, owner, d.id, d.file, ia), writing.applyUpdate(d.project, member, d.id, d.file, ib)]);
    Y.applyUpdate(a, ub); Y.applyUpdate(b, ua); expect(a.getText("source").toString()).toBe(b.getText("source").toString());
    const canonical = await writing.fileContent(d.project, owner, d.id, d.file); expect(sourceText(Buffer.from(canonical.state!, "base64"))).toBe(a.getText("source").toString());
    const receipt = await writing.applyUpdate(d.project, owner, d.id, d.file, ia); expect(receipt.replay).toBe(true);
    await expect(writing.applyUpdate(d.project, owner, d.id, d.file, { ...ia, update: ib.update })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.manuscriptUpdate.count({ where: { fileId: d.file } })).toBe(2);
    expect((await db.projectActivity.findMany({ where: { projectId: d.project, type: "MANUSCRIPT_WRITING_SESSION" } })).map(e => e.actorId).sort()).toEqual([owner, member].sort());
    const causal = sourceDocument(); causal.getText("source").insert(0, "dependency"); const before = Y.encodeStateVector(causal); causal.getText("source").insert(10, "missing");
    await expect(writing.applyUpdate(d.project, owner, d.id, d.file, { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(causal, before)).toString("base64") })).rejects.toMatchObject({ statusCode: 409 });
    a.destroy(); b.destroy(); causal.destroy();
  });
  it("rejects path and same-name races, preserves stable renamed/deleted file history", async () => {
    const d = await draft();
    for (const path of ["../secret.tex", "C:/x.tex", "a\\b.tex", "/root.tex", "a/../../b.tex"]) await expect(writing.createFile(d.project, member, d.id, { path, kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(writing.createFile(d.project, member, d.id, { path: "oversize.tex", kind: "TEXT", content: "漢".repeat(200000), clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    const races = await Promise.allSettled([owner, member].map(actor => writing.createFile(d.project, actor, d.id, { path: "sections/concurrent.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })));
    expect(races.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const f = (await writing.detail(d.project, member, d.id)).files.find(f => f.path === "sections/concurrent.tex")!;
    const edit = await update(d, member, text => text.insert(0, "Acknowledged section"), f.id);
    await writing.changeFile(d.project, owner, d.id, f.id, { path: "sections/renamed.tex", expectedVersion: edit.result.fileVersion });
    expect((await writing.fileContent(d.project, member, d.id, f.id)).path).toBe("sections/renamed.tex");
    await expect(writing.changeFile(d.project, member, d.id, f.id, { delete: true, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await writing.changeFile(d.project, owner, d.id, f.id, { delete: true, expectedVersion: edit.result.fileVersion + 1 });
    expect(sourceText((await db.manuscriptFile.findUniqueOrThrow({ where: { id: f.id } })).crdtState!)).toBe("Acknowledged section");
    await expect(writing.applyUpdate(d.project, member, d.id, f.id, edit.input)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.changeFile(d.project, owner, d.id, d.file, { delete: true, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("atomically resolves citation keys from canonical literature while keeping manual content", async () => {
    const d = await draft(), paper = await db.paper.create({ data: { primaryProvider: "user", title: "Canonical methods", publicationYear: 2024, doi: `10.1234/${crypto.randomUUID()}` } });
    await db.projectPaper.create({ data: { projectId: d.project, paperId: paper.id, addedById: owner } });
    const base = citationKey(paper, []), bib = d.detail.files.find(f => f.path === "references.bib")!;
    await update(d, owner, text => text.insert(text.length, `@article{${base}, title={Manual metadata}}\n`), bib.id);
    const results = await Promise.all([owner, member].map(actor => writing.insertCitation(d.project, actor, d.id, paper.id)));
    expect(results[0]!.key).toBe(`${base}_2`); expect(results[1]!.key).toBe(results[0]!.key);
    const text = sourceText(Buffer.from((await writing.fileContent(d.project, owner, d.id, bib.id)).state!, "base64"));
    expect(text).toContain("Manual metadata"); expect(text.match(/lumigap-paper:/g)).toHaveLength(1); expect(text).toContain("Canonical methods");
    await expect(writing.insertCitation(d.project, member, d.id, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
  it("retains exact source and raster bytes in immutable snapshots, export and restored drafts", async () => {
    const d = await draft(), png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const asset = await writing.asset(d.project, member, d.id, { path: "figures/test.png", data: png.toString("base64") });
    const change = await update(d, member, text => text.insert(0, "% original\n"));
    const snap = await writing.snapshot(d.project, owner, d.id, { label: "v1", clientKey: crypto.randomUUID(), minimumSequences: { [d.file]: change.result.sequence } });
    await expect(writing.snapshot(d.project, owner, d.id, { label: "invalid", clientKey: crypto.randomUUID(), minimumSequences: { [d.file]: change.result.sequence + 100 } })).rejects.toMatchObject({ statusCode: 409 });
    const before = await writing.viewSnapshot(d.project, owner, d.id, snap.id);
    await update(d, member, text => text.insert(0, "% changed\n"));
    const blue = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
    await writing.asset(d.project, member, d.id, { path: asset.path, data: blue.toString("base64"), replaceId: asset.id, expectedVersion: asset.version });
    expect((await writing.viewSnapshot(d.project, member, d.id, snap.id)).checksum).toBe(before.checksum);
    const zip = unzipSync(await writing.export(d.project, member, d.id, snap.id));
    expect(strFromU8(zip["main.tex"]!)).toBe(before.manifest!.files.find(f => f.id === d.file)!.text);
    expect(hashBytes(zip[asset.path]!)).toBe(asset.checksum);
    await expect(db.manuscriptSnapshot.update({ where: { id: snap.id }, data: { label: "mutated" } })).rejects.toThrow(/append-only/);
    const restored = await writing.restore(d.project, owner, d.id, snap.id, { title: "Restored v1", clientKey: crypto.randomUUID() });
    expect(restored.id).not.toBe(d.id); expect(sourceText(Buffer.from((await writing.fileContent(d.project, owner, restored.id, restored.mainFileId!)).state!, "base64"))).toBe(strFromU8(zip["main.tex"]!));
    await expect(writing.asset(d.project, member, d.id, { path: "evil.png", data: Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64") })).rejects.toMatchObject({ statusCode: 400 });
    await expect(writing.compile(d.project, member, d.id, snap.id)).rejects.toMatchObject({ statusCode: 503 });
  });
  it("scopes mentor feedback to shared immutable versions and preserves replies after v2", async () => {
    const d = await draft(), req = await db.mentorshipRequest.create({ data: { projectId: d.project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = await db.mentorRelationship.create({ data: { projectId: d.project, mentorUserId: mentor, sourceRequestId: req.id } });
    const v1 = await writing.snapshot(d.project, owner, d.id, { label: "v1", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await expect(writing.viewSnapshot(d.project, mentor, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    const thread = await writing.comment(d.project, owner, d.id, { body: "Please evaluate sampling", clientKey: crypto.randomUUID(), snapshotId: v1.id, mentorRelationshipId: relation.id });
    expect((await writing.detail(d.project, member, d.id)).latestFeedback).toMatchObject({ snapshotId: v1.id, snapshotLabel: "v1", status: "PENDING" });
    expect((await writing.viewSnapshot(d.project, mentor, d.id, v1.id)).canComment).toBe(true);
    await discussions.reply(d.project, member, thread.id, { body: "We will clarify this", clientKey: crypto.randomUUID(), mentions: [], replyToId: null });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("PENDING");
    await discussions.reply(d.project, mentor, thread.id, { body: "Check the sampling frame", clientKey: crypto.randomUUID(), mentions: [], replyToId: null });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("RESPONDED");
    await writing.comment(d.project, mentor, d.id, { body: "Explain inclusion criteria", clientKey: crypto.randomUUID(), snapshotId: v1.id });
    await discussions.resolve(d.project, owner, thread.id, { expectedVersion: 1, status: "RESOLVED", conclusion: "Updated sampling rationale" });
    expect((await writing.comments(d.project, member, d.id, v1.id)).find(comment => comment.id === thread.id)).toMatchObject({ status: "RESOLVED", conclusion: "Updated sampling rationale" });
    expect((await writing.list(d.project, member))[0]!.latestFeedback?.status).toBe("RESOLVED");
    await discussions.resolve(d.project, owner, thread.id, { expectedVersion: 2, status: "OPEN", conclusion: "" });
    expect((await writing.list(d.project, member))[0]!.latestFeedback?.status).toBe("RESPONDED");
    await update(d, member, text => text.insert(0, "% inclusion criteria\n"));
    const v2 = await writing.snapshot(d.project, member, d.id, { label: "v2", clientKey: crypto.randomUUID(), minimumSequences: {} });
    expect(await writing.comments(d.project, member, d.id, v2.id)).toHaveLength(0);
    expect((await writing.comments(d.project, mentor, d.id, v1.id))).toHaveLength(2);
    await expect(writing.detail(d.project, mentor, d.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.createFile(d.project, mentor, d.id, { path: "attack.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await writing.comment(d.project, owner, d.id, { body: "Please review the revised version", clientKey: crypto.randomUUID(), snapshotId: v2.id, mentorRelationshipId: relation.id });
    expect((await writing.detail(d.project, member, d.id)).latestFeedback).toMatchObject({ snapshotId: v2.id, status: "PENDING" });
    await db.mentorRelationship.update({ where: { id: relation.id }, data: { status: "ENDED" } });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("ENDED");
    await expect(writing.viewSnapshot(d.project, mentor, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.list(d.project, outsider)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("checks the requested durability minimum when retrying an existing snapshot", async () => {
    const d = await draft(), input = { label: "Durable retry", clientKey: crypto.randomUUID(), minimumSequences: {} };
    const version = await writing.snapshot(d.project, owner, d.id, input);
    const edit = await update(d, member, text => text.insert(0, "% saved after the version\n"));
    await expect(writing.snapshot(d.project, owner, d.id, { ...input, minimumSequences: { [d.file]: edit.result.sequence } })).rejects.toMatchObject({ statusCode: 409 });
    expect((await writing.snapshot(d.project, owner, d.id, input)).id).toBe(version.id);
    expect(await db.manuscriptSnapshot.count({ where: { workspaceId: d.id } })).toBe(1);
  });
  it("advertises editing only for manuscript discussions whose original context may be changed", async () => {
    const d = await draft(), version = await writing.snapshot(d.project, owner, d.id, { label: "Comment capabilities", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const live = await writing.comment(d.project, member, d.id, { body: "Anchored live comment", clientKey: crypto.randomUUID(), fileId: d.file });
    const snapshot = await writing.comment(d.project, member, d.id, { body: "Snapshot comment", clientKey: crypto.randomUUID(), snapshotId: version.id });
    const input = { title: "Linked discussion", body: "General manuscript discussion", category: "GENERAL" as const, link: { kind: "MANUSCRIPT" as const, id: d.id }, mentorRelationshipId: null, mentions: [], clientKey: crypto.randomUUID() };
    for (const thread of [live, snapshot]) {
      expect(await discussions.detail(d.project, member, thread.id, { page: 1, pageSize: 20 })).toMatchObject({ canEdit: false, canReply: true, canResolve: true });
      await expect(discussions.save(d.project, member, { ...input, expectedVersion: 1 }, thread.id)).rejects.toMatchObject({ statusCode: 409 });
    }
    const editable = await discussions.save(d.project, member, input);
    expect(await discussions.detail(d.project, member, editable.id, { page: 1, pageSize: 20 })).toMatchObject({ canEdit: true });
    expect(await discussions.save(d.project, member, { ...input, body: "Updated general discussion", expectedVersion: 1 }, editable.id)).toMatchObject({ id: editable.id, version: 2 });
  });
  it("keeps archived manuscript comments and snapshot feedback read-only through every discussion route", async () => {
    const d = await draft(), req = await db.mentorshipRequest.create({ data: { projectId: d.project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = await db.mentorRelationship.create({ data: { projectId: d.project, mentorUserId: mentor, sourceRequestId: req.id } });
    const version = await writing.snapshot(d.project, owner, d.id, { label: "Archived feedback", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const live = await writing.comment(d.project, member, d.id, { body: "Live comment", clientKey: crypto.randomUUID() });
    const shared = await writing.comment(d.project, owner, d.id, { body: "Snapshot feedback", clientKey: crypto.randomUUID(), snapshotId: version.id, mentorRelationshipId: relation.id });
    await db.draftWorkspace.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    for (const actor of [owner, mentor]) {
      expect(await writing.viewSnapshot(d.project, actor, d.id, version.id)).toMatchObject({ canComment: false, canResolve: false });
      await expect(writing.comment(d.project, actor, d.id, { body: "Archived mutation", clientKey: crypto.randomUUID(), snapshotId: version.id })).rejects.toMatchObject({ statusCode: 409 });
    }
    for (const [actor, thread] of [[owner, live.id], [owner, shared.id], [mentor, shared.id]] as const) {
      expect(await discussions.detail(d.project, actor, thread, { page: 1, pageSize: 20 })).toMatchObject({ canReply: false, canResolve: false, canEdit: false });
      await expect(discussions.reply(d.project, actor, thread, { body: "Archived reply", clientKey: crypto.randomUUID(), mentions: [], replyToId: null })).rejects.toMatchObject({ statusCode: 409 });
    }
    await expect(discussions.resolve(d.project, owner, shared.id, { expectedVersion: 1, status: "RESOLVED", conclusion: "Archived resolution" })).rejects.toMatchObject({ statusCode: 409 });
    for (const link of [{ kind: "MANUSCRIPT" as const, id: d.id }, { kind: "MANUSCRIPT_SNAPSHOT" as const, id: version.id }]) await expect(discussions.save(d.project, owner, { title: "Archived linked comment", body: "Archived linked body", category: "GENERAL", link, mentorRelationshipId: null, mentions: [], clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.projectTeamMessage.count({ where: { projectId: d.project } })).toBe(0);
  });
  it("revokes deleted manuscript feedback access through generic discussion lists and routes", async () => {
    const d = await draft(), req = await db.mentorshipRequest.create({ data: { projectId: d.project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = await db.mentorRelationship.create({ data: { projectId: d.project, mentorUserId: mentor, sourceRequestId: req.id } });
    const version = await writing.snapshot(d.project, owner, d.id, { label: "Deleted feedback", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const live = await writing.comment(d.project, member, d.id, { body: "Deleted live comment", clientKey: crypto.randomUUID() });
    const shared = await writing.comment(d.project, owner, d.id, { body: "Deleted snapshot feedback", clientKey: crypto.randomUUID(), snapshotId: version.id, mentorRelationshipId: relation.id });
    await writing.remove(d.project, owner, d.id, d.detail.version);
    for (const actor of [owner, member, mentor]) expect(await discussions.list(d.project, actor, { page: 1, pageSize: 20 })).toMatchObject({ items: [], total: 0 });
    for (const [actor, thread] of [[owner, live.id], [owner, shared.id], [mentor, shared.id]] as const) {
      await expect(discussions.detail(d.project, actor, thread, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
      await expect(discussions.reply(d.project, actor, thread, { body: "Deleted reply", clientKey: crypto.randomUUID(), mentions: [], replyToId: null })).rejects.toMatchObject({ statusCode: 404 });
      await expect(discussions.history(d.project, actor, "DISCUSSION", thread, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
    }
    await expect(discussions.resolve(d.project, owner, shared.id, { expectedVersion: 1, status: "RESOLVED", conclusion: "Deleted resolution" })).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.projectDiscussion.count({ where: { projectId: d.project } })).toBe(2);
    const ordinary = await discussions.save(d.project, owner, { title: "General project discussion", body: "Independent from the deleted manuscript", category: "GENERAL", link: null, mentorRelationshipId: null, mentions: [], clientKey: crypto.randomUUID() });
    const available = await discussions.list(d.project, member, { page: 1, pageSize: 20 });
    expect(available.items.map(thread => thread.id)).toEqual([ordinary.id]); expect(available.total).toBe(1);
  });
  it("executes formal request, acceptance and structured review against the sealed source only", async () => {
    const d = await draft(), v1 = await writing.snapshot(d.project, owner, d.id, { label: "Submission v1", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const sealed = await writing.publish(d.project, member, d.id, v1.id, [owner, member]);
    await expect(writing.publish(d.project, member, d.id, v1.id, [member])).rejects.toMatchObject({ statusCode: 409 });
    const template = await reviewTemplateService.create({ name: "Manuscript methods rubric", source: "PERSONAL", reviewMode: "RUBRIC_ASSESSMENT", publish: true, guidelines: [], criteria: [{ key: "method", title: "Method", weight: 1, required: true, levels: [{ label: "Clear", score: 4 }] }] }, owner, "USER");
    const request = await reviewRequestService.create({ submissionId: sealed.submissionId, reviewerId: reviewer, templateVersionId: template.activeVersion!.id }, owner);
    await expect(writing.viewSnapshot(d.project, reviewer, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    await reviewRequestService.accept(request.id, reviewer);
    await writing.comment(d.project, member, d.id, { body: "Private team preparation notes", clientKey: crypto.randomUUID(), snapshotId: v1.id });
    expect(await writing.comments(d.project, member, d.id, v1.id)).toHaveLength(1);
    expect(await writing.comments(d.project, reviewer, d.id, v1.id)).toEqual([]);
    expect(await writing.commentPage(d.project, reviewer, d.id, v1.id)).toEqual({ items: [], nextCursor: null });
    expect((await reviewService.getReview(request.assignment.id, reviewer)).manuscriptSource).toEqual({ projectId: d.project, manuscriptId: d.id, snapshotId: v1.id });
    const view = await writing.viewSnapshot(d.project, reviewer, d.id, v1.id); expect(view.canComment).toBe(false); expect(view.formalRevisionId).toBe(sealed.revisionId);
    await update(d, member, text => text.insert(0, "% live source changed after review started\n"));
    const v2 = await writing.snapshot(d.project, owner, d.id, { label: "Submission v2", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await expect(writing.viewSnapshot(d.project, reviewer, d.id, v2.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.detail(d.project, reviewer, d.id)).rejects.toMatchObject({ statusCode: 404 });
    const review = await reviewService.saveReview(request.assignment.id, reviewer, { overallAssessment: "STRONG", responses: [{ criterionKey: "method", performanceLevelId: template.activeVersion!.criteria[0]!.levels[0]!.id, comment: "Sampling is clear" }], requiredRevisions: [] }, true);
    expect(review.review.revisionId).toBe(sealed.revisionId);
    expect((await db.submissionRevision.findUniqueOrThrow({ where: { id: sealed.revisionId } })).contentSnapshot).not.toContain("live source changed");
  });
  it("denies outsiders, nested ID attacks, archived mutations and revoked sessions", async () => {
    const d = await draft(), other = await draft();
    await expect(writing.detail(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.fileContent(d.project, member, d.id, other.file)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.export(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    const input = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(sourceDocument())).toString("base64") };
    await expect(writing.applyUpdate(d.project, member, d.id, d.file, input, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 401 });
    await db.project.update({ where: { id: d.project }, data: { status: "ARCHIVED" } });
    expect((await writing.detail(d.project, member, d.id)).canWrite).toBe(false);
    await expect(writing.createFile(d.project, member, d.id, { path: "archived.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("pages every comment and keeps the latest replies in a busy thread", async () => {
    const d = await draft(), base = Date.now() - 10000;
    const threads = Array.from({ length: 201 }, (_, index) => ({ id: crypto.randomUUID(), projectId: d.project, authorId: owner, category: "GENERAL", title: `Comment ${index}`, body: `Comment ${index}`, targetKind: "MANUSCRIPT", targetId: d.id, clientKey: crypto.randomUUID(), createdAt: new Date(base + index) }));
    await db.projectDiscussion.createMany({ data: threads });
    const thread = threads[200]!;
    await db.projectTeamMessage.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ projectId: d.project, threadId: thread.id, senderId: member, content: `Reply ${index}`, clientKey: crypto.randomUUID(), createdAt: new Date(base + 500 + index) })) });
    const first = await writing.commentPage(d.project, owner, d.id);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toMatchObject({ body: "Comment 200", hasMoreMessages: true });
    expect(first.items[0]?.messages.at(-1)?.body).toBe("Reply 1000");
    expect(first.items[0]?.messages).toHaveLength(20);
    const ids = first.items.map(row => row.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await writing.commentPage(d.project, owner, d.id, undefined, cursor);
      ids.push(...page.items.map(row => row.id)); cursor = page.nextCursor;
    }
    expect(ids).toHaveLength(201); expect(new Set(ids).size).toBe(201);
    const conversation = await discussions.detail(d.project, owner, thread.id, { page: 51, pageSize: 20 });
    expect(conversation.messages.items.at(-1)?.body).toBe("Reply 1000");
    await expect(writing.commentPage(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    const other = await draft(), foreign = await writing.comment(other.project, owner, other.id, { body: "Other project", clientKey: crypto.randomUUID() });
    await expect(writing.commentPage(d.project, owner, d.id, undefined, foreign.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
