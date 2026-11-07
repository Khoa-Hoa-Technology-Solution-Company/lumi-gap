import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const IDENTITY_ID = "22222222-2222-4222-8222-222222222222";
const VALID_ORCID = "0000-0002-1825-0097";
const VALID_ORCID_X = "0000-0002-1694-233X";
const INVALID_CHECKSUM_ORCID = "0000-0002-1825-0098";

const mocks = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  return {
    redisStore,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      CORS_ORIGIN: "http://localhost:8080",
      ORCID_CLIENT_ID: "APP-TESTCLIENT123456" as string | undefined,
      ORCID_CLIENT_SECRET: "secret-orcid-value-do-not-leak" as string | undefined,
      ORCID_BASE_URL: "https://sandbox.orcid.org" as string,
      ORCID_REDIRECT_URI: "http://localhost:4000/api/v1/academic-profiles/orcid/callback" as string | undefined,
    },
    redis: {
      set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
        if (nx === "NX" && redisStore.has(key)) return null;
        redisStore.set(key, value);
        return "OK";
      }),
      get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
      eval: vi.fn(async (_script: string, _numKeys: number, key: string, expected: string) => {
        if (redisStore.get(key) === expected) {
          redisStore.delete(key);
          return 1;
        }
        return 0;
      }),
    },
    prisma: {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111" }]),
      $transaction: vi.fn(),
      user: {
        findUnique: vi.fn(),
      },
      refreshToken: {
        findFirst: vi.fn(),
      },
      academicIdentityLink: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      academicProfile: {
        updateMany: vi.fn(),
      },
    },
    auditLog: vi.fn(),
  };
});

vi.mock("../../../config/env.js", () => ({ env: mocks.env }));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: mocks.redis }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.auditLog } }));

import { orcidOAuthService, resolveOrcidBaseUrl } from "../orcid-oauth.service.js";
import { academicIdentityService } from "../academic-identity.service.js";

function identityRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date("2026-11-07T00:00:00.000Z");
  return {
    id: IDENTITY_ID,
    userId: USER_ID,
    provider: "ORCID",
    label: null,
    identifier: VALID_ORCID,
    profileUrl: `https://orcid.org/${VALID_ORCID}`,
    connectionMethod: "OAUTH",
    status: "CONNECTED",
    verificationStatus: "PROVIDER_CONNECTED",
    visibility: "PUBLIC",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ORCID OAuth 2.0 Service & Account Linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.academicIdentityLink.findFirst.mockReset();
    mocks.prisma.academicIdentityLink.findUnique.mockReset();
    mocks.prisma.academicIdentityLink.create.mockReset();
    mocks.prisma.academicIdentityLink.update.mockReset();
    mocks.prisma.academicIdentityLink.delete.mockReset();
    mocks.redisStore.clear();
    mocks.env.NODE_ENV = "test";
    mocks.env.CORS_ORIGIN = "http://localhost:8080";
    mocks.env.ORCID_CLIENT_ID = "APP-TESTCLIENT123456";
    mocks.env.ORCID_CLIENT_SECRET = "secret-orcid-value-do-not-leak";
    mocks.env.ORCID_BASE_URL = "https://sandbox.orcid.org";
    mocks.env.ORCID_REDIRECT_URI = "http://localhost:4000/api/v1/academic-profiles/orcid/callback";

    mocks.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
      if (where.id === USER_ID || where.id === OTHER_USER_ID) {
        return { id: where.id, accountStatus: "ACTIVE" };
      }
      return null;
    });
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ id: "rt-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
    mocks.prisma.academicProfile.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1. rejects unauthenticated or inactive users when starting ORCID linking", async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(orcidOAuthService.start(USER_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: "Academic identity owner not found",
    });

    mocks.prisma.user.findUnique.mockResolvedValueOnce({ id: USER_ID, accountStatus: "SUSPENDED" });
    await expect(orcidOAuthService.start(USER_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: "Academic identity owner not found",
    });
  });

  it("2. handles missing ORCID env vars gracefully without crashing status and returns 503 on connect/callback", async () => {
    mocks.env.ORCID_CLIENT_ID = undefined;
    mocks.env.ORCID_CLIENT_SECRET = undefined;
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValueOnce(null);

    const status = await orcidOAuthService.status(USER_ID);
    expect(status).toEqual({
      configured: false,
      environment: "sandbox",
      connected: false,
      link: null,
    });

    await expect(orcidOAuthService.start(USER_ID, SESSION_ID)).rejects.toMatchObject({
      statusCode: 503,
      message: "ORCID connection is not configured",
    });

    await expect(orcidOAuthService.complete({ code: "code-123", state: "state-12345678901234567890" })).rejects.toMatchObject({
      statusCode: 503,
      message: "ORCID connection is not configured",
    });
  });

  it("3. generates a valid ORCID authorization URL and stores hashed state in Redis for both sandbox and production", async () => {
    const sandboxStart = await orcidOAuthService.start(USER_ID, SESSION_ID, {
      returnTo: "/profile",
      returnOrigin: "http://localhost:8080",
    });
    const sandboxUrl = new URL(sandboxStart.url);
    expect(sandboxUrl.origin).toBe("https://sandbox.orcid.org");
    expect(sandboxUrl.pathname).toBe("/oauth/authorize");
    expect(sandboxUrl.searchParams.get("client_id")).toBe("APP-TESTCLIENT123456");
    expect(sandboxUrl.searchParams.get("response_type")).toBe("code");
    expect(sandboxUrl.searchParams.get("scope")).toBe("/authenticate");
    expect(sandboxUrl.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/v1/academic-profiles/orcid/callback");
    expect(sandboxUrl.searchParams.get("state")).toBe(sandboxStart.state);
    expect(sandboxStart.state.length).toBeGreaterThanOrEqual(40);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth:orcid:state:[a-f0-9]{64}$/),
      expect.any(String),
      "EX",
      600,
      "NX",
    );

    mocks.env.ORCID_BASE_URL = "https://orcid.org";
    const prodStart = await orcidOAuthService.start(USER_ID, SESSION_ID);
    expect(new URL(prodStart.url).origin).toBe("https://orcid.org");

    expect(() => resolveOrcidBaseUrl("https://evil.example.com" as "https://orcid.org")).toThrow(
      "ORCID base URL is invalid or not allowed",
    );
  });

  it("4. rejects callback when state is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(orcidOAuthService.complete({ code: "auth-code-123" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Missing ORCID authorization code or state",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("5. rejects callback when state is invalid or unknown", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: "unknown-state-token-that-was-never-issued-12345",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "ORCID authorization state is invalid, expired, or already used",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("6. rejects callback when state has expired in Redis", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);
    mocks.redisStore.clear(); // Simulate Redis TTL expiration

    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: started.state,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "ORCID authorization state is invalid, expired, or already used",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("7. rejects replayed state on second attempt (single-use atomic consumption)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "orcid-access-token-1",
            token_type: "bearer",
            scope: "/authenticate",
            orcid: VALID_ORCID,
            name: "Josiah Carberry",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    mocks.prisma.academicIdentityLink.create.mockResolvedValue(identityRow());

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);

    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: started.state,
        authenticatedUserId: USER_ID,
        authenticatedSessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      link: expect.objectContaining({
        provider: "ORCID",
        identifier: VALID_ORCID,
        verificationStatus: "PROVIDER_CONNECTED",
      }),
    });

    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: started.state,
        authenticatedUserId: USER_ID,
        authenticatedSessionId: SESSION_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "ORCID authorization state is invalid, expired, or already used",
    });
  });

  it("8. rejects callback when state belongs to a different user or session", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);

    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: started.state,
        authenticatedUserId: OTHER_USER_ID,
        authenticatedSessionId: OTHER_SESSION_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "ORCID authorization state belongs to a different LumiGap account",
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const started2 = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await expect(
      orcidOAuthService.complete({
        code: "auth-code-123",
        state: started2.state,
        authenticatedUserId: USER_ID,
        authenticatedSessionId: OTHER_SESSION_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "ORCID authorization state belongs to a different session",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("9. handles callback with error=access_denied cleanly and consumes state", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);

    await expect(
      orcidOAuthService.complete({
        error: "access_denied",
        errorDescription: "User denied access",
        state: started.state,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "ORCID authorization was cancelled",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.redisStore.size).toBe(0);
  });

  it("10. handles ORCID token exchange HTTP failure without leaking client_secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "invalid_client",
            error_description: "Client secret secret-orcid-value-do-not-leak was rejected",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);
    let caughtError: Error | undefined;
    try {
      await orcidOAuthService.complete({ code: "bad-code", state: started.state });
    } catch (err) {
      caughtError = err as Error;
    }
    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toBe("ORCID token exchange failed");
    expect(JSON.stringify(caughtError)).not.toContain("secret-orcid-value-do-not-leak");
  });

  it("11. rejects ORCID token response when orcid or access_token is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok-1" }), { status: 200 }),
      ),
    );
    const started1 = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await expect(orcidOAuthService.complete({ code: "code-1", state: started1.state })).rejects.toMatchObject({
      statusCode: 502,
      message: "ORCID token response is missing required identity fields",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ orcid: VALID_ORCID }), { status: 200 }),
      ),
    );
    const started2 = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await expect(orcidOAuthService.complete({ code: "code-2", state: started2.state })).rejects.toMatchObject({
      statusCode: 502,
      message: "ORCID token response is missing required identity fields",
    });
  });

  it("12. rejects ORCID token response when the returned ORCID checksum is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "tok-invalid-orcid",
            orcid: INVALID_CHECKSUM_ORCID,
          }),
          { status: 200 },
        ),
      ),
    );

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await expect(orcidOAuthService.complete({ code: "code-invalid", state: started.state })).rejects.toMatchObject({
      statusCode: 502,
      message: "ORCID returned an invalid researcher identifier",
    });
    expect(mocks.prisma.academicIdentityLink.create).not.toHaveBeenCalled();
  });

  it("13. creates AcademicIdentityLink with OAUTH, CONNECTED, PROVIDER_CONNECTED on valid callback without logging tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "sensitive-orcid-token-999",
          refresh_token: "sensitive-refresh-token-999",
          token_type: "bearer",
          scope: "/authenticate",
          orcid: VALID_ORCID_X,
          name: "Ada Lovelace",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    mocks.prisma.academicIdentityLink.create.mockResolvedValue(
      identityRow({
        identifier: VALID_ORCID_X,
        profileUrl: `https://orcid.org/${VALID_ORCID_X}`,
      }),
    );

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID, { returnTo: "/profile" });
    const completed = await orcidOAuthService.complete({
      code: "valid-auth-code",
      state: started.state,
      authenticatedUserId: USER_ID,
      authenticatedSessionId: SESSION_ID,
    });

    expect(mocks.prisma.academicIdentityLink.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        provider: "ORCID",
        identifier: VALID_ORCID_X,
        profileUrl: `https://orcid.org/${VALID_ORCID_X}`,
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
        visibility: "PUBLIC",
      },
    });
    expect(completed.link).toMatchObject({
      provider: "ORCID",
      identifier: VALID_ORCID_X,
      profileUrl: `https://orcid.org/${VALID_ORCID_X}`,
      connectionMethod: "OAUTH",
      status: "CONNECTED",
      verificationStatus: "PROVIDER_CONNECTED",
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      "academic_profile.orcid.connected",
      expect.objectContaining({
        userId: USER_ID,
        targetRecordId: IDENTITY_ID,
        details: expect.objectContaining({
          provider: "ORCID",
          identifier: VALID_ORCID_X,
          connectionMethod: "OAUTH",
          verificationStatus: "PROVIDER_CONNECTED",
          upgradedFromManual: false,
        }),
      }),
    );
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain("sensitive-orcid-token-999");
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain("sensitive-refresh-token-999");
    expect(JSON.stringify(completed)).not.toContain("sensitive-orcid-token-999");
  });

  it("14. safely upgrades an existing manual ORCID belonging to the same user to OAUTH / PROVIDER_CONNECTED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "token-upgrade",
            orcid: VALID_ORCID,
          }),
          { status: 200 },
        ),
      ),
    );

    // First findFirst checks conflicting verified link on other users -> null
    // Second findFirst checks existing link on the same user -> manual unverified row
    mocks.prisma.academicIdentityLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        identityRow({
          connectionMethod: "MANUAL",
          status: "SELF_DECLARED",
          verificationStatus: "UNVERIFIED",
          visibility: "REGISTERED_USERS",
        }),
      );
    mocks.prisma.academicIdentityLink.update.mockResolvedValueOnce(
      identityRow({
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
        visibility: "REGISTERED_USERS",
      }),
    );

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);
    const completed = await orcidOAuthService.complete({
      code: "upgrade-code",
      state: started.state,
    });

    expect(mocks.prisma.academicIdentityLink.update).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID },
      data: {
        identifier: VALID_ORCID,
        profileUrl: `https://orcid.org/${VALID_ORCID}`,
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
      },
    });
    expect(completed.link.visibility).toBe("REGISTERED_USERS");
    expect(completed.link.verificationStatus).toBe("PROVIDER_CONNECTED");
    expect(mocks.auditLog).toHaveBeenCalledWith(
      "academic_profile.orcid.connected",
      expect.objectContaining({
        details: expect.objectContaining({ upgradedFromManual: true }),
      }),
    );
  });

  it("15. blocks linking an ORCID iD already PROVIDER_CONNECTED to another user (409 Conflict), while unverified manual claims do not block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        new Response(
          JSON.stringify({
            access_token: "token-conflict",
            orcid: VALID_ORCID,
          }),
          { status: 200 },
        ),
      ),
    );

    // Case A: Another user already has a PROVIDER_CONNECTED link for this ORCID iD
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValueOnce(
      identityRow({
        id: "other-link-id",
        userId: OTHER_USER_ID,
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
      }),
    );

    const startedConflict = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await expect(
      orcidOAuthService.complete({
        code: "conflict-code",
        state: startedConflict.state,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "This ORCID iD is already connected to another LumiGap account",
    });
    expect(mocks.prisma.academicIdentityLink.create).not.toHaveBeenCalled();

    // Case B: Another user only had an UNVERIFIED manual claim -> query for PROVIDER_CONNECTED returns null, allowing real owner to connect
    mocks.prisma.academicIdentityLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.prisma.academicIdentityLink.create.mockResolvedValueOnce(identityRow());

    const startedAllowed = await orcidOAuthService.start(USER_ID, SESSION_ID);
    const linked = await orcidOAuthService.complete({
      code: "real-owner-code",
      state: startedAllowed.state,
    });
    expect(linked.link.verificationStatus).toBe("PROVIDER_CONNECTED");
  });

  it("16 & 17. prevents manually editing a connected ORCID identifier while still allowing visibility updates", async () => {
    const connectedRow = identityRow({
      connectionMethod: "OAUTH",
      status: "CONNECTED",
      verificationStatus: "PROVIDER_CONNECTED",
      visibility: "PUBLIC",
    });
    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValue(connectedRow);
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);

    await expect(
      academicIdentityService.update(USER_ID, IDENTITY_ID, { identifier: VALID_ORCID_X }),
    ).rejects.toThrow("Disconnect the provider before changing this academic identity");

    mocks.prisma.academicIdentityLink.update.mockResolvedValueOnce({
      ...connectedRow,
      visibility: "PRIVATE",
    });
    const updatedVisibility = await academicIdentityService.update(USER_ID, IDENTITY_ID, {
      visibility: "PRIVATE",
    });
    expect(updatedVisibility).toMatchObject({
      visibility: "PRIVATE",
      verificationStatus: "PROVIDER_CONNECTED",
      connectionMethod: "OAUTH",
    });
  });

  it("18 & 19. disconnects owned ORCID and records audit log, while preventing another user from disconnecting it", async () => {
    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValueOnce(identityRow());
    mocks.prisma.academicIdentityLink.delete.mockResolvedValueOnce(identityRow());

    const disconnected = await orcidOAuthService.disconnect(USER_ID);
    expect(disconnected).toEqual({ disconnected: true });
    expect(mocks.prisma.academicIdentityLink.delete).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID },
    });
    expect(mocks.prisma.academicProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { orcidStatus: "NOT_SUBMITTED" },
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      "academic_profile.orcid.disconnected",
      expect.objectContaining({
        userId: USER_ID,
        targetRecordId: IDENTITY_ID,
      }),
    );

    // Another user cannot remove USER_ID's ORCID link via academicIdentityService.remove
    mocks.prisma.academicIdentityLink.findUnique.mockResolvedValueOnce(
      identityRow({ userId: USER_ID }),
    );
    await expect(academicIdentityService.remove(OTHER_USER_ID, IDENTITY_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: "Academic identity not found",
    });
  });

  it("20. preserves Lecturer verification boundaries: connecting ORCID never grants LECTURER role or verifies position/affiliation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "token-student",
            orcid: VALID_ORCID,
          }),
          { status: 200 },
        ),
      ),
    );

    mocks.prisma.academicIdentityLink.findFirst.mockResolvedValue(null);
    mocks.prisma.academicIdentityLink.create.mockResolvedValueOnce(identityRow());

    const started = await orcidOAuthService.start(USER_ID, SESSION_ID);
    await orcidOAuthService.complete({
      code: "student-code",
      state: started.state,
    });

    expect(mocks.prisma.academicProfile.updateMany).toHaveBeenCalledTimes(1);
    const profileUpdatePayload = mocks.prisma.academicProfile.updateMany.mock.calls[0]?.[0];
    expect(profileUpdatePayload).toEqual({
      where: { userId: USER_ID },
      data: { orcidStatus: "VERIFIED" },
    });
    expect(profileUpdatePayload.data).not.toHaveProperty("academicRole");
    expect(profileUpdatePayload.data).not.toHaveProperty("roleVerificationStatus");
    expect(profileUpdatePayload.data).not.toHaveProperty("positionStatus");
    expect(profileUpdatePayload.data).not.toHaveProperty("affiliationStatus");
    expect(profileUpdatePayload.data).not.toHaveProperty("verificationStatus");
  });
});
