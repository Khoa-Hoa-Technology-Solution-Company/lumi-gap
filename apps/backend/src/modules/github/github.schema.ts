import { z } from "zod";
import { databaseIdSchema } from "../../common/validation/database-id.js";

export const githubRepository = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
export const githubReturnPath = z.string().max(500).regex(/^\/projects\/[a-fA-F0-9-]{24,36}(?:\/manuscripts\/[a-fA-F0-9-]{36}|\?tab=manuscripts)?$/);
export const githubStartSchema = z.object({ returnTo: githubReturnPath }).strict();
export const githubCompleteSchema = z.object({ code: z.string().min(1).max(512), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const githubPageSchema = z.object({ page: z.coerce.number().int().min(1).max(100).default(1) }).strict();
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const branch = z.string().max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(value => !value.includes("..") && !value.includes("//") && value.split("/").every(part => part && !part.endsWith(".lock") && !part.endsWith(".")));
const sourcePath = z.string().max(240).refine(value => value.split("/").every(part => /^[A-Za-z0-9][A-Za-z0-9._ ()-]*$/.test(part) && part.length <= 100 && !part.endsWith(" "))
  && value.split("/")[0]?.toLowerCase() !== "lumigap-build" && (/\.(tex|bib|txt|sty|cls|bst|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd|png|jpg|jpeg|webp|pdf|svg|eps)$/.test(value) || value === "lumigap-version.json"));
const blobBody = z.object({ content: z.string().max(6_666_668).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), encoding: z.literal("base64") }).strict();
const treeBody = z.object({ base_tree: sha, tree: z.array(z.object({ path: sourcePath, mode: z.literal("100644"), type: z.literal("blob"), sha: sha.nullable() }).strict()).min(1).max(401) }).strict();
const commitBody = z.object({ message: z.string().trim().min(1).max(500), tree: sha, parents: z.array(sha).length(1) }).strict();
const newRefBody = z.object({ ref: z.string().startsWith("refs/heads/").refine(value => branch.safeParse(value.slice(11)).success), sha }).strict();
const updateRefBody = z.object({ sha, force: z.literal(false) }).strict();
export const githubCreateRepoSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(true),
  projectId: databaseIdSchema.optional(),
}).strict();
export const githubInitializeRepoSchema = z.object({ repository: githubRepository, branch, projectId: databaseIdSchema }).strict();

export const githubRequestSchema = z.object({
  repository: githubRepository,
  path: z.string().max(400),
  method: z.enum(["GET", "POST", "PATCH"]),
  projectId: databaseIdSchema.optional(),
  body: z.unknown().optional(),
}).strict().superRefine((value, ctx) => {
  let valid = false;
  if (value.method === "GET" && value.body === undefined) {
    valid = value.path === "" || /^\/git\/(commits|blobs)\/[a-f0-9]{40}$/.test(value.path) || /^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(value.path);
    if (/^\/commits\?sha=[A-Za-z0-9%._-]+&per_page=5$/.test(value.path)) try { valid = branch.safeParse(decodeURIComponent(value.path.slice(13, -11))).success; } catch { /* Invalid encoding */ }
    if (/^\/compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}\?per_page=1$/.test(value.path)) valid = true;
    if (value.path.startsWith("/git/ref/heads/")) try { valid = branch.safeParse(decodeURIComponent(value.path.slice(15))).success; } catch { /* Invalid encoding */ }
  } else if (value.method === "POST") {
    valid = value.path === "/git/blobs" ? blobBody.safeParse(value.body).success : value.path === "/git/trees" ? treeBody.safeParse(value.body).success : value.path === "/git/commits" ? commitBody.safeParse(value.body).success : value.path === "/git/refs" && newRefBody.safeParse(value.body).success;
  } else if (value.method === "PATCH" && value.path.startsWith("/git/refs/heads/")) {
    try { valid = branch.safeParse(decodeURIComponent(value.path.slice(16))).success && updateRefBody.safeParse(value.body).success; } catch { /* Invalid encoding */ }
  }
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported GitHub repository operation" });
});
export type GithubRequest = z.infer<typeof githubRequestSchema>;
