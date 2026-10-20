import type { ManuscriptCompilation, ManuscriptEngine, ManuscriptManifest, ManuscriptTexLive } from "@trend/shared-types";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { manuscriptCompileQueue } from "../../infrastructure/queue.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { hashBytes, manuscriptPath } from "./manuscript-source.js";

/** Fixed server registry: a request can select a release, never an endpoint. */
export function compilerEndpoint(version: string) {
  const url = version === "2022" ? env.MANUSCRIPT_COMPILER_URL : version === "2025" ? env.MANUSCRIPT_COMPILER_2025_URL : undefined;
  if (!url) throw AppError.serviceUnavailable("The requested TeX Live release is not configured.");
  return url;
}
export const compilerAvailability = { available: Boolean(env.MANUSCRIPT_COMPILER_URL || env.MANUSCRIPT_COMPILER_2025_URL), reason: env.MANUSCRIPT_COMPILER_URL || env.MANUSCRIPT_COMPILER_2025_URL ? "READY" : "COMPILER_NOT_CONFIGURED", versions: ([...(env.MANUSCRIPT_COMPILER_URL ? ["2022"] : []), ...(env.MANUSCRIPT_COMPILER_2025_URL ? ["2025"] : [])] as ManuscriptTexLive[]) };
export const compilationSelect = { id: true, snapshotId: true, texLiveVersion: true, status: true, requestedById: true, diagnostics: true, checksum: true, toolchain: true, createdAt: true, completedAt: true } as const;
type Row = { texLiveVersion: string; id: string; snapshotId: string; status: string; diagnostics: string; checksum: string | null; toolchain: string | null; createdAt: Date; completedAt: Date | null };
const engineFromToolchain = (value: string | null): ManuscriptEngine => value?.startsWith("lualatex") ? "lualatex" : value?.startsWith("xelatex") ? "xelatex" : "pdflatex";
export const compilationDto = (row: Row, sourceVersion: number): ManuscriptCompilation => ({ ...row, texLiveVersion: row.texLiveVersion as ManuscriptTexLive, status: row.status as ManuscriptCompilation["status"], engine: engineFromToolchain(row.toolchain), sourceVersion, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null });

export async function enqueueCompilation(id: string) {
  try {
    await manuscriptCompileQueue.add("compile", { compilationId: id }, { jobId: id });
  } catch {
    await getPrisma().manuscriptCompilation.updateMany({ where: { id, status: "QUEUED" }, data: { status: "FAILED", completedAt: new Date(), diagnostics: "The compilation queue is unavailable. Please try again." } });
    throw AppError.serviceUnavailable("The compilation queue is unavailable. Please try again.");
  }
}

const compilerResult = z.object({ success: z.boolean(), errorCode: z.literal("TIMED_OUT").optional(), diagnostics: z.string().max(100000), toolchain: z.string().max(150), pdf: z.string().max(27000000).nullable(), synctex: z.string().max(2700000).nullable().optional() });

/** Worker-only compiler client, shared by saved manuscripts and temporary import previews. */
export async function compileSourceFiles(payload: { engine: ManuscriptEngine; mainFile: string; files: { path: string; data: string }[] }, version: ManuscriptTexLive) {
  const endpoint = compilerEndpoint(version);
  const response = await fetch(new URL("compile", `${endpoint.replace(/\/$/, "")}/`), {
    method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Key": env.INTERNAL_SERVICE_KEY },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(75000), redirect: "error",
  });
  if (!response.ok) throw new Error("The isolated compiler is temporarily unavailable.");
  let size = 0; const chunks: Uint8Array[] = [];
  if (!response.body) throw new Error("The compiler returned an empty response.");
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 31000000) throw new Error("The compiled PDF exceeded the output limit.");
    chunks.push(chunk);
  }
  const result = compilerResult.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!result.toolchain.startsWith(`TeX Live ${version} /`)) throw new Error("The compiler returned a different TeX Live release than requested.");
  const pdf = result.success && result.pdf ? Buffer.from(result.pdf, "base64") : null;
  const sync = pdf && result.synctex ? Buffer.from(result.synctex, "base64") : null;
  if (sync && sync.length > 2000000) throw new Error("SyncTeX output exceeded the limit.");
  if (result.success && (!pdf || pdf.length > 20000000 || pdf.subarray(0, 5).toString() !== "%PDF-")) throw new Error("The compiler returned an invalid PDF.");
  return { result, pdf, sync };
}

/** Runs only in the BullMQ worker. Never executes TeX inside an application process. */
export async function processCompilation(compilationId: string) {
  const db = getPrisma();
  const compilation = await db.manuscriptCompilation.findUnique({ where: { id: compilationId }, select: compilationSelect });
  if (!compilation || !["QUEUED", "COMPILING"].includes(compilation.status)) return;
  const snapshot = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: compilation.snapshotId } });
  const engine = engineFromToolchain(compilation.toolchain);
  const payload = await withWorkspace(snapshot.projectId, compilation.requestedById, { write: true }, async context => {
    const draft = await context.tx.draftWorkspace.findFirst({ where: { id: snapshot.workspaceId, projectId: context.project.id, writingMode: "LATEX", archivedAt: null, deletedAt: null } });
    if (!draft) throw AppError.notFound("Manuscript not found");
    const manifest = snapshot.manifest as unknown as ManuscriptManifest;
    const main = manifest.files.find(f => f.id === manifest.mainFileId && f.kind === "TEXT" && f.path.endsWith(".tex"));
    if (!main) throw AppError.badRequest("Choose a .tex main file before compiling.");
    const assets = await context.tx.manuscriptSnapshotAsset.findMany({ where: { snapshotId: snapshot.id } });
    const files = manifest.files.filter(f => f.kind !== "FOLDER").map(f => {
      manuscriptPath(f.path, f.kind);
      const bytes = f.kind === "TEXT" ? Buffer.from(f.text ?? "") : assets.find(a => a.fileId === f.id)?.data;
      if (!bytes) throw AppError.conflict("A retained source asset is unavailable.");
      return { path: f.path, data: Buffer.from(bytes).toString("base64") };
    });
    await context.tx.manuscriptCompilation.update({ where: { id: compilationId }, data: { status: "COMPILING", diagnostics: "" } });
    return { engine, mainFile: main.path, files };
  });
  const { result, pdf, sync } = await compileSourceFiles(payload, compilation.texLiveVersion as ManuscriptTexLive);
  // Recheck the requester's permission before retaining private output.
  await withWorkspace(snapshot.projectId, compilation.requestedById, { write: true }, async context => {
    await context.tx.manuscriptCompilation.update({ where: { id: compilationId }, data: { status: pdf ? "SUCCESS" : result.errorCode === "TIMED_OUT" ? "TIMED_OUT" : "FAILED", pdfData: pdf, syncTexData: sync, checksum: pdf ? hashBytes(pdf) : null, diagnostics: result.diagnostics.slice(-64000), toolchain: `${engine} | ${result.toolchain}`, completedAt: new Date() } });
  });
}
