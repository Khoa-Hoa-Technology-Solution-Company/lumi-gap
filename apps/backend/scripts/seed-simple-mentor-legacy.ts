// Used only by the disposable migration verification runner.
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { createProjectFixture } from "../src/test-utils/project-fixture.js";
if (!/^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error("Disposable test database required");
const db = getPrisma();
try {
  const accounts = await Promise.all(["Owner", "Primary mentor", "Pending mentor"].map(fullName => db.user.create({ data: { fullName, email: `${randomUUID()}@migration.invalid`, emailVerifiedAt: new Date() } })));
  const [owner, mentor, pending] = accounts;
  const project = await createProjectFixture({ data: { ownerId: owner!.id, title: "Historical supervision" } });
  const accepted = await db.mentorshipRequest.create({ data: { projectId: project.id, mentorUserId: mentor!.id, requestedBy: owner!.id, mentorRole: "PRIMARY", status: "ACCEPTED", message: "Original accepted invitation", invitationSnapshot: { historicalEvidence: "unchanged" }, expiresAt: new Date(Date.now() + 6 * 86400000) } });
  await db.mentorRelationship.create({ data: { projectId: project.id, mentorUserId: mentor!.id, mentorRole: "PRIMARY", sourceRequestId: accepted.id } });
  await db.mentorshipRequest.create({ data: { projectId: project.id, mentorUserId: pending!.id, requestedBy: owner!.id, mentorRole: "SECONDARY", message: "Original pending invitation", invitationSnapshot: { approved: true }, expiresAt: new Date(Date.now() + 6 * 86400000) } });
  await db.mentorshipDraft.create({ data: { projectId: project.id, userId: owner!.id, direction: "PROJECT_TO_LECTURER", mentorRole: "PRIMARY", message: "Original unpublished draft" } });
} finally { await disconnectPostgres(); }
