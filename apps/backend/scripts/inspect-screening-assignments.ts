import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";

// Read-only diagnostic. Accepts the public project ID; does not print credentials.
const publicId = process.argv[2];
if (!publicId) throw new Error("Provide a public project ID");
const db = getPrisma();
try {
  const project = await db.project.findFirstOrThrow({ where: /^[0-9a-f-]{36}$/i.test(publicId) ? { id: publicId } : { legacyMongoId: publicId }, select: { id: true, ownerId: true } });
  const members = await db.projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" }, select: { userId: true } });
  const rounds = await db.screeningRound.findMany({ where: { projectId: project.id, active: true }, select: { id: true, number: true, phase: true, settings: true, status: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const assignments = await db.screeningAssignment.findMany({ where: { projectId: project.id, active: true, roundId: { in: rounds.map(r => r.id) } }, select: { roundId: true, reviewerId: true, submittedAt: true } });
  const people = await db.user.findMany({ where: { id: { in: [...new Set([project.ownerId, ...members.map(m => m.userId), ...assignments.map(a => a.reviewerId)])] } }, select: { id: true, fullName: true, isActive: true, accountStatus: true, emailVerifiedAt: true } });
  const name = (id: string) => people.find(p => p.id === id)?.fullName;
  console.log(JSON.stringify({ activeMembers: members.length, owner: name(project.ownerId), rounds: rounds.map(r => ({ number: r.number, phase: r.phase, status: r.status, settings: r.settings, reviewers: assignments.filter(a => a.roundId === r.id).map(a => ({ name: name(a.reviewerId), submitted: Boolean(a.submittedAt), isOwner: a.reviewerId === project.ownerId })) })) }, null, 2));
} finally { await disconnectPostgres(); }
