import "../src/config/load-env.js";
import { randomBytes, randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";
import { capabilityService } from "../src/modules/authorization/capability.service.js";

// Each run creates a separate local demo. Never reset or modify existing identities.
async function main() {
  if (env.NODE_ENV === "production" || !env.DATABASE_URL
    || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) {
    throw new Error("Demo creation requires nonproduction, loopback PostgreSQL");
  }
  const ready = await fetch("http://localhost:8080/", { signal: AbortSignal.timeout(10_000) });
  if (!ready.ok) throw new Error("Local web is unavailable");
  const batch = randomBytes(3).toString("hex");
  const accounts = await Promise.all([
    { key: "owner", name: "Chủ dự án", lecturer: false },
    { key: "member", name: "Thành viên", lecturer: false },
    { key: "lecturer", name: "Giảng viên", lecturer: true },
  ].map(async input => {
    const password = `${randomBytes(9).toString("base64url")}aA1!`;
    return { ...input, id: randomUUID(), email: `screening.${input.key}.${batch}@lumigap.test`,
      password, hash: await passwordService.hash(password) };
  }));
  const prisma = getPrisma(), now = new Date(), projectId = randomUUID();
  await prisma.$transaction(async tx => {
    const institution = await tx.institution.create({ data: {
      slug: `screening-demo-${batch}`, name: `LumiGap Screening Demo ${batch}`,
      hostInstitution: false, verificationPolicy: { allowInstitutionalEmailVerification: false },
    } });
    for (const a of accounts) {
      const position = a.lecturer ? "LECTURER" : "STUDENT";
      await tx.user.create({ data: {
        id: a.id, email: a.email, passwordHash: a.hash, fullName: `${a.name} (Demo ${batch})`,
        role: "user", systemRole: "USER", accountStatus: "ACTIVE", isActive: true,
        academicProfileType: a.lecturer ? "lecturer" : "student", institution: institution.name,
        emailVerifiedAt: now, onboardingCompletedAt: now, researchInterests: ["Artificial Intelligence"],
      } });
      await tx.userEmail.create({ data: { userId: a.id, normalizedEmail: a.email,
        isPrimary: true, purpose: "ACCOUNT", verifiedAt: now } });
      await tx.academicProfile.create({ data: {
        userId: a.id, publicHandle: `screening.${a.key}.${batch}`, academicRole: position,
        primaryPosition: position, positionCategory: position, positionTitle: a.name,
        roleVerificationStatus: a.lecturer ? "VERIFIED" : "SELF_DECLARED",
        roleVerificationMethod: a.lecturer ? "MANUAL_REVIEW" : null,
        roleVerifiedAt: a.lecturer ? now : null,
        positionStatus: a.lecturer ? "VERIFIED" : "NOT_SUBMITTED",
        affiliationStatus: a.lecturer ? "VERIFIED" : "NOT_SUBMITTED",
        identityStatus: a.lecturer ? "VERIFIED" : "NOT_SUBMITTED", emailStatus: "VERIFIED",
        verificationStatus: a.lecturer ? "VERIFIED" : "SELF_DECLARED",
        verifiedAt: a.lecturer ? now : null,
        verificationNote: "Synthetic local demo identity; not real academic verification.",
        biography: "Tài khoản demo để thử đánh giá độc lập và mời giảng viên.",
        onboardingCompletedAt: now, expertiseAreas: ["Artificial Intelligence", "Systematic Review"],
        supportAvailability: { enabled: a.lecturer, types: [], preferredTopics: ["Artificial Intelligence"] },
        mentorshipEmailEnabled: false, notificationLocale: "vi",
      } });
      await tx.affiliation.create({ data: {
        userId: a.id, institutionId: institution.id, institutionName: institution.name,
        positionTitle: a.name, positionCategory: position,
        positionStatus: a.lecturer ? "VERIFIED" : "NOT_SUBMITTED",
        verificationStatus: a.lecturer ? "VERIFIED" : "NOT_SUBMITTED",
        verificationMethod: a.lecturer ? "MANUAL_REVIEW" : null,
        verificationSource: a.lecturer ? "ADMIN" : "SELF_DECLARED", verifiedAt: a.lecturer ? now : null,
      } });
    }
    const owner = accounts.find(a => a.key === "owner")!;
    const member = accounts.find(a => a.key === "member")!;
    await tx.project.create({ data: {
      id: projectId, title: `Đánh giá tài liệu độc lập (Demo ${batch})`,
      ownerId: owner.id, createdById: owner.id, creationKey: `screening-demo-${batch}`,
      visibility: "PRIVATE", status: "PLANNING", researchField: "Artificial Intelligence",
      researchAreas: ["Artificial Intelligence"], mentorshipDiscovery: "SEEKING_MENTOR",
      description: "Dự án demo hai reviewer và một giảng viên được mời riêng.",
      mentorshipSummary: "Thử quy trình đánh giá tài liệu độc lập và phân xử bất đồng.",
      mentorshipResearchAreas: ["Artificial Intelligence"],
      mentorshipExpertise: ["Systematic Review"], mentorshipNeeds: "Góp ý tiêu chí và phân xử khi hai reviewer chưa thống nhất.",
    } });
    await tx.projectMember.createMany({ data: [
      { projectId, userId: owner.id, role: "OWNER" },
      { projectId, userId: member.id, role: "MEMBER" },
    ] });
    await tx.researchPlan.create({ data: { projectId, updatedById: owner.id,
      problem: "Dự án demo để kiểm tra sàng lọc tài liệu độc lập; không phải nghiên cứu thật." } });
  }, { timeout: 30_000 });
  for (const a of accounts) await capabilityService.evaluate(a.id);
  // These are newly generated demo credentials requested by the local operator.
  // Do not write them, hashes, or session tokens to repository files.
  console.log(JSON.stringify({ projectUrl: `http://localhost:8080/projects/${projectId}?tab=papers`,
    accounts: accounts.map(a => ({ role: a.key, email: a.email, password: a.password })) }));
  for (const a of accounts) {
    const response = await fetch("http://localhost:8080/api/v1/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: a.email, password: a.password }), signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok || !result.success || result.data.user.email !== a.email) throw new Error(`Demo login failed: ${a.key}`);
    const profile = result.data.user;
    console.log(JSON.stringify({ verifiedLogin: a.key, academicRole: profile.academicRole,
      capabilities: profile.capabilities }));
    const access = await fetch(`http://localhost:8080/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${result.data.tokens.accessToken}` }, signal: AbortSignal.timeout(10_000),
    });
    if (a.lecturer ? ![403, 404].includes(access.status) : access.status !== 200) {
      throw new Error(`Unexpected demo project access: ${a.key} (${access.status})`);
    }
    const logout = await fetch("http://localhost:8080/api/v1/auth/logout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: result.data.tokens.refreshToken }), signal: AbortSignal.timeout(10_000),
    });
    if (!logout.ok) throw new Error(`Demo verification logout failed: ${a.key}`);
  }
  console.log("Verified all three logins, member project access and lecturer isolation.");
}

main().catch(error => {
  // Prisma errors can contain credentials; never dump raw persistence exceptions.
  console.error("Demo creation/verification failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
}).finally(disconnectPostgres);
