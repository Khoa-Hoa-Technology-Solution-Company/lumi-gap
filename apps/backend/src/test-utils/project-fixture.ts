import type { Prisma } from "../generated/prisma/client.js";
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
