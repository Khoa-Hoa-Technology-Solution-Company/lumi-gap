import { z } from "zod";
import { env } from "../../config/env.js";

export const pdfLayoutSchema = z.object({
  pageCount: z.number().int().min(1).max(100),
  tableCount: z.number().int().min(0).max(5000),
  blockCount: z.number().int().min(0).max(100_000),
  unmappedBlocks: z.number().int().min(0).max(100_000),
  warnings: z.array(z.string().max(100)).max(600).optional(),
}).strict();

export const pdfComparisonSchema = z.object({
  status: z.literal("compared"),
  sourcePages: z.number().int().min(1).max(100),
  // Reflow may increase the output page count; keep the actual value.
  generatedPages: z.number().int().min(1).max(1000),
  comparedPages: z.number().int().min(1).max(5),
  textCoverage: z.number().min(0).max(1).optional(),
  numericCoverage: z.number().min(0).max(1).optional(),
  visualSimilarity: z.number().min(0).max(1).optional(),
  contentBoundsDeviation: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string().max(100)).max(30),
}).strict();

export const pdfComparisonResultSchema = z.union([
  pdfComparisonSchema,
  z.object({ status: z.literal("unavailable") }).strict(),
]);

/** Source bytes stay within our authenticated service; never sent to an AI provider. */
export async function comparePdfOutput(original: Buffer, generated: Buffer) {
  const form = new FormData();
  form.append("original", new Blob([new Uint8Array(original)], { type: "application/pdf" }), "original.pdf");
  form.append("generated", new Blob([new Uint8Array(generated)], { type: "application/pdf" }), "generated.pdf");
  const response = await fetch(new URL("internal/pdf-comparison", `${env.AI_REVIEWER_URL.replace(/\/$/, "")}/`), {
    method: "POST", headers: { "X-Internal-Key": env.INTERNAL_SERVICE_KEY }, body: form,
    redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) throw new Error("PDF comparison unavailable");
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 80_000) throw new Error("PDF comparison exceeds server limits");
    chunks.push(chunk);
  }
  return pdfComparisonSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
