import "../src/config/load-env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";
import { seedCommunities } from "./seed-communities.js";
import { seedForumPagination } from "./seed-forum-pagination.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed data must not be applied in production");
  const prisma = getPrisma();
  console.log("🌱 Seeding database...");

  // 1. Seed API Provider (OpenAlex)
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

  // Keep the canonical trusted-institution record used by institutional email verification.
  const fptInstitution = await prisma.institution.upsert({
    where: { slug: "fpt-university" },
    create: { id: "00000000-0000-4000-8000-000000000001", name: "FPT University", slug: "fpt-university", hostInstitution: true, status: "ACTIVE", verificationPolicy: { allowInstitutionalEmailVerification: true }, isActive: true },
    update: { name: "FPT University", slug: "fpt-university", hostInstitution: true, status: "ACTIVE", verificationPolicy: { allowInstitutionalEmailVerification: true }, isActive: true },
  });
  for (const domain of ["fpt.edu.vn", "fe.edu.vn"]) await prisma.institutionDomain.upsert({
    where: { domain },
    create: { institutionId: fptInstitution.id, domain, trusted: true, status: "ACTIVE", verificationMethod: "INSTITUTIONAL_EMAIL" },
    update: { institutionId: fptInstitution.id, trusted: true, status: "ACTIVE", verificationMethod: "INSTITUTIONAL_EMAIL" },
  });

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
      systemRole: "USER",
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
      systemRole: "USER",
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
      academicRole: "LECTURER",
      roleVerificationStatus: "VERIFIED",
      roleVerificationMethod: "MANUAL_REVIEW",
      roleVerifiedAt: new Date(),
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
      academicRole: "LECTURER",
      roleVerificationStatus: "VERIFIED",
      roleVerificationMethod: "MANUAL_REVIEW",
      roleVerifiedAt: new Date(),
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
      systemRole: "USER",
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
      systemRole: "USER",
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

  // 3e. Academic forum fixture data. These records are intentionally realistic but
  // clearly marked as demo accounts; they make the forum useful on a fresh install.
  console.log("💬 Seeding academic forum discussions...");
  const forumUsers = [
    { email: "minh.anh.nguyen@lumigap.demo", fullName: "Minh Anh Nguyen", institution: "LumiGap Research Lab", academicProfileType: "researcher" },
    { email: "hoang.tran@lumigap.demo", fullName: "Hoang Tran", institution: "LumiGap Research Lab", academicProfileType: "researcher" },
    { email: "thanh.pham@lumigap.demo", fullName: "Thanh Pham", institution: "LumiGap Research Lab", academicProfileType: "student" },
  ];
  const seededForumUsers = [] as Array<{ id: string; fullName: string }>;
  for (const [index, input] of forumUsers.entries()) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: { ...input, passwordHash: userPasswordHash, role: "user", systemRole: "USER", accountStatus: "ACTIVE", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), researchInterests: ["Software Engineering", "Artificial Intelligence"] },
      update: { fullName: input.fullName, institution: input.institution, academicProfileType: input.academicProfileType, passwordHash: userPasswordHash, accountStatus: "ACTIVE" },
    });
    seededForumUsers.push({ id: user.id, fullName: user.fullName });
    await prisma.academicProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, publicHandle: `forum.demo.${index + 1}`, primaryPosition: input.academicProfileType === "student" ? "STUDENT" : "RESEARCH_STAFF", positionCategory: input.academicProfileType === "student" ? "STUDENT" : "RESEARCH_STAFF", positionSource: "PREDEFINED", identityStatus: "NOT_SUBMITTED", emailStatus: "NOT_SUBMITTED", affiliationStatus: "NOT_SUBMITTED", positionStatus: "NOT_SUBMITTED", orcidStatus: "NOT_SUBMITTED", verificationStatus: "SELF_DECLARED", headline: "Demo forum contributor", expertiseAreas: ["Software Engineering", "Artificial Intelligence"], researchKeywords: ["empirical software engineering", "research methods"] },
      update: { headline: "Demo forum contributor", verificationStatus: "SELF_DECLARED" },
    });
  }

  const communities = [
    ["Software Engineering", "software-engineering", "Empirical methods, developer tools, and software engineering research."],
    ["Artificial Intelligence", "artificial-intelligence", "Evidence, evaluation, and responsible practice in AI research."],
    ["Data Science", "data-science", "Data-centric methods, reproducibility, and applied analytics."],
    ["Cybersecurity", "cybersecurity", "Security measurement, privacy, and trustworthy systems."],
    ["Information Systems", "information-systems", "Socio-technical systems and digital transformation research."],
    ["Research Methodology", "research-methodology", "Study design, screening, synthesis, and research quality."],
  ] as const;
  const discussionBodies = [
    "Most published evaluations report benchmark accuracy, yet practical code review also depends on defect severity, reviewer effort, false positives, and whether developers accept suggestions. Which outcome measures and study designs would make these claims more credible?",
    "I am preparing a review protocol and need a defensible way to assess methodological quality across heterogeneous empirical studies. I would welcome examples that separate reporting quality from risk of bias.",
    "Two reviewers are screening titles and abstracts independently. Should agreement be reported before or after reconciliation, and how should prevalence effects be explained when one decision dominates?",
    "Many evaluations use curated tasks with known answers. In real teams, code context, maintainability, and developer judgment are less controlled. What evidence would support transfer from benchmark performance to practice?",
    "Recent studies disagree about whether developers trust AI-generated feedback. Differences in participant experience, task difficulty, and explanation quality may account for some of the contrast. How should a synthesis represent this heterogeneity?",
    "Small empirical studies can still be informative, but claims about generality need care. I am collecting concrete ways to describe sampling, instrumentation, learning effects, and researcher degrees of freedom.",
    "This paper's evaluation uses offline patches and expert annotations. I am interested in whether those measures capture review usefulness in a team workflow, and what replication material would let others test the result.",
    "The study reports productivity gains during a short task. Does the design support a claim about sustained developer productivity, or only local task completion? Please point to the precise outcomes and follow-up window.",
    "I am reviewing candidate gaps around AI-assisted code review. There are several short-term laboratory evaluations, but fewer longitudinal field studies. Which recent papers could narrow or invalidate this gap?",
    "A few newer studies appear relevant to this candidate gap. Before changing its validation status, I want to compare populations, tasks, outcome measures, and publication dates against the current evidence set.",
    "Industrial requirements work involves ambiguous stakeholder language and evolving constraints. Which field studies evaluate LLM assistance beyond synthetic requirements datasets, and where is evidence still thin?",
    "Mixed-methods reviews often combine bibliometric metadata, screening decisions, and qualitative coding. How are others preserving provenance and producing a replication package that survives data-source updates?",
    "Security assessments of small AI deployments often extrapolate from limited prompts or threat models. What minimum disclosure is needed so readers can judge the scope of a claimed improvement?",
    "A replication package should make the sample, transformations, analysis scripts, and exclusions inspectable. Which components have been most useful when reproducing empirical software engineering results?",
  ];
  const replyBodies = [
    "I would preregister the primary outcome and report uncertainty, not only point estimates. Separating laboratory validity from field transfer also makes the interpretation clearer.",
    "Could you clarify the unit of analysis and inclusion criteria? A study-level quality tool may not capture bias in individual outcome measures.",
    "One counterpoint is that a benchmark can still be useful for controlled comparisons. The limitation is treating its ranking as evidence of downstream developer benefit without a task study.",
    "A recent paper may be relevant, but I would screen it against the protocol before treating it as supporting evidence. Its population and follow-up period matter here.",
    "It may help to publish the coding guide, disagreement log, and sensitivity analysis. That gives readers a way to inspect how reconciliation changed the result.",
    "I would distinguish perceived usefulness from correctness. Developer trust is an outcome to measure, not a substitute for independent assessment of the suggested change.",
  ];
  const forumCommunityRows = [] as Array<{ id: string; slug: string }>;
  for (const [sortOrder, [name, slug, description]] of communities.entries()) {
    const community = await prisma.community.upsert({
      where: { slug },
      create: { name, slug, description, researchField: name, researchTopics: [name, "Research methods"], rules: ["Cite evidence when making empirical claims.", "Keep critique focused on methods and results."], ownerId: admin2.id, visibility: "public", status: "ACTIVE", isForumCategory: true, sortOrder },
      update: { isForumCategory: true },
    });
    forumCommunityRows.push({ id: community.id, slug: community.slug });
    for (const member of [admin2, lecturer, student, ...seededForumUsers.map((user) => ({ ...user }))]) {
      await prisma.communityMembership.upsert({ where: { communityId_userId: { communityId: community.id, userId: member.id } }, create: { communityId: community.id, userId: member.id, role: member.id === admin2.id ? "owner" : "member", status: "active" }, update: { status: "active" } });
    }
    const memberCount = await prisma.communityMembership.count({ where: { communityId: community.id, status: "active" } });
    await prisma.community.update({ where: { id: community.id }, data: { memberCount } });
  }

  // DOI/title/year below are real arXiv metadata, upserted by DOI to avoid duplicates.
  const seedPapers = await Promise.all([
    { doi: "10.48550/arxiv.2505.20206", arxivId: "2505.20206", title: "Evaluating Large Language Models for Code Review", publicationYear: 2025 },
    { doi: "10.48550/arxiv.2412.18531", arxivId: "2412.18531", title: "Automated Code Review In Practice", publicationYear: 2024 },
  ].map((paper) => prisma.paper.upsert({
    where: { doi: paper.doi },
    create: { ...paper, primaryProvider: "arxiv", dataStatus: "active", paperStatus: "not-downloaded", paperLink: `https://arxiv.org/abs/${paper.arxivId}` },
    update: { title: paper.title, publicationYear: paper.publicationYear, arxivId: paper.arxivId, dataStatus: "active" },
  })));
  const shareableGaps = await prisma.researchGap.findMany({ where: { forumShareable: true, status: "active" }, select: { id: true, title: true, topic: true } });
  const seedGap = shareableGaps.find((gap) => /code review/i.test(`${gap.title} ${gap.topic}`));

  const topicRows = [
    ["How should LLM-based code review be evaluated beyond benchmark accuracy?", "QUESTION", 0, 0],
    ["Which quality assessment tool is appropriate for a systematic literature review in software engineering?", "QUESTION", 5, 1],
    ["How should inter-rater agreement be reported during literature screening?", "QUESTION", 5, 2],
    ["Are benchmark-based evaluations enough for AI-assisted software engineering?", "DISCUSSION", 1, 0],
    ["Contradictory findings on developer trust in AI-generated feedback", "DISCUSSION", 1, 1],
    ["Threats to validity in small-sample empirical software engineering studies", "DISCUSSION", 0, 2],
    ["Discussing evaluation design in recent LLM code-review research", "PAPER_DISCUSSION", 0, 0],
    ["Does this study provide enough evidence for long-term developer productivity claims?", "PAPER_DISCUSSION", 0, 1],
    ["Is longitudinal evaluation of AI-assisted code review still an open gap?", "RESEARCH_GAP_DISCUSSION", 0, 2],
    ["Recent studies may challenge this candidate research gap", "RESEARCH_GAP_DISCUSSION", 5, 0],
    ["Is evidence still missing for LLM-assisted requirements engineering in industry?", "RESEARCH_GAP_DISCUSSION", 4, 1],
    ["Reproducible data pipelines for mixed-methods research reviews", "DISCUSSION", 2, 2],
    ["How should security claims be scoped in small AI deployments?", "DISCUSSION", 3, 0],
    ["What makes a useful replication package for an empirical study?", "QUESTION", 5, 1],
  ] as const;
  const now = Date.now();
  for (const [index, [title, type, communityIndex, authorIndex]] of topicRows.entries()) {
    const id = `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`;
    const communityId = forumCommunityRows[communityIndex].id;
    const authorId = [lecturer.id, student.id, ...seededForumUsers.map((user) => user.id)][authorIndex % (2 + seededForumUsers.length)];
    const createdAt = new Date(now - (index * 19 + 3) * 60 * 60 * 1000);
    await prisma.forumPost.upsert({
      where: { id },
      create: { id, authorId, communityId, type, title, body: discussionBodies[index], tags: [type === "QUESTION" ? "methodology" : "evidence", "research", "computing"], status: "active", acceptedCommentId: null, createdAt, updatedAt: createdAt, lastActivityAt: createdAt },
      update: { authorId, communityId, type, title, body: discussionBodies[index], status: "active", acceptedCommentId: null, createdAt, editedAt: null, tags: [type === "QUESTION" ? "methodology" : "evidence", "research", "computing"], updatedAt: createdAt, lastActivityAt: createdAt },
    });
    if (type === "PAPER_DISCUSSION") {
      const seedPaper = seedPapers[index === 7 ? 1 : 0];
      await prisma.forumPost.update({ where: { id }, data: { linkedPaperId: seedPaper.id } });
      await prisma.forumPostPaper.deleteMany({ where: { postId: id, paperId: { not: seedPaper.id } } });
      await prisma.forumPostPaper.upsert({ where: { postId_paperId: { postId: id, paperId: seedPaper.id } }, create: { postId: id, paperId: seedPaper.id, position: 0 }, update: {} });
      await prisma.forumReference.upsert({ where: { id: `00000000-0000-4000-c000-${String(index + 1).padStart(12, "0")}` }, create: { id: `00000000-0000-4000-c000-${String(index + 1).padStart(12, "0")}`, postId: id, paperId: seedPaper.id, title: seedPaper.title, verified: true, createdById: authorId, position: 0 }, update: { postId: id, paperId: seedPaper.id, title: seedPaper.title, verified: true } });
    }
    if (type === "RESEARCH_GAP_DISCUSSION" && seedGap && index === 8) {
      await prisma.forumPost.update({ where: { id }, data: { linkedResearchGapId: seedGap.id, researchGapId: seedGap.id } });
      await prisma.forumPostGap.upsert({ where: { postId_gapId: { postId: id, gapId: seedGap.id } }, create: { postId: id, gapId: seedGap.id }, update: {} });
    } else if (type === "RESEARCH_GAP_DISCUSSION") {
      // Do not invent a scientific gap or attach an unrelated existing gap.
      await prisma.forumPost.update({ where: { id }, data: { type: "DISCUSSION", linkedResearchGapId: null, researchGapId: null } });
      await prisma.forumPostGap.deleteMany({ where: { postId: id } });
    }
    const replyCount = [0, 3, 2, 5, 4, 1, 6, 0, 3, 2, 4, 2, 1, 3][index];
    for (let replyIndex = 0; replyIndex < replyCount; replyIndex += 1) {
      const commentId = `00000000-0000-4000-a000-${String(index * 10 + replyIndex + 1).padStart(12, "0")}`;
      const replyAuthor = [student.id, lecturer.id, ...seededForumUsers.map((user) => user.id)][(replyIndex + index) % (2 + seededForumUsers.length)];
      const recentReplyMinutes = index === 6 && replyIndex === replyCount - 1 ? 18 : index === 9 && replyIndex === replyCount - 1 ? 60 : null;
      const replyAt = recentReplyMinutes === null ? new Date(createdAt.getTime() + (replyIndex + 1) * 60 * 60 * 1000) : new Date(now - recentReplyMinutes * 60 * 1000);
      const replyBody = replyBodies[(index + replyIndex) % replyBodies.length];
      await prisma.forumComment.upsert({ where: { id: commentId }, create: { id: commentId, postId: id, postNumber: replyIndex + 2, authorId: replyAuthor, body: replyBody, status: "active", createdAt: replyAt, updatedAt: replyAt }, update: { postId: id, authorId: replyAuthor, body: replyBody, status: "active", createdAt: replyAt, editedAt: null, updatedAt: replyAt } });
    }
    const replyActivityAt = await prisma.forumComment.aggregate({ where: { postId: id, status: "active" }, _count: { _all: true }, _max: { createdAt: true, editedAt: true } });
    const lastActivityAt = [createdAt, replyActivityAt?._max.createdAt, replyActivityAt?._max.editedAt].filter((date): date is Date => Boolean(date)).sort((a, b) => b.getTime() - a.getTime())[0] ?? createdAt;
    await prisma.forumPost.update({ where: { id }, data: { commentCount: replyActivityAt._count._all, lastActivityAt } });
    if (type === "QUESTION" && replyCount > 0 && index !== 2) {
      await prisma.forumPost.update({ where: { id }, data: { acceptedCommentId: `00000000-0000-4000-a000-${String(index * 10 + 1).padStart(12, "0")}` } });
    }
    const voters = [admin2, lecturer, student, ...seededForumUsers];
    const voteIds = voters.map((_, voteIndex) => `00000000-0000-4000-b000-${String(index * 10 + voteIndex + 1).padStart(12, "0")}`);
    await prisma.forumVote.deleteMany({ where: { id: { in: voteIds } } });
    const helpfulTarget = [0, 5, 3, 1, 0, 3, 5, 1, 3, 0, 5, 1, 0, 3][index];
    for (let voteIndex = 0; voteIndex < helpfulTarget; voteIndex += 1) {
      await prisma.forumVote.create({ data: { id: voteIds[voteIndex], postId: id, userId: voters[voteIndex].id, value: 1, createdAt } });
      await prisma.forumReaction.upsert({ where: { targetType_targetId_userId: { targetType: "post", targetId: id, userId: voters[voteIndex].id } }, create: { targetType: "post", targetId: id, userId: voters[voteIndex].id, reaction: "LIKE", createdAt }, update: {} });
    }
    await prisma.forumPost.update({ where: { id }, data: { score: helpfulTarget, voteScore: helpfulTarget } });
    await prisma.forumPost.update({ where: { id }, data: { viewCount: [18, 248, 135, 431, 76, 42, 1024, 29, 314, 187, 63, 91, 54, 208][index] } });
  }
  for (const community of forumCommunityRows) {
    const threadCount = await prisma.forumPost.count({ where: { communityId: community.id, status: { in: ["active", "locked"] } } });
    await prisma.community.update({ where: { id: community.id }, data: { threadCount } });
  }

  await seedForumPagination();

  // 4. Research communities, memberships and sample discussions
  console.log("💬 Seeding Research Communities...");
  await seedCommunities(prisma, { lecturer, student, admin: admin1 });

  // 5. Default Sync Config for OpenAlex
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
