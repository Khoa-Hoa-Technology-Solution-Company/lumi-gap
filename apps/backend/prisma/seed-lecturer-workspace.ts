import "../src/config/load-env.js";
import { createHash, randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { env } from "../src/config/env.js";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { passwordService } from "../src/modules/auth/password.service.js";

/**
 * Comprehensive, safe, idempotent development seed for the LumiGap Lecturer Workspace.
 *
 * Guarantees:
 * - Strictly disabled in production and non-loopback PostgreSQL hosts.
 * - Uses deterministic UUIDs under `lumigap-lecturer-workspace-demo-v2:` and `@lumigap.test` emails.
 * - Reruns never overwrite existing real users, passwords, profile edits, or mentorship decisions.
 * - Generates valid synthetic PDF attachments via pdf-lib (zero real personal data or copyrighted papers).
 */
export const DEMO_NAMESPACE = "lumigap-lecturer-workspace-demo-v2";

export function demoId(key: string): string {
  const hex = createHash("sha256").update(`${DEMO_NAMESPACE}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function computePolicyHash(preset: string, permissions: string[], expiresAt: string | null): string {
  const canonical = JSON.stringify({
    preset,
    permissions: [...new Set(permissions)].sort(),
    expiresAt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function stripAscii(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7E]/g, " ");
}

export async function buildSyntheticPdf(title: string, subtitle: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("LUMIGAP SYNTHETIC DEMO DOCUMENT (NON-PRODUCTION)", {
    x: 48,
    y: 792,
    size: 9,
    font: bold,
    color: rgb(0.42, 0.45, 0.5),
  });
  page.drawText(stripAscii(title).slice(0, 90), {
    x: 48,
    y: 760,
    size: 16,
    font: bold,
    color: rgb(0.08, 0.12, 0.2),
  });
  page.drawText(stripAscii(subtitle).slice(0, 110), {
    x: 48,
    y: 736,
    size: 11,
    font: regular,
    color: rgb(0.28, 0.33, 0.4),
  });

  let y = 700;
  for (const line of lines) {
    page.drawText(`- ${stripAscii(line).slice(0, 95)}`, {
      x: 56,
      y,
      size: 10.5,
      font: regular,
      color: rgb(0.15, 0.18, 0.24),
    });
    y -= 20;
    if (y < 72) break;
  }

  page.drawText("Synthetic placeholder content created strictly for local UI/UX & workflow verification.", {
    x: 48,
    y: 48,
    size: 8.5,
    font: regular,
    color: rgb(0.45, 0.48, 0.55),
  });

  return doc.save();
}

const institutions = [
  { slug: "lumigap-lw-demo-tech", name: "Đại học Công nghệ & Khoa học LumiGap (Demo)" },
  { slug: "lumigap-lw-demo-med", name: "Đại học Y Dược LumiGap (Demo)" },
  { slug: "lumigap-lw-demo-soc", name: "Viện Nghiên cứu Xã hội & Kinh tế LumiGap (Demo)" },
];

type SeedAccount = {
  key: string;
  name: string;
  role: "student" | "researcher" | "lecturer";
  institution: number;
  department: string;
  areas: string[];
  expertise: string[];
  bio: string;
  verified?: boolean;
  pendingVerification?: boolean;
  available?: boolean;
  profileVisibility?: "PUBLIC" | "PRIVATE";
};

export const DEMO_ACCOUNTS: SeedAccount[] = [
  {
    key: "lw.student.ai",
    name: "Nguyễn Minh Anh",
    role: "student",
    institution: 0,
    department: "Khoa Khoa học Máy tính",
    areas: ["Artificial Intelligence", "Education"],
    expertise: ["LLM Evaluation", "Literature Review", "Python"],
    bio: "Trưởng nhóm nghiên cứu ứng dụng trợ lý AI trong học tập cá nhân hóa bậc đại học.",
  },
  {
    key: "lw.student.member1",
    name: "Trần Hoàng Nam",
    role: "student",
    institution: 0,
    department: "Khoa Hệ thống Thông tin",
    areas: ["Data Science", "Education"],
    expertise: ["Data Analysis", "Experimental Design", "Statistics"],
    bio: "Thành viên phụ trách thiết kế bộ dữ liệu khảo sát và phân tích thống kê thực nghiệm.",
  },
  {
    key: "lw.student.private",
    name: "Đỗ Nhật Linh",
    role: "student",
    institution: 0,
    department: "Khoa Công nghệ Phần mềm",
    areas: ["Software Engineering"],
    expertise: ["Frontend Testing"],
    bio: "Thành viên giữ hồ sơ học thuật ở chế độ riêng tư để kiểm thử quyền riêng tư.",
    profileVisibility: "PRIVATE",
  },
  {
    key: "lw.student.health",
    name: "Lê Thảo Vy",
    role: "student",
    institution: 1,
    department: "Khoa Y học Lâm sàng",
    areas: ["AI in Healthcare", "Medical Education"],
    expertise: ["Systematic Review", "Clinical Evaluation"],
    bio: "Trưởng nhóm đánh giá độ tin cậy của mô hình ngôn ngữ lớn trong tình huống lâm sàng.",
  },
  {
    key: "lw.student.hci",
    name: "Hoàng Bảo Trâm",
    role: "student",
    institution: 2,
    department: "Khoa Thiết kế Tương tác",
    areas: ["Human-Computer Interaction", "Education"],
    expertise: ["Usability Testing", "Qualitative Research"],
    bio: "Nhóm nghiên cứu khả năng tiếp cận dịch vụ công trực tuyến cho người cao tuổi.",
  },
  {
    key: "lw.student.cyber",
    name: "Phạm Gia Huy",
    role: "researcher",
    institution: 0,
    department: "Phòng thí nghiệm An toàn Thông tin",
    areas: ["Cybersecurity", "Software Engineering"],
    expertise: ["Static Analysis", "Secure Coding"],
    bio: "Nghiên cứu viên phát triển quy trình phát hiện lỗ hổng tự động trong mã nguồn sinh viên.",
  },
  {
    key: "lw.student.env",
    name: "Vũ Khánh Toàn",
    role: "student",
    institution: 2,
    department: "Khoa Khoa học Môi trường",
    areas: ["Environmental Science", "Data Science"],
    expertise: ["Time Series Forecasting", "Data Curation"],
    bio: "Trưởng nhóm dự báo chất lượng không khí đô thị từ dữ liệu cảm biến công khai.",
  },
  {
    key: "lw.student.nlp",
    name: "Bùi Quốc Đạt",
    role: "student",
    institution: 0,
    department: "Khoa Trí tuệ Nhân tạo",
    areas: ["Natural Language Processing", "Artificial Intelligence"],
    expertise: ["Vietnamese NLP", "Annotation"],
    bio: "Nhóm xây dựng bộ ngữ liệu đánh giá sắc thái bình luận học thuật tiếng Việt.",
  },
  {
    key: "lw.student.fin",
    name: "Ngô Thanh Tú",
    role: "student",
    institution: 2,
    department: "Khoa Tài chính Định lượng",
    areas: ["Data Science", "Machine Learning"],
    expertise: ["Explainable AI", "Statistics"],
    bio: "Trưởng nhóm nghiên cứu mô hình giải thích rủi ro tín dụng vi mô.",
  },
  {
    key: "lw.mentor.lead",
    name: "TS. Nguyễn Quang Minh",
    role: "lecturer",
    institution: 0,
    department: "Khoa Khoa học Máy tính",
    areas: ["Artificial Intelligence", "Natural Language Processing", "Education", "Cybersecurity"],
    expertise: ["LLM Evaluation", "Experimental Design", "Research Methods", "Literature Review"],
    bio: "Giảng viên hướng dẫn đánh giá LLM, thiết kế thực nghiệm và phương pháp nghiên cứu khoa học.",
    verified: true,
    available: true,
  },
  {
    key: "lw.mentor.health",
    name: "PGS.TS. Trần Mai Phương",
    role: "lecturer",
    institution: 1,
    department: "Bộ môn Tin học Y sinh",
    areas: ["AI in Healthcare", "Medical Education", "Artificial Intelligence"],
    expertise: ["Systematic Review", "Clinical Evaluation", "Research Methods"],
    bio: "Chuyên gia hướng dẫn tổng quan hệ thống và ứng dụng trí tuệ nhân tạo trong y khoa.",
    verified: true,
    available: true,
  },
  {
    key: "lw.mentor.fresh",
    name: "TS. Lê Đức Hưng",
    role: "lecturer",
    institution: 0,
    department: "Khoa Khoa học Dữ liệu",
    areas: ["Data Science", "Machine Learning", "Environmental Science"],
    expertise: ["Statistics", "Data Analysis", "Experimental Design"],
    bio: "Giảng viên mới xác minh, chưa có nhóm đang hướng dẫn (kiểm thử trạng thái ban đầu).",
    verified: true,
    available: true,
  },
  {
    key: "lw.mentor.unavailable",
    name: "TS. Bùi Minh Châu",
    role: "lecturer",
    institution: 1,
    department: "Bộ môn Sức khỏe Cộng đồng",
    areas: ["AI in Healthcare", "Education"],
    expertise: ["Qualitative Research", "Survey Design"],
    bio: "Giảng viên đã xác minh nhưng đang tạm ngừng tiếp nhận nhóm nghiên cứu mới.",
    verified: true,
    available: false,
  },
  {
    key: "lw.lecturer.unverified",
    name: "Nguyễn Tuấn Kiệt",
    role: "lecturer",
    institution: 0,
    department: "Khoa Công nghệ Thông tin",
    areas: ["Artificial Intelligence"],
    expertise: ["Machine Learning"],
    bio: "Tài khoản giảng viên tự khai báo chưa xác minh (kiểm thử chặn truy cập Lecturer Workspace).",
    verified: false,
    available: false,
  },
  {
    key: "lw.lecturer.pending",
    name: "ThS. Phan Hải Đăng",
    role: "lecturer",
    institution: 2,
    department: "Khoa Quản trị Công nghệ",
    areas: ["Human-Computer Interaction", "Education"],
    expertise: ["Survey Design"],
    bio: "Tài khoản giảng viên đang chờ thẩm định xác minh học thuật.",
    verified: false,
    pendingVerification: true,
    available: false,
  },
  {
    key: "lw.mentor.outsider",
    name: "TS. Đặng Hải Yến",
    role: "lecturer",
    institution: 2,
    department: "Viện Nghiên cứu Phát triển Bền vững",
    areas: ["Environmental Science", "Sustainability"],
    expertise: ["Systematic Review", "Data Analysis"],
    bio: "Giảng viên kiểm chứng đối chứng quyền truy cập (không thuộc các dự án riêng tư của nhóm AI).",
    verified: true,
    available: true,
  },
];

export const DEMO_PROJECT_KEYS = [
  "lw-ai-edu",
  "lw-med-llm",
  "lw-hci-sparse",
  "lw-nlp-nopolicy",
  "lw-env-proposal",
  "lw-cyber-sec",
  "lw-edtech-filled",
  "lw-private-closed",
  "lw-fin-ended",
  "lw-archived-edu",
] as const;

export async function runLecturerWorkspaceSeed() {
  if (env.NODE_ENV === "production") {
    throw new Error("Lecturer Workspace demo seed is disabled in production");
  }
  if (!env.DATABASE_URL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) {
    throw new Error("Lecturer Workspace demo seed requires a local loopback PostgreSQL database");
  }

  const prisma = getPrisma();
  const password = `${randomBytes(18).toString("base64url")}aA1!`;
  const passwordHash = await passwordService.hash(password);
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);

  const [introPdfEdu, outlinePdfEdu, introPdfMed] = await Promise.all([
    buildSyntheticPdf(
      "De cuong tom tat — Tro ly AI trong hoc tap ca nhan hoa (Demo)",
      "Tai lieu gioi thieu an toan danh cho giang vien can nhac huong dan",
      [
        "Muc tieu: Danh gia tac dong cua tro ly AI co rang buoc nguon hoc lieu doi voi sinh vien nam 2-3.",
        "Thiet ke: Thuc nghiem doi chung 8 tuan (n = 120) ket hop phong van sau.",
        "Chi so do luong: Diem kiem tra kien thuc, thoi gian tu hoc va muc do tin cay nguon trich dan.",
        "Nhu cau co van: Gop y thiet ke nhom doi chung va khung danh gia rubric.",
      ],
    ),
    buildSyntheticPdf(
      "Ke hoach moc nghien cuu hoc ky 2026 (Demo)",
      "Lich trinh 4 moc chinh cua nhom nghien cuu AI Giao duc",
      [
        "Moc 1: Hoan thanh tong quan 45 bai bao nen tang (Da hoan tat).",
        "Moc 2: Thiet ke bo cau hoi danh gia va thu nghiem pilot (Dang thuc hien).",
        "Moc 3: Thu thap du lieu thuc nghiem chinh thuc va phan tich thong ke.",
        "Moc 4: Hoan thien ban thao va nop phan bien hoc thuat noi bo.",
      ],
    ),
    buildSyntheticPdf(
      "Tom tat nghien cuu — Danh gia LLM lam sang (Demo)",
      "Ho so gioi thieu nhom nghien cuu Y khoa (Demo)",
      [
        "Pham vi: Danh gia do chinh xac va ty le ao giac cua 3 mo hinh LLM tren 200 tinh huong gia lap.",
        "Khong su dung du lieu benh nhan that; toan bo tinh huong lay tu bo de cong khai.",
        "Can co van phu ho tro kiem dinh thong ke va quy trinh cham cheo.",
      ],
    ),
  ]);

  const createdEmails: string[] = [];
  const createdProjects: Array<{ key: string; id: string; title: string }> = [];

  const standardProspectivePerms = [
    "OVERVIEW_VIEW",
    "PAPERS_VIEW",
    "PAPERS_COMMENT",
    "TASKS_VIEW",
    "MANUSCRIPTS_VIEW",
    "MANUSCRIPTS_COMMENT",
    "MENTOR_CHAT",
    "CONTRIBUTIONS_VIEW",
  ];
  const prospectiveExpiryIso = daysFromNow(150).toISOString();
  const prospectiveHash = computePolicyHash("ADVISOR", standardProspectivePerms, prospectiveExpiryIso);

  await prisma.$transaction(
    async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(714206029)`;

      // 1. Institutions
      for (const inst of institutions) {
        const instId = demoId(`inst:${inst.slug}`);
        const row = await tx.institution.upsert({
          where: { slug: inst.slug },
          update: {},
          create: {
            id: instId,
            ...inst,
            hostInstitution: false,
            verificationPolicy: { allowInstitutionalEmailVerification: false },
          },
        });
        if (row.id !== instId) throw new Error(`Demo institution collision: ${inst.slug}`);
      }

      // 2. Accounts & Academic Profiles
      for (const acc of DEMO_ACCOUNTS) {
        const userId = demoId(`user:${acc.key}`);
        const email = `${acc.key}@lumigap.test`;
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          if (existing.id !== userId) throw new Error(`Existing account outside demo seed: ${email}`);
          continue;
        }

        const inst = institutions[acc.institution]!;
        const isLecturer = acc.role === "lecturer";
        const verified = acc.verified === true;
        const pending = acc.pendingVerification === true;
        const category = isLecturer ? "LECTURER" : acc.role === "student" ? "STUDENT" : "RESEARCH_STAFF";
        const positionTitle = isLecturer ? "Giảng viên" : acc.role === "student" ? "Sinh viên" : "Nghiên cứu viên";

        await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash,
            fullName: `${acc.name} (Demo)`,
            role: "user",
            systemRole: "USER",
            academicProfileType: acc.role,
            institution: inst.name,
            researchInterests: acc.areas,
            emailVerifiedAt: now,
            onboardingCompletedAt: now,
          },
        });

        await tx.userEmail.create({
          data: { userId, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT", verifiedAt: now },
        });

        await tx.academicProfile.create({
          data: {
            userId,
            publicHandle: `demo.${acc.key}`,
            primaryPosition: category,
            positionCategory: category,
            positionTitle,
            affiliationPosition: positionTitle,
            affiliationDepartment: acc.department,
            academicRole: isLecturer ? "LECTURER" : acc.role === "student" ? "STUDENT" : "RESEARCHER",
            roleVerificationStatus: verified ? "VERIFIED" : pending ? "PENDING" : "SELF_DECLARED",
            roleVerificationMethod: verified ? "MANUAL_REVIEW" : null,
            roleVerifiedAt: verified ? daysAgo(45) : null,
            identityStatus: verified ? "VERIFIED" : pending ? "PENDING" : "NOT_SUBMITTED",
            emailStatus: "VERIFIED",
            affiliationStatus: verified ? "VERIFIED" : pending ? "PENDING" : "NOT_SUBMITTED",
            positionStatus: verified ? "VERIFIED" : pending ? "PENDING" : "NOT_SUBMITTED",
            verificationStatus: verified ? "VERIFIED" : pending ? "PENDING" : "SELF_DECLARED",
            verifiedAt: verified ? daysAgo(45) : null,
            verificationMethod: verified ? "MANUAL_REVIEW" : null,
            verificationNote: "Synthetic local development fixture; not a real academic credential.",
            headline: `${positionTitle} · ${acc.department}`,
            biography: `${acc.bio} (Hồ sơ mẫu dành cho môi trường phát triển nội bộ.)`,
            expertiseAreas: [...acc.areas, ...acc.expertise],
            skills: acc.expertise,
            researchKeywords: acc.areas,
            profileVisibility: acc.profileVisibility ?? "PUBLIC",
            showInResearcherSearch: acc.profileVisibility !== "PRIVATE",
            onboardingCompletedAt: now,
            privacySettings: {
              expertise: acc.profileVisibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
              researchInterests: acc.profileVisibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
            },
            supportAvailability: {
              enabled: verified && acc.available === true,
              types: ["RESEARCH_DIRECTION", "METHODOLOGY", "PAPER_FEEDBACK"],
              preferredTopics: acc.areas,
            },
            mentorshipEmailEnabled: false,
            notificationLocale: "vi",
          },
        });

        await tx.affiliation.create({
          data: {
            userId,
            institutionId: demoId(`inst:${inst.slug}`),
            institutionName: inst.name,
            positionTitle,
            positionCategory: category,
            department: acc.department,
            isPrimary: true,
            positionStatus: verified ? "VERIFIED" : pending ? "PENDING" : "NOT_SUBMITTED",
            verificationStatus: verified ? "VERIFIED" : pending ? "PENDING" : "NOT_SUBMITTED",
            verificationMethod: verified ? "MANUAL_REVIEW" : null,
            verificationSource: verified ? "ADMIN" : "SELF_DECLARED",
            verifiedAt: verified ? daysAgo(45) : null,
          },
        });

        const caps = verified
          ? ["BASIC_RESEARCH", "RESEARCH_SUPPORT", "STRUCTURED_REVIEW", "GAP_VALIDATION"]
          : ["BASIC_RESEARCH"];
        for (const capability of caps) {
          await tx.userCapability.create({ data: { userId, capability, source: "SYSTEM_POLICY_V1" } });
        }

        createdEmails.push(email);
      }

      const u = (key: string) => demoId(`user:${key}`);

      // Helper to store synthetic MentorshipAttachment idempotently
      const ensureAttachment = async (key: string, projectId: string, uploadedById: string, fileName: string, bytes: Uint8Array) => {
        const attId = demoId(`att:${key}`);
        const exists = await tx.mentorshipAttachment.findUnique({ where: { id: attId } });
        if (!exists) {
          const buf = Buffer.from(bytes);
          await tx.mentorshipAttachment.create({
            data: {
              id: attId,
              projectId,
              uploadedById,
              fileName,
              mimeType: "application/pdf",
              byteSize: buf.byteLength,
              sha256: createHash("sha256").update(buf).digest("hex"),
              content: buf,
            },
          });
        }
        return attId;
      };

      // =========================================================================
      // PROJECT 1 (Flagship Complete Dossier + Active Mentorship + Multi-Round Review + Contributions)
      // =========================================================================
      const p1Id = demoId("project:lw-ai-edu");
      if (!(await tx.project.findUnique({ where: { id: p1Id } }))) {
        const att1 = await ensureAttachment("edu-proposal", p1Id, u("lw.student.ai"), "De-cuong-tro-ly-AI-hoc-tap-Demo.pdf", introPdfEdu);
        const att2 = await ensureAttachment("edu-timeline", p1Id, u("lw.student.ai"), "Ke-hoach-moc-nghien-cuu-2026-Demo.pdf", outlinePdfEdu);

        await tx.project.create({
          data: {
            id: p1Id,
            ownerId: u("lw.student.ai"),
            createdById: u("lw.student.ai"),
            creationKey: "lw-demo-ai-edu",
            title: "Đánh giá hiệu quả của trợ lý AI trong học tập cá nhân hóa (Demo)",
            description: "Dự án nghiên cứu thực nghiệm đánh giá hiệu quả trợ lý AI có dẫn chứng học liệu đối với kỹ năng tự học của sinh viên đại học.",
            researchField: "Artificial Intelligence",
            researchAreas: ["Artificial Intelligence", "Education", "Natural Language Processing"],
            researchStage: "EXPERIMENTATION",
            status: "ACTIVE",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Nhóm thiết kế thí nghiệm đối chứng 8 tuần nhằm đánh giá tác động của trợ lý AI có ràng buộc nguồn trích dẫn lên kết quả tự học và khả năng kiểm chứng thông tin của sinh viên.",
            mentorshipResearchAreas: ["Artificial Intelligence", "Education"],
            mentorshipExpertise: ["LLM Evaluation", "Experimental Design", "Statistics"],
            mentorshipNeeds: "Cần cố vấn góp ý thiết kế nhóm đối chứng, bộ tiêu chí rubric đánh giá bản thảo và phương pháp kiểm định độ tin cậy kết quả.",
            mentorshipSupportTypes: ["RESEARCH_DIRECTION", "METHODOLOGY", "PAPER_FEEDBACK", "DATA_ANALYSIS"],
            mentorshipMethodologies: ["Controlled Experiment", "Mixed Methods", "Rubric Evaluation"],
            mentorshipProfile: {
              researchProblem: "Sinh viên thường phụ thuộc vào câu trả lời tổng quát từ LLM mà thiếu cơ chế đối chiếu nguồn học thuật, dẫn đến hiểu sai khái niệm cốt lõi.",
              researchObjectives: [
                "Xây dựng kịch bản trợ lý AI có ràng buộc trích dẫn theo giáo trình học phần.",
                "Đo lường khác biệt điểm kiểm tra và mức độ tự chủ học tập giữa nhóm thí nghiệm và nhóm đối chứng.",
                "Đề xuất khuyến nghị sư phạm khi tích hợp trợ lý AI vào giảng dạy bậc đại học.",
              ],
              researchQuestions: [
                "Trợ lý AI có dẫn chứng nguồn cải thiện điểm đánh giá năng lực giải quyết vấn đề ra sao?",
                "Mức độ kiểm chứng nguồn của sinh viên thay đổi như thế nào sau 8 tuần sử dụng?",
              ],
              expectedOutcomes: "01 bản thảo bài báo hội nghị khoa học sinh viên / tạp chí giáo dục và bộ dữ liệu khảo sát ẩn danh.",
              expectedDuration: "2_SEMESTERS",
              expectedFrequency: "BIWEEKLY",
              workingMode: "HYBRID",
              mentoringGoals: "Hoàn thiện thiết kế thực nghiệm, phân tích dữ liệu và phản biện bản thảo vòng 1–2 trước khi nộp hội nghị.",
              progressSummary: {
                completed: "Đã hoàn thành tổng quan 45 bài báo nền tảng và thiết kế bộ câu hỏi khảo sát tiền thí nghiệm.",
                inProgress: "Đang chạy thử nghiệm pilot trên 30 sinh viên và hiệu chỉnh thang đo rubric.",
                notStarted: "Chưa thực hiện kiểm định thống kê mô hình hỗn hợp cho dữ liệu giai đoạn chính thức.",
                challenges: "Cần kiểm soát biến nhiễu từ mức độ quen thuộc công cụ AI ban đầu giữa hai nhóm.",
                feedbackNeeded: "Nhờ giảng viên góp ý cỡ mẫu tối thiểu và cách trình bày phần Đe dọa tính hợp lệ (Threats to Validity).",
                upcomingMilestone: "Chốt bản thảo v2 sau vòng phản biện nội bộ vào cuối tháng này.",
              },
              recruitingRoles: ["SECONDARY"],
              sharedAttachmentIds: [att1, att2],
              prospectiveAccess: {
                preset: "ADVISOR",
                permissions: standardProspectivePerms,
                expiresAt: prospectiveExpiryIso,
                scopeNote: "Cho phép xem tổng quan, kế hoạch, bản thảo chia sẻ và trao đổi cố vấn; không mở kho dữ liệu thô chưa ẩn danh.",
              },
            },
          },
        });

        await tx.projectMember.createMany({
          data: [
            {
              projectId: p1Id,
              userId: u("lw.student.ai"),
              role: "OWNER",
              status: "ACTIVE",
              mentorshipProfileShared: true,
              mentorshipRoleNote: "Chủ nhiệm đề tài — Thiết kế kịch bản thực nghiệm & viết bản thảo chính",
              mentorshipConsentUpdatedAt: daysAgo(20),
            },
            {
              projectId: p1Id,
              userId: u("lw.student.member1"),
              role: "MEMBER",
              status: "ACTIVE",
              mentorshipProfileShared: true,
              mentorshipRoleNote: "Phụ trách thu thập dữ liệu, phân tích thống kê & trực quan hóa",
              mentorshipConsentUpdatedAt: daysAgo(19),
            },
            {
              projectId: p1Id,
              userId: u("lw.student.private"),
              role: "MEMBER",
              status: "ACTIVE",
              mentorshipProfileShared: false,
              mentorshipRoleNote: null,
            },
          ],
        });

        await tx.researchPlan.create({
          data: {
            projectId: p1Id,
            updatedById: u("lw.student.ai"),
            approach: "EMPIRICAL",
            problem: "Đánh giá tác động của trợ lý AI có dẫn chứng học liệu tới năng lực tự học của sinh viên đại học.",
            objectives: ["Thiết kế thực nghiệm đối chứng", "Đo lường hiệu quả học tập", "Công bố kết quả nội bộ"],
            methodology: "Thử nghiệm đối chứng ngẫu nhiên có phân tầng kết hợp phỏng vấn bán cấu trúc.",
          },
        });

        // Accepted mentorship request + active relationship + MentorAccess for lw.mentor.lead
        const req1Id = demoId("req:lw-ai-edu:lead");
        const rel1Id = demoId("rel:lw-ai-edu:lead");
        const access1Id = demoId("access:lw-ai-edu:lead");

        await tx.mentorshipRequest.create({
          data: {
            id: req1Id,
            projectId: p1Id,
            mentorUserId: u("lw.mentor.lead"),
            requestedBy: u("lw.student.ai"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "PRIMARY",
            status: "ACCEPTED",
            message: "Kính mời Thầy hướng dẫn chính cho đề tài đánh giá trợ lý AI trong học tập cá nhân hóa. Nhóm đã hoàn thành tổng quan tài liệu và mong nhận góp ý về thiết kế thực nghiệm.",
            respondedAt: daysAgo(25),
            idempotencyKey: "lw-demo-req-ai-edu-lead",
            termsSnapshot: {
              proposalKind: "INITIAL_PROPOSAL",
              mentorRole: "PRIMARY",
              supportAreas: ["RESEARCH_DIRECTION", "METHODOLOGY", "PAPER_FEEDBACK"],
              availability: { frequency: "BIWEEKLY", duration: "2_SEMESTERS", mode: "HYBRID" },
              policyHash: prospectiveHash,
              consentConfirmedAt: daysAgo(25).toISOString(),
            },
          },
        });

        await tx.mentorRelationship.create({
          data: {
            id: rel1Id,
            projectId: p1Id,
            mentorUserId: u("lw.mentor.lead"),
            sourceRequestId: req1Id,
            mentorRole: "PRIMARY",
            status: "ACTIVE",
            startedAt: daysAgo(25),
          },
        });

        await tx.mentorAccess.create({
          data: {
            id: access1Id,
            projectId: p1Id,
            requestId: req1Id,
            relationshipId: rel1Id,
            mentorUserId: u("lw.mentor.lead"),
            preset: "ADVISOR",
            permissions: [...standardProspectivePerms, "MANUSCRIPTS_REVIEW", "SUBMISSIONS_VIEW"],
            expiresAt: daysFromNow(150),
            configuredById: u("lw.student.ai"),
          },
        });

        // Shared resource for mentor
        const share1Id = demoId("share:lw-ai-edu:plan");
        await tx.mentorResourceShare.create({
          data: {
            id: share1Id,
            projectId: p1Id,
            accessId: access1Id,
            kind: "PLAN",
            resourceId: demoId("res:lw-ai-edu:plan"),
            title: "Kế hoạch thiết kế thực nghiệm 8 tuần (Phiên bản đã duyệt)",
            content: "Tóm tắt quy trình chia nhóm đối chứng (n=120), thang đo tiền/hậu kiểm tra và quy tắc bảo vệ dữ liệu người học.",
            sharedById: u("lw.student.ai"),
            accessMode: "COMMENT",
          },
        });

        // Project tasks visible in Mentor Project Tasks tab
        await tx.projectTask.createMany({
          data: [
            {
              id: demoId("task:lw-ai-edu:1"),
              projectId: p1Id,
              title: "Rà soát tiêu chí rubric chấm câu trả lời có dẫn chứng",
              description: "Đối chiếu tiêu chí chấm điểm giữa 2 người chấm độc lập và tính hệ số Cohen's kappa.",
              status: "IN_PROGRESS",
              priority: "HIGH",
              assigneeId: u("lw.student.ai"),
              createdById: u("lw.student.ai"),
              dueAt: daysFromNow(5),
              clientKey: demoId("ck:task:lw-ai-edu:1"),
            },
            {
              id: demoId("task:lw-ai-edu:2"),
              projectId: p1Id,
              title: "Bổ sung phân tích Threats to Validity theo góp ý vòng 1",
              description: "Làm rõ giới hạn cỡ mẫu pilot và phương án kiểm soát biến nhiễu kinh nghiệm dùng AI.",
              status: "TODO",
              priority: "MEDIUM",
              assigneeId: u("lw.student.member1"),
              createdById: u("lw.student.ai"),
              dueAt: daysFromNow(9),
              clientKey: demoId("ck:task:lw-ai-edu:2"),
            },
          ],
        });

        // Mentor feedback (system-recorded contributions with clean Vietnamese titles & localized kinds)
        await tx.mentorFeedback.createMany({
          data: [
            {
              id: demoId("fb:lw-ai-edu:guidance"),
              projectId: p1Id,
              accessId: access1Id,
              shareId: share1Id,
              authorId: u("lw.mentor.lead"),
              kind: "MESSAGE",
              body: "Nhóm cần bổ sung phép kiểm định tiền thí nghiệm (pre-test) để đảm bảo tương đương năng lực đầu vào giữa hai nhóm trước khi đo tác động của trợ lý AI.",
              creditRoles: ["SUPERVISION", "METHODOLOGY"],
              status: "ACCEPTED",
              handledById: u("lw.student.ai"),
              handledAt: daysAgo(12),
              response: "Nhóm đã tiếp thu và cập nhật bảng câu hỏi pre-test vào kế hoạch.",
              clientKey: demoId("ck:fb:lw-ai-edu:guidance"),
              createdAt: daysAgo(14),
            },
            {
              id: demoId("fb:lw-ai-edu:suggestion"),
              projectId: p1Id,
              accessId: access1Id,
              shareId: share1Id,
              authorId: u("lw.mentor.lead"),
              kind: "SUGGESTION",
              body: "Đề xuất bổ sung chỉ số đo tỷ lệ sinh viên nhấp kiểm chứng nguồn trích dẫn gốc để tránh đánh giá chỉ dựa trên điểm số ngắn hạn.",
              creditRoles: ["SUPERVISION", "VALIDATION"],
              status: "PENDING",
              clientKey: demoId("ck:fb:lw-ai-edu:suggestion"),
              createdAt: daysAgo(4),
            },
          ],
        });

        // Mentor agreements: 1 PROPOSED (needs lecturer's response) + 1 ACCEPTED (acknowledged)
        await tx.mentorAgreement.createMany({
          data: [
            {
              id: demoId("agr:lw-ai-edu:proposed"),
              projectId: p1Id,
              accessId: access1Id,
              proposedById: u("lw.student.ai"),
              creditRoles: ["SUPERVISION", "METHODOLOGY", "WRITING_REVIEW_EDITING"],
              acknowledgement: "Ghi nhận vai trò Cố vấn chính cho giai đoạn thiết kế thực nghiệm và rà soát bản thảo v1–v2.",
              note: "Nhóm kính nhờ Thầy xác nhận phạm vi ghi nhận đóng góp học thuật trước khi chốt hồ sơ học kỳ.",
              status: "PROPOSED",
              clientKey: demoId("ck:agr:lw-ai-edu:proposed"),
              createdAt: daysAgo(2),
            },
            {
              id: demoId("agr:lw-ai-edu:accepted"),
              projectId: p1Id,
              accessId: access1Id,
              proposedById: u("lw.student.ai"),
              creditRoles: ["SUPERVISION"],
              acknowledgement: "Ghi nhận đóng góp định hướng câu hỏi nghiên cứu và sàng lọc 45 bài báo giai đoạn tổng quan.",
              note: "Đã thống nhất sau buổi họp tổng kết mốc 1.",
              status: "ACCEPTED",
              respondedById: u("lw.mentor.lead"),
              respondedAt: daysAgo(18),
              clientKey: demoId("ck:agr:lw-ai-edu:accepted"),
              createdAt: daysAgo(20),
            },
          ],
        });

        // Work contributions covering all states for lw.mentor.lead
        const contribPendingAckId = demoId("contrib:lw-ai-edu:pending-ack");
        const contribWaitingTeamId = demoId("contrib:lw-ai-edu:waiting-team");
        const contribAcknowledgedId = demoId("contrib:lw-ai-edu:acknowledged");

        await tx.projectContributionProposal.createMany({
          data: [
            {
              id: contribPendingAckId,
              projectId: p1Id,
              contributorId: u("lw.mentor.lead"),
              proposedById: u("lw.student.ai"),
              title: "Thẩm định thiết kế nhóm đối chứng và bộ câu hỏi pre-test",
              description: "Cố vấn đã rà soát toàn bộ kịch bản phân tầng mẫu n=120 và đề xuất điều chỉnh 4 câu hỏi bị dẫn dắt trong bài kiểm tra đầu vào.",
              roles: ["SUPERVISION", "METHODOLOGY"],
              category: "DESIGN_METHODOLOGY",
              source: "TEAM_LOG",
              workDate: daysAgo(6),
              evidence: "Biên bản họp hướng dẫn tuần 4 và bản sửa đổi bộ câu hỏi pre-test v1.2.",
              outcome: "Bộ câu hỏi pre-test chuẩn hóa dùng cho giai đoạn pilot.",
              status: "PENDING_CONFIRMATION",
              confirmationRequiredFrom: "CONTRIBUTOR",
              clientKey: demoId("ck:contrib:pending-ack"),
            },
            {
              id: contribWaitingTeamId,
              projectId: p1Id,
              contributorId: u("lw.mentor.lead"),
              proposedById: u("lw.mentor.lead"),
              title: "Tư vấn trực tiếp phương pháp phân tích ANOVA hỗn hợp (ngoài hệ thống)",
              description: "Buổi làm việc trực tiếp tại phòng thí nghiệm kéo dài 90 phút hướng dẫn nhóm kiểm tra giả định phân phối chuẩn và chọn mô hình phân tích lặp lại.",
              roles: ["SUPERVISION", "FORMAL_ANALYSIS"],
              category: "ANALYSIS_INTERPRETATION",
              source: "MANUAL",
              workDate: daysAgo(3),
              evidence: "Ghi chú buổi hướng dẫn trực tiếp ngày 23/11 và kịch bản R mẫu.",
              outcome: "Kịch bản phân tích thống kê tiền đăng ký cho dữ liệu 8 tuần.",
              status: "PENDING_CONFIRMATION",
              confirmationRequiredFrom: "OWNER",
              clientKey: demoId("ck:contrib:waiting-team"),
            },
            {
              id: contribAcknowledgedId,
              projectId: p1Id,
              contributorId: u("lw.mentor.lead"),
              proposedById: u("lw.student.ai"),
              title: "Định hướng khung tổng quan tài liệu và tiêu chí chọn lọc PRISMA",
              description: "Hướng dẫn nhóm xây dựng tiêu chí đưa vào/loại trừ cho 45 bài báo nền tảng về trợ lý AI giáo dục giai đoạn 2021–2026.",
              roles: ["SUPERVISION", "CONCEPTUALIZATION"],
              category: "CONCEPTUALIZATION",
              source: "TEAM_LOG",
              workDate: daysAgo(21),
              evidence: "Ma trận tổng quan tài liệu v1 và nhật ký sàng lọc PRISMA.",
              outcome: "Hoàn thành Mốc 1 tổng quan tài liệu.",
              status: "CONFIRMED",
              confirmationRequiredFrom: "CONTRIBUTOR",
              confirmedById: u("lw.mentor.lead"),
              confirmedAt: daysAgo(19),
              clientKey: demoId("ck:contrib:acknowledged"),
            },
          ],
        });

        await tx.contributionParticipant.createMany({
          data: [
            { proposalId: contribPendingAckId, userId: u("lw.mentor.lead"), roles: ["SUPERVISION", "METHODOLOGY"] },
            { proposalId: contribWaitingTeamId, userId: u("lw.mentor.lead"), roles: ["SUPERVISION", "FORMAL_ANALYSIS"] },
            { proposalId: contribAcknowledgedId, userId: u("lw.mentor.lead"), roles: ["SUPERVISION", "CONCEPTUALIZATION"] },
          ],
        });

        await tx.contributionReview.create({
          data: {
            id: demoId("crev:lw-ai-edu:acknowledged"),
            proposalId: contribAcknowledgedId,
            version: 1,
            userId: u("lw.mentor.lead"),
            decision: "ACKNOWLEDGE",
            note: "Xác nhận đúng nội dung và vai trò hướng dẫn ở Mốc 1.",
            createdAt: daysAgo(19),
          },
        });

        // Multi-round Academic Review lifecycle (Submission + v1 & v2 + ReviewRequest + Round 1 Submitted HumanReview + Revision Items)
        const subId = demoId("sub:lw-ai-edu:manuscript");
        const rev1Id = demoId("subrev:lw-ai-edu:v1");
        const rev2Id = demoId("subrev:lw-ai-edu:v2");
        const tplId = demoId("rtpl:lw-demo:standard");
        const tplVerId = demoId("rtplver:lw-demo:standard:v1");
        const rreqId = demoId("rreq:lw-ai-edu:round1");
        const assignId = demoId("rassign:lw-ai-edu:lead");
        const hrevId = demoId("hrev:lw-ai-edu:round1");
        const ritem1Id = demoId("ritem:lw-ai-edu:1");
        const ritem2Id = demoId("ritem:lw-ai-edu:2");

        await tx.reviewTemplate.upsert({
          where: { id: tplId },
          update: {},
          create: {
            id: tplId,
            name: "Mẫu phản biện bản thảo nghiên cứu thực nghiệm (Demo)",
            description: "Mẫu tiêu chí đánh giá học thuật nội bộ cho bản thảo thực nghiệm giáo dục & AI.",
            submissionType: "MANUSCRIPT",
            source: "SYSTEM",
            status: "PUBLISHED",
            activeVersionId: tplVerId,
            active: true,
          },
        });
        await tx.reviewTemplateVersion.upsert({
          where: { id: tplVerId },
          update: {},
          create: {
            id: tplVerId,
            templateId: tplId,
            versionNumber: 1,
            reviewMode: "STRUCTURED_CRITERIA",
            description: "Đánh giá tính mới, phương pháp thực nghiệm và tính minh bạch bằng chứng.",
            guidelines: ["Kiểm tra căn cứ bằng chứng của từng kết luận.", "Đánh giá rõ giới hạn nghiên cứu."],
            status: "PUBLISHED",
            publishedAt: daysAgo(60),
          },
        });

        await tx.submission.create({
          data: {
            id: subId,
            projectId: p1Id,
            createdById: u("lw.student.ai"),
            title: "Tác động của trợ lý AI có dẫn chứng nguồn lên năng lực tự học của sinh viên đại học (Demo)",
            abstractText: "Nghiên cứu thực nghiệm đối chứng trên 120 sinh viên nhằm đánh giá hiệu quả học tập và hành vi kiểm chứng nguồn khi sử dụng trợ lý AI giáo dục.",
            submissionType: "MANUSCRIPT",
            researchField: "Artificial Intelligence",
            researchGoal: "Đo lường hiệu quả học tập và mức độ kiểm chứng nguồn của sinh viên.",
            researchQuestions: [
              "Trợ lý AI dẫn chứng nguồn có cải thiện điểm hậu kiểm tra so với LLM thông thường không?",
            ],
            methodology: "Thử nghiệm đối chứng ngẫu nhiên có phân tầng (RCT) kết hợp phân tích nhật ký sử dụng.",
            keywords: ["AI in Education", "LLM Evaluation", "Source Grounding"],
            status: "revised",
            currentRevisionNumber: 2,
            currentRevisionId: rev2Id,
          },
        });

        await tx.submissionRevision.createMany({
          data: [
            {
              id: rev1Id,
              submissionId: subId,
              revisionNumber: 1,
              uploadedById: u("lw.student.ai"),
              originalFileName: "Ban-thao-tro-ly-AI-hoc-tap-v1-Demo.pdf",
              contentType: "PDF",
              contentSnapshot: "Phiên bản v1 nộp phản biện vòng 1 (bao gồm tổng quan tài liệu, thiết kế thử nghiệm pilot và kết quả bước đầu).",
              sizeBytes: 184320,
              createdAt: daysAgo(15),
            },
            {
              id: rev2Id,
              submissionId: subId,
              revisionNumber: 2,
              uploadedById: u("lw.student.ai"),
              sourceRevisionId: rev1Id,
              responseToReview: "Nhóm đã bổ sung phân tích Threats to Validity, làm rõ phương pháp chọn mẫu phân tầng và cập nhật bảng thống kê Cohen's d theo góp ý vòng 1.",
              originalFileName: "Ban-thao-tro-ly-AI-hoc-tap-v2-Demo.pdf",
              contentType: "PDF",
              contentSnapshot: "Phiên bản v2 đã chỉnh sửa sau vòng phản biện 1, sẵn sàng rà soát lại ở vòng 2.",
              sizeBytes: 216540,
              createdAt: daysAgo(3),
            },
          ],
        });

        await tx.reviewRequest.create({
          data: {
            id: rreqId,
            submissionId: subId,
            projectId: p1Id,
            requesterId: u("lw.student.ai"),
            templateVersionId: tplVerId,
            artifactRevisionId: rev2Id,
            status: "IN_REVIEW",
            origin: "MENTOR_WORKSPACE",
            message: "Nhóm đã cập nhật bản thảo v2 theo toàn bộ góp ý vòng 1 và kính nhờ Thầy xem lại ở vòng 2.",
            dueAt: daysFromNow(7),
            createdAt: daysAgo(14),
            respondedAt: daysAgo(13),
          },
        });

        await tx.reviewerAssignment.create({
          data: {
            id: assignId,
            submissionId: subId,
            reviewRequestId: rreqId,
            artifactRevisionId: rev2Id,
            mentorAccessId: access1Id,
            reviewerId: u("lw.mentor.lead"),
            assignedById: u("lw.student.ai"),
            anonymousCode: `LW-DEMO-${p1Id.slice(0, 6).toUpperCase()}`,
            status: "in_progress",
            dueAt: daysFromNow(7),
            createdAt: daysAgo(14),
          },
        });

        await tx.humanReview.create({
          data: {
            id: hrevId,
            assignmentId: assignId,
            roundNumber: 1,
            reviewerId: u("lw.mentor.lead"),
            submissionId: subId,
            revisionId: rev1Id,
            templateId: tplId,
            templateVersionId: tplVerId,
            status: "SUBMITTED",
            overallComment: "Bản thảo v1 đặt vấn đề rõ ràng và có ý nghĩa thực tiễn. Tuy nhiên nhóm cần bổ sung phân tích kiểm soát biến nhiễu đầu vào và trình bày đầy đủ kích thước hiệu ứng (effect size) trước khi chuyển sang bước nộp hội nghị.",
            keyStrengths: "Câu hỏi nghiên cứu mạch lạc; có thiết kế đối chứng và quy trình ẩn danh dữ liệu người học.",
            keyConcerns: "Thiếu phần Threats to Validity và chưa báo cáo hệ số đồng thuận giữa các giám khảo chấm rubric.",
            overallAssessment: "MAJOR_REVISION",
            recommendation: "MAJOR_REVISION",
            reviewerAcademicRole: "LECTURER",
            submittedAt: daysAgo(9),
            createdAt: daysAgo(11),
          },
        });

        await tx.reviewRevisionItem.createMany({
          data: [
            {
              id: ritem1Id,
              reviewId: hrevId,
              position: 1,
              priority: "MAJOR",
              locator: "Mục 3.2 — Thiết kế thực nghiệm",
              description: "Bổ sung phân tích Threats to Validity và mô tả rõ cách phân tầng nhóm đối chứng theo năng lực đầu vào.",
              status: "ADDRESSED",
            },
            {
              id: ritem2Id,
              reviewId: hrevId,
              position: 2,
              priority: "MINOR",
              locator: "Mục 4.1 — Bảng kết quả pilot",
              description: "Bổ sung khoảng tin cậy 95% và chỉ số kích thước hiệu ứng Cohen's d bên cạnh giá trị p-value.",
              status: "OPEN",
            },
          ],
        });

        await tx.reviewRevisionResponse.create({
          data: {
            id: demoId("rresp:lw-ai-edu:1"),
            revisionItemId: ritem1Id,
            submissionRevisionId: rev2Id,
            responseText: "Nhóm đã bổ sung tiểu mục 3.4 Threats to Validity và mô tả chi tiết thuật toán phân tầng theo điểm pre-test.",
            status: "ADDRESSED",
          },
        });

        // One open non-punitive integrity clarification case for demo coverage
        await tx.researchIntegrityCase.create({
          data: {
            id: demoId("icase:lw-ai-edu:1"),
            projectId: p1Id,
            kind: "CONTRIBUTION_DISPUTE",
            status: "UNDER_REVIEW",
            reporterId: u("lw.student.member1"),
            respondentUserId: u("lw.mentor.lead"),
            targetKind: "WORK_CONTRIBUTION",
            targetId: contribPendingAckId,
            title: "Làm rõ vai trò CRediT cho giai đoạn chuẩn hóa bộ câu hỏi pre-test",
            description: "Đề nghị bổ sung ghi nhận đồng tham gia vai trò Data Curation cho thành viên phụ trách làm sạch bảng câu hỏi pilot.",
            evidenceRefs: [{ kind: "WORK_CONTRIBUTION", id: contribPendingAckId, label: "Biên bản họp tuần 4" }],
            createdAt: daysAgo(2),
          },
        });

        createdProjects.push({ key: "lw-ai-edu", id: p1Id, title: "Đánh giá hiệu quả của trợ lý AI trong học tập cá nhân hóa (Demo)" });
      }

      // =========================================================================
      // PROJECT 2 — Complete Dossier Seeking Secondary Mentor + Incoming Invitation to lw.mentor.lead
      // =========================================================================
      const p2Id = demoId("project:lw-med-llm");
      if (!(await tx.project.findUnique({ where: { id: p2Id } }))) {
        const attMed = await ensureAttachment("med-intro", p2Id, u("lw.student.health"), "Tom-tat-danh-gia-LLM-lam-sang-Demo.pdf", introPdfMed);
        await tx.project.create({
          data: {
            id: p2Id,
            ownerId: u("lw.student.health"),
            createdById: u("lw.student.health"),
            creationKey: "lw-demo-med-llm",
            title: "Đánh giá độ tin cậy của LLM trong hỗ trợ chẩn đoán lâm sàng (Demo)",
            description: "Đánh giá mức độ chính xác và tỷ lệ ảo giác của các mô hình ngôn ngữ lớn trên tập tình huống lâm sàng công khai.",
            researchField: "AI in Healthcare",
            researchAreas: ["AI in Healthcare", "Medical Education", "Artificial Intelligence"],
            researchStage: "DATA_COLLECTION",
            status: "ACTIVE",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Nhóm khảo sát độ tin cậy của 3 mô hình LLM mã nguồn mở trên 200 ca lâm sàng giả lập công khai, tập trung vào tỷ lệ ảo giác và khả năng giải thích.",
            mentorshipResearchAreas: ["AI in Healthcare", "Artificial Intelligence"],
            mentorshipExpertise: ["LLM Evaluation", "Statistics", "Systematic Review"],
            mentorshipNeeds: "Cần cố vấn phụ về đánh giá mô hình LLM và phân tích lỗi sai hệ thống.",
            mentorshipSupportTypes: ["METHODOLOGY", "DATA_ANALYSIS", "PAPER_FEEDBACK"],
            mentorshipMethodologies: ["Benchmark Evaluation", "Error Taxonomy"],
            mentorshipProfile: {
              researchProblem: "LLM thường tạo lập luận y khoa nghe thuyết phục nhưng vẫn chứa sai sót lâm sàng nguy hiểm khi thiếu kiểm định.",
              researchObjectives: [
                "Xây dựng bộ tiêu chí phân loại lỗi ảo giác lâm sàng trên tình huống giả lập.",
                "So sánh hiệu năng giữa các chiến lược gợi nhắc (prompting) có dẫn chứng hướng dẫn điều trị.",
              ],
              expectedDuration: "1_SEMESTER",
              expectedFrequency: "BIWEEKLY",
              workingMode: "ONLINE",
              progressSummary: {
                completed: "Đã chuẩn hóa 200 tình huống giả lập từ nguồn mở và hoàn thành chấm mẫu 40 tình huống.",
                inProgress: "Đang xây dựng bảng phân loại mức độ nghiêm trọng của sai sót.",
                challenges: "Cần thống nhất phương pháp đo độ tin cậy giữa các chuyên gia chấm điểm.",
              },
              recruitingRoles: ["SECONDARY"],
              sharedAttachmentIds: [attMed],
              prospectiveAccess: {
                preset: "ADVISOR",
                permissions: standardProspectivePerms,
                expiresAt: prospectiveExpiryIso,
                scopeNote: "Chia sẻ tổng quan, bộ tiêu chí đánh giá và bản thảo nghiên cứu.",
              },
            },
          },
        });
        await tx.projectMember.create({
          data: {
            projectId: p2Id,
            userId: u("lw.student.health"),
            role: "OWNER",
            status: "ACTIVE",
            mentorshipProfileShared: true,
            mentorshipRoleNote: "Chủ nhiệm đề tài — Xây dựng ca lâm sàng giả lập & điều phối chấm chéo",
            mentorshipConsentUpdatedAt: daysAgo(10),
          },
        });

        // Active primary mentor: lw.mentor.health
        const reqMedPrimary = demoId("req:lw-med-llm:health");
        const relMedPrimary = demoId("rel:lw-med-llm:health");
        await tx.mentorshipRequest.create({
          data: {
            id: reqMedPrimary,
            projectId: p2Id,
            mentorUserId: u("lw.mentor.health"),
            requestedBy: u("lw.student.health"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "PRIMARY",
            status: "ACCEPTED",
            message: "Kính mời Cô hướng dẫn chuyên môn y sinh cho dự án đánh giá LLM lâm sàng.",
            respondedAt: daysAgo(15),
            idempotencyKey: "lw-demo-req-med-primary",
          },
        });
        await tx.mentorRelationship.create({
          data: {
            id: relMedPrimary,
            projectId: p2Id,
            mentorUserId: u("lw.mentor.health"),
            sourceRequestId: reqMedPrimary,
            mentorRole: "PRIMARY",
            status: "ACTIVE",
            startedAt: daysAgo(15),
          },
        });

        // Pending incoming invitation to lw.mentor.lead for SECONDARY role
        const reqMedIncoming = demoId("req:lw-med-llm:lead-incoming");
        await tx.mentorshipRequest.create({
          data: {
            id: reqMedIncoming,
            projectId: p2Id,
            mentorUserId: u("lw.mentor.lead"),
            requestedBy: u("lw.student.health"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "SECONDARY",
            status: "PENDING",
            message: "Nhóm đã có PGS.TS. Trần Mai Phương hướng dẫn chuyên môn y khoa và mong mời Thầy làm Cố vấn phụ về phương pháp đánh giá LLM và kiểm định thống kê.",
            expiresAt: daysFromNow(14),
            idempotencyKey: "lw-demo-req-med-lead-incoming",
            termsSnapshot: {
              proposalKind: "INITIAL_PROPOSAL",
              mentorRole: "SECONDARY",
              supportAreas: ["METHODOLOGY", "DATA_ANALYSIS"],
              availability: { frequency: "BIWEEKLY", duration: "1_SEMESTER", mode: "ONLINE" },
              policyHash: prospectiveHash,
            },
          },
        });
        await tx.mentorAccess.create({
          data: {
            id: demoId("access:lw-med-llm:lead-incoming"),
            projectId: p2Id,
            requestId: reqMedIncoming,
            mentorUserId: u("lw.mentor.lead"),
            preset: "ADVISOR",
            permissions: standardProspectivePerms,
            expiresAt: daysFromNow(150),
            configuredById: u("lw.student.health"),
          },
        });
        createdProjects.push({ key: "lw-med-llm", id: p2Id, title: "Đánh giá độ tin cậy của LLM trong hỗ trợ chẩn đoán lâm sàng (Demo)" });
      }

      // =========================================================================
      // PROJECT 3 — Sparse Dossier (No Progress Shared + 0 Consented Members -> tests Dossier fixes!)
      // =========================================================================
      const p3Id = demoId("project:lw-hci-sparse");
      if (!(await tx.project.findUnique({ where: { id: p3Id } }))) {
        await tx.project.create({
          data: {
            id: p3Id,
            ownerId: u("lw.student.hci"),
            createdById: u("lw.student.hci"),
            creationKey: "lw-demo-hci-sparse",
            title: "Thiết kế giao diện hỗ trợ người cao tuổi tiếp cận dịch vụ công (Demo)",
            description: "Nghiên cứu trải nghiệm người dùng và đề xuất nguyên tắc thiết kế giao diện thân thiện với người cao tuổi.",
            researchField: "Human-Computer Interaction",
            researchAreas: ["Human-Computer Interaction", "Education"],
            researchStage: "PLANNING",
            status: "PLANNING",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Nhóm đang xây dựng đề cương nghiên cứu khả năng sử dụng cổng dịch vụ công trực tuyến đối với người dùng trên 60 tuổi và tìm giảng viên góp ý phương pháp phỏng vấn.",
            mentorshipResearchAreas: ["Human-Computer Interaction"],
            mentorshipExpertise: ["Qualitative Research", "Survey Design"],
            mentorshipNeeds: "Cần giảng viên định hướng khung khảo sát và tiêu chí đánh giá khả năng tiếp cận.",
            mentorshipSupportTypes: ["RESEARCH_DIRECTION", "METHODOLOGY"],
            mentorshipProfile: {
              expectedDuration: "1_SEMESTER",
              expectedFrequency: "FLEXIBLE",
              workingMode: "ONLINE",
              recruitingRoles: ["PRIMARY"],
              prospectiveAccess: {
                preset: "ADVISOR",
                permissions: ["OVERVIEW_VIEW", "TASKS_VIEW", "MENTOR_CHAT"],
                expiresAt: prospectiveExpiryIso,
              },
            },
          },
        });
        await tx.projectMember.createMany({
          data: [
            { projectId: p3Id, userId: u("lw.student.hci"), role: "OWNER", status: "ACTIVE", mentorshipProfileShared: false },
            { projectId: p3Id, userId: u("lw.student.private"), role: "MEMBER", status: "ACTIVE", mentorshipProfileShared: false },
          ],
        });
        createdProjects.push({ key: "lw-hci-sparse", id: p3Id, title: "Thiết kế giao diện hỗ trợ người cao tuổi tiếp cận dịch vụ công (Demo)" });
      }

      // =========================================================================
      // PROJECT 4 — Seeking Mentor WITHOUT Prospective Access Policy (tests missing-policy UX)
      // =========================================================================
      const p4Id = demoId("project:lw-nlp-nopolicy");
      if (!(await tx.project.findUnique({ where: { id: p4Id } }))) {
        await tx.project.create({
          data: {
            id: p4Id,
            ownerId: u("lw.student.nlp"),
            createdById: u("lw.student.nlp"),
            creationKey: "lw-demo-nlp-nopolicy",
            title: "Phân tích sắc thái bình luận học thuật tiếng Việt đa lĩnh vực (Demo)",
            description: "Xây dựng bộ ngữ liệu và mô hình phân loại sắc thái góp ý học thuật tiếng Việt.",
            researchField: "Natural Language Processing",
            researchAreas: ["Natural Language Processing", "Artificial Intelligence"],
            researchStage: "PLANNING",
            status: "PLANNING",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Nhóm dự kiến gán nhãn 3.000 nhận xét học thuật tiếng Việt ẩn danh để hỗ trợ phân tích tính xây dựng trong phản biện.",
            mentorshipResearchAreas: ["Natural Language Processing", "Artificial Intelligence"],
            mentorshipExpertise: ["LLM Evaluation", "Data Analysis"],
            mentorshipNeeds: "Cần cố vấn góp ý hướng dẫn gán nhãn (annotation guidelines) và chỉ số đồng thuận.",
            mentorshipSupportTypes: ["RESEARCH_DIRECTION", "DATA_ANALYSIS"],
            mentorshipProfile: {
              recruitingRoles: ["PRIMARY"],
              prospectiveAccess: null,
            },
          },
        });
        await tx.projectMember.create({
          data: {
            projectId: p4Id,
            userId: u("lw.student.nlp"),
            role: "OWNER",
            status: "ACTIVE",
            mentorshipProfileShared: true,
            mentorshipRoleNote: "Chủ nhiệm đề tài — Thiết kế bộ hướng dẫn gán nhãn tiếng Việt",
            mentorshipConsentUpdatedAt: daysAgo(5),
          },
        });
        createdProjects.push({ key: "lw-nlp-nopolicy", id: p4Id, title: "Phân tích sắc thái bình luận học thuật tiếng Việt đa lĩnh vực (Demo)" });
      }

      // =========================================================================
      // PROJECT 5 — Outgoing Formal Proposal from lw.mentor.lead + Clarification Thread
      // =========================================================================
      const p5Id = demoId("project:lw-env-proposal");
      if (!(await tx.project.findUnique({ where: { id: p5Id } }))) {
        await tx.project.create({
          data: {
            id: p5Id,
            ownerId: u("lw.student.env"),
            createdById: u("lw.student.env"),
            creationKey: "lw-demo-env-proposal",
            title: "Mô hình dự báo chất lượng không khí đô thị từ dữ liệu cảm biến mở (Demo)",
            description: "Kết hợp chuỗi thời gian khí tượng và dữ liệu cảm biến mở để dự báo chỉ số PM2.5 ngắn hạn.",
            researchField: "Environmental Science",
            researchAreas: ["Environmental Science", "Data Science", "Machine Learning"],
            researchStage: "LITERATURE_REVIEW",
            status: "ACTIVE",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Nhóm thu thập chuỗi dữ liệu quan trắc công khai 24 tháng nhằm so sánh mô hình học sâu nhẹ và mô hình thống kê cổ điển trong dự báo PM2.5.",
            mentorshipResearchAreas: ["Environmental Science", "Data Science"],
            mentorshipExpertise: ["Experimental Design", "Statistics", "Data Analysis"],
            mentorshipNeeds: "Cần cố vấn định hướng cách chia tập kiểm tra theo thời gian và đánh giá sai số mùa vụ.",
            mentorshipSupportTypes: ["METHODOLOGY", "DATA_ANALYSIS"],
            mentorshipProfile: {
              expectedDuration: "2_SEMESTERS",
              expectedFrequency: "BIWEEKLY",
              workingMode: "ONLINE",
              recruitingRoles: ["PRIMARY", "SECONDARY"],
              prospectiveAccess: {
                preset: "ADVISOR",
                permissions: standardProspectivePerms,
                expiresAt: prospectiveExpiryIso,
              },
            },
          },
        });
        await tx.projectMember.create({
          data: {
            projectId: p5Id,
            userId: u("lw.student.env"),
            role: "OWNER",
            status: "ACTIVE",
            mentorshipProfileShared: true,
            mentorshipRoleNote: "Chủ nhiệm đề tài — Thu thập và làm sạch chuỗi thời gian PM2.5",
            mentorshipConsentUpdatedAt: daysAgo(8),
          },
        });

        const reqEnvOutId = demoId("req:lw-env-proposal:lead-out");
        await tx.mentorshipRequest.create({
          data: {
            id: reqEnvOutId,
            projectId: p5Id,
            mentorUserId: u("lw.mentor.lead"),
            requestedBy: u("lw.mentor.lead"),
            direction: "LECTURER_TO_PROJECT",
            mentorRole: "SECONDARY",
            status: "PENDING",
            message: "Tôi có thể hỗ trợ nhóm phần thiết kế đánh giá mô hình chuỗi thời gian, tránh rò rỉ dữ liệu tương lai và rà soát phần phương pháp trong bản thảo.",
            expiresAt: daysFromNow(12),
            idempotencyKey: "lw-demo-req-env-lead-out",
            termsSnapshot: {
              proposalKind: "INITIAL_PROPOSAL",
              mentorRole: "SECONDARY",
              supportAreas: ["METHODOLOGY", "DATA_ANALYSIS"],
              availability: { frequency: "BIWEEKLY", duration: "1_SEMESTER", mode: "ONLINE", note: "Trao đổi chiều thứ Năm hàng hai tuần." },
              policyHash: prospectiveHash,
              consentConfirmedAt: daysAgo(3).toISOString(),
            },
          },
        });
        await tx.mentorAccess.create({
          data: {
            id: demoId("access:lw-env-proposal:lead-out"),
            projectId: p5Id,
            requestId: reqEnvOutId,
            mentorUserId: u("lw.mentor.lead"),
            preset: "ADVISOR",
            permissions: standardProspectivePerms,
            expiresAt: daysFromNow(150),
            configuredById: u("lw.student.env"),
          },
        });
        await tx.mentorshipRequestMessage.create({
          data: {
            id: demoId("reqmsg:lw-env-proposal:1"),
            requestId: reqEnvOutId,
            projectId: p5Id,
            authorId: u("lw.student.env"),
            body: "Em cảm ơn Thầy đã gửi đề nghị! Nhóm xin hỏi thêm lịch trao đổi vào cuối tuần có thuận tiện hơn cho Thầy không ạ?",
            clientKey: demoId("ck:reqmsg:lw-env-proposal:1"),
            createdAt: daysAgo(1),
          },
        });
        createdProjects.push({ key: "lw-env-proposal", id: p5Id, title: "Mô hình dự báo chất lượng không khí đô thị từ dữ liệu cảm biến mở (Demo)" });
      }

      // =========================================================================
      // PROJECT 6 — Second Active Mentorship (Cybersecurity) for lw.mentor.lead
      // =========================================================================
      const p6Id = demoId("project:lw-cyber-sec");
      if (!(await tx.project.findUnique({ where: { id: p6Id } }))) {
        await tx.project.create({
          data: {
            id: p6Id,
            ownerId: u("lw.student.cyber"),
            createdById: u("lw.student.cyber"),
            creationKey: "lw-demo-cyber-sec",
            title: "Phát hiện lỗ hổng bảo mật tự động trong mã nguồn sinh viên (Demo)",
            description: "Đánh giá độ chính xác của công cụ phân tích tĩnh kết hợp quy tắc học máy trong phát hiện lỗi bảo mật phổ biến.",
            researchField: "Cybersecurity",
            researchAreas: ["Cybersecurity", "Software Engineering"],
            researchStage: "EXPERIMENTATION",
            status: "ACTIVE",
            visibility: "PRIVATE",
            mentorshipDiscovery: "CLOSED",
            mentorshipSummary: "Dự án xây dựng bộ kiểm thử gồm 150 mẫu lỗ hổng phổ biến để đo tỷ lệ cảnh báo giả của các công cụ phân tích tĩnh.",
            mentorshipResearchAreas: ["Cybersecurity", "Software Engineering"],
          },
        });
        await tx.projectMember.createMany({
          data: [
            { projectId: p6Id, userId: u("lw.student.cyber"), role: "OWNER", status: "ACTIVE", mentorshipProfileShared: true },
            { projectId: p6Id, userId: u("lw.student.member1"), role: "MEMBER", status: "ACTIVE", mentorshipProfileShared: true },
          ],
        });
        const req6Id = demoId("req:lw-cyber-sec:lead");
        const rel6Id = demoId("rel:lw-cyber-sec:lead");
        await tx.mentorshipRequest.create({
          data: {
            id: req6Id,
            projectId: p6Id,
            mentorUserId: u("lw.mentor.lead"),
            requestedBy: u("lw.student.cyber"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "SECONDARY",
            status: "ACCEPTED",
            message: "Mời Thầy đồng hành hỗ trợ thiết kế đánh giá thực nghiệm cho bộ kiểm thử bảo mật.",
            respondedAt: daysAgo(18),
            idempotencyKey: "lw-demo-req-cyber-lead",
          },
        });
        await tx.mentorRelationship.create({
          data: {
            id: rel6Id,
            projectId: p6Id,
            mentorUserId: u("lw.mentor.lead"),
            sourceRequestId: req6Id,
            mentorRole: "SECONDARY",
            status: "ACTIVE",
            startedAt: daysAgo(18),
          },
        });
        await tx.mentorAccess.create({
          data: {
            id: demoId("access:lw-cyber-sec:lead"),
            projectId: p6Id,
            requestId: req6Id,
            relationshipId: rel6Id,
            mentorUserId: u("lw.mentor.lead"),
            preset: "OBSERVER",
            permissions: ["OVERVIEW_VIEW", "TASKS_VIEW", "MENTOR_CHAT", "CONTRIBUTIONS_VIEW"],
            expiresAt: daysFromNow(120),
            configuredById: u("lw.student.cyber"),
          },
        });
        createdProjects.push({ key: "lw-cyber-sec", id: p6Id, title: "Phát hiện lỗ hổng bảo mật tự động trong mã nguồn sinh viên (Demo)" });
      }

      // =========================================================================
      // PROJECT 7 — Primary Role Filled, Open Secondary Only
      // =========================================================================
      const p7Id = demoId("project:lw-edtech-filled");
      if (!(await tx.project.findUnique({ where: { id: p7Id } }))) {
        await tx.project.create({
          data: {
            id: p7Id,
            ownerId: u("lw.student.ai"),
            createdById: u("lw.student.ai"),
            creationKey: "lw-demo-edtech-filled",
            title: "Cá nhân hóa lộ trình ôn tập bằng biểu đồ tri thức (Demo)",
            description: "Mô hình hóa khái niệm môn học bằng biểu đồ tri thức nhằm gợi ý lộ trình ôn tập thích ứng.",
            researchField: "Education",
            researchAreas: ["Education", "Artificial Intelligence"],
            researchStage: "IMPLEMENTATION",
            status: "ACTIVE",
            visibility: "PRIVATE",
            mentorshipDiscovery: "SEEKING_MENTOR",
            mentorshipSummary: "Dự án đã có Cố vấn chính phụ trách chuyên môn giáo dục và đang tìm Cố vấn phụ về đánh giá thuật toán gợi ý.",
            mentorshipResearchAreas: ["Education", "Artificial Intelligence"],
            mentorshipExpertise: ["Machine Learning", "Experimental Design"],
            mentorshipNeeds: "Cần cố vấn phụ góp ý đánh giá thuật toán gợi ý lộ trình.",
            mentorshipSupportTypes: ["METHODOLOGY", "DATA_ANALYSIS"],
            mentorshipProfile: {
              recruitingRoles: ["SECONDARY"],
              prospectiveAccess: {
                preset: "ADVISOR",
                permissions: standardProspectivePerms,
                expiresAt: prospectiveExpiryIso,
              },
            },
          },
        });
        await tx.projectMember.create({
          data: { projectId: p7Id, userId: u("lw.student.ai"), role: "OWNER", status: "ACTIVE", mentorshipProfileShared: true },
        });
        const req7Id = demoId("req:lw-edtech-filled:primary");
        await tx.mentorshipRequest.create({
          data: {
            id: req7Id,
            projectId: p7Id,
            mentorUserId: u("lw.mentor.health"),
            requestedBy: u("lw.student.ai"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "PRIMARY",
            status: "ACCEPTED",
            message: "Cố vấn chính đã nhận hướng dẫn dự án.",
            respondedAt: daysAgo(30),
            idempotencyKey: "lw-demo-req-edtech-primary",
          },
        });
        await tx.mentorRelationship.create({
          data: {
            id: demoId("rel:lw-edtech-filled:primary"),
            projectId: p7Id,
            mentorUserId: u("lw.mentor.health"),
            sourceRequestId: req7Id,
            mentorRole: "PRIMARY",
            status: "ACTIVE",
            startedAt: daysAgo(30),
          },
        });
        createdProjects.push({ key: "lw-edtech-filled", id: p7Id, title: "Cá nhân hóa lộ trình ôn tập bằng biểu đồ tri thức (Demo)" });
      }

      // =========================================================================
      // PROJECT 8 — Discovery Closed (Private Only)
      // =========================================================================
      const p8Id = demoId("project:lw-private-closed");
      if (!(await tx.project.findUnique({ where: { id: p8Id } }))) {
        await tx.project.create({
          data: {
            id: p8Id,
            ownerId: u("lw.student.cyber"),
            createdById: u("lw.student.cyber"),
            creationKey: "lw-demo-private-closed",
            title: "Nghiên cứu tối ưu hóa truy vấn đồ thị quy mô vừa (Demo)",
            description: "Dự án nội bộ không mở khám phá cố vấn công khai.",
            researchField: "Software Engineering",
            researchAreas: ["Software Engineering"],
            status: "PLANNING",
            visibility: "PRIVATE",
            mentorshipDiscovery: "CLOSED",
          },
        });
        await tx.projectMember.create({
          data: { projectId: p8Id, userId: u("lw.student.cyber"), role: "OWNER", status: "ACTIVE" },
        });
        createdProjects.push({ key: "lw-private-closed", id: p8Id, title: "Nghiên cứu tối ưu hóa truy vấn đồ thị quy mô vừa (Demo)" });
      }

      // =========================================================================
      // PROJECT 9 — Historical Ended Mentorship (Accepted Request + Ended Relationship + Revoked Access)
      // =========================================================================
      const p9Id = demoId("project:lw-fin-ended");
      if (!(await tx.project.findUnique({ where: { id: p9Id } }))) {
        await tx.project.create({
          data: {
            id: p9Id,
            ownerId: u("lw.student.fin"),
            createdById: u("lw.student.fin"),
            creationKey: "lw-demo-fin-ended",
            title: "Đánh giá rủi ro tín dụng vi mô bằng học máy giải thích được (Demo)",
            description: "Dự án đã hoàn thành học kỳ trước; quan hệ hướng dẫn đã kết thúc nhưng hồ sơ đóng góp lịch sử được bảo toàn.",
            researchField: "Machine Learning",
            researchAreas: ["Machine Learning", "Data Science"],
            status: "COMPLETED",
            visibility: "PRIVATE",
            mentorshipDiscovery: "CLOSED",
            mentorshipSummary: "Dự án đã hoàn thành và bảo vệ báo cáo tổng kết học kỳ.",
          },
        });
        await tx.projectMember.create({
          data: { projectId: p9Id, userId: u("lw.student.fin"), role: "OWNER", status: "ACTIVE" },
        });
        const req9Id = demoId("req:lw-fin-ended:lead");
        const rel9Id = demoId("rel:lw-fin-ended:lead");
        const acc9Id = demoId("access:lw-fin-ended:lead");
        await tx.mentorshipRequest.create({
          data: {
            id: req9Id,
            projectId: p9Id,
            mentorUserId: u("lw.mentor.lead"),
            requestedBy: u("lw.student.fin"),
            direction: "PROJECT_TO_LECTURER",
            mentorRole: "PRIMARY",
            status: "ACCEPTED",
            message: "Kính mời Thầy hướng dẫn dự án học máy giải thích được cho tín dụng vi mô.",
            respondedAt: daysAgo(120),
            idempotencyKey: "lw-demo-req-fin-ended",
          },
        });
        await tx.mentorRelationship.create({
          data: {
            id: rel9Id,
            projectId: p9Id,
            mentorUserId: u("lw.mentor.lead"),
            sourceRequestId: req9Id,
            mentorRole: "PRIMARY",
            status: "ENDED",
            startedAt: daysAgo(120),
            endedAt: daysAgo(35),
            endedById: u("lw.student.fin"),
            endReason: "Dự án đã hoàn tất báo cáo tổng kết học kỳ.",
          },
        });
        await tx.mentorAccess.create({
          data: {
            id: acc9Id,
            projectId: p9Id,
            requestId: req9Id,
            relationshipId: rel9Id,
            mentorUserId: u("lw.mentor.lead"),
            preset: "ADVISOR",
            permissions: standardProspectivePerms,
            revokedAt: daysAgo(35),
            configuredById: u("lw.student.fin"),
          },
        });
        // Historical preserved contribution after access revoked
        await tx.mentorFeedback.create({
          data: {
            id: demoId("fb:lw-fin-ended:hist"),
            projectId: p9Id,
            accessId: acc9Id,
            authorId: u("lw.mentor.lead"),
            kind: "MESSAGE",
            body: "Nhận xét tổng kết về phương pháp giải thích SHAP và tính ổn định của đặc trưng đầu vào trước khi bảo vệ đề tài.",
            creditRoles: ["SUPERVISION", "VALIDATION"],
            status: "ACCEPTED",
            handledById: u("lw.student.fin"),
            handledAt: daysAgo(40),
            clientKey: demoId("ck:fb:lw-fin-ended:hist"),
            createdAt: daysAgo(45),
          },
        });
        createdProjects.push({ key: "lw-fin-ended", id: p9Id, title: "Đánh giá rủi ro tín dụng vi mô bằng học máy giải thích được (Demo)" });
      }

      // =========================================================================
      // PROJECT 10 — Archived Project
      // =========================================================================
      const p10Id = demoId("project:lw-archived-edu");
      if (!(await tx.project.findUnique({ where: { id: p10Id } }))) {
        await tx.project.create({
          data: {
            id: p10Id,
            ownerId: u("lw.student.hci"),
            createdById: u("lw.student.hci"),
            creationKey: "lw-demo-archived-edu",
            title: "Khảo sát thói quen sử dụng công cụ trích dẫn khoa học (Demo)",
            description: "Dự án đã lưu trữ để kiểm thử trạng thái chỉ đọc trong lịch sử.",
            researchField: "Education",
            researchAreas: ["Education"],
            status: "ARCHIVED",
            visibility: "PRIVATE",
            mentorshipDiscovery: "CLOSED",
            archivedAt: daysAgo(60),
          },
        });
        await tx.projectMember.create({
          data: { projectId: p10Id, userId: u("lw.student.hci"), role: "OWNER", status: "ACTIVE" },
        });
        createdProjects.push({ key: "lw-archived-edu", id: p10Id, title: "Khảo sát thói quen sử dụng công cụ trích dẫn khoa học (Demo)" });
      }
    },
    { timeout: 60_000 },
  );

  return { createdEmails, createdProjects, password };
}

const isDirectExecution = process.argv[1]?.replace(/\\/g, "/").endsWith("seed-lecturer-workspace.ts");
if (isDirectExecution) {
  runLecturerWorkspaceSeed()
    .then(result => {
      console.log(`Lecturer Workspace demo seed complete: ${result.createdEmails.length} new account(s), ${result.createdProjects.length} new project(s).`);
      if (result.createdEmails.length > 0) {
        console.log("New demo accounts:", result.createdEmails.join(", "));
        console.log("Generated password for NEW accounts only (save locally):", result.password);
      } else {
        console.log("Idempotent rerun: existing demo accounts & decisions preserved.");
      }
      if (result.createdProjects.length > 0) {
        console.log("Created demo projects:", result.createdProjects);
      }
    })
    .catch(error => {
      console.error("Lecturer Workspace demo seed failed:", error instanceof Error ? error.message : "Unknown error");
      process.exitCode = 1;
    })
    .finally(disconnectPostgres);
}
