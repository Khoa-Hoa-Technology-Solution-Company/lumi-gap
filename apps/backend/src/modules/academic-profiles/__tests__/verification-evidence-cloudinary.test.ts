import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ privateUrl: vi.fn(() => "https://private-download.example/temporary"), configure: vi.fn() }));
vi.mock("../../../config/env.js", () => ({ env: { STORAGE_PROVIDER: "cloudinary", CLOUDINARY_CLOUD_NAME: "test", CLOUDINARY_API_KEY: "test", CLOUDINARY_API_SECRET: "test" } }));
vi.mock("cloudinary", () => ({ v2: { config: mocks.configure, utils: { private_download_url: mocks.privateUrl } } }));
import { verificationEvidenceStorage } from "../verification-evidence-storage.service.js";

describe("temporary authenticated verification evidence downloads", () => {
  it("signs a raw authenticated download for only 60 seconds and checks the owner key", async () => {
    const user = "11111111-1111-4111-8111-111111111111";
    const key = `verification-evidence/${user}/22222222-2222-4222-8222-222222222222.pdf`;
    const before = Math.floor(Date.now() / 1000);
    await verificationEvidenceStorage.adminLocation(key, user);
    const args = mocks.privateUrl.mock.calls[0] as unknown as [string, string, { resource_type: string; type: string; expires_at: number }];
    expect(args[0]).toBe(key);
    expect(args[2]).toMatchObject({ resource_type: "raw", type: "authenticated" });
    expect(args[2].expires_at).toBeGreaterThanOrEqual(before + 60);
    expect(args[2].expires_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 60);
    await expect(verificationEvidenceStorage.adminLocation(key, "33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ statusCode: 404 });
  });
});
