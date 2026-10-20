import { z } from "zod";
import { zipSync, unzipSync } from "fflate";
import { AppError } from "../../common/exceptions/app-error.js";
import { manuscriptService } from "./manuscript.service.js";

const bundleSchema = z.object({ files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(7_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0) }).strict()).min(1).max(201) }).strict();
export const manuscriptRepository = {
  async import(project: string, actor: string, input: { title: string; mainFile: string; clientKey: string }, payload: Uint8Array) {
    await manuscriptService.list(project, actor);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)); } catch { throw AppError.badRequest("Invalid source bundle"); }
    const result = bundleSchema.safeParse(parsed);
    if (!result.success) throw AppError.badRequest("Invalid source bundle");
    const files: Record<string, Uint8Array> = Object.create(null);
    for (const file of result.data.files) {
      if (Object.hasOwn(files, file.path)) throw AppError.badRequest("Duplicate source path");
      const bytes = Buffer.from(file.content, "base64");
      if (bytes.toString("base64") !== file.content) throw AppError.badRequest("Invalid source encoding");
      files[file.path] = bytes;
    }
    // Reuse the atomic import, full path/CRC/source/asset checks and retry receipts.
    return manuscriptService.importZip(project, actor, input, zipSync(files, { mtime: new Date("1980-01-01T00:00:00Z") }));
  },
  async source(project: string, actor: string, id: string, snapshot: string) {
    const archive = unzipSync(await manuscriptService.export(project, actor, id, snapshot));
    return { files: Object.entries(archive).map(([path, bytes]) => ({ path, content: Buffer.from(bytes).toString("base64") })) };
  },
};
