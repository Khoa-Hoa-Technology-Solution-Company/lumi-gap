import type { Prisma } from "../../generated/prisma/client.js";

export async function replaceActivePasswordResetToken(
  tx: Prisma.TransactionClient,
  input: { userId: string; tokenHash: string; issuedAt: Date; expiresAt: Date },
): Promise<void> {
  // Serialize issuance per account so concurrent requests cannot leave two
  // unconsumed links active. The migration's partial unique index is a second guard.
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${input.userId}::uuid FOR UPDATE`;
  await tx.passwordResetToken.updateMany({
    where: { userId: input.userId, consumedAt: null },
    data: { consumedAt: input.issuedAt },
  });
  await tx.passwordResetToken.create({
    data: {
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    },
  });
}
