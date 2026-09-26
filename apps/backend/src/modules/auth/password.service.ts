import argon2 from "argon2";
import bcrypt from "bcryptjs";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const passwordService = {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  },

  async verify(storedHash: string, password: string): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (storedHash.startsWith("$argon2")) {
      const valid = await argon2.verify(storedHash, password);
      return { valid, needsRehash: valid && argon2.needsRehash(storedHash, ARGON2_OPTIONS) };
    }

    // One-way compatibility for accounts created before the Argon2id migration.
    // A successful bcrypt login is immediately upgraded to Argon2id.
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, needsRehash: valid };
  },
};
