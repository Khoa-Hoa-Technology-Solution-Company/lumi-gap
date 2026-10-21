import { createHash } from "node:crypto";
import type { ManuscriptPdfImport } from "@trend/shared-types";
import { z } from "zod";
import { UnrecoverableError } from "bullmq";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { aiJobsQueue } from "../../infrastructure/queue.js";
import { redis } from "../../infrastructure/redis.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { manuscriptService } from "./manuscript.service.js";
import { readSourceZip } from "./manuscript-import.js";
import { improvePdfStructure, pdfBlocksSchema } from "./manuscript-pdf-structure.js";
import { compileSourceFiles, compilerAvailability } from "./manuscript-compiler.js";
import { comparePdfOutput, pdfComparisonResultSchema, pdfLayoutSchema } from "./manuscript-pdf-quality.js";

export const PDF_IMPORT_JOB = "manuscript_pdf_import";
const TTL = 3600;
const key = (id: string, kind: string) => `manuscript-pdf:${id}:${kind}`;
const hash = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
export const pdfImportSchema = z.object({ title: z.string().trim().min(2).max(160), clientKey: z.string().uuid(), mode: z.enum(["layout", "structured"]).optional(), ai: z.enum(["true", "false"]).optional() }).strict().refine(input => input.ai !== "true" || input.mode === "structured", "AI structure assistance requires structured conversion");
const resultSchema = z.object({ archive: z.string().max(13_333_336).regex(/^[A-Za-z0-9+/]+={0,2}$/), pageCount: z.number().int().min(1).max(100), wordCount: z.number().int().min(1).max(100_000), warnings: z.array(z.string().max(100)).max(600), preview: z.string().max(12_000), blocks: pdfBlocksSchema.optional(), layout: pdfLayoutSchema.optional(), comparison: pdfComparisonResultSchema.optional(), compilation: z.object({ status: z.enum(["success", "failed", "unavailable"]), diagnostics: z.string().max(8000).optional() }).optional() }).strict();
type Result = z.infer<typeof resultSchema>;
type Payload = { project: string; actor: string; title: string; clientKey: string; digest: string; expiresAt: number; mode?: "layout" | "structured"; ai?: "true" | "false" };

async function access(project: string, actor: string) {
  return withWorkspace(project, actor, { write: true }, async context => ({ project: context.project.id, actor: context.actorId }));
}
async function scoped(project: string, actor: string, id: string) {
  const scope = await access(project, actor);
  const job = await aiJobsQueue.getJob(id);
  const payload = job?.data as Payload | undefined;
  if (!job || job.name !== PDF_IMPORT_JOB || payload?.project !== scope.project || payload.actor !== scope.actor) throw AppError.notFound("PDF conversion not found");
  if (payload.expiresAt <= Date.now()) throw AppError.notFound("PDF conversion expired. Upload the PDF again.");
  return { job, payload };
}
async function loadResult(id: string): Promise<Result> {
  const raw = await redis.get(key(id, "result"));
  if (!raw) throw AppError.notFound("PDF conversion expired. Upload the PDF again.");
  return resultSchema.parse(JSON.parse(raw));
}

export const manuscriptPdfImport = {
  async create(project: string, actor: string, input: z.infer<typeof pdfImportSchema>, pdf: Buffer): Promise<ManuscriptPdfImport> {
    const scope = await access(project, actor);
    if (!pdf.length || pdf.length > 5_000_000 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw AppError.badRequest("Choose a PDF no larger than 5 MB");
    const id = hash(JSON.stringify([scope.project, scope.actor, input.clientKey]));
    const settings = { mode: input.mode ?? "layout", ai: input.ai ?? "false" };
    const digest = hash(Buffer.concat([Buffer.from(JSON.stringify([input.title, settings]) + "\0"), pdf]));
    const prior = await aiJobsQueue.getJob(id);
    if (prior) {
      if (prior.name !== PDF_IMPORT_JOB || prior.data.digest !== digest) throw AppError.conflict("This PDF import key was already used with different content");
      return this.get(project, actor, id);
    }
    // File bytes live only in expiring private Redis keys, never in queue logs.
    await redis.set(key(id, "source"), JSON.stringify({ digest, pdf: pdf.toString("base64") }), "EX", TTL, "NX");
    const receipt = await redis.get(key(id, "source"));
    if (!receipt || JSON.parse(receipt).digest !== digest) throw AppError.conflict("This PDF import key was already used with different content");
    await aiJobsQueue.add(PDF_IMPORT_JOB, { ...scope, ...input, ...settings, digest, expiresAt: Date.now() + TTL * 1000 } satisfies Payload, {
      jobId: id, attempts: 5, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { age: TTL, count: 100 }, removeOnFail: { age: TTL, count: 100 },
    });
    // Concurrent retries must agree on both the immutable queue receipt and bytes.
    const saved = await aiJobsQueue.getJob(id);
    if (saved?.data.digest !== digest) throw AppError.conflict("This PDF import key was already used with different content");
    return this.get(project, actor, id);
  },
  async get(project: string, actor: string, id: string): Promise<ManuscriptPdfImport> {
    const { job, payload } = await scoped(project, actor, id);
    const state = await job.getState();
    const base = { id, mode: payload.mode ?? "layout", expiresAt: new Date(payload.expiresAt).toISOString() };
    if (state === "completed") {
      const { archive: _archive, blocks: _blocks, ...result } = await loadResult(id);
      return { ...base, status: "ready", ...result };
    }
    if (state === "failed") {
      const error = await redis.get(key(id, "error"));
      return { ...base, status: "failed", error: error ?? "PDF conversion failed. Try uploading again." };
    }
    const progress = job.progress && typeof job.progress === "object" && "phase" in job.progress ? job.progress.phase : undefined;
    const phase = progress === "compiling" || progress === "comparing" ? progress : "converting";
    return { ...base, status: state === "active" ? "processing" : "queued", phase };
  },
  async previewPdf(project: string, actor: string, id: string) {
    const { job } = await scoped(project, actor, id);
    if (await job.getState() !== "completed") throw AppError.conflict("Wait for the preview to finish compiling");
    const result = await loadResult(id);
    if (result.compilation?.status !== "success") throw AppError.notFound("Compiled preview is not available");
    const pdf = await redis.get(key(id, "preview-pdf"));
    if (!pdf) throw AppError.notFound("PDF conversion expired. Upload the PDF again.");
    return Buffer.from(pdf, "base64");
  },
  async accept(project: string, actor: string, id: string) {
    const { job, payload } = await scoped(project, actor, id);
    if (await job.getState() !== "completed") throw AppError.conflict("Wait for PDF conversion before importing");
    const result = await loadResult(id);
    // Existing import owns authorization, idempotency, persistence and history.
    return manuscriptService.importZip(project, actor, { title: payload.title, mainFile: "main.tex", clientKey: payload.clientKey, engine: "xelatex" }, Buffer.from(result.archive, "base64"));
  },
  async process(id: string) {
    const job = await aiJobsQueue.getJob(id);
    if (!job || job.name !== PDF_IMPORT_JOB) return;
    const payload = job.data as Payload;
    try {
      await access(payload.project, payload.actor);
      if (payload.expiresAt <= Date.now()) throw new UnrecoverableError("PDF conversion expired");
      const raw = await redis.get(key(id, "source"));
      if (!raw) throw new UnrecoverableError("PDF upload expired");
      const form = new FormData();
      const source = z.object({ digest: z.literal(payload.digest), pdf: z.string().max(6_666_668) }).parse(JSON.parse(raw));
      form.append("file", new Blob([new Uint8Array(Buffer.from(source.pdf, "base64"))], { type: "application/pdf" }), "source.pdf");
      form.append("mode", payload.mode ?? "layout");
      const response = await fetch(new URL("internal/pdf-to-latex", `${env.AI_REVIEWER_URL.replace(/\/$/, "")}/`), {
        method: "POST", headers: { "X-Internal-Key": env.INTERNAL_SERVICE_KEY }, body: form, redirect: "error", signal: AbortSignal.timeout(310_000),
      });
      if (!response.body) throw new Error("PDF conversion service unavailable");
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 14_000_000) throw new UnrecoverableError("Converted source exceeds import limits");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (!response.ok) {
        if (response.status === 422) {
          const detail = z.object({ detail: z.string().max(300) }).safeParse(JSON.parse(body));
          throw new UnrecoverableError(detail.success ? detail.data.detail : "PDF could not be converted");
        }
        throw new Error("PDF conversion service unavailable");
      }
      const result = resultSchema.parse(JSON.parse(body));
      readSourceZip(Buffer.from(result.archive, "base64"), "main.tex");
      if (payload.ai === "true" && payload.mode === "structured" && result.blocks?.length) {
        await access(payload.project, payload.actor);
        try {
          Object.assign(result, await improvePdfStructure(payload.actor, payload.digest, result.archive, result.blocks));
          result.warnings.push("AI_STRUCTURE_REVIEW");
        } catch {
          // Retain a usable deterministic conversion if AI is unavailable or
          // violates the immutable-content/known-block contract.
          result.warnings.push("AI_STRUCTURE_UNAVAILABLE");
        }
      }
      delete result.blocks;
      await access(payload.project, payload.actor);
      // Compile the converted main.tex, never the facsimile or original PDF.
      // This remains a temporary job: no draft, snapshot or activity is created.
      let compiledPdf: Buffer | null = null;
      if (!compilerAvailability.available) result.compilation = { status: "unavailable" };
      else {
        await job.updateProgress({ phase: "compiling" });
        try {
          const bundle = readSourceZip(Buffer.from(result.archive, "base64"), "main.tex");
          const compiled = await compileSourceFiles({ engine: "xelatex", mainFile: bundle.mainFile, files: bundle.files.map(file => ({ path: file.path, data: Buffer.from(file.bytes).toString("base64") })) }, env.MANUSCRIPT_COMPILER_2025_URL ? "2025" : "2022");
          compiledPdf = compiled.pdf;
          result.compilation = { status: compiledPdf ? "success" : "failed", ...(compiledPdf ? {} : { diagnostics: compiled.result.diagnostics.slice(-8000) }) };
        } catch {
          result.compilation = { status: "unavailable" };
        }
      }
      await access(payload.project, payload.actor);
      if (payload.mode === "structured" && compiledPdf) {
        await job.updateProgress({ phase: "comparing" });
        try {
          result.comparison = await comparePdfOutput(Buffer.from(source.pdf, "base64"), compiledPdf);
        } catch {
          // Conversion remains available, with an explicit unavailable state.
          result.comparison = { status: "unavailable" };
        }
        await access(payload.project, payload.actor);
      }
      const remaining = Math.floor((payload.expiresAt - Date.now()) / 1000);
      if (remaining <= 0) throw new UnrecoverableError("PDF conversion expired");
      if (compiledPdf) await redis.set(key(id, "preview-pdf"), compiledPdf.toString("base64"), "EX", remaining);
      await redis.set(key(id, "result"), JSON.stringify(result), "EX", remaining);
      // Retain source until TTL so a crash immediately before BullMQ acknowledgement can retry.
    } catch (error) {
      if (error instanceof AppError && [403, 404, 409].includes(error.statusCode)) throw new UnrecoverableError("Project access is no longer available");
      if (error instanceof UnrecoverableError) await redis.set(key(id, "error"), error.message, "EX", TTL);
      throw error;
    }
  },
};
