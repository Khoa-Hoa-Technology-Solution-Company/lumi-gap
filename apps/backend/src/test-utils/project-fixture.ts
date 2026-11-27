import type { Prisma } from "../generated/prisma/client.js";
import { purgeProjectRecord } from "../modules/projects/project-purge.js";
import { getPrisma } from "../infrastructure/database/prisma.js";

/** Persistence fixtures must satisfy the same atomic owner invariant as production. */
export async function createProjectFixture(input: { data: Prisma.ProjectUncheckedCreateInput }) {
  if (process.env.NODE_ENV !== "test") throw new Error("Project fixtures are test-only");
  return getPrisma().$transaction(async tx => {
    const project = await tx.project.create(input);
    await tx.projectMember.create({ data: { projectId: project.id, userId: project.ownerId, role: "OWNER" } });
    await tx.researchPlan.create({ data: { projectId: project.id } });
    return project;
  });
}

/** Remove only captured test projects through the same retention-aware purge as production. */
export async function purgeProjectFixture(projectId: string) {
  if (process.env.NODE_ENV !== "test") throw new Error("Project fixtures are test-only");
  const db = getPrisma();
  const databases = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  const name = databases[0]?.name;
  if (!name || (name !== "test" && !name.endsWith("_test"))) throw new Error("Fixture purge requires an isolated test database");
  await db.$transaction(async tx => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) return;
    await tx.project.update({ where: { id: projectId }, data: { deletedAt: new Date(Date.now() - 31 * 86400000), purgeAt: new Date(Date.now() - 86400000) } });
    await purgeProjectRecord(tx, projectId, null, { trigger: "TEST_FIXTURE_CLEANUP" });
  }, { timeout: 30000 });
}
