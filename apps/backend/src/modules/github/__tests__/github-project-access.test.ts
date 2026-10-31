import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), project: vi.fn(), member: vi.fn(), connection: vi.fn(),
  githubJson: vi.fn(), record: vi.fn(), exportPolicy: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  user: { findUnique: mocks.user }, project: { findUnique: mocks.project },
  projectMember: { findFirst: mocks.member }, githubConnection: { findUnique: mocks.connection },
}) }));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: {} }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../github.crypto.js", () => ({ openGithubToken: () => "synthetic-token", sealGithubToken: vi.fn() }));
vi.mock("../github.http.js", async original => ({ ...await original<typeof import("../github.http.js")>(), githubJson: mocks.githubJson }));
vi.mock("../../audit/research-ledger.service.js", () => ({ researchLedgerService: { record: mocks.record }, assertCanExportProjectSource: mocks.exportPolicy }));
import { githubService } from "../github.service.js";
import { GithubHttpError } from "../github.http.js";

const userId = "54292743-7f2d-4053-ac65-c1d75b393887";
const projectId = "799b39a4-25ce-47e7-90ad-9c303d6c65d8";
const legacyId = "6ab33f1537802fe30d38753b";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: userId, isActive: true, accountStatus: "ACTIVE" });
  mocks.project.mockResolvedValue({ id: projectId, ownerId: userId, visibility: "PUBLIC", exportPolicy: "ALL_MEMBERS" });
  mocks.member.mockResolvedValue(null);
  mocks.connection.mockResolvedValue({ encryptedAccessToken: "synthetic-ciphertext", expiresAt: null });
  mocks.githubJson.mockResolvedValue({ private: true });
  mocks.record.mockResolvedValue(undefined);
});

it("resolves a legacy project URL before checking membership and contacting GitHub", async () => {
  await expect(githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "", method: "GET" })).resolves.toEqual({ private: true });
  expect(mocks.project).toHaveBeenCalledWith(expect.objectContaining({ where: { legacyMongoId: legacyId } }));
  expect(mocks.member).toHaveBeenCalledWith({ where: { projectId, userId, status: "ACTIVE" } });
  expect(mocks.githubJson).toHaveBeenCalledWith("https://api.github.com/repos/team/paper", expect.objectContaining({ method: "GET" }));
});

it("records exports using the canonical project ID even when the caller uses a legacy URL", async () => {
  await githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "/git/refs/heads/main", method: "PATCH", body: { sha: "a".repeat(40), force: false } });
  expect(mocks.exportPolicy).toHaveBeenCalledOnce();
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ projectId, actorId: userId, eventType: "MANUSCRIPT_SOURCE_EXPORTED" }));
});

it("checks the resolved project's export policy before creating a repository", async () => {
  mocks.githubJson.mockResolvedValue({ full_name: "team/new-paper", default_branch: "main", private: true });
  await expect(githubService.createRepository(userId, { projectId: legacyId, name: "new-paper", isPrivate: true })).resolves.toMatchObject({ fullName: "team/new-paper" });
  expect(mocks.member).toHaveBeenCalledWith({ where: { projectId, userId, status: "ACTIVE" } });
  expect(mocks.exportPolicy).toHaveBeenCalledOnce();
  const body = JSON.parse(mocks.githubJson.mock.calls[0]![1].body);
  expect(body).toMatchObject({ auto_init: true, private: true });
});

it.each(["read", "create"])("denies former members before a GitHub %s request", async mode => {
  mocks.project.mockResolvedValue({ id: projectId, ownerId: "another-owner", visibility: "PUBLIC", exportPolicy: "ALL_MEMBERS" });
  const work = mode === "read"
    ? githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "", method: "GET" })
    : githubService.createRepository(userId, { projectId: legacyId, name: "new-paper", isPrivate: true });
  await expect(work).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.githubJson).not.toHaveBeenCalled();
});

it("rejects an unknown project before a GitHub request", async () => {
  mocks.project.mockResolvedValue(null);
  await expect(githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "", method: "GET" })).rejects.toMatchObject({ statusCode: 404 });
  expect(mocks.githubJson).not.toHaveBeenCalled();
});

const initInput = { projectId: legacyId, repository: "team/empty-paper", branch: "main" };
it.each(["create", "initialize", "push"])("rejects an active member's %s action before contacting GitHub", async mode => {
  mocks.project.mockResolvedValue({ id: projectId, ownerId: "another-owner", visibility: "PUBLIC", exportPolicy: "ALL_MEMBERS" });
  mocks.member.mockResolvedValue({ userId, status: "ACTIVE" });
  const work = mode === "create" ? githubService.createRepository(userId, { projectId: legacyId, name: "paper", isPrivate: true })
    : mode === "initialize" ? githubService.initializeRepository(userId, initInput)
    : githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "/git/refs/heads/main", method: "PATCH", body: { sha: "a".repeat(40), force: false } });
  await expect(work).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.githubJson).not.toHaveBeenCalled();
});
it("rejects unscoped repository creation before contacting GitHub", async () => {
  await expect(githubService.createRepository(userId, { name: "paper", isPrivate: true })).rejects.toMatchObject({ statusCode: 400 });
  expect(mocks.githubJson).not.toHaveBeenCalled();
});
it("retains read access for an active project member", async () => {
  mocks.project.mockResolvedValue({ id: projectId, ownerId: "another-owner", visibility: "PUBLIC", exportPolicy: "ALL_MEMBERS" });
  mocks.member.mockResolvedValue({ userId, status: "ACTIVE" });
  await expect(githubService.request(userId, { projectId: legacyId, repository: "team/paper", path: "", method: "GET" })).resolves.toEqual({ private: true });
  expect(mocks.githubJson).toHaveBeenCalledOnce();
});
const metadata = { private: true, default_branch: "main", permissions: { push: true } };
const initialHead = "b".repeat(40);
it("initializes only an empty repository with a fixed README and canonical audit identity", async () => {
  mocks.githubJson.mockResolvedValueOnce(metadata).mockRejectedValueOnce(new GithubHttpError(409, false)).mockResolvedValueOnce({ commit: { sha: initialHead } });
  await expect(githubService.initializeRepository(userId, initInput)).resolves.toEqual({ head: initialHead });
  expect(mocks.member).toHaveBeenCalledWith({ where: { projectId, userId, status: "ACTIVE" } });
  expect(mocks.exportPolicy).toHaveBeenCalledOnce();
  const [url, request] = mocks.githubJson.mock.calls[2]!;
  expect(url).toBe("https://api.github.com/repos/team/empty-paper/contents/README.md");
  expect(request.method).toBe("PUT");
  const body = JSON.parse(request.body);
  expect(body).toEqual({ message: "Initialize repository for LumiGap", branch: "main", content: Buffer.from("# LumiGap manuscript repository\n\nManuscript source is synchronized only on explicit user action.\n").toString("base64") });
  expect(body).not.toHaveProperty("sha");
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ projectId, actorId: userId, eventType: "GITHUB_REPOSITORY_INITIALIZED", currentVersionRef: initialHead }));
});

it("does not initialize a repository which already has commits", async () => {
  mocks.githubJson.mockResolvedValueOnce(metadata).mockResolvedValueOnce([{ sha: initialHead }]);
  await expect(githubService.initializeRepository(userId, initInput)).rejects.toMatchObject({ statusCode: 409 });
  expect(mocks.githubJson).toHaveBeenCalledTimes(2);
  expect(mocks.record).not.toHaveBeenCalled();
});

it.each([[422, false], [403, false], [429, true], [500, false], [409, true]])("does not treat GitHub %s (rate limited: %s) as permission to initialize", async (status, limited) => {
  mocks.githubJson.mockResolvedValueOnce(metadata).mockRejectedValueOnce(new GithubHttpError(status as number, limited as boolean));
  await expect(githubService.initializeRepository(userId, initInput)).rejects.toBeDefined();
  expect(mocks.githubJson).toHaveBeenCalledTimes(2);
  expect(mocks.record).not.toHaveBeenCalled();
});

it.each(["read-only", "private-to-public", "wrong-branch"])("blocks initialization for %s before any GitHub write", async mode => {
  if (mode === "private-to-public") mocks.project.mockResolvedValue({ id: projectId, ownerId: userId, visibility: "PRIVATE", exportPolicy: "ALL_MEMBERS" });
  mocks.githubJson.mockResolvedValue({ ...metadata, private: mode !== "private-to-public", permissions: { push: mode !== "read-only" } });
  await expect(githubService.initializeRepository(userId, { ...initInput, branch: mode === "wrong-branch" ? "other" : "main" })).rejects.toBeDefined();
  expect(mocks.githubJson).toHaveBeenCalledTimes(1);
});

it("blocks a removed member before initializing a repository", async () => {
  mocks.project.mockResolvedValue({ id: projectId, ownerId: "other", visibility: "PUBLIC", exportPolicy: "ALL_MEMBERS" });
  await expect(githubService.initializeRepository(userId, initInput)).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.githubJson).not.toHaveBeenCalled();
});
