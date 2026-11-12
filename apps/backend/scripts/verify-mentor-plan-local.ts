import "../src/config/load-env.js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";

// Read-only domain audit. Only hashes/counts are written, never invitation content.
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local database only");
const path = new URL("../../../docs/audits/2026-10-31-mentor-plan-migration-integrity.json", import.meta.url);
const db = getPrisma();
try {
  const [requests, relationships] = await Promise.all([
    db.mentorshipRequest.findMany({ select: { id: true, projectId: true, mentorUserId: true, requestedBy: true, direction: true, mentorRole: true, status: true, message: true, responseNote: true, expiresAt: true, respondedAt: true, createdAt: true, updatedAt: true }, orderBy: { id: "asc" } }),
    db.mentorRelationship.findMany({ orderBy: { id: "asc" } }),
  ]);
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const current = { requests: { count: requests.length, sha256: digest(requests) }, relationships: { count: relationships.length, sha256: digest(relationships) } };
  if (process.argv[2] === "before") {
    writeFileSync(path, JSON.stringify({ before: current }, null, 2));
    console.log("Local mentor history baseline captured (hashes and counts only).");
  } else {
    const baseline = JSON.parse(readFileSync(path, "utf8"));
    const preserved = JSON.stringify(baseline.before) === JSON.stringify(current);
    const legacyConflicts = await db.$queryRaw<Array<{ roles: bigint }>>`SELECT count(*) AS roles FROM (SELECT project_id,mentor_role FROM mentorship_requests WHERE status='PENDING' GROUP BY project_id,mentor_role HAVING count(*)>1) conflicts`;
    writeFileSync(path, JSON.stringify({ ...baseline, after: current, preserved, legacyRoleConflicts: Number(legacyConflicts[0]?.roles ?? 0) }, null, 2));
    if (!preserved) throw new Error("Mentor history changed during migration; inspect concurrent activity before proceeding");
    console.log(`Mentor history preserved; legacy roles needing explicit review: ${Number(legacyConflicts[0]?.roles ?? 0)}.`);
  }
} finally { await disconnectPostgres(); }
