import "../src/config/load-env.js";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../src/config/env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";

// Reserved .test addresses and separate institutions keep demo identities distinct.
// Reruns never reset passwords, profile edits, requests, or relationship decisions.
const id = (key: string) => {
  const hex = createHash("sha256").update(`lumigap-mentorship-demo-v1:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const institutions = [
  { slug: "lumigap-demo-technology", name: "Đại học Công nghệ LumiGap (Demo)" },
  { slug: "lumigap-demo-health", name: "Đại học Y khoa LumiGap (Demo)" },
  { slug: "lumigap-demo-social", name: "Viện Nghiên cứu Xã hội LumiGap (Demo)" },
];
type DemoUser = {
  key: string; name: string; role: "student" | "researcher" | "lecturer";
  institution: number; areas: string[]; expertise: string[]; bio: string;
  verified?: boolean; available?: boolean;
};
const users: DemoUser[] = [
  { key: "leader", name: "Nguyễn Minh Anh", role: "student", institution: 0,
    areas: ["Artificial Intelligence", "Education"], expertise: ["Literature Review"], bio: "Trưởng nhóm nghiên cứu ứng dụng AI trong giáo dục." },
  { key: "member", name: "Trần Hoàng Nam", role: "student", institution: 0,
    areas: ["Software Engineering"], expertise: ["Data Analysis"], bio: "Thành viên phụ trách thu thập tài liệu và phân tích dữ liệu." },
  { key: "student.health", name: "Lê Thảo Vy", role: "student", institution: 1,
    areas: ["AI in Healthcare", "Medical Education"], expertise: ["Literature Review"], bio: "Trưởng nhóm nghiên cứu đánh giá mô hình ngôn ngữ trong đào tạo y khoa." },
  { key: "researcher", name: "Phạm Gia Huy", role: "researcher", institution: 0,
    areas: ["Cybersecurity", "Software Engineering"], expertise: ["Experimental Design"], bio: "Nghiên cứu viên phụ trách dự án an toàn phần mềm." },
  { key: "mentor.ai", name: "TS. Nguyễn Quang Minh", role: "lecturer", institution: 0, verified: true, available: true,
    areas: ["Artificial Intelligence", "Natural Language Processing", "Education"], expertise: ["LLM Evaluation", "Experimental Design", "Literature Review"],
    bio: "Hướng dẫn đánh giá LLM, thiết kế thực nghiệm và tổng quan tài liệu. Có thể gặp nhóm mỗi tuần." },
  { key: "mentor.health", name: "TS. Trần Mai Phương", role: "lecturer", institution: 1, verified: true, available: true,
    areas: ["AI in Healthcare", "Medical Education", "Artificial Intelligence"], expertise: ["LLM Evaluation", "Systematic Review", "Research Methods"],
    bio: "Đồng hành cùng nhóm nghiên cứu AI y tế, USMLE và phương pháp tổng quan hệ thống." },
  { key: "mentor.data", name: "TS. Lê Đức Hưng", role: "lecturer", institution: 0, verified: true, available: true,
    areas: ["Data Science", "Machine Learning", "Artificial Intelligence"], expertise: ["Statistics", "Data Analysis", "Experimental Design"],
    bio: "Hướng dẫn phân tích dữ liệu, thống kê và đánh giá mô hình học máy." },
  { key: "mentor.security", name: "TS. Phạm Bảo Ngọc", role: "lecturer", institution: 0, verified: true, available: true,
    areas: ["Cybersecurity", "Software Engineering"], expertise: ["Secure Coding", "Experimental Design", "Research Methods"],
    bio: "Hướng dẫn nghiên cứu an toàn phần mềm và thiết kế thí nghiệm bảo mật." },
  { key: "mentor.education", name: "TS. Võ Thanh Hà", role: "lecturer", institution: 2, verified: true, available: true,
    areas: ["Education", "Human-Computer Interaction"], expertise: ["Qualitative Research", "Survey Design", "Research Methods"],
    bio: "Hướng dẫn khảo sát, phỏng vấn và nghiên cứu trải nghiệm học tập." },
  { key: "mentor.sustainability", name: "TS. Đặng Hải Yến", role: "lecturer", institution: 2, verified: true, available: true,
    areas: ["Environmental Science", "Sustainability", "Data Science"], expertise: ["Systematic Review", "Data Analysis"],
    bio: "Hướng dẫn nghiên cứu phát triển bền vững và tổng quan hệ thống." },
  { key: "lecturer.pending", name: "Nguyễn Tuấn Kiệt", role: "lecturer", institution: 0, verified: false, available: false,
    areas: ["Artificial Intelligence"], expertise: ["Machine Learning"], bio: "Hồ sơ chưa xác minh để thử điều kiện tìm mentor." },
  { key: "lecturer.unavailable", name: "TS. Bùi Minh Châu", role: "lecturer", institution: 1, verified: true, available: false,
    areas: ["AI in Healthcare"], expertise: ["Systematic Review"], bio: "Giảng viên đã xác minh, hiện tạm ngừng nhận nhóm mới." },
];
const projects = [
  { key: "education", owner: "leader", title: "AI hỗ trợ học tập cá nhân hóa (Demo)",
    areas: ["Artificial Intelligence", "Education"], expertise: ["LLM Evaluation", "Experimental Design"],
    summary: "Nhóm tìm hiểu cách trợ lý AI hỗ trợ sinh viên tự học và đo lường hiệu quả học tập.",
    needs: "Cần mentor góp ý câu hỏi nghiên cứu, thiết kế đánh giá và lựa chọn thang đo.", seeking: true },
  { key: "health", owner: "student.health", title: "Đánh giá LLM trong đào tạo y khoa (Demo)",
    areas: ["AI in Healthcare", "Medical Education"], expertise: ["LLM Evaluation", "Systematic Review"],
    summary: "Nhóm khảo sát khả năng trả lời câu hỏi y khoa của LLM từ tài liệu công khai.",
    needs: "Cần hỗ trợ xây dựng tiêu chí sàng lọc tài liệu và đánh giá chất lượng bằng chứng.", seeking: true },
  { key: "security", owner: "researcher", title: "An toàn mã nguồn trong dự án sinh viên (Demo)",
    areas: ["Cybersecurity", "Software Engineering"], expertise: ["Secure Coding", "Experimental Design"],
    summary: "Nhóm nghiên cứu các lỗi bảo mật thường gặp và hiệu quả của công cụ phân tích mã nguồn.",
    needs: "Cần góp ý thiết kế thực nghiệm và cách báo cáo kết quả.", seeking: false },
];

async function main() {
  if (env.NODE_ENV === "production") throw new Error("Demo seed is disabled in production");
  if (!env.DATABASE_URL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) {
    throw new Error("Demo seed requires a local loopback PostgreSQL database");
  }
  const prisma = getPrisma();
  // Generated only for accounts created in this run; never stored in source or reset on rerun.
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const passwordHash = await passwordService.hash(password);
  const now = new Date();
  const createdEmails: string[] = [];

  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(714206018)`;
    for (const institution of institutions) {
      const institutionId = id(institution.slug);
      const row = await tx.institution.upsert({
        where: { slug: institution.slug }, update: {},
        create: { id: institutionId, ...institution, hostInstitution: false, verificationPolicy: { allowInstitutionalEmailVerification: false } },
      });
      if (row.id !== institutionId) throw new Error(`Demo institution collision: ${institution.slug}`);
    }

    for (const input of users) {
      const userId = id(input.key), email = `${input.key}@lumigap.test`;
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        if (existing.id !== userId) throw new Error(`Existing account is outside this seed: ${email}`);
        continue;
      }
      const institution = institutions[input.institution]!;
      const isLecturer = input.role === "lecturer", verified = input.verified === true;
      const category = isLecturer ? "LECTURER" : input.role === "student" ? "STUDENT" : "RESEARCH_STAFF";
      const positionTitle = isLecturer ? "Giảng viên" : input.role === "student" ? "Sinh viên" : "Nghiên cứu viên";
      await tx.user.create({ data: {
        id: userId, email, passwordHash, fullName: `${input.name} (Demo)`, role: "user", systemRole: "USER",
        academicProfileType: input.role, institution: institution.name, researchInterests: input.areas,
        emailVerifiedAt: now, onboardingCompletedAt: now,
      } });
      await tx.userEmail.create({ data: { userId, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT", verifiedAt: now } });
      await tx.academicProfile.create({ data: {
        userId, publicHandle: `demo.${input.key}`, primaryPosition: category, positionCategory: category,
        positionTitle, affiliationPosition: positionTitle, affiliationDepartment: input.areas[0],
        academicRole: isLecturer ? "LECTURER" : input.role === "student" ? "STUDENT" : "RESEARCHER",
        roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED",
        roleVerificationMethod: verified ? "MANUAL_REVIEW" : null, roleVerifiedAt: verified ? now : null,
        identityStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", emailStatus: "VERIFIED",
        affiliationStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED",
        verificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", verifiedAt: verified ? now : null,
        verificationMethod: verified ? "MANUAL_REVIEW" : null,
        verificationNote: "Synthetic local demo identity; not a real academic verification.",
        headline: `${positionTitle} · ${input.areas[0]} · Hồ sơ demo`,
        biography: `Đây là tài khoản mẫu, không đại diện cho cá nhân hoặc tổ chức thật. ${input.bio}`,
        expertiseAreas: [...input.areas, ...input.expertise], skills: input.expertise, researchKeywords: input.areas,
        profileVisibility: "PUBLIC", showInResearcherSearch: true, onboardingCompletedAt: now,
        privacySettings: { expertise: "PUBLIC", researchInterests: "PUBLIC" },
        supportAvailability: { enabled: verified && input.available === true, types: [], preferredTopics: input.areas },
        mentorshipEmailEnabled: false, notificationLocale: "vi",
      } });
      await tx.affiliation.create({ data: {
        userId, institutionId: id(institution.slug), institutionName: institution.name,
        positionTitle, positionCategory: category, department: input.areas[0],
        positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", verificationStatus: verified ? "VERIFIED" : "NOT_SUBMITTED",
        verificationMethod: verified ? "MANUAL_REVIEW" : null, verificationSource: verified ? "ADMIN" : "SELF_DECLARED",
        verifiedAt: verified ? now : null,
      } });
      const capabilities = verified ? ["BASIC_RESEARCH", "RESEARCH_SUPPORT", "STRUCTURED_REVIEW", "GAP_VALIDATION"] : ["BASIC_RESEARCH"];
      for (const capability of capabilities) await tx.userCapability.create({ data: { userId, capability, source: "SYSTEM_POLICY_V1" } });
      createdEmails.push(email);
    }

    for (const input of projects) {
      const projectId = id(`project.${input.key}`), ownerId = id(input.owner);
      if (await tx.project.findUnique({ where: { id: projectId } })) continue;
      await tx.project.create({ data: {
        id: projectId, ownerId, createdById: ownerId, creationKey: `demo-mentorship-${input.key}`,
        title: input.title, description: input.summary, researchField: input.areas[0], researchAreas: input.areas,
        status: "PLANNING", visibility: "PRIVATE", mentorshipDiscovery: input.seeking ? "SEEKING_MENTOR" : "CLOSED",
        mentorshipSummary: input.summary, mentorshipResearchAreas: input.areas, mentorshipExpertise: input.expertise, mentorshipNeeds: input.needs,
      } });
      await tx.projectMember.create({ data: { projectId, userId: ownerId, role: "OWNER" } });
      await tx.projectMember.create({ data: { projectId, userId: id("member"), role: "MEMBER" } });
      await tx.researchPlan.create({ data: { projectId, updatedById: ownerId,
        problem: `# ${input.title}\n\n${input.summary}\n\n## Mục tiêu\n\n${input.needs}\n\nDự án mẫu để thử tìm mentor, gửi lời mời và cộng tác.`,
      } });

      // Consent examples belong only to newly created demo projects. Reruns cannot
      // resurrect ended relationships, recreate cancelled requests or undo edits.
      const mentorUserId = id(input.key === "education" ? "mentor.ai" : input.key === "health" ? "mentor.health" : "mentor.security");
      const accepted = input.key === "security", offer = input.key === "health";
      const requestId = id(`request.${input.key}`);
      await tx.mentorshipRequest.create({ data: {
        id: requestId, projectId, mentorUserId, requestedBy: offer ? mentorUserId : ownerId,
        direction: offer ? "LECTURER_TO_PROJECT" : "PROJECT_TO_LECTURER", status: accepted ? "ACCEPTED" : "PENDING",
        message: offer ? "Tôi có thể hỗ trợ nhóm về phương pháp nghiên cứu và đánh giá LLM. (Lời đề nghị mẫu)" : "Nhóm mong thầy/cô hướng dẫn thiết kế nghiên cứu và góp ý định hướng. (Lời mời mẫu)",
        respondedAt: accepted ? now : null, expiresAt: accepted ? null : new Date(now.getTime() + 7 * 86400000),
        idempotencyKey: `demo-${input.key}`,
      } });
      if (accepted) await tx.mentorRelationship.create({ data: {
        id: id(`relationship.${input.key}`), projectId, mentorUserId, sourceRequestId: requestId, status: "ACTIVE", startedAt: now,
      } });
    }
  }, { timeout: 30_000 });

  console.log(`Demo seed complete: ${createdEmails.length} new accounts; existing data preserved.`);
  if (createdEmails.length) {
    console.log("New accounts:", createdEmails.join(", "));
    console.log("Generated password for NEW accounts only (save locally):", password);
  } else console.log("No passwords changed. Use the credentials from the initial seed run.");
  console.log("Demo projects:", projects.map(p => ({ title: p.title, id: id(`project.${p.key}`) })));
}

main().catch(error => {
  // Do not dump Prisma errors: they can contain SQL parameters and password hashes.
  console.error("Demo seed failed:", error instanceof Error ? error.name : "Unknown error");
  process.exitCode = 1;
}).finally(disconnectPostgres);
