import "./src/config/load-env.js";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Client generation and formatting do not need a live database. Deploy and
    // migration commands still fail before connecting when this value is empty.
    url: process.env.DATABASE_URL ?? "",
  },
});
