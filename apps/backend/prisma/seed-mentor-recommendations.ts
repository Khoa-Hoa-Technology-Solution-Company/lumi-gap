import "../src/config/load-env.js";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../src/config/env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";
import type { Prisma } from "../src/generated/prisma/client.js";

/**
 * Idempotent, local-only synthetic fixture seed for Academic Mentor Recommendation testing & QA.
 * Creates clearly marked synthetic Lecturers A–J (§65) and representative projects (§66)
 * under reserved `.test` domains without ever touching real users or resetting the database.
 */
const deterministicUuid = (key: string) => {
  const hex = createHash("sha256").update(`lumigap-mentor-rec-fixture-v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

interface SyntheticLecturerFixture {
  key: string;
  fullName: string;
  institution: string;
  positionTitle: string;
  accepting: boolean;
  maxActiveProjects: number | null;
  areas: string[];
  specializations: string[];
  skills: string[];
  methods: string[];
  keywords: string[];
  supportTypes: string[];
  orcid?: string;
  orcidVerified?: boolean;
  papers?: Array<{ key: string; title: string; abstractText: string | null; year: number; doi: string }>;
  featuredOnlyTitle?: string;
}

const SYNTHETIC_LECTURERS: readonly SyntheticLecturerFixture[] = [
  {
    key: "lecturer-a-nlp",
    fullName: "TS. Synthetic Lecturer A — NLP & LLM (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Associate Professor",
    accepting: true,
    maxActiveProjects: 4,
    areas: ["Natural Language Processing", "Large Language Models", "Information Retrieval"],
    specializations: ["Scientific Text Mining", "Semantic Search"],
    skills: ["Python", "PyTorch", "Natural Language Processing"],
    methods: ["Experimental Design", "Evaluation Metrics"],
    keywords: ["Large Language Models", "Information Retrieval", "RAG", "LLM Evaluation"],
    supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN", "DATA_ANALYSIS"],
    orcid: "0000-0002-1000-0001",
    orcidVerified: true,
    papers: [
      {
        key: "paper-a-1",
        title: "Grounded Retrieval-Augmented Large Language Models for Scientific Evidence Synthesis",
        abstractText: "We present an Information Retrieval and Large Language Models pipeline for semantic search, citation verification, and experimental evaluation across academic corpora.",
        year: 2025,
        doi: "10.9999/lumigap.demo.a1",
      },
    ],
  },
  {
    key: "lecturer-b-methodology",
    fullName: "TS. Synthetic Lecturer B — Methodology (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Senior Lecturer",
    accepting: true,
    maxActiveProjects: 4,
    areas: ["Research Methodology", "Literature Review", "Academic Writing"],
    specializations: ["Systematic Literature Review", "Evidence Synthesis"],
    skills: ["Systematic Review", "Qualitative Analysis"],
    methods: ["Systematic Review", "Research Methods", "Research Question Formulation"],
    keywords: ["Research Gap", "Literature Review", "Research Gap Validation", "Academic Writing"],
    supportTypes: ["RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION", "RESEARCH_METHODOLOGY", "ACADEMIC_WRITING"],
    orcid: "0000-0002-1000-0002",
    orcidVerified: true,
    papers: [
      {
        key: "paper-b-1",
        title: "Structured Literature Review Frameworks for Identifying Validated Research Gaps",
        abstractText: "This paper examines research methodology guidelines that help undergraduate researchers formulate research questions and distinguish true research gaps from single-paper limitations.",
        year: 2024,
        doi: "10.9999/lumigap.demo.b1",
      },
    ],
  },
  {
    key: "lecturer-c-se",
    fullName: "TS. Synthetic Lecturer C — Software Engineering (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Senior Lecturer",
    accepting: true,
    maxActiveProjects: 3,
    areas: ["Software Engineering", "Cybersecurity", "System Architecture"],
    specializations: ["Vulnerability Detection", "Empirical Software Engineering"],
    skills: ["Python", "SQL", "Experimental Design"],
    methods: ["Experimental Design", "Case Study"],
    keywords: ["Software Engineering", "System Architecture", "Secure Coding", "System Reliability"],
    supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN"],
    orcid: "0000-0002-1000-0003",
    orcidVerified: true,
    papers: [
      {
        key: "paper-c-1",
        title: "Empirical Evaluation of Automated Vulnerability Detection in Student Software Projects",
        abstractText: "We evaluate software architecture and static analysis tools for vulnerability detection and system reliability in engineering repositories.",
        year: 2025,
        doi: "10.9999/lumigap.demo.c1",
      },
    ],
  },
  {
    key: "lecturer-d-edu",
    fullName: "TS. Synthetic Lecturer D — Education & Qualitative (Demo)",
    institution: "LumiGap Synthetic Education Faculty (Demo)",
    positionTitle: "Lecturer",
    accepting: true,
    maxActiveProjects: 4,
    areas: ["Education", "Educational Technology", "Human-Computer Interaction"],
    specializations: ["Learning Analytics", "Qualitative Research"],
    skills: ["Qualitative Analysis", "Statistical Analysis"],
    methods: ["Qualitative Research", "Survey Design", "User Study"],
    keywords: ["Education", "Educational Technology", "Qualitative Research", "Survey Design"],
    supportTypes: ["RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN", "ACADEMIC_WRITING"],
  },
  {
    key: "lecturer-e-no-pubs",
    fullName: "ThS. Synthetic Lecturer E — Declared Support No Pubs (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Lecturer",
    accepting: true,
    maxActiveProjects: 5,
    areas: ["Natural Language Processing", "Information Retrieval", "Software Engineering"],
    specializations: ["LLM Applications"],
    skills: ["Python", "PyTorch", "Natural Language Processing"],
    methods: ["Experimental Design", "Literature Review"],
    keywords: ["Large Language Models", "Information Retrieval", "Research Gap"],
    supportTypes: ["RESEARCH_DIRECTION", "SOFTWARE_TECHNICAL_GUIDANCE", "RESEARCH_GAP_VALIDATION"],
  },
  {
    key: "lecturer-f-many-unrelated",
    fullName: "GS. Synthetic Lecturer F — High Volume Unrelated (Demo)",
    institution: "LumiGap Synthetic Marine Institute (Demo)",
    positionTitle: "Professor",
    accepting: true,
    maxActiveProjects: 5,
    areas: ["Marine Biology", "Oceanography", "Ecology"],
    specializations: ["Coral Reef Conservation"],
    skills: ["R", "Statistical Analysis"],
    methods: ["Field Observation"],
    keywords: ["Marine Biology", "Coral Reefs", "Biodiversity"],
    supportTypes: ["DATA_ANALYSIS"],
    orcid: "0000-0002-1000-0006",
    orcidVerified: true,
    papers: Array.from({ length: 8 }, (_, idx) => ({
      key: `paper-f-${idx + 1}`,
      title: `Longitudinal Marine Biodiversity Assessment in Coastal Reefs Part ${idx + 1}`,
      abstractText: "Observational marine ecology survey measuring coral reef salinity and species recovery.",
      year: 2020 + (idx % 5),
      doi: `10.9999/lumigap.demo.f${idx + 1}`,
    })),
  },
  {
    key: "lecturer-g-capacity-full",
    fullName: "TS. Synthetic Lecturer G — Capacity Full (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Senior Lecturer",
    accepting: true,
    maxActiveProjects: 1,
    areas: ["Natural Language Processing", "Large Language Models", "Information Retrieval"],
    specializations: ["Semantic Search"],
    skills: ["Python", "PyTorch"],
    methods: ["Experimental Design"],
    keywords: ["Large Language Models", "Information Retrieval"],
    supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "RESEARCH_GAP_VALIDATION"],
  },
  {
    key: "lecturer-h-not-accepting",
    fullName: "TS. Synthetic Lecturer H — Not Accepting (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Associate Professor",
    accepting: false,
    maxActiveProjects: 3,
    areas: ["Natural Language Processing", "Large Language Models"],
    specializations: ["LLM Safety"],
    skills: ["Python"],
    methods: ["Experimental Design"],
    keywords: ["Large Language Models"],
    supportTypes: ["RESEARCH_METHODOLOGY"],
  },
  {
    key: "lecturer-i-sparse",
    fullName: "ThS. Synthetic Lecturer I — Sparse Profile (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Lecturer",
    accepting: true,
    maxActiveProjects: null,
    areas: [],
    specializations: [],
    skills: [],
    methods: [],
    keywords: [],
    supportTypes: [],
  },
  {
    key: "lecturer-j-uncertain-auth",
    fullName: "TS. Synthetic Lecturer J — Uncertain Authorship (Demo)",
    institution: "LumiGap Synthetic Research Institute (Demo)",
    positionTitle: "Lecturer",
    accepting: true,
    maxActiveProjects: 3,
    areas: ["Software Engineering"],
    specializations: [],
    skills: ["Python"],
    methods: [],
    keywords: ["Software Engineering"],
    supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE"],
    orcid: "0000-0002-1000-0010",
    orcidVerified: false,
    papers: [
      {
        key: "paper-j-1",
        title: "Information Retrieval Tooling for Academic Literature Exploration",
        abstractText: null,
        year: 2023,
        doi: "10.9999/lumigap.demo.j1",
      },
    ],
  },
];

async function main() {
  if (env.NODE_ENV === "production") throw new Error("Synthetic recommendation seed is disabled in production");
  if (!env.DATABASE_URL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) {
    throw new Error("Synthetic recommendation seed requires a local loopback PostgreSQL database");
  }

  const db = getPrisma();
  const passwordHash = await passwordService.hash(`${randomBytes(18).toString("base64url")}aA1!`);
  const now = new Date();
  let createdLecturers = 0;

  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(714206029)`;
    const instId = deterministicUuid("inst-synthetic-rec");
    await tx.institution.upsert({
      where: { slug: "lumigap-synthetic-recommendation-demo" },
      update: {},
      create: {
        id: instId,
        slug: "lumigap-synthetic-recommendation-demo",
        name: "LumiGap Synthetic Research Institute (Demo)",
        hostInstitution: false,
        verificationPolicy: { allowInstitutionalEmailVerification: false },
      },
    });

    for (const item of SYNTHETIC_LECTURERS) {
      const userId = deterministicUuid(item.key);
      const email = `${item.key}@lumigap-rec.test`;
      const existing = await tx.user.findUnique({ where: { email } });
      if (!existing) {
        await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash,
            fullName: item.fullName,
            role: "user",
            systemRole: "USER",
            academicProfileType: "lecturer",
            institution: item.institution,
            researchInterests: item.areas,
            emailVerifiedAt: now,
            onboardingCompletedAt: now,
          },
        });
        await tx.userEmail.create({ data: { userId, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT", verifiedAt: now } });
        await tx.academicProfile.create({
          data: {
            userId,
            publicHandle: `synth.${item.key.replace(/-/g, ".")}`,
            primaryPosition: "LECTURER",
            positionCategory: "LECTURER",
            positionTitle: item.positionTitle,
            affiliationPosition: item.positionTitle,
            academicRole: "LECTURER",
            roleVerificationStatus: "VERIFIED",
            roleVerificationMethod: "MANUAL_REVIEW",
            roleVerifiedAt: now,
            identityStatus: "VERIFIED",
            emailStatus: "VERIFIED",
            affiliationStatus: "VERIFIED",
            positionStatus: "VERIFIED",
            verificationStatus: "VERIFIED",
            verifiedAt: now,
            verificationMethod: "MANUAL_REVIEW",
            verificationNote: "Synthetic local fixture for mentor recommendation evaluation.",
            headline: `${item.positionTitle} · ${item.areas[0] ?? "Academic Mentoring"} (Demo)`,
            biography: "Hồ sơ giảng viên tổng hợp phục vụ kiểm thử hệ thống đề xuất cố vấn học thuật trên môi trường local.",
            expertiseAreas: item.areas,
            researchSpecializations: item.specializations,
            skills: item.skills,
            researchKeywords: item.keywords,
            profileVisibility: "PUBLIC",
            showInResearcherSearch: true,
            allowCollaborationRequests: true,
            onboardingCompletedAt: now,
            privacySettings: {
              expertise: "PUBLIC",
              researchInterests: "PUBLIC",
              researchMethods: item.methods,
            } as Prisma.InputJsonValue,
            supportAvailability: {
              enabled: item.accepting,
              types: item.supportTypes,
              preferredTopics: item.areas,
              maxActiveProjects: item.maxActiveProjects,
            } as Prisma.InputJsonValue,
            mentorshipEmailEnabled: false,
            notificationLocale: "vi",
          },
        });
        for (const cap of ["BASIC_RESEARCH", "RESEARCH_SUPPORT", "STRUCTURED_REVIEW", "GAP_VALIDATION"]) {
          await tx.userCapability.create({ data: { userId, capability: cap, source: "SYSTEM_POLICY_V1" } });
        }
        createdLecturers++;
      }

      if (item.orcid && item.papers?.length) {
        const linkId = deterministicUuid(`idlink:${item.key}`);
        await tx.academicIdentityLink.upsert({
          where: { id: linkId },
          update: {},
          create: {
            id: linkId,
            userId,
            provider: "ORCID",
            identifier: item.orcid,
            profileUrl: `https://orcid.org/${item.orcid}`,
            connectionMethod: item.orcidVerified ? "OAUTH" : "MANUAL",
            status: item.orcidVerified ? "CONNECTED" : "SELF_DECLARED",
            verificationStatus: item.orcidVerified ? "PROVIDER_CONNECTED" : "UNVERIFIED",
            visibility: "PUBLIC",
          },
        });

        const authorId = deterministicUuid(`author:${item.key}`);
        await tx.author.upsert({
          where: { id: authorId },
          update: {},
          create: {
            id: authorId,
            displayName: item.fullName,
            orcid: item.orcid,
          },
        });

        for (const paper of item.papers) {
          const paperId = deterministicUuid(`paper:${paper.key}`);
          await tx.paper.upsert({
            where: { id: paperId },
            update: {},
            create: {
              id: paperId,
              title: paper.title,
              abstractText: paper.abstractText,
              publicationYear: paper.year,
              doi: paper.doi,
              primaryProvider: "openalex",
              dataStatus: "active",
            },
          });
          await tx.paperAuthor.upsert({
            where: { paperId_position: { paperId, position: 1 } },
            update: { authorId, displayName: item.fullName },
            create: { paperId, authorId, displayName: item.fullName, position: 1 },
          });
        }
      }
    }

    // Create one active mentorship for Lecturer G so their maxActiveProjects=1 capacity is authentically reached
    const capOwnerId = deterministicUuid("owner-capacity-holder");
    const capOwnerEmail = "capacity-holder@lumigap-rec.test";
    if (!(await tx.user.findUnique({ where: { email: capOwnerEmail } }))) {
      await tx.user.create({
        data: { id: capOwnerId, email: capOwnerEmail, passwordHash, fullName: "Synthetic Team Capacity Holder (Demo)", emailVerifiedAt: now, onboardingCompletedAt: now },
      });
    }
    const capProjectId = deterministicUuid("project-capacity-holder");
    if (!(await tx.project.findUnique({ where: { id: capProjectId } }))) {
      await tx.project.create({
        data: {
          id: capProjectId,
          ownerId: capOwnerId,
          title: "Capacity Holder Project (Demo)",
          status: "ACTIVE",
          visibility: "PRIVATE",
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: capProjectId,
          userId: capOwnerId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });
      const reqId = deterministicUuid("req-capacity-holder");
      await tx.mentorshipRequest.create({
        data: {
          id: reqId,
          projectId: capProjectId,
          mentorUserId: deterministicUuid("lecturer-g-capacity-full"),
          requestedBy: capOwnerId,
          direction: "PROJECT_TO_LECTURER",
          mentorRole: "PRIMARY",
          status: "ACCEPTED",
          respondedAt: now,
          message: "Synthetic capacity holder relationship",
          idempotencyKey: "synth-cap-holder-1",
        },
      });
      await tx.mentorRelationship.create({
        data: {
          id: deterministicUuid("rel-capacity-holder"),
          projectId: capProjectId,
          mentorUserId: deterministicUuid("lecturer-g-capacity-full"),
          mentorRole: "PRIMARY",
          sourceRequestId: reqId,
          status: "ACTIVE",
          startedAt: now,
        },
      });
    }
  }, { timeout: 30_000 });

  console.log(`Synthetic mentor recommendation seed complete: ${createdLecturers} newly created synthetic lecturers (existing preserved).`);
}

main()
  .catch(err => {
    console.error("Synthetic mentor recommendation seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPostgres();
    process.exit(process.exitCode ?? 0);
  });
