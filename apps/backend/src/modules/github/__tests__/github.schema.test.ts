import { describe, expect, it } from "vitest";
import { githubRequestSchema, githubReturnPath, githubCreateRepoSchema } from "../github.schema.js";
const sha = "a".repeat(40), repository = "team/paper";
describe("GitHub repository proxy boundary", () => {
  it("allows only bounded commit history and SHA-pinned ancestry comparisons", () => {
    for (const path of ["/commits?sha=main&per_page=5", "/commits?sha=feature%2Fpaper&per_page=5", `/compare/${sha}...${"b".repeat(40)}?per_page=1`]) expect(githubRequestSchema.safeParse({ repository, path, method: "GET" }).success).toBe(true);
    for (const path of ["/commits?sha=main&per_page=100", "/commits?sha=main&per_page=5&page=2", "/commits?sha=..%2Fprivate&per_page=5", "/commits?sha=main%26path%3Dsecret&per_page=5", "/commits?sha=%FF&per_page=5", "/compare/main...other", `/compare/${sha}...${sha}?per_page=100`]) expect(githubRequestSchema.safeParse({ repository, path, method: "GET" }).success).toBe(false);
    expect(githubRequestSchema.safeParse({ repository, path: "/commits?sha=main&per_page=5", method: "POST" }).success).toBe(false);
  });
  it("accepts both canonical and preserved legacy project identifiers", () => {
    for (const projectId of ["6ab33f1537802fe30d38753b", "6b7bf9dc-16b5-4f6a-a3d3-4c9e0a70346a"]) {
      expect(githubRequestSchema.safeParse({ repository, path: "", method: "GET", projectId }).success).toBe(true);
      expect(githubCreateRepoSchema.safeParse({ name: "paper", isPrivate: true, projectId }).success).toBe(true);
    }
    for (const projectId of ["../private", "not-an-id", "6ab33f1537802fe30d38753b/other"]) {
      expect(githubRequestSchema.safeParse({ repository, path: "", method: "GET", projectId }).success).toBe(false);
      expect(githubCreateRepoSchema.safeParse({ name: "paper", projectId }).success).toBe(false);
    }
  });
  it("permits existing source-sync read and non-force write operations", () => {
    for (const path of ["", `/git/ref/heads/${encodeURIComponent("feature/paper")}`, `/git/commits/${sha}`, `/git/trees/${sha}?recursive=1`, `/git/blobs/${sha}`]) expect(githubRequestSchema.safeParse({ repository, path, method: "GET" }).success).toBe(true);
    const writes = [
      ["/git/blobs", "POST", { content: "aGVsbG8=", encoding: "base64" }],
      ["/git/trees", "POST", { base_tree: sha, tree: [{ path: "sections/main.tex", mode: "100644", type: "blob", sha }] }],
      ["/git/commits", "POST", { message: "Source update", tree: sha, parents: [sha] }],
      ["/git/refs", "POST", { ref: "refs/heads/lumigap/source", sha }],
      ["/git/refs/heads/feature%2Fpaper", "PATCH", { sha, force: false }],
    ];
    for (const [path, method, body] of writes) expect(githubRequestSchema.safeParse({ repository, path, method, body }).success).toBe(true);
  });
  it("rejects arbitrary API paths, redirects, force pushes, tags, symlinks and executable source paths", () => {
    for (const path of ["/../../user", "https://evil.test", "/git/ref/heads/..%2Fmain", "/git/refs/tags/v1", "/git/ref/heads/a?x=1", "/git/ref/heads/a%252Fb", "/contents/secret"]) expect(githubRequestSchema.safeParse({ repository, path, method: "GET" }).success).toBe(false);
    expect(githubRequestSchema.safeParse({ repository, path: "/git/refs/heads/main", method: "PATCH", body: { sha, force: true } }).success).toBe(false);
    for (const path of [".github/workflows/ci.yml", "../main.tex", "lumigap-build/main.tex", "scripts/run.sh"]) expect(githubRequestSchema.safeParse({ repository, path: "/git/trees", method: "POST", body: { base_tree: sha, tree: [{ path, mode: "100644", type: "blob", sha }] } }).success).toBe(false);
    expect(githubRequestSchema.safeParse({ repository: "team/repo/../other", path: "", method: "GET" }).success).toBe(false);
    expect(githubRequestSchema.safeParse({ repository, path: "", method: "GET", body: { token: "leak" } }).success).toBe(false);
  });
  it("rejects external callback return paths", () => {
    expect(githubReturnPath.safeParse("/projects/6ab33f1537802fe30d38753b?tab=manuscripts").success).toBe(true);
    for (const path of ["//evil.test", "https://evil.test", "/projects/../auth", "/projects/6ab33f1537802fe30d38753b?next=https://evil.test"]) expect(githubReturnPath.safeParse(path).success).toBe(false);
  });
});
