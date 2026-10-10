import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { env } from "../config/env.js";

type CloudinaryResourceType = "image" | "raw";
type CloudinaryDeliveryType = "upload" | "authenticated";

let configured = false;

function configureCloudinary() {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    api_secret: env.CLOUDINARY_API_SECRET!,
    secure: true,
  });
  configured = true;
}

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
}

export async function uploadCloudinaryBuffer(
  buffer: Buffer,
  options: UploadApiOptions & { resource_type: CloudinaryResourceType; type?: CloudinaryDeliveryType },
): Promise<CloudinaryUploadResult> {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result?: UploadApiResponse) => {
      if (error) {
        reject(error);
        return;
      }
      if (!result?.public_id || !result.secure_url) {
        reject(new Error("Cloudinary upload did not return a public_id and secure_url"));
        return;
      }
      resolve({ publicId: result.public_id, secureUrl: result.secure_url });
    });
    stream.end(buffer);
  });
}

export async function deleteCloudinaryAsset(
  publicId: string,
  options: { resource_type: CloudinaryResourceType; type?: CloudinaryDeliveryType },
): Promise<void> {
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: options.resource_type,
    type: options.type,
    invalidate: true,
  });
}

export function cloudinaryPublicUrl(
  publicId: string,
  options: { resource_type: CloudinaryResourceType; type?: CloudinaryDeliveryType; format?: string },
): string {
  configureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: options.resource_type,
    type: options.type ?? "upload",
    format: options.format,
    secure: true,
    sign_url: options.type === "authenticated",
  });
}

export function cloudinaryPrivateDownloadUrl(publicId: string): string {
  configureCloudinary();
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "raw", type: "authenticated", attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 60,
  });
}
