import { afterAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { authService } from "../auth.service.js";

describe.sequential("identity account persistence", () => {
  const marker = crypto.randomUUID();
  const passwordEmail = `password-${marker}@fpt.edu.vn`;
  const googleEmail = `google-${marker}@fpt.edu.vn`;
  const personalResearcherEmail = `personal-researcher-${marker}@gmail.com`;
  const additionalEmail = `additional-${marker}@example.edu`;
  const duplicateOwnerEmail = `duplicate-owner-${marker}@fpt.edu.vn`;

  afterAll(async () => {
    await getPrisma().user.deleteMany({
      where: { email: { in: [passwordEmail, googleEmail, personalResearcherEmail, duplicateOwnerEmail] } },
    });
  });

  it("creates an email/password account with an unverified primary UserEmail", async () => {
    const result = await authService.register({
      email: passwordEmail,
      password: "StrongPassword123",
      fullName: "Password Account",
    });
    expect(result.user.systemRole).toBe("USER");
    expect(result.user.admissionBasis).toBe("HOST_INSTITUTION");
    expect(result.user.emailVerifiedAt).toBeUndefined();
    const linked = await getPrisma().userEmail.findUnique({ where: { normalizedEmail: passwordEmail } });
    expect(linked).toMatchObject({ isPrimary: true, purpose: "ACCOUNT", verifiedAt: null });
  }, 15_000);

  it("creates a Google account without duplicating its provider identity", async () => {
    const subject = `google-subject-${marker}`;
    const first = await authService.googleLogin({
      subject, email: googleEmail, emailVerified: true, name: "Google Account",
    });
    const second = await authService.googleLogin({
      subject, email: googleEmail, emailVerified: true, name: "Google Account",
    });
    expect(second.user.id).toBe(first.user.id);
    expect(await getPrisma().oAuthAccount.count({ where: { provider: "GOOGLE", providerAccountId: subject } })).toBe(1);
    expect(second.user.participantScope).toBe("INTERNAL");
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: googleEmail } });
    const affiliation = await getPrisma().affiliation.findFirst({
      where: { userId: user.id, isPrimary: true, isCurrent: true },
    });
    expect(affiliation).toMatchObject({
      institutionName: "FPT University",
      verificationStatus: "VERIFIED",
      verificationSource: "EMAIL",
    });

    const researcher = await authService.updateAcademicProfile(user.id, {
      academicRole: "RESEARCHER",
      positionTitle: "Research Assistant",
      institutionName: "FPT University",
      researchAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });
    expect(researcher.participantScope).toBe("INTERNAL");
    expect(researcher.academicRole).toBe("RESEARCHER");
    expect(researcher.academicRoleVerificationStatus).toBe("SELF_DECLARED");
    expect(researcher.capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(researcher.capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
  });

  it("treats a personal-email Researcher with FEID-verified FPT affiliation as internal", async () => {
    const prisma = getPrisma();
    const institution = await prisma.institution.findUniqueOrThrow({ where: { slug: "fpt-university" } });
    const user = await prisma.user.create({
      data: {
        email: personalResearcherEmail,
        fullName: "Personal Email Researcher",
        admissionBasis: "INVITATION",
      },
    });
    await prisma.userEmail.create({
      data: { userId: user.id, normalizedEmail: personalResearcherEmail, isPrimary: true, purpose: "ACCOUNT", verifiedAt: new Date() },
    });
    await prisma.affiliation.create({
      data: {
        userId: user.id,
        institutionId: institution.id,
        institutionName: institution.name,
        verificationStatus: "VERIFIED",
        verificationMethod: "FEID",
        verificationSource: "FEID",
        verifiedAt: new Date(),
        isPrimary: true,
        isCurrent: true,
      },
    });

    const researcher = await authService.updateAcademicProfile(user.id, {
      academicRole: "RESEARCHER",
      positionTitle: "Research Scientist",
      institutionName: "FPT University",
      researchAreas: ["AI in Education"],
      researchInterests: ["Learning analytics"],
    });

    expect(researcher.email).toBe(personalResearcherEmail);
    expect(researcher.participantScope).toBe("INTERNAL");
    expect(researcher.academicRole).toBe("RESEARCHER");
    expect(researcher.academicRoleVerificationStatus).toBe("SELF_DECLARED");
    expect(researcher.capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(researcher.capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(researcher.capabilities).not.toContain("MENTOR_PROJECT");
    const current = await prisma.affiliation.findFirstOrThrow({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
    expect(current).toMatchObject({ verificationStatus: "VERIFIED", verificationMethod: "FEID" });
  });

  it("uses an additional verified email for the same password account", async () => {
    const primary = await getPrisma().user.findUniqueOrThrow({ where: { email: passwordEmail } });
    await getPrisma().userEmail.create({
      data: { userId: primary.id, normalizedEmail: additionalEmail, purpose: "INSTITUTIONAL", verifiedAt: new Date() },
    });
    const login = await authService.login({ email: additionalEmail, password: "StrongPassword123" });
    expect(login.user.id).toBe(primary.legacyMongoId ?? primary.id);
    expect(login.user.email).toBe(passwordEmail);
  });

  it("rejects duplicate verified emails and duplicate provider identities at the database boundary", async () => {
    const other = await getPrisma().user.create({
      data: { email: duplicateOwnerEmail, fullName: "Duplicate Constraint Owner", admissionBasis: "ADMIN" },
    });
    await expect(getPrisma().userEmail.create({
      data: { userId: other.id, normalizedEmail: additionalEmail, purpose: "INSTITUTIONAL", verifiedAt: new Date() },
    })).rejects.toMatchObject({ code: "P2002" });

    const googleIdentity = await getPrisma().oAuthAccount.findFirstOrThrow({ where: { provider: "GOOGLE", email: googleEmail } });
    await expect(getPrisma().oAuthAccount.create({
      data: { userId: other.id, provider: "GOOGLE", providerAccountId: googleIdentity.providerAccountId, email: duplicateOwnerEmail },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

