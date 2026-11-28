import { beforeEach, describe, expect, it, vi } from "vitest";

const { USER_ID, EMAIL, DOMAIN, INSTITUTION } = vi.hoisted(() => ({
  USER_ID: "11111111-1111-4111-8111-111111111111",
  EMAIL: "student@fpt.edu.vn",
  DOMAIN: "fpt.edu.vn",
  INSTITUTION: { id: "inst-1", name: "FPT University", rorId: null, hostInstitution: true },
}));

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ affiliations: [] as Row[], evidence: [] as Row[], profile: null as Row | null }));
const auditLog = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: auditLog } }));
vi.mock("../../identity/participant-scope.service.js", () => ({ participantScopeForUser: vi.fn(async () => ({})) }));
vi.mock("../../identity/institution-domain.service.js", () => ({
  trustedInstitutionForEmail: vi.fn(async (email: string) => ({ email: email.toLowerCase(), domain: DOMAIN, institution: INSTITUTION })),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => {
  const userEmail = { normalizedEmail: EMAIL, userId: USER_ID, verifiedAt: new Date() };
  const client: any = {
    user: {
      findUnique: async () => ({ id: USER_ID }),
      findUniqueOrThrow: async () => ({ id: USER_ID, isActive: true, accountStatus: "ACTIVE" }),
      update: async () => ({}),
    },
    userEmail: { findUnique: async () => userEmail, upsert: async () => userEmail },
    academicProfile: {
      findUnique: async () => db.profile,
      upsert: async ({ create }: Row) => (db.profile = { id: "profile-1", ...create, affiliationStatus: "VERIFIED" }),
    },
    affiliation: {
      findFirst: async () => db.affiliations.find(a => a.isPrimary && a.isCurrent) ?? null,
      update: async ({ where, data }: Row) => Object.assign(db.affiliations.find(a => a.id === where.id)!, data),
      create: async ({ data }: Row) => { const row = { id: `aff-${db.affiliations.length + 1}`, ...data }; db.affiliations.push(row); return row; },
    },
    verificationEvidence: {
      findFirst: async ({ where }: Row) => db.evidence.find(e =>
        e.status === where.status && e.sourceReference === where.sourceReference && e.supersededAt == null && e.invalidatedAt == null) ?? null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: Row) => { const row = { id: `ev-${db.evidence.length + 1}`, supersededAt: null, invalidatedAt: null, ...data }; db.evidence.push(row); return row; },
    },
    $queryRaw: async () => [],
  };
  // Pending/open lookup uses status.in; model it as "none open" for this fixture.
  const origFind = client.verificationEvidence.findFirst;
  client.verificationEvidence.findFirst = async (args: Row) =>
    args.where.status?.in ? null : origFind(args);
  client.$transaction = async (fn: (tx: any) => Promise<unknown>) => fn(client);
  return { getPrisma: () => client };
});

import { affiliationService } from "../affiliation.service.js";

describe("affiliationService.verifyFromEmail idempotency", () => {
  beforeEach(() => {
    db.affiliations = [];
    db.evidence = [];
    db.profile = null;
    auditLog.mockClear();
  });

  it("creates one verification on first call and nothing new on repeat calls", async () => {
    const first = await affiliationService.verifyFromEmail(USER_ID, EMAIL);
    expect(first?.status).toBe("VERIFIED");
    expect(db.affiliations).toHaveLength(1);
    expect(db.evidence).toHaveLength(1);
    expect(auditLog).toHaveBeenCalledTimes(1);

    const second = await affiliationService.verifyFromEmail(USER_ID, EMAIL);
    const third = await affiliationService.verifyFromEmail(USER_ID, EMAIL);
    expect(second?.status).toBe("VERIFIED");
    expect(third?.status).toBe("VERIFIED");
    expect(db.affiliations).toHaveLength(1);
    expect(db.evidence).toHaveLength(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("issues a fresh verification when the previous evidence is invalidated", async () => {
    await affiliationService.verifyFromEmail(USER_ID, EMAIL);
    db.evidence[0]!.invalidatedAt = new Date();
    await affiliationService.verifyFromEmail(USER_ID, EMAIL);
    expect(db.evidence).toHaveLength(2);
    expect(auditLog).toHaveBeenCalledTimes(2);
  });
});
