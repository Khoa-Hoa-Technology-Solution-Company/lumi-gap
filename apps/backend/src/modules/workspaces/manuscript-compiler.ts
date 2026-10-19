import type { ManuscriptCompilation, ManuscriptEngine, ManuscriptManifest } from "@trend/shared-types";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { manuscriptCompileQueue } from "../../infrastructure/queue.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { hashBytes, manuscriptPath } from "./manuscript-source.js";

export const compilerAvailability = { available: Boolean(env.MANUSCRIPT_COMPILER_URL), reason: env.MANUSCRIPT_COMPILER_URL ? "READY" : "COMPILER_NOT_CONFIGURED" };
export const compilationSelect = { id: true, snapshotId: true, status: true, requestedById: true, diagnostics: true, checksum: true, toolchain: true, createdAt: true, completedAt: true } as const;
type Row = { id: string; snapshotId: string; status: string; diagnostics: string; checksum: string | null; toolchain: string | null; createdAt: Date; completedAt: Date | null };
export const compilationDto = (row: Row, sourceVersion: number): ManuscriptCompilation => ({ ...row, status: row.status as ManuscriptCompilation["status"], engine: row.toolchain?.startsWith("xelatex") ? "xelatex" : "pdflatex", sourceVersion, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null });

export async function enqueueCompilation(id: string) {
  try {
    await manuscriptCompileQueue.add("compile", { compilationId: id }, { jobId: id });
  } catch {
    await getPrisma().manuscriptCompilation.updateMany({ where: { id, status: "QUEUED" }, data: { status: "FAILED", completedAt: new Date(), diagnostics: "The compilation queue is unavailable. Please try again." } });
    throw AppError.serviceUnavailable("The compilation queue is unavailable. Please try again.");
  }
}

const compilerResult = z.object({ success: z.boolean(), errorCode: z.literal("TIMED_OUT").optional(), diagnostics: z.string().max(100000), toolchain: z.string().max(150), pdf: z.string().max(27000000).nullable() });

/** Runs only in the BullMQ worker. Never executes TeX inside an application process. */
export async function processCompilation(compilationId: string) {
  const db = getPrisma();
  const compilation = await db.manuscriptCompilation.findUnique({ where: { id: compilationId }, select: compilationSelect });
  if (!compilation || !["QUEUED", "COMPILING"].includes(compilation.status)) return;
  if (!env.MANUSCRIPT_COMPILER_URL) throw new Error("The manuscript compiler is not configured.");
  const snapshot = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: compilation.snapshotId } });
  const engine: ManuscriptEngine = compilation.toolchain?.startsWith("xelatex") ? "xelatex" : "pdflatex";
  const payload = await withWorkspace(snapshot.projectId, compilation.requestedById, { write: true }, async context => {
    const draft = await context.tx.draftWorkspace.findFirst({ where: { id: snapshot.workspaceId, projectId: context.project.id, writingMode: "LATEX", archivedAt: null } });
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
  const response = await fetch(new URL("compile", `${env.MANUSCRIPT_COMPILER_URL.replace(/\/$/, "")}/`), {
    method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Key": env.INTERNAL_SERVICE_KEY },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(75000), redirect: "error",
  });
  if (!response.ok) throw new Error("The isolated compiler is temporarily unavailable.");
  // Bound the response before parsing, including chunked responses.
  let size = 0; const chunks: Uint8Array[] = [];
  if (!response.body) throw new Error("The compiler returned an empty response.");
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 28000000) throw new Error("The compiled PDF exceeded the output limit.");
    chunks.push(chunk);
  }
  const result = compilerResult.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const pdf = result.success && result.pdf ? Buffer.from(result.pdf, "base64") : null;
  if (result.success && (!pdf || pdf.length > 20000000 || pdf.subarray(0, 5).toString() !== "%PDF-")) throw new Error("The compiler returned an invalid PDF.");
  // Recheck the requester's permission before retaining private output.
  await withWorkspace(snapshot.projectId, compilation.requestedById, { write: true }, async context => {
    await context.tx.manuscriptCompilation.update({ where: { id: compilationId }, data: { status: pdf ? "SUCCESS" : result.errorCode === "TIMED_OUT" ? "TIMED_OUT" : "FAILED", pdfData: pdf, checksum: pdf ? hashBytes(pdf) : null, diagnostics: result.diagnostics.slice(-64000), toolchain: `${engine} | ${result.toolchain}`, completedAt: new Date() } });
  });
}
