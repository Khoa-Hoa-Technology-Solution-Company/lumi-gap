import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const bucket = process.env.R2_BUCKET || process.env.AWS_S3_BUCKET;
const region = process.env.R2_REGION || process.env.AWS_REGION || 'auto';
const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

const s3Client =
  bucket
    ? new S3Client({
        region,
        endpoint,
        credentials:
          accessKeyId && secretAccessKey
            ? {
                accessKeyId,
                secretAccessKey,
              }
            : undefined,
      })
    : null;

function assertS3Configured() {
  if (!s3Client || !bucket) {
    throw new Error('S3 storage is not configured');
  }
}

function sanitizeFilename(value) {
  return String(value || 'paper.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildPdfKey(file) {
  const safeName = sanitizeFilename(file.originalname);
  const randomId = crypto.randomBytes(8).toString('hex');

  return `papers/${Date.now()}-${randomId}-${safeName}`;
}

function parseS3Path(value) {
  if (!value) return null;

  const text = String(value);

  if (text.startsWith('s3://')) {
    const withoutProtocol = text.slice('s3://'.length);
    const slashIndex = withoutProtocol.indexOf('/');
    const parsedBucket = slashIndex >= 0 ? withoutProtocol.slice(0, slashIndex) : withoutProtocol;
    const key = slashIndex >= 0 ? withoutProtocol.slice(slashIndex + 1) : '';

    return { bucket: parsedBucket || bucket, key };
  }

  if (!text.startsWith('/uploads/') && !/^https?:\/\//i.test(text)) {
    return { bucket, key: text.replace(/^\/+/, '') };
  }

  return null;
}

export function isS3Path(value) {
  return Boolean(parseS3Path(value));
}

export function isObjectStorageConfigured() {
  return Boolean(bucket);
}

export async function uploadPdfToS3(file) {
  assertS3Configured();

  const key = buildPdfKey(file);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/pdf',
      Metadata: {
        originalName: sanitizeFilename(file.originalname),
      },
    })
  );

  return `s3://${bucket}/${key}`;
}

export async function deletePdfFromS3(pdfPath) {
  const parsed = parseS3Path(pdfPath);
  if (!parsed?.key) return;

  assertS3Configured();

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    })
  );
}

export async function getPdfDownloadUrl(pdfPath, filename = 'paper.pdf') {
  const parsed = parseS3Path(pdfPath);

  if (!parsed?.key) {
    return pdfPath;
  }

  assertS3Configured();

  const command = new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 60 * 10 });
}
