import { Worker } from "node:worker_threads";
import { AppError } from "../../common/exceptions/app-error.js";
/** Parse untrusted PDF structure off the API thread, with memory/time bounds. */
export async function validateMentorPdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024 || !/^%PDF-[12]\.[0-9]/.test(Buffer.from(bytes).subarray(0, 8).toString("ascii")) || !Buffer.from(bytes).subarray(-2048).includes(Buffer.from("%%EOF"))) throw AppError.badRequest("Use a valid PDF no larger than 10 MB.");
  return new Promise<number>((resolve, reject) => {
    // Fixed developer-owned script. PDF bytes are structured workerData, never code.
    const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads'); const {PDFDocument}=require('pdf-lib'); parentPort.postMessage("ready"); PDFDocument.load(new Uint8Array(workerData),{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false}).then(doc=>{const n=doc.getPageCount(); parentPort.postMessage(n>0&&n<=1000?n:0)}).catch(()=>parentPort.postMessage(0));`, { eval: true, execArgv: [], env: {}, workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 } });
    let settled = false;
    const failure = () => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); reject(AppError.badRequest("The PDF is damaged, encrypted or exceeds the validation limits.")); };
    // Module startup may be slower on a busy host; parsing retains its own bound.
    let timer = setTimeout(failure, 10000);
    worker.on("message", (pages: number | "ready") => {
      if (settled) return;
      clearTimeout(timer);
      if (pages === "ready") { timer = setTimeout(failure, 5000); return; }
      if (!pages) return failure();
      settled = true; void worker.terminate(); resolve(pages);
    });
    worker.once("error", failure);
    worker.once("exit", code => { if (code !== 0) failure(); });
  });
}
