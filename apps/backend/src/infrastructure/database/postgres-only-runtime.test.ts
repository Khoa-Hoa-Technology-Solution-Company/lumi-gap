import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return ["generated", "node_modules", "dist"].includes(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("PostgreSQL-only runtime boundary", () => {
  const runtimeSources = sourceFiles(resolve(backendRoot, "src"));

  it("contains no Mongoose imports", () => {
    const offenders = runtimeSources.filter((path) =>
      /(?:from\s+|import\s+|require\()["']mongoose["']/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("contains no legacy model imports", () => {
    const offenders = runtimeSources.filter((path) =>
      /(?:\.model\.js|\/models\/)/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("does not declare Mongoose as a backend dependency", () => {
    const manifest = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.mongoose).toBeUndefined();
    expect(manifest.devDependencies?.mongoose).toBeUndefined();
  });

  it("does not define a MongoDB Compose service", () => {
    const composePath = resolve(backendRoot, "..", "..", "docker-compose.yml");
    if (!existsSync(composePath)) {
      return;
    }
    const compose = readFileSync(composePath, "utf8");
    expect(compose).not.toMatch(/^\s{2}mongo(?:db)?:\s*$/m);
  });
});
