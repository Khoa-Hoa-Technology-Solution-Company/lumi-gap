import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeProfileCover, profileCoverKey, safeProfileCoverPath } from "../profile-cover-storage.service.js";

describe("profile cover processing", () => {
  it("decodes and normalizes a real raster image to a bounded WebP cover", async () => {
    const input = await sharp({ create: { width: 1200, height: 400, channels: 3, background: "#526b83" } })
      .png().toBuffer();
    const output = await normalizeProfileCover(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(480);
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects SVG and malformed image bytes even when a client could spoof MIME", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"></svg>');
    await expect(normalizeProfileCover(svg)).rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeProfileCover(Buffer.from("not an image"))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("only resolves generated keys inside the configured cover directory", () => {
    const userId = "66f28c765111111111111111";
    const key = profileCoverKey(userId, "550e8400-e29b-41d4-a716-446655440000");
    expect(safeProfileCoverPath(key, "uploads-test")).toBe(path.resolve("uploads-test", key));
    expect(safeProfileCoverPath("profile-covers/../secrets.txt", "uploads-test")).toBeNull();
    expect(safeProfileCoverPath("profile-covers/other-user/cover.webp", "uploads-test")).toBeNull();
  });
});
