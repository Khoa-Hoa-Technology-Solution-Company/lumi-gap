import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { backendRoot, loadRootEnv, repoRoot } from "../load-env.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe test cleanup path");
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("root environment loading", () => {
  it("expands URLs while preserving container/process overrides", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "lumigap-env-test-"));
    directories.push(directory);
    const path = resolve(directory, ".env");
    writeFileSync(path, "POSTGRES_USER=local\nPOSTGRES_PASSWORD=local123\nPOSTGRES_HOST_PORT=5433\nDATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_HOST_PORT}/lumi_gap\n");
    const native: NodeJS.ProcessEnv = {};
    loadRootEnv(path, native);
    expect(native.DATABASE_URL).toBe("postgresql://local:local123@localhost:5433/lumi_gap");
    const container = { POSTGRES_PASSWORD: "injected123", DATABASE_URL: "postgresql://local:injected123@postgres:5432/lumi_gap" };
    loadRootEnv(path, container);
    expect(container.POSTGRES_PASSWORD).toBe("injected123");
    expect(container.DATABASE_URL).toBe("postgresql://local:injected123@postgres:5432/lumi_gap");
  });

  it("accepts a missing local file and anchors paths independently of cwd", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "lumigap-env-test-"));
    directories.push(directory);
    const injected = { DATABASE_URL: "postgresql://container:pass@postgres:5432/test" };
    expect(() => loadRootEnv(resolve(directory, "missing.env"), injected)).not.toThrow();
    expect(injected.DATABASE_URL).toContain("@postgres:5432");
    expect(backendRoot).toBe(resolve(repoRoot, "apps/backend") + sep);
  });
});
