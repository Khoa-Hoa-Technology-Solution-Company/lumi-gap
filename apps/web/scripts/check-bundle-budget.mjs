import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const manifestPath = path.join(distDir, ".vite", "manifest.json");
const ENTRY_LIMIT_BYTES = 250 * 1024;
const INITIAL_GRAPH_LIMIT_BYTES = 900 * 1024;

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Vite manifest not found: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
if (!entry) throw new Error("Vite manifest has no entry chunk");

const initialFiles = new Set();
const visit = (chunk) => {
  if (!chunk?.file || initialFiles.has(chunk.file)) return;
  initialFiles.add(chunk.file);
  for (const importedKey of chunk.imports ?? []) visit(manifest[importedKey]);
};
visit(entry);

const sizes = [...initialFiles].map((file) => ({
  file,
  bytes: fs.statSync(path.join(distDir, file)).size,
}));
const entryBytes = sizes.find(({ file }) => file === entry.file)?.bytes ?? 0;
const initialBytes = sizes.reduce((total, item) => total + item.bytes, 0);
const initialThree = sizes.find(({ file }) => file.includes("vendor-three"));

const failures = [];
if (entryBytes > ENTRY_LIMIT_BYTES) {
  failures.push(
    `entry chunk ${(entryBytes / 1024).toFixed(1)} KiB exceeds ${ENTRY_LIMIT_BYTES / 1024} KiB`,
  );
}
if (initialBytes > INITIAL_GRAPH_LIMIT_BYTES) {
  failures.push(
    `initial JS graph ${(initialBytes / 1024).toFixed(1)} KiB exceeds ${
      INITIAL_GRAPH_LIMIT_BYTES / 1024
    } KiB`,
  );
}
if (initialThree) {
  failures.push(`Three.js is eagerly loaded by the initial graph (${initialThree.file})`);
}

console.log(
  JSON.stringify(
    {
      entry: { file: entry.file, kib: Number((entryBytes / 1024).toFixed(1)) },
      initialGraphKib: Number((initialBytes / 1024).toFixed(1)),
      initialFiles: sizes.map(({ file, bytes }) => ({
        file,
        kib: Number((bytes / 1024).toFixed(1)),
      })),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  throw new Error(`Web bundle budget failed:\n- ${failures.join("\n- ")}`);
}
