/** Reusable local reset for the explicitly approved test account, including media. */
import { readFile, readdir, realpath, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../src/config/env.js";
import { profileAvatarStorage, profileCoverStorage } from "../src/modules/academic-profiles/profile-cover-storage.service.js";

const testEmail = "thanhndse182854@fpt.edu.vn";
const backendRoot = fileURLToPath(new URL("../", import.meta.url));
const sqlFile = fileURLToPath(new URL("../../../artifacts/database/reset-test-account.sql", import.meta.url));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type ResetResult = { email: string; accountsDeleted: number; rowsDeleted: number; userIds: string[]; mediaKeys: string[]; deletedByTable: Record<string, number> };

async function removeLocalMedia(userId: string, folder: string) {
  const root = path.resolve(backendRoot, "uploads");
  const directory = path.resolve(root, folder, userId);
  if (!uuid.test(userId) || !["profile-covers", "profile-avatars"].includes(folder)
    || !directory.startsWith(root + path.sep)) throw new Error("Invalid local media scope");
  let actualDirectory: string;
  try { actualDirectory = await realpath(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const actualRoot = await realpath(root);
  if (!actualDirectory.startsWith(actualRoot + path.sep)) throw new Error("Media directory is outside uploads");
  const entries = await readdir(actualDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".webp") || !uuid.test(entry.name.slice(0, -5))) {
      throw new Error("Unexpected content in the account media directory");
    }
  }
  for (const entry of entries) await unlink(path.join(actualDirectory, entry.name));
  await rmdir(actualDirectory);
  return entries.length;
}

async function main() {
  if (env.NODE_ENV === "production") throw new Error("This reset utility is for the local test database only.");
  const url = new URL(env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/lumigap_db") {
    throw new Error("Expected the local lumigap_db database.");
  }
  const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query(await readFile(sqlFile, "utf8"));
    const response = await client.query<{ result: ResetResult }>("SELECT public.lumigap_reset_test_account($1) AS result", [testEmail]);
    const result = response.rows[0]!.result;
    let localFiles = 0;
    let cloudFiles = 0;
    const remoteKeys = new Set(result.mediaKeys);
    if (env.STORAGE_PROVIDER === "cloudinary") {
      cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME!, api_key: env.CLOUDINARY_API_KEY!, api_secret: env.CLOUDINARY_API_SECRET!, secure: true, timeout: 10000 });
      for (const userId of result.userIds) {
        if (!uuid.test(userId)) throw new Error("Invalid account ID from reset");
        for (const folder of ["profile-covers", "profile-avatars"]) {
          const prefix = `${folder}/${userId}/`;
          let cursor: string | undefined;
          do {
            const page = await cloudinary.api.resources({ resource_type: "image", type: "upload", prefix, max_results: 100, next_cursor: cursor });
            for (const asset of page.resources as Array<{ public_id: string }>) {
              if (!asset.public_id.startsWith(prefix)) throw new Error("Unexpected Cloudinary asset scope");
              remoteKeys.add(asset.public_id + ".webp");
            }
            cursor = page.next_cursor as string | undefined;
          } while (cursor);
        }
      }
    }
    for (const key of remoteKeys) {
      const parts = key.split("/");
      if (parts.length !== 3 || !result.userIds.includes(parts[1]!) || !uuid.test(parts[2]!.replace(/\.webp$/, ""))) {
        throw new Error("Media key does not belong to this account");
      }
      if (parts[0] === "profile-covers") await profileCoverStorage.remove(key);
      else if (parts[0] === "profile-avatars") await profileAvatarStorage.remove(key);
      else throw new Error("Unexpected media folder");
      cloudFiles++;
    }
    for (const userId of result.userIds) for (const folder of ["profile-covers", "profile-avatars"]) {
      localFiles += await removeLocalMedia(userId, folder);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ...result, localFilesRemoved: localFiles, storageAssetsRemoved: cloudFiles }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Reset failed"); process.exitCode = 1; });
