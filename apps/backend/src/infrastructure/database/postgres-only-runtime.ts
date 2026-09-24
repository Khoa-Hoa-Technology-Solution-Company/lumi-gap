import { env } from "../../config/env.js";

/**
 * Runtime tripwire for the completed PostgreSQL cutover.
 *
 * Legacy copy tooling is isolated under scripts/ and is never imported by the
 * API or workers. The application process itself does not load a Mongo client.
 */
export function enforcePostgresOnlyRuntime(): void {
  if (env.PERSISTENCE_PROVIDER !== "postgresql") {
    throw new Error("Application runtime is PostgreSQL-only");
  }
}
