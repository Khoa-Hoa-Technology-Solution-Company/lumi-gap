import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as presignS3Url } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export type PdfStorageProvider = "local" | "r2";

export interface StoredPdf {
  provider: PdfStorageProvider;
  uri: string;
  key: string;
}

type PutObjectInput = {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType: string;
};

interface BaseStorageOptions {
  randomId?: () => string;
}

interface LocalStorageOptions extends BaseStorageOptions {
  provider: "local";
  uploadsDir: string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  unlink?: typeof fs.unlink;
}

interface R2StorageOptions extends BaseStorageOptions {
  provider: "r2";
  bucket: string;
  putObject?: (input: PutObjectInput) => Promise<unknown>;
  deleteObject?: (input: { Bucket: string; Key: string }) => Promise<unknown>;
  getSignedUrl?: (key: string, expiresInSeconds: number) => Promise<string>;
}

export type PdfStorageOptions = LocalStorageOptions | R2StorageOptions;

export interface PdfStorageService {
  savePdf(buffer: Buffer, originalName: string): Promise<StoredPdf>;
  deletePdf(uri: string): Promise<void>;
  getSignedDownloadUrl(uri: string, expiresInSeconds?: number): Promise<string | null>;
  resolveLocalPath(uri: string): string | null;
}

export function buildPdfObjectKey(originalName: string, id: string = crypto.randomUUID()): string {
  const base = path.basename(originalName || "paper.pdf");
  const withoutExt = base.replace(/\.pdf$/i, "");
  const safeName = withoutExt
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "paper";
  return `papers/${id}-${safeName}.pdf`;
}

export function createPdfStorageService(options: PdfStorageOptions): PdfStorageService {
  const randomId = options.randomId ?? (() => crypto.randomUUID());

  if (options.provider === "local") {
    const mkdir = options.mkdir ?? fs.mkdir;
    const writeFile = options.writeFile ?? fs.writeFile;
    const unlink = options.unlink ?? fs.unlink;
    const uploadsDir = options.uploadsDir;

    return {
      async savePdf(buffer, originalName) {
        const key = buildPdfObjectKey(originalName, randomId());
        const filename = key.split("/").at(-1)!;
        const absoluteDir = path.resolve(uploadsDir);
        const absolutePath = path.join(absoluteDir, filename);
        await mkdir(absoluteDir, { recursive: true });
        await writeFile(absolutePath, buffer);
        return { provider: "local", uri: `/uploads/${filename}`, key: filename };
      },
      async deletePdf(uri) {
        const localPath = this.resolveLocalPath(uri);
        if (!localPath) return;
        try {
          await unlink(localPath);
        } catch {
          // Ignore missing files; DB state is the source of truth for availability.
        }
      },
      async getSignedDownloadUrl() {
        return null;
      },
      resolveLocalPath(uri) {
        if (!uri || uri.startsWith("r2://")) return null;
        return path.resolve(uri.startsWith("/") ? uri.slice(1) : uri);
      },
    };
  }

  const bucket = options.bucket;
  const putObject = options.putObject;
  const deleteObject = options.deleteObject;
  const getSignedUrl = options.getSignedUrl;

  return {
    async savePdf(buffer, originalName) {
      const key = buildPdfObjectKey(originalName, randomId());
      await putR2Object({ bucket, key, body: buffer, putObject });
      return { provider: "r2", uri: `r2://${bucket}/${key}`, key };
    },
    async deletePdf(uri) {
      const parsed = parseR2Uri(uri);
      if (!parsed) return;
      if (deleteObject) {
        await deleteObject({ Bucket: parsed.bucket, Key: parsed.key });
        return;
      }
      await getR2Client().send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    },
    async getSignedDownloadUrl(uri, expiresInSeconds = env.R2_SIGNED_URL_TTL_SECONDS) {
      const parsed = parseR2Uri(uri);
      if (!parsed) return null;
      if (getSignedUrl) return getSignedUrl(parsed.key, expiresInSeconds);
      return presignS3Url(
        getR2Client(),
        new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }),
        { expiresIn: expiresInSeconds },
      );
    },
    resolveLocalPath() {
      return null;
    },
  };
}

export function parseR2Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith("r2://")) return null;
  const withoutScheme = uri.slice("r2://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: withoutScheme.slice(0, slash),
    key: withoutScheme.slice(slash + 1),
  };
}

function getR2Client(): S3Client {
  assertR2Config();
  const endpoint = env.R2_ENDPOINT!;
  const accessKeyId = env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY!;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function putR2Object(args: {
  bucket: string;
  key: string;
  body: Buffer;
  putObject?: (input: PutObjectInput) => Promise<unknown>;
}) {
  const input = {
    Bucket: args.bucket,
    Key: args.key,
    Body: args.body,
    ContentType: "application/pdf",
  };
  if (args.putObject) {
    await args.putObject(input);
    return;
  }
  await getR2Client().send(new PutObjectCommand(input));
}

function assertR2Config() {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    throw new Error("R2 storage is enabled but R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET is missing");
  }
}

export function createDefaultPdfStorageService(): PdfStorageService {
  if (env.STORAGE_PROVIDER === "r2") {
    assertR2Config();
    return createPdfStorageService({ provider: "r2", bucket: env.R2_BUCKET! });
  }
  return createPdfStorageService({ provider: "local", uploadsDir: "uploads" });
}

export const pdfStorageService = createDefaultPdfStorageService();
