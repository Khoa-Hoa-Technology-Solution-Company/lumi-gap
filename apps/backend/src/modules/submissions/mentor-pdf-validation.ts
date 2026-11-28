import { Worker } from "node:worker_threads";
import {
  MANUSCRIPT_PDF_MAX_BYTES,
  MANUSCRIPT_PDF_MAX_MB,
  MANUSCRIPT_PDF_MAX_PAGES,
  type PdfValidationErrorCode,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

const PDF_VALIDATION_TIMEOUT_MS = 15_000;
const PDF_WORKER_STARTUP_TIMEOUT_MS = 10_000;
const PDF_WORKER_MAX_OLD_MB = 256;
const PDF_WORKER_MAX_YOUNG_MB = 32;
const MAX_CONCURRENT_PDF_VALIDATORS = 3;

let activeWorkers = 0;
const waitQueue: Array<() => void> = [];

async function acquireValidationSlot(): Promise<void> {
  if (activeWorkers < MAX_CONCURRENT_PDF_VALIDATORS) {
    activeWorkers += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeWorkers += 1;
      resolve();
    });
  });
}

function releaseValidationSlot(): void {
  activeWorkers = Math.max(0, activeWorkers - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function pdfError(
  code: PdfValidationErrorCode,
  message: string,
  details?: Record<string, unknown>,
  statusCode = 400,
): AppError {
  return new AppError(statusCode, code, message, details);
}

function hasPdfHeader(buf: Buffer): boolean {
  // PDF 1.7 spec allows %PDF-x.y anywhere within the first 1024 bytes.
  const head = buf.subarray(0, Math.min(buf.length, 1024)).toString("latin1");
  return /%PDF-[12]\.[0-9]/.test(head);
}

function hasPdfEof(buf: Buffer): boolean {
  const tailSize = Math.min(buf.length, 4096);
  return buf.subarray(buf.length - tailSize).includes(Buffer.from("%%EOF"));
}

type WorkerValidationResult =
  | { ok: true; pages: number }
  | { ok: false; code: PdfValidationErrorCode; detail?: string };

/**
 * Parse untrusted PDF structure off the API event loop with bounded memory, timeout,
 * concurrency semaphore, single-settlement guarantee, and structured error classification.
 */
export async function validateMentorPdf(bytes: Uint8Array): Promise<number> {
  if (!bytes || bytes.length === 0) {
    throw pdfError("PDF_EMPTY", "Tệp PDF không có dữ liệu.");
  }

  if (bytes.length > MANUSCRIPT_PDF_MAX_BYTES) {
    const actualMb = +(bytes.length / (1024 * 1024)).toFixed(2);
    throw pdfError(
      "PDF_TOO_LARGE",
      `Bản PDF (${actualMb} MB) vượt giới hạn dung lượng cho phép (${MANUSCRIPT_PDF_MAX_MB} MB).`,
      { actualBytes: bytes.length, maxBytes: MANUSCRIPT_PDF_MAX_BYTES, maxMb: MANUSCRIPT_PDF_MAX_MB },
      413,
    );
  }

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!hasPdfHeader(buf)) {
    throw pdfError("PDF_INVALID_FORMAT", "Tệp được chọn không phải tài liệu PDF hợp lệ.");
  }

  if (!hasPdfEof(buf)) {
    throw pdfError(
      "PDF_CORRUPTED",
      "Không thể đọc cấu trúc của bản PDF này (thiếu phần kết thúc tệp). Hãy xuất lại tài liệu thành PDF và thử lại.",
    );
  }

  await acquireValidationSlot();
  try {
    return await new Promise<number>((resolve, reject) => {
      let settled = false;
      // Fixed developer-owned script; untrusted PDF bytes are passed strictly as structured workerData.
      // Security: ignoreEncryption stays false so password-protected PDFs are explicitly rejected.
      // Compatibility: throwOnInvalidObject=false avoids false rejections on valid Word/LaTeX/Acrobat PDFs.
      const script = `
        (() => {
        const { parentPort, workerData } = require('node:worker_threads');
        let PDFDocument;
        try {
          ({ PDFDocument } = require('pdf-lib'));
        } catch (loadErr) {
          parentPort.postMessage({ ok: false, code: 'PDF_VALIDATION_UNAVAILABLE', detail: String(loadErr && loadErr.message || '') });
          return;
        }
        parentPort.postMessage({ ready: true });
        PDFDocument.load(new Uint8Array(workerData), {
          ignoreEncryption: false,
          throwOnInvalidObject: false,
          updateMetadata: false,
        }).then((doc) => {
          const pages = doc.getPageCount();
          parentPort.postMessage({ ok: true, pages });
        }).catch((err) => {
          const name = err && err.name ? String(err.name) : '';
          const msg = err && err.message ? String(err.message) : '';
          const isEncrypted = /encrypt|password/i.test(name) || /encrypt|password/i.test(msg);
          parentPort.postMessage({
            ok: false,
            code: isEncrypted ? 'PDF_PASSWORD_PROTECTED' : 'PDF_CORRUPTED',
            detail: msg.slice(0, 160),
          });
        });
        })();
      `;

      let worker: Worker;
      try {
        worker = new Worker(script, {
          eval: true,
          execArgv: [],
          env: {},
          workerData: bytes,
          resourceLimits: {
            maxOldGenerationSizeMb: PDF_WORKER_MAX_OLD_MB,
            maxYoungGenerationSizeMb: PDF_WORKER_MAX_YOUNG_MB,
          },
        });
      } catch {
        reject(pdfError("PDF_VALIDATION_UNAVAILABLE", "Dịch vụ kiểm tra PDF tạm thời chưa khả dụng.", undefined, 503));
        return;
      }

      const settleOk = (pages: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(pages);
      };

      const settleErr = (err: AppError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        reject(err);
      };

      const timeout = () => {
        settleErr(
          pdfError(
            "PDF_VALIDATION_TIMEOUT",
            "Quá trình kiểm tra PDF mất nhiều thời gian hơn dự kiến. Bạn có thể thử lại.",
            { timeoutMs: PDF_VALIDATION_TIMEOUT_MS },
            408,
          ),
        );
      };
      let timer = setTimeout(timeout, PDF_WORKER_STARTUP_TIMEOUT_MS);

      worker.on("message", (msg: WorkerValidationResult | { ready: true }) => {
        if (settled) return;
        if ("ready" in msg) {
          clearTimeout(timer);
          timer = setTimeout(timeout, PDF_VALIDATION_TIMEOUT_MS);
          return;
        }
        if (msg?.ok) {
          if (msg.pages <= 0) {
            settleErr(
              pdfError(
                "PDF_CORRUPTED",
                "Không thể đọc trang nào trong bản PDF này. Hãy xuất lại tài liệu thành PDF và thử lại.",
              ),
            );
            return;
          }
          if (msg.pages > MANUSCRIPT_PDF_MAX_PAGES) {
            settleErr(
              pdfError(
                "PDF_PAGE_LIMIT_EXCEEDED",
                `Bản PDF có ${msg.pages} trang, vượt giới hạn tối đa ${MANUSCRIPT_PDF_MAX_PAGES} trang được hỗ trợ.`,
                { pages: msg.pages, maxPages: MANUSCRIPT_PDF_MAX_PAGES },
              ),
            );
            return;
          }
          settleOk(msg.pages);
          return;
        }

        const code = msg?.code ?? "PDF_CORRUPTED";
        if (code === "PDF_PASSWORD_PROTECTED") {
          settleErr(
            pdfError(
              "PDF_PASSWORD_PROTECTED",
              "Bản PDF được bảo vệ bằng mật khẩu. Vui lòng sử dụng bản không yêu cầu mật khẩu.",
            ),
          );
          return;
        }
        if (code === "PDF_VALIDATION_UNAVAILABLE") {
          settleErr(
            pdfError(
              "PDF_VALIDATION_UNAVAILABLE",
              "Dịch vụ kiểm tra PDF tạm thời chưa khả dụng. Vui lòng thử lại sau.",
              undefined,
              503,
            ),
          );
          return;
        }
        settleErr(
          pdfError(
            "PDF_CORRUPTED",
            "Không thể đọc cấu trúc của bản PDF này. Hãy xuất lại tài liệu thành PDF và thử lại.",
          ),
        );
      });

      worker.once("error", (err) => {
        const message = err?.message ?? "";
        if (/heap|memory|allocation/i.test(message)) {
          settleErr(
            pdfError(
              "PDF_VALIDATION_RESOURCE_LIMIT",
              "Bản PDF có cấu trúc quá phức tạp hoặc vượt khả năng xử lý hiện tại.",
            ),
          );
          return;
        }
        settleErr(
          pdfError(
            "PDF_VALIDATION_UNAVAILABLE",
            "Dịch vụ kiểm tra PDF tạm thời gặp sự cố. Vui lòng thử lại.",
            undefined,
            503,
          ),
        );
      });

      worker.once("exit", (exitCode) => {
        if (settled || exitCode === 0) return;
        settleErr(
          pdfError(
            "PDF_VALIDATION_RESOURCE_LIMIT",
            "Bản PDF có cấu trúc phức tạp hoặc vượt khả năng xử lý hiện tại.",
          ),
        );
      });
    });
  } finally {
    releaseValidationSlot();
  }
}
