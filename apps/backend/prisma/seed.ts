import "dotenv/config";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";

async function main() {
  const prisma = getPrisma();
  console.log("🌱 Seeding database...");

  // 1. Seed Trusted Institutions
  console.log("🏛️  Seeding Trusted Institutions...");
  const fptInst = await prisma.trustedInstitution.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "FPT University",
      rorId: "https://ror.org/037b58712",
      verificationPolicy: {
        allowInstitutionalEmailVerification: true,
        autoVerifyMethods: ["INSTITUTIONAL_EMAIL"],
      },
      isActive: true,
    },
    update: {
      name: "FPT University",
      isActive: true,
      verificationPolicy: {
        allowInstitutionalEmailVerification: true,
        autoVerifyMethods: ["INSTITUTIONAL_EMAIL"],
      },
    },
  });

  const domains = ["fpt.edu.vn", "fe.edu.vn"];
  for (const domain of domains) {
    await prisma.trustedInstitutionDomain.upsert({
      where: { domain },
      create: {
        domain,
        institutionId: fptInst.id,
      },
      update: {
        institutionId: fptInst.id,
      },
    });
  }

  // 2. Seed API Provider (OpenAlex)
  console.log("🌐 Seeding API Providers...");
  const openalexProvider = await prisma.apiProvider.upsert({
    where: { providerName: "openalex" },
    create: {
      providerName: "openalex",
      baseUrl: "https://api.openalex.org",
      providerKind: "academic-api",
      providerStatus: "enabled",
      rateLimitPerMin: 600,
    },
    update: {
      baseUrl: "https://api.openalex.org",
      providerKind: "academic-api",
      providerStatus: "enabled",
      rateLimitPerMin: 600,
    },
  });

  // 3. Seed Users
  console.log("👤 Seeding User Accounts...");

  const adminPasswordHash = await passwordService.hash("Admin123456!");
  const userPasswordHash = await passwordService.hash("Password123456!");

  // 3a. Admin Account: admin@liemresearch.com
  const admin1 = await prisma.user.upsert({
    where: { email: "admin@liemresearch.com" },
    create: {
      email: "admin@liemresearch.com",
      passwordHash: adminPasswordHash,
      fullName: "LiemResearch Admin",
      role: "admin",
      systemRole: "ADMIN",
      accountStatus: "ACTIVE",
      academicProfileType: "researcher",
      institution: "LiemResearch",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      credits: 100000,
      points: 10000,
      researchInterests: ["Artificial Intelligence", "Information Retrieval", "Machine Learning"],
    },
    update: {
      passwordHash: adminPasswordHash,
      fullName: "LiemResearch Admin",
      role: "admin",
      systemRole: "ADMIN",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.academicProfile.upsert({
    where: { userId: admin1.id },
    create: {
      userId: admin1.id,
      publicHandle: "admin",
      primaryPosition: "RESEARCH_STAFF",
      positionTitle: "Research Director",
      positionCategory: "RESEARCH_STAFF",
      positionSource: "PREDEFINED",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      affiliationStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      orcidStatus: "NOT_SUBMITTED",
      verificationStatus: "VERIFIED",
      headline: "System Administrator & Research Lead",
      biography: "Administrator for the research trend discovery and publication intelligence platform.",
      affiliationPosition: "Research Director",
      affiliationDepartment: "Core Systems",
      expertiseAreas: ["Artificial Intelligence", "Machine Learning", "Information Retrieval"],
      skills: ["System Architecture", "NLP", "Data Engineering"],
      researchKeywords: ["bibliometrics", "ai-research", "literature-review"],
      onboardingCompletedAt: new Date(),
    },
    update: {
      primaryPosition: "RESEARCH_STAFF",
      positionTitle: "Research Director",
      positionCategory: "RESEARCH_STAFF",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      verificationStatus: "VERIFIED",
      onboardingCompletedAt: new Date(),
    },
  });

  // 3b. Secondary Admin Account: admin@lumigap.com
  const admin2 = await prisma.user.upsert({
    where: { email: "admin@lumigap.com" },
    create: {
      email: "admin@lumigap.com",
      passwordHash: adminPasswordHash,
      fullName: "LumiGAP System Admin",
      role: "admin",
      systemRole: "ADMIN",
      accountStatus: "ACTIVE",
      academicProfileType: "researcher",
      institution: "LumiGAP Research",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      credits: 100000,
      points: 10000,
      researchInterests: ["AI in Healthcare", "Knowledge Graphs", "NLP"],
    },
    update: {
      passwordHash: adminPasswordHash,
      fullName: "LumiGAP System Admin",
      role: "admin",
      systemRole: "ADMIN",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.academicProfile.upsert({
    where: { userId: admin2.id },
    create: {
      userId: admin2.id,
      publicHandle: "admin.lumigap",
      primaryPosition: "RESEARCH_STAFF",
      positionTitle: "Lead Researcher",
      positionCategory: "RESEARCH_STAFF",
      positionSource: "PREDEFINED",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      affiliationStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      orcidStatus: "NOT_SUBMITTED",
      verificationStatus: "VERIFIED",
      headline: "Lead Platform Admin @ LumiGAP",
      biography: "Lead Platform Administrator managing trends, gap validation, and literature review workflows.",
      affiliationPosition: "Lead Researcher",
      affiliationDepartment: "Research & Development",
      expertiseAreas: ["AI in Healthcare", "Knowledge Graphs", "Natural Language Processing"],
      skills: ["Machine Learning", "Graph Databases", "Scientific Computing"],
      researchKeywords: ["gap-validation", "deep-learning", "knowledge-graphs"],
      onboardingCompletedAt: new Date(),
    },
    update: {
      primaryPosition: "RESEARCH_STAFF",
      positionTitle: "Lead Researcher",
      positionCategory: "RESEARCH_STAFF",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      verificationStatus: "VERIFIED",
      onboardingCompletedAt: new Date(),
    },
  });

  // Capabilities for Admins
  const allCapabilities = [
    "BASIC_RESEARCH",
    "RESEARCH_SUPPORT",
    "STRUCTURED_REVIEW",
    "GAP_VALIDATION",
  ];

  for (const adminUser of [admin1, admin2]) {
    for (const capability of allCapabilities) {
      await prisma.userCapability.upsert({
        where: { userId_capability: { userId: adminUser.id, capability } },
        create: {
          userId: adminUser.id,
          capability,
          status: "ACTIVE",
          source: "SYSTEM_POLICY_V1",
        },
        update: {
          status: "ACTIVE",
          source: "SYSTEM_POLICY_V1",
          expiresAt: null,
        },
      });
    }
  }

  // 3c. Demo Lecturer Account: lecturer@fpt.edu.vn
  const lecturer = await prisma.user.upsert({
    where: { email: "lecturer@fpt.edu.vn" },
    create: {
      email: "lecturer@fpt.edu.vn",
      passwordHash: userPasswordHash,
      fullName: "Dr. Nguyen Van A",
      role: "user",
      systemRole: "RESEARCH_USER",
      accountStatus: "ACTIVE",
      academicProfileType: "lecturer",
      institution: "FPT University",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      credits: 50000,
      points: 5000,
      researchInterests: ["Natural Language Processing", "Knowledge Graphs", "Deep Learning"],
    },
    update: {
      passwordHash: userPasswordHash,
      fullName: "Dr. Nguyen Van A",
      systemRole: "RESEARCH_USER",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.academicProfile.upsert({
    where: { userId: lecturer.id },
    create: {
      userId: lecturer.id,
      publicHandle: "lecturer.nguyen",
      primaryPosition: "LECTURER",
      positionTitle: "Senior Lecturer",
      positionCategory: "LECTURER",
      positionSource: "PREDEFINED",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      affiliationStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      orcidStatus: "NOT_SUBMITTED",
      verificationStatus: "VERIFIED",
      headline: "Senior Lecturer in Computer Science @ FPT University",
      biography: "Lecturer and researcher focusing on NLP, automated literature reviews, and AI-driven scientific workflows.",
      affiliationDepartment: "Department of Computer Science",
      affiliationPosition: "Senior Lecturer",
      institutionalEmail: "lecturer@fpt.edu.vn",
      institutionalEmailVerifiedAt: new Date(),
      expertiseAreas: ["Natural Language Processing", "Knowledge Graphs", "Deep Learning"],
      skills: ["Python", "PyTorch", "Transformers", "Knowledge Representation"],
      researchKeywords: ["nlp", "transformers", "academic-graph", "citation-analysis"],
      onboardingCompletedAt: new Date(),
    },
    update: {
      primaryPosition: "LECTURER",
      positionTitle: "Senior Lecturer",
      positionCategory: "LECTURER",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      positionStatus: "VERIFIED",
      verificationStatus: "VERIFIED",
      onboardingCompletedAt: new Date(),
    },
  });

  for (const capability of allCapabilities) {
    await prisma.userCapability.upsert({
      where: { userId_capability: { userId: lecturer.id, capability } },
      create: {
        userId: lecturer.id,
        capability,
        status: "ACTIVE",
        source: "SYSTEM_POLICY_V1",
      },
      update: {
        status: "ACTIVE",
        source: "SYSTEM_POLICY_V1",
        expiresAt: null,
      },
    });
  }

  // 3d. Demo Student Account: student@fpt.edu.vn
  const student = await prisma.user.upsert({
    where: { email: "student@fpt.edu.vn" },
    create: {
      email: "student@fpt.edu.vn",
      passwordHash: userPasswordHash,
      fullName: "Tran Thi B",
      role: "user",
      systemRole: "RESEARCH_USER",
      accountStatus: "ACTIVE",
      academicProfileType: "student",
      institution: "FPT University",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      credits: 10000,
      points: 1000,
      researchInterests: ["Software Engineering", "Web Systems", "Machine Learning"],
    },
    update: {
      passwordHash: userPasswordHash,
      fullName: "Tran Thi B",
      systemRole: "RESEARCH_USER",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.academicProfile.upsert({
    where: { userId: student.id },
    create: {
      userId: student.id,
      publicHandle: "student.tran",
      primaryPosition: "STUDENT",
      positionTitle: "Undergraduate Student",
      positionCategory: "STUDENT",
      positionSource: "PREDEFINED",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      affiliationStatus: "NOT_SUBMITTED",
      positionStatus: "NOT_SUBMITTED",
      orcidStatus: "NOT_SUBMITTED",
      verificationStatus: "SELF_DECLARED",
      headline: "Undergraduate Computer Science Student @ FPT University",
      biography: "Passionate about research discovery tools, data engineering, and intelligent web applications.",
      affiliationDepartment: "Department of Software Engineering",
      affiliationPosition: "Undergraduate Student",
      institutionalEmail: "student@fpt.edu.vn",
      institutionalEmailVerifiedAt: new Date(),
      expertiseAreas: ["Software Engineering", "Web Systems"],
      skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
      researchKeywords: ["literature-review", "web-architecture", "data-visualization"],
      onboardingCompletedAt: new Date(),
    },
    update: {
      primaryPosition: "STUDENT",
      positionTitle: "Undergraduate Student",
      positionCategory: "STUDENT",
      identityStatus: "VERIFIED",
      emailStatus: "VERIFIED",
      onboardingCompletedAt: new Date(),
    },
  });

  await prisma.userCapability.upsert({
    where: { userId_capability: { userId: student.id, capability: "BASIC_RESEARCH" } },
    create: {
      userId: student.id,
      capability: "BASIC_RESEARCH",
      status: "ACTIVE",
      source: "SYSTEM_POLICY_V1",
    },
    update: {
      status: "ACTIVE",
      source: "SYSTEM_POLICY_V1",
      expiresAt: null,
    },
  });

  // 4. Default Sync Config for OpenAlex
  console.log("⚙️  Seeding Default Sync Configs...");
  const existingConfig = await prisma.apiSyncConfig.findFirst({
    where: { providerId: openalexProvider.id },
  });

  if (!existingConfig) {
    await prisma.apiSyncConfig.create({
      data: {
        providerId: openalexProvider.id,
        createdById: admin1.id,
        configName: "General AI & Computer Science Ingest",
        searchText: "artificial intelligence OR machine learning OR computer vision",
        fromPublicationYear: 2021,
        toPublicationYear: 2026,
        scheduleCron: "0 0 * * *",
        configStatus: "enabled",
      },
    });
  }

  console.log("\n=======================================================");
  console.log("🎉 Database seeding completed successfully!");
  console.log("=======================================================");
  console.log("🔑 Seeded Accounts & Credentials:");
  console.log("-------------------------------------------------------");
  console.log("1. System Admin (Primary):");
  console.log("   - Email:    admin@liemresearch.com");
  console.log("   - Password: Admin123456!");
  console.log("   - Role:     ADMIN (Full Access to /admin)");
  console.log("-------------------------------------------------------");
  console.log("2. System Admin (LumiGAP):");
  console.log("   - Email:    admin@lumigap.com");
  console.log("   - Password: Admin123456!");
  console.log("   - Role:     ADMIN (Full Access to /admin)");
  console.log("-------------------------------------------------------");
  console.log("3. Senior Lecturer / Verified Researcher:");
  console.log("   - Email:    lecturer@fpt.edu.vn");
  console.log("   - Password: Password123456!");
  console.log("   - Position: Lecturer (Verified, Full Capabilities)");
  console.log("-------------------------------------------------------");
  console.log("4. Student:");
  console.log("   - Email:    student@fpt.edu.vn");
  console.log("   - Password: Password123456!");
  console.log("   - Position: Student (Verified Email)");
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPostgres();
  });
