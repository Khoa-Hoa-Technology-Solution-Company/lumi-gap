import { describe, expect, it } from "vitest";
import { githubRequestSchema, githubReturnPath } from "../github.schema.js";
const sha = "a".repeat(40), repository = "team/paper";
describe("GitHub repository proxy boundary", () => {
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
