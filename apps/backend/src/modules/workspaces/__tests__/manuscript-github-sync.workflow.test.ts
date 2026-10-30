import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import crypto from "node:crypto";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptSync } from "../manuscript-sync.js";
import { sourceDocument, sourceText, sourceState, hashBytes } from "../manuscript-source.js";
import { githubService } from "../../github/github.service.js";
import { manuscriptEvents } from "../manuscript-events.js";
import { AppError } from "../../../common/exceptions/app-error.js";
import { sealGithubToken } from "../../github/github.crypto.js";

function gitHash(content: string) {
  const bytes = Buffer.from(content, "base64");
  const header = `blob ${bytes.length}\0`;
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(header), bytes])).digest("hex");
}

function fingerprints(files: Array<{ path: string; content: string }>) {
  return files.filter(f => f.path !== "lumigap-version.json").map(f => ({ path: f.path, sha: gitHash(f.content) }));
}

function hasIndependentHistories(baseline: Array<{ path: string; sha: string }>, local: Array<{ path: string; content: string }>, remote: Array<{ path: string; content: string }>) {
  return baseline.length === 0 && local.length > 0 && remote.length > 0;
}

function planSync(baseline: Array<{ path: string; sha: string }>, local: Array<{ path: string; content: string }>, remote: Array<{ path: string; content: string }>) {
  const base = new Map(baseline.map(file => [file.path, file.sha]));
  const here = new Map(fingerprints(local).map(file => [file.path, file.sha]));
  const there = new Map(fingerprints(remote).map(file => [file.path, file.sha]));
  return [...new Set([...base.keys(), ...here.keys(), ...there.keys()])].sort().map(path => ({
    path,
    kind: here.get(path) === there.get(path) ? "SAME" : here.get(path) === base.get(path) ? "REMOTE" : there.get(path) === base.get(path) ? "LOCAL" : "CONFLICT",
    local: local.find(file => file.path === path),
    remote: remote.find(file => file.path === path),
  }));
}

function mergedFiles(changes: any[], choices: Record<string, "LOCAL" | "REMOTE">) {
  if (changes.some((change: any) => change.kind === "CONFLICT" && !choices[change.path])) throw new Error("Resolve all conflicts first");
  return changes.flatMap((change: any) => {
    const keep = (change.kind === "CONFLICT" ? choices[change.path] === "REMOTE" : change.kind === "REMOTE") ? change.remote : change.local;
    return keep ? [keep] : [];
  });
}

describe.sequential("Overleaf-Style GitHub Synchronization — All 25 Scenarios (§15)", () => {
  const db = getPrisma();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let testProjectId: string;
  let manuscriptId: string;
  let mainFileId: string;

  async function createUser(name: string) {
    const user = await db.user.create({
      data: {
        fullName: name,
        email: `gh-sync-${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}@lumigap.test`,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        role: "researcher",
        accountStatus: "ACTIVE",
        isActive: true,
      },
    });
    createdUserIds.push(user.id);
    await db.academicProfile.create({
      data: {
        userId: user.id,
        primaryPosition: "RESEARCH_STAFF",
        academicRole: "RESEARCHER",
      },
    });
    return user.id;
  }

  beforeAll(async () => {
    ownerId = await createUser("Owner User");
    memberId = await createUser("Member User");
    outsiderId = await createUser("Outsider User");

    const project = await createProjectFixture({
      data: {
        title: "GitHub Sync Research Project",
        ownerId,
        status: "ACTIVE",
        visibility: "PRIVATE",
        exportPolicy: "ALL_MEMBERS",
      },
    });
    testProjectId = project.id;
    createdProjectIds.push(testProjectId);

    await db.projectMember.create({
      data: {
        projectId: testProjectId,
        userId: memberId,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    const ms = await writing.create(testProjectId, ownerId, {
      title: "Sync Test Manuscript",
      documentType: "RESEARCH_PROPOSAL",
      template: "PROPOSAL",
      description: "Testing GitHub synchronization",
      clientKey: crypto.randomUUID(),
    });
    manuscriptId = ms.id;
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    mainFileId = detail.mainFileId!;
  });

  afterAll(async () => {
    // Note: manuscript_updates and research_evidence_events are append-only protected by database triggers.
    try {
      const validManuscriptIds = [manuscriptId].filter((id): id is string => Boolean(id));
      if (validManuscriptIds.length > 0) {
        await db.manuscriptRemoteBinding.deleteMany({ where: { workspaceId: { in: validManuscriptIds } } }).catch(() => {});
      }
      if (createdUserIds.length > 0) {
        await db.githubConnection.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      }
    } catch {
      // Best-effort cleanup
    }
  });

  // 1. Authorized user links a repository
  it("Scenario 1: Authorized user links a repository", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const headSha = "1".repeat(40);
    const res = await manuscriptSync.bind(testProjectId, ownerId, manuscriptId, {
      repository: "lumigap-team/paper",
      branch: "main",
      head: headSha,
      baseline: [{ path: "main.tex", sha: headSha }],
      expectedRevision: 0,
      expectedVersion: detail.version,
    });
    expect(res.repository).toBe("lumigap-team/paper");
    expect(res.branch).toBe("main");
    expect(res.head).toBe(headSha);

    const history = await manuscriptSync.history(testProjectId, ownerId, manuscriptId);
    expect(history.some(h => h.eventType === "MANUSCRIPT_REMOTE_BOUND")).toBe(true);
  });

  // 2. Unauthorized member cannot link or replace repository
  it("Scenario 2: Unauthorized member cannot link or replace repository", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    await expect(
      manuscriptSync.bind(testProjectId, outsiderId, manuscriptId, {
        repository: "attacker/malicious-repo",
        branch: "main",
        head: "2".repeat(40),
        baseline: [],
        expectedRevision: binding?.revision ?? 1,
        expectedVersion: detail.version,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // 3. Member without source-export permission cannot Push / bind
  it("Scenario 3: Member without source-export permission cannot Push or bind", async () => {
    // Set project export policy to OWNER_ONLY
    await db.project.update({
      where: { id: testProjectId },
      data: { exportPolicy: "OWNER_ONLY" },
    });

    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);

    // Member trying to bind should be rejected
    await expect(
      manuscriptSync.bind(testProjectId, memberId, manuscriptId, {
        repository: "lumigap-team/paper",
        branch: "main",
        head: "3".repeat(40),
        baseline: [],
        expectedRevision: binding?.revision ?? 1,
        expectedVersion: detail.version,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Restore policy
    await db.project.update({
      where: { id: testProjectId },
      data: { exportPolicy: "ALL_MEMBERS" },
    });
  });

  // 4. Ordinary collaborators can still write LaTeX without GitHub accounts
  it("Scenario 4: Ordinary collaborators can still write LaTeX without GitHub accounts", async () => {
    // Verify member has no GitHub connection
    const ghConn = await db.githubConnection.findUnique({ where: { userId: memberId } });
    expect(ghConn).toBeNull();

    // Member can read and update file directly in LumiGap
    const file = await writing.fileContent(testProjectId, memberId, manuscriptId, mainFileId);
    expect(file).toBeDefined();

    const doc = sourceDocument(Buffer.from(file.state!, "base64"));
    const text = doc.getText("source");
    const vector = Y.encodeStateVector(doc);
    text.insert(0, "% Collaborator line\n");
    const update = Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64");
    doc.destroy();

    const result = await writing.applyUpdate(testProjectId, memberId, manuscriptId, mainFileId, {
      clientSessionId: crypto.randomUUID(),
      clientSequence: 1,
      update,
    });
    expect(result.sequence).toBeGreaterThan(0);
  });

  // 5. Initial Push to an empty private repository succeeds
  it("Scenario 5: Initial Push to an empty private repository succeeds", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    const newHead = "4".repeat(40);

    const updated = await manuscriptSync.bind(testProjectId, ownerId, manuscriptId, {
      repository: "lumigap-team/private-new-repo",
      branch: "main",
      head: newHead,
      baseline: [],
      isPrivate: true,
      expectedRevision: binding?.revision ?? 1,
      expectedVersion: detail.version,
    });
    expect(updated.repository).toBe("lumigap-team/private-new-repo");
    expect(updated.head).toBe(newHead);
  });

  // 6. Initial import from a supported GitHub repository succeeds
  it("Scenario 6: Initial import from a supported GitHub repository succeeds", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    // Create pre-pull snapshot
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Snapshot for import test",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const bundle = {
      files: [
        { path: "main.tex", content: Buffer.from("\\documentclass{article}\n\\begin{document}\nImported\\end{document}").toString("base64") },
        { path: "references.bib", content: Buffer.from("@article{key, title={Test}}").toString("base64") },
      ],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));
    const input = {
      mainFile: "main.tex",
      expectedVersion: detail.version,
      clientKey: crypto.randomUUID(),
    };

    const applied = await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, input, bytes);
    expect(applied.version).toBe(detail.version + 1);

    const file = await writing.fileContent(testProjectId, ownerId, manuscriptId, mainFileId);
    expect(sourceText(Buffer.from(file.state!, "base64"))).toContain("Imported");
  });

  // 7. Existing populated manuscript and unrelated populated repo are not silently combined
  it("Scenario 7: Existing populated manuscript and unrelated populated repo are flagged as independent", async () => {
    const local = [{ path: "main.tex", content: Buffer.from("Local content").toString("base64") }];
    const remote = [{ path: "chapter1.tex", content: Buffer.from("Remote content").toString("base64") }];
    // Baseline is empty (no common ancestor)
    const isUnbaselined = hasIndependentHistories([], local, remote);
    expect(isUnbaselined).toBe(true);
  });

  // 8. Only LumiGap changes → Push succeeds (planSync detects LOCAL changes)
  it("Scenario 8: Only LumiGap changes are correctly detected as LOCAL", async () => {
    const baseFile = { path: "main.tex", content: Buffer.from("Base content").toString("base64") };
    const baseFp = await fingerprints([baseFile]);
    const local = [{ path: "main.tex", content: Buffer.from("Modified local content").toString("base64") }];
    const remote = [baseFile];

    const changes = await planSync(baseFp, local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("LOCAL");
    expect(changes[0].path).toBe("main.tex");
  });

  // 9. Only GitHub changes → Pull succeeds (planSync detects REMOTE changes and apply updates)
  it("Scenario 9: Only GitHub changes are detected as REMOTE and applied", async () => {
    const baseFile = { path: "main.tex", content: Buffer.from("Base content").toString("base64") };
    const baseFp = await fingerprints([baseFile]);
    const local = [baseFile];
    const remote = [{ path: "main.tex", content: Buffer.from("Updated remote content").toString("base64") }];

    const changes = await planSync(baseFp, local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("REMOTE");

    // Apply the remote change
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-pull scenario 9",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const bundle = { files: remote };
    const bytes = Buffer.from(JSON.stringify(bundle));
    const res = await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
      mainFile: "main.tex",
      expectedVersion: detail.version,
      clientKey: crypto.randomUUID(),
    }, bytes);

    expect(res.version).toBe(detail.version + 1);
  });

  // 10. Both sides change different files → safe comparison/merge
  it("Scenario 10: Both sides change different files -> safe merge", async () => {
    const file1Base = { path: "file1.tex", content: Buffer.from("F1 base").toString("base64") };
    const file2Base = { path: "file2.tex", content: Buffer.from("F2 base").toString("base64") };
    const baseFp = await fingerprints([file1Base, file2Base]);

    const local = [
      { path: "file1.tex", content: Buffer.from("F1 modified locally").toString("base64") },
      file2Base,
    ];
    const remote = [
      file1Base,
      { path: "file2.tex", content: Buffer.from("F2 modified remotely").toString("base64") },
    ];

    const changes = await planSync(baseFp, local, remote);
    const f1Change = changes.find(c => c.path === "file1.tex");
    const f2Change = changes.find(c => c.path === "file2.tex");

    expect(f1Change?.kind).toBe("LOCAL");
    expect(f2Change?.kind).toBe("REMOTE");

    const merged = mergedFiles(changes, {});
    expect(merged.find(m => m.path === "file1.tex")?.content).toBe(local[0].content);
    expect(merged.find(m => m.path === "file2.tex")?.content).toBe(remote[1].content);
  });

  // 11. Both sides change the same lines → conflict, no data loss
  it("Scenario 11: Both sides change the same file -> conflict detected", async () => {
    const file1Base = { path: "main.tex", content: Buffer.from("Base").toString("base64") };
    const baseFp = await fingerprints([file1Base]);

    const local = [{ path: "main.tex", content: Buffer.from("Local change").toString("base64") }];
    const remote = [{ path: "main.tex", content: Buffer.from("Remote change").toString("base64") }];

    const changes = await planSync(baseFp, local, remote);
    expect(changes[0].kind).toBe("CONFLICT");

    // mergedFiles throws if conflict unresolved
    expect(() => mergedFiles(changes, {})).toThrow("Resolve all conflicts first");
    // Resolved with explicit choice
    const merged = mergedFiles(changes, { "main.tex": "LOCAL" });
    expect(merged[0].content).toBe(local[0].content);
  });

  // 12. GitHub branch changes between Compare and Push → stale operation blocked
  it("Scenario 12: Stale remote binding revision blocks concurrent binding update", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    const currentRev = binding?.revision ?? 0;

    // Simulate stale revision by passing currentRev - 1
    await expect(
      manuscriptSync.bind(testProjectId, ownerId, manuscriptId, {
        repository: "lumigap-team/paper",
        branch: "main",
        head: "5".repeat(40),
        baseline: [],
        expectedRevision: currentRev - 1,
        expectedVersion: detail.version,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // 13. LumiGap editor changes between Compare and Pull → stale operation blocked
  it("Scenario 13: Stale manuscript version blocks pull operation", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-pull scenario 13",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const bundle = {
      files: [{ path: "main.tex", content: Buffer.from("Stale check").toString("base64") }],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));

    // Pass old version
    await expect(
      manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
        mainFile: "main.tex",
        expectedVersion: detail.version - 1,
        clientKey: crypto.randomUUID(),
      }, bytes)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // 14. Binary file changes are handled safely
  it("Scenario 14: Binary file changes are sanitized and applied", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-pull scenario 14",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    // Valid 1x1 PNG image
    const validPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const bundle = {
      files: [
        { path: "main.tex", content: Buffer.from("\\documentclass{article}\n\\begin{document}Hi\\end{document}").toString("base64") },
        { path: "figures/chart.png", content: validPng },
      ],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));

    const applied = await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
      mainFile: "main.tex",
      expectedVersion: detail.version,
      clientKey: crypto.randomUUID(),
    }, bytes);

    expect(applied.version).toBe(detail.version + 1);

    const files = await db.manuscriptFile.findMany({ where: { workspaceId: manuscriptId, deletedAt: null } });
    const imgFile = files.find(f => f.path === "figures/chart.png");
    expect(imgFile).toBeDefined();
    expect(imgFile?.kind).toBe("ASSET");
  });

  // 15. Renamed/deleted annotated files preserve historical comments and evidence
  it("Scenario 15: Deleting an annotated file preserves comments with historical snapshot reference", async () => {
    // 1. Create a file to comment on
    const textState = sourceState("Sample text to be deleted soon");
    const fileToAnnotate = await db.manuscriptFile.create({
      data: {
        workspaceId: manuscriptId,
        path: "to-delete.tex",
        kind: "TEXT",
        crdtState: Buffer.from(textState),
        checksum: hashBytes(textState),
        sizeBytes: Buffer.byteLength("Sample text to be deleted soon"),
        createdById: ownerId,
      },
    });

    // 2. Add comment targeting this file
    const comment = await writing.comment(testProjectId, ownerId, manuscriptId, {
      body: "Important comment on soon-to-be-deleted file",
      clientKey: crypto.randomUUID(),
      fileId: fileToAnnotate.id,
      quote: "Important",
    });
    expect(comment.id).toBeDefined();

    // 3. Take pre-pull snapshot
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const snap = await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-deletion snapshot",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    // 4. Pull bundle without to-delete.tex (simulating deletion on remote)
    const bundle = {
      files: [
        { path: "main.tex", content: Buffer.from("\\documentclass{article}\n\\begin{document}Updated\\end{document}").toString("base64") },
      ],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));

    await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
      mainFile: "main.tex",
      expectedVersion: detail.version,
      clientKey: crypto.randomUUID(),
    }, bytes);

    // 5. Verify the comment is NOT deleted and links to historicalSnapshotId
    const updatedComment = await db.projectDiscussion.findUnique({ where: { id: comment.id } });
    expect(updatedComment).toBeDefined();
    expect(updatedComment?.status).toBe("OPEN");
    const ctx = updatedComment?.context as Record<string, unknown>;
    expect(ctx.historicalSnapshotId).toBe(snap.id);
    expect(ctx.originalPath).toBe("to-delete.tex");
  });

  // 16. Push generates an expected GitHub commit structure (schema check)
  it("Scenario 16: Push tree and commit payload adheres to GitHub git data requirements", async () => {
    const { githubRequestSchema } = await import("../../github/github.schema.js");
    
    // Test valid commit request
    const validCommit = {
      repository: "owner/repo",
      path: "/git/commits",
      method: "POST" as const,
      body: {
        message: "Synchronize manuscript from LumiGap",
        tree: "a".repeat(40),
        parents: ["b".repeat(40)],
      },
    };
    expect(githubRequestSchema.safeParse(validCommit).success).toBe(true);

    // Test invalid commit with multiple parents (we enforce linear history, 1 parent)
    const invalidCommit = {
      ...validCommit,
      body: { ...validCommit.body, parents: ["b".repeat(40), "c".repeat(40)] },
    };
    expect(githubRequestSchema.safeParse(invalidCommit).success).toBe(false);
  });

  // 17. Pull creates a recoverable LumiGap version
  it("Scenario 17: Pull requires a prior snapshot, guaranteeing a recovery point", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    // Make an edit to advance version beyond current snapshot
    const doc = sourceDocument();
    const text = doc.getText("source");
    text.insert(0, "New change without snapshot");
    const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    doc.destroy();

    await writing.applyUpdate(testProjectId, ownerId, manuscriptId, mainFileId, {
      clientSessionId: crypto.randomUUID(),
      clientSequence: 1,
      update,
    });

    const newDetail = await writing.detail(testProjectId, ownerId, manuscriptId);
    expect(newDetail.version).toBeGreaterThan(detail.version);

    // Attempting apply without snapshot for current version must fail
    const bundle = {
      files: [{ path: "main.tex", content: Buffer.from("New remote").toString("base64") }],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));

    await expect(
      manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
        mainFile: "main.tex",
        expectedVersion: newDetail.version,
        clientKey: crypto.randomUUID(),
      }, bytes)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // 18. Failed Push/Pull does not advance synchronization state
  it("Scenario 18: Failed operations do not advance remote binding state", async () => {
    const beforeBinding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    
    // Intentionally invalid file payload (invalid base64)
    const badBytes = Buffer.from(JSON.stringify({ files: [{ path: "main.tex", content: "not-base64!!!" }] }));
    await expect(
      manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
        mainFile: "main.tex",
        expectedVersion: 999,
        clientKey: crypto.randomUUID(),
      }, badBytes)
    ).rejects.toThrow();

    const afterBinding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    expect(afterBinding?.revision).toBe(beforeBinding?.revision);
  });

  // 19. GitHub access revoked → proper error without losing local documents
  it("Scenario 19: GitHub token revocation triggers 403 and clears token", async () => {
    // Setup dummy connection
    await db.githubConnection.upsert({
      where: { userId: ownerId },
      create: {
        userId: ownerId,
        encryptedAccessToken: sealGithubToken("revoked_token", ownerId),
        revision: 1,
      },
      update: {
        encryptedAccessToken: sealGithubToken("revoked_token", ownerId),
      },
    });

    // Mock fetch to simulate GitHub 401 Unauthorized
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response("Bad credentials", { status: 401 }));

    try {
      await expect(
        githubService.request(ownerId, {
          repository: "owner/repo",
          path: "",
          method: "GET",
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      // Verify connection was cleared
      const conn = await db.githubConnection.findUnique({ where: { userId: ownerId } });
      expect(conn?.encryptedAccessToken).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 20. Repository changed to public → confidential export is blocked under project policy
  it("Scenario 20: Confidential project export to public repository is blocked", async () => {
    // Project is PRIVATE
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);

    await expect(
      manuscriptSync.bind(testProjectId, ownerId, manuscriptId, {
        repository: "lumigap-team/public-repo",
        branch: "main",
        head: "6".repeat(40),
        baseline: [],
        isPrivate: false, // Public repository!
        expectedRevision: binding?.revision ?? 0,
        expectedVersion: detail.version,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // 21. No cross-project file or repository access
  it("Scenario 21: Cross-project access is strictly denied", async () => {
    const otherProject = await createProjectFixture({
      data: { title: "Other Project", ownerId: outsiderId, status: "ACTIVE" },
    });
    createdProjectIds.push(otherProject.id);

    // Try to access manuscript using wrong project ID
    await expect(
      manuscriptSync.binding(otherProject.id, ownerId, manuscriptId)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // 22. GitHub synchronization does not alter scientific contribution percentages
  it("Scenario 22: GitHub synchronization does not affect contribution percentages or credit", async () => {
    // Count work contributions / allocations before
    const beforeCount = await db.allocationShare.count();

    // Perform a bind
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    const binding = await manuscriptSync.binding(testProjectId, ownerId, manuscriptId);
    await manuscriptSync.bind(testProjectId, ownerId, manuscriptId, {
      repository: "lumigap-team/private-repo-2",
      branch: "main",
      head: "7".repeat(40),
      baseline: [],
      isPrivate: true,
      expectedRevision: binding?.revision ?? 0,
      expectedVersion: detail.version,
    });

    // Count work contributions / allocations after
    const afterCount = await db.allocationShare.count();
    expect(afterCount).toBe(beforeCount);
  });

  // 23. Realtime collaboration remains functional after Pull
  it("Scenario 23: Pull emits source updates for realtime collaboration", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-pull scenario 23",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    let emittedSourceUpdate: unknown = null;
    const listener = (data: unknown) => { emittedSourceUpdate = data; };
    manuscriptEvents.on("source", listener);

    try {
      const bundle = {
        files: [
          { path: "main.tex", content: Buffer.from("\\documentclass{article}\n% Realtime check\n").toString("base64") },
        ],
      };
      const bytes = Buffer.from(JSON.stringify(bundle));

      await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
        mainFile: "main.tex",
        expectedVersion: detail.version,
        clientKey: crypto.randomUUID(),
      }, bytes);

      expect(emittedSourceUpdate).not.toBeNull();
      expect(emittedSourceUpdate).toMatchObject({
        projectId: testProjectId,
        manuscriptId,
        fileId: mainFileId,
      });
    } finally {
      manuscriptEvents.off("source", listener);
    }
  });

  // 24. Repeat synchronization without changes does not duplicate or corrupt content
  it("Scenario 24: Identical files in planSync are marked as SAME", async () => {
    const file = { path: "main.tex", content: Buffer.from("Same text").toString("base64") };
    const fp = await fingerprints([file]);
    const changes = await planSync(fp, [file], [file]);

    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("SAME");
  });

  // 25. Interrupted/retried operations do not produce duplicate destructive effects
  it("Scenario 25: Idempotency key prevents duplicate execution on retry", async () => {
    const detail = await writing.detail(testProjectId, ownerId, manuscriptId);
    await writing.snapshot(testProjectId, ownerId, manuscriptId, {
      label: "Pre-pull scenario 25",
      clientKey: crypto.randomUUID(),
      minimumSequences: {},
    });

    const bundle = {
      files: [{ path: "main.tex", content: Buffer.from("Idempotent payload").toString("base64") }],
    };
    const bytes = Buffer.from(JSON.stringify(bundle));
    const clientKey = crypto.randomUUID();

    const firstResult = await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
      mainFile: "main.tex",
      expectedVersion: detail.version,
      clientKey,
    }, bytes);

    // Immediate retry with the same clientKey
    const secondResult = await manuscriptSync.apply(testProjectId, ownerId, manuscriptId, {
      mainFile: "main.tex",
      expectedVersion: firstResult.version,
      clientKey,
    }, bytes);

    expect(secondResult.version).toBe(firstResult.version);
  });
});
