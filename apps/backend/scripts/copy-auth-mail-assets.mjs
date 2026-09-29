import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("src/modules/auth/assets");
const destination = resolve("dist/modules/auth/assets");

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
