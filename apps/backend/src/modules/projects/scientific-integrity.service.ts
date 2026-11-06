import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CitationIntegrityItem,
  AiTransparencyItem,
  MemberCreditItem,
  AuthorshipRegistryItem,
  AccessProvenanceItem,
  ProjectIntegrityOverview,
  VerifyCitationInput,
  DeclareExternalAiInput,
  UpdateMemberCreditInput,
  ConfirmCreditInput,
  UpdateAuthorshipInput,
  ConfirmAuthorshipInput,
  CreditRole,
  ProjectSecurityEventView,
} from "@trend/shared-types";
import { creditRoles } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { withWorkspace, type WorkspaceContext } from "./workspace-access.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { sourceText } from "../workspaces/manuscript-source.js";
import { normalizeProjectDoi } from "./project-paper-identity.js";

// Input Validation Schemas
export const verifyCitationSchema = z.object({
  citationKey: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional(),
  action: z.enum(["VERIFY", "UNVERIFY"]).default("VERIFY"),
});

export const declareExternalAiSchema = z.object({
  id: z.string().uuid().optional(),
  toolName: z.string().trim().min(2).max(120),
  purpose: z.enum(["SEARCH", "OUTLINE", "SUMMARY", "LANGUAGE_POLISH", "ANALYSIS", "CODE_ASSISTANCE", "OTHER"]),
  purposeDescription: z.string().trim().min(3).max(2000),
  affectedScope: z.string().trim().max(500).optional(),
  humanOversightVerified: z.boolean().default(true),
  humanOversightNote: z.string().trim().max(2000).optional(),
});

export const updateMemberCreditSchema = z.object({
  memberUserId: z.string().uuid(),
  creditRoles: z.array(z.enum(creditRoles)).min(1, "Chọn ít nhất 1 vai trò CRediT"),
  externalContribution: z.string().trim().max(2000).optional(),
});

export const confirmCreditSchema = z.object({
  decision: z.enum(["CONFIRM", "DISPUTE"]),
  note: z.string().trim().max(2000).optional(),
});

export const updateAuthorshipSchema = z.object({
  authors: z.array(
    z.object({
      userId: z.string().uuid(),
      order: z.number().int().min(1).max(100),
      isCorresponding: z.boolean().default(false),
      creditRoles: z.array(z.enum(creditRoles)),
      rationale: z.string().trim().max(1000).optional().default(""),
    })
  ).min(1, "Cần ít nhất một tác giả dự kiến"),
  copyrightHolders: z.array(z.string().trim().max(200)).optional(),
});

export const confirmAuthorshipSchema = z.object({
  decision: z.enum(["CONFIRM", "DISPUTE"]),
  note: z.string().trim().max(2000).optional(),
});

// Helper for parsing BibTeX entries
function parseBibtexEntries(bibContent: string) {
  const entries: Map<string, { type: string; title?: string; authors?: string[]; year?: number; doi?: string; journal?: string }> = new Map();
  const entryRegex = /@([a-zA-Z]+)\s*\{\s*([^,]+),([^@]*)/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(bibContent)) !== null) {
    const type = match[1]!.toLowerCase();
    const key = match[2]!.trim();
    const body = match[3]!;

    const getField = (name: string): string | undefined => {
      const fieldRegex = new RegExp(`${name}\\s*=\\s*["{]([^"}]+)["}]`, "i");
      const m = fieldRegex.exec(body);
      return m ? m[1]!.trim() : undefined;
    };

    const title = getField("title");
    const authorStr = getField("author");
    const authors = authorStr ? authorStr.split(/\s+and\s+/i).map(a => a.trim()) : undefined;
    const yearStr = getField("year");
    const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : undefined;
    const doi = getField("doi");
    const journal = getField("journal") || getField("booktitle");

    entries.set(key, { type, title, authors, year, doi, journal });
  }

  return entries;
}

export const scientificIntegrityService = {
  async getOverview(projectId: string, actorId: string): Promise<ProjectIntegrityOverview> {
    return withWorkspace(projectId, actorId, {}, async (context) => {
      const { tx, project } = context;

      // 1. Gather all Project Members and Mentors
      const [members, mentors] = await Promise.all([
        tx.projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" } }),
        tx.mentorRelationship.findMany({ where: { projectId: project.id, status: "ACTIVE" } }),
      ]);
      const projectUsers = await tx.user.findMany({
        where: { id: { in: [...new Set([project.ownerId, ...members.map(m => m.userId), ...mentors.map(m => m.mentorUserId)])] } },
        select: { id: true, fullName: true, email: true, systemRole: true },
      });

      const userMap = new Map(projectUsers.map(u => [u.id, u]));
      const ownerUser = userMap.get(project.ownerId);

      // 2. Fetch Project Manuscripts & LaTeX Files for Citation Auditing
      const manuscripts = await tx.draftWorkspace.findMany({
        where: { projectId: project.id, writingMode: "LATEX", deletedAt: null },
      });

      const workspaceIds = manuscripts.map(m => m.id);
      const manuscriptFiles = workspaceIds.length > 0
        ? await tx.manuscriptFile.findMany({
            where: { workspaceId: { in: workspaceIds }, deletedAt: null },
          })
        : [];

      // Extract citation keys from all .tex files
      const citedOccurrences: Array<{ key: string; filePath: string; line: number }> = [];
      const bibEntriesMap: Map<string, { type: string; title?: string; authors?: string[]; year?: number; doi?: string; journal?: string }> = new Map();
      const duplicateBibKeys = new Set<string>();
      const seenBibKeys = new Set<string>();

      for (const file of manuscriptFiles) {
        if (!file.crdtState && !file.writingBaseline) continue;
        const text = file.crdtState ? sourceText(new Uint8Array(file.crdtState)) : "";
        if (!text) continue;

        if (file.path.endsWith(".bib")) {
          const parsed = parseBibtexEntries(text);
          for (const [key, val] of parsed.entries()) {
            if (seenBibKeys.has(key)) {
              duplicateBibKeys.add(key);
            }
            seenBibKeys.add(key);
            bibEntriesMap.set(key, val);
          }
        } else if (file.path.endsWith(".tex")) {
          const lines = text.split(/\r?\n/);
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex]!;
            const citeRegex = /\\[A-Za-z]*cite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/gi;
            let m: RegExpExecArray | null;
            while ((m = citeRegex.exec(lineText)) !== null) {
              const keys = m[1]!.split(",").map(k => k.trim()).filter(Boolean);
              for (const k of keys) {
                citedOccurrences.push({ key: k, filePath: file.path, line: lineIndex + 1 });
              }
            }
          }
        }
      }

      // Query Paper Library in project
      const projectLinks = await tx.projectPaper.findMany({ where: { projectId: project.id }, select: { paperId: true } });
      const projectPapers = (await tx.paper.findMany({
        where: { id: { in: projectLinks.map(link => link.paperId) } },
        select: { id: true, title: true, doi: true, publicationYear: true },
      })).map(paper => ({ paper }));

      const papersByDoi = new Map<string, (typeof projectPapers)[number]["paper"]>();
      for (const pp of projectPapers) {
        if (pp.paper?.doi) {
          papersByDoi.set(normalizeProjectDoi(pp.paper.doi), pp.paper);
        }
      }

      // Query manual citation verification records from project activities
      const citationVerificationActivities = await tx.projectActivity.findMany({
        where: {
          projectId: project.id,
          type: "CITATION_VERIFIED" as any,
        },
        orderBy: { createdAt: "desc" },
      });

      const verificationMap = new Map<string, { verifiedById: string; verifiedByName: string; verifiedAt: string; note?: string; unverified?: boolean }>();
      for (const act of citationVerificationActivities) {
        if (!act.entityId || verificationMap.has(act.entityId)) continue;
        const meta = (act.metadata ?? {}) as Record<string, unknown>;
        const actor = act.actorId ? userMap.get(act.actorId) : undefined;
        verificationMap.set(act.entityId, {
          verifiedById: act.actorId || "",
          verifiedByName: actor?.fullName || "Thành viên dự án",
          verifiedAt: act.createdAt.toISOString(),
          note: typeof meta.note === "string" ? meta.note : undefined,
          unverified: meta.action === "UNVERIFY",
        });
      }

      // Aggregate Citation Integrity Items
      const citationItemsMap = new Map<string, CitationIntegrityItem>();
      const doiPattern = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i;

      for (const occ of citedOccurrences) {
        if (citationItemsMap.has(occ.key)) continue;

        const bib = bibEntriesMap.get(occ.key);
        const isDuplicate = duplicateBibKeys.has(occ.key);
        const verification = verificationMap.get(occ.key);
        const isManuallyVerified = Boolean(verification && !verification.unverified);

        let doiStatus: CitationIntegrityItem["doiStatus"] = "NO_DOI_SUPPLIED";
        let issueKind: CitationIntegrityItem["issueKind"] = "NONE";
        let issueMessage = "Trích dẫn hợp lệ";
        let matchedPaperId: string | null = null;
        let matchedPaperTitle: string | null = null;

        if (!bib) {
          issueKind = "MISSING_FROM_BIB";
          doiStatus = "NOT_FOUND";
          issueMessage = `Khóa trích dẫn '\\cite{${occ.key}}' không có trong references.bib.`;
        } else if (isDuplicate) {
          issueKind = "DUPLICATE_KEY";
          issueMessage = `Khóa trích dẫn '${occ.key}' được khai báo nhiều lần trong file .bib.`;
        } else if (bib.doi) {
          const normDoi = normalizeProjectDoi(bib.doi);
          if (!doiPattern.test(normDoi)) {
            doiStatus = "INVALID_FORMAT";
            issueKind = "METADATA_MISMATCH";
            issueMessage = `Định dạng DOI '${bib.doi}' không đúng chuẩn quốc tế.`;
          } else {
            const matched = papersByDoi.get(normDoi);
            if (matched) {
              matchedPaperId = matched.id;
              matchedPaperTitle = matched.title;
              doiStatus = "VALID";
              issueKind = "NONE";
              issueMessage = "Đã khớp với tài liệu trong Thư viện dự án.";
            } else {
              doiStatus = "VALID";
              issueKind = "NONE";
              issueMessage = "DOI chuẩn khoa học.";
            }
          }
        } else {
          doiStatus = "NO_DOI_SUPPLIED";
          issueKind = "UNVERIFIED";
          issueMessage = "Tài liệu chưa có mã DOI. Cần nhóm kiểm tra tính hợp lệ thủ công.";
        }

        if (isManuallyVerified) {
          issueKind = "NONE";
          issueMessage = verification?.note || "Đã được xác minh thủ công bởi nhóm.";
        }

        citationItemsMap.set(occ.key, {
          key: occ.key,
          filePath: occ.filePath,
          line: occ.line,
          bibEntry: bib || null,
          matchedPaperId,
          matchedPaperTitle,
          doiStatus,
          issueKind,
          issueMessage,
          verifiedById: isManuallyVerified ? verification?.verifiedById : null,
          verifiedByName: isManuallyVerified ? verification?.verifiedByName : null,
          verifiedAt: isManuallyVerified ? verification?.verifiedAt : null,
          verificationNote: isManuallyVerified ? verification?.note : null,
        });
      }

      const citationItems = Array.from(citationItemsMap.values());
      const brokenCount = citationItems.filter(c => c.issueKind === "MISSING_FROM_BIB" || c.issueKind === "DUPLICATE_KEY").length;
      const mismatchedCount = citationItems.filter(c => c.issueKind === "METADATA_MISMATCH").length;
      const unverifiedCount = citationItems.filter(c => c.issueKind === "UNVERIFIED").length;
      const validCount = citationItems.filter(c => c.issueKind === "NONE").length;

      // 3. AI Transparency & Activity Logs
      const aiRuns = await tx.aiRun.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

      const manualAiActivities = await tx.projectActivity.findMany({
        where: {
          projectId: project.id,
          type: "EXTERNAL_AI_DECLARED" as any,
        },
        orderBy: { createdAt: "desc" },
      });

      const manualDeclarations: AiTransparencyItem[] = [];
      const seenAiIds = new Set<string>();

      for (const act of manualAiActivities) {
        const id = act.entityId || act.id;
        if (seenAiIds.has(id)) continue;
        seenAiIds.add(id);

        const meta = (act.metadata ?? {}) as Record<string, unknown>;
        if (meta.active === false) continue;

        const actor = act.actorId ? userMap.get(act.actorId) : undefined;
        manualDeclarations.push({
          id,
          source: "MANUAL_EXTERNAL",
          toolName: String(meta.toolName || "External AI Tool"),
          userId: act.actorId || "",
          userName: actor?.fullName || "Thành viên",
          purpose: (meta.purpose as any) || "OTHER",
          purposeDescription: String(meta.purposeDescription || ""),
          affectedScope: typeof meta.affectedScope === "string" ? meta.affectedScope : null,
          humanOversightVerified: Boolean(meta.humanOversightVerified ?? true),
          verifiedById: act.actorId || null,
          verifiedByName: actor?.fullName || null,
          verifiedAt: act.createdAt.toISOString(),
          verificationNote: typeof meta.humanOversightNote === "string" ? meta.humanOversightNote : null,
          createdAt: act.createdAt.toISOString(),
        });
      }

      const platformAiItems: AiTransparencyItem[] = aiRuns.map(run => {
        const user = userMap.get(run.ownerId);
        let purpose: AiTransparencyItem["purpose"] = "OTHER";
        let purposeDesc = "Hỗ trợ nghiên cứu học thuật";

        if (run.jobType.includes("writing")) {
          purpose = "LANGUAGE_POLISH";
          purposeDesc = "Hỗ trợ diễn đạt và kiểm tra ngữ pháp LaTeX";
        } else if (run.jobType.includes("screening")) {
          purpose = "ANALYSIS";
          purposeDesc = "Phân tích tiêu đề và tóm tắt theo tiêu chí sàng lọc";
        } else if (run.jobType.includes("gap")) {
          purpose = "SEARCH";
          purposeDesc = "Tìm kiếm khoảng trống nghiên cứu";
        } else if (run.jobType.includes("pre_review") || run.jobType.includes("report")) {
          purpose = "SUMMARY";
          purposeDesc = "Tóm tắt và phân tích đánh giá sơ bộ bản thảo";
        }

        return {
          id: run.id,
          source: "PLATFORM",
          toolName: `LumiGap AI (${run.jobType})`,
          userId: run.ownerId,
          userName: user?.fullName || "Thành viên",
          purpose,
          purposeDescription: purposeDesc,
          affectedScope: "Hệ thống LumiGap",
          humanOversightVerified: run.status === "completed",
          verifiedById: run.ownerId,
          verifiedByName: user?.fullName || null,
          verifiedAt: run.completedAt?.toISOString() || null,
          verificationNote: "Kết quả đã được người dùng kiểm tra trước khi áp dụng.",
          createdAt: run.createdAt.toISOString(),
        };
      });

      const allAiItems = [...manualDeclarations, ...platformAiItems];
      const unverifiedAiCount = allAiItems.filter(i => !i.humanOversightVerified).length;

      // Generate AI Declaration Statement
      const declarationSummaryMarkdown = [
        "### Khai báo sử dụng AI trong nghiên cứu (COPE / ICMJE Declaration)",
        "",
        allAiItems.length === 0
          ? "Các tác giả xác nhận **không sử dụng** công cụ trí tuệ nhân tạo tạo sinh (Generative AI) trong việc soạn thảo và phân tích nội dung nghiên cứu này."
          : "Các tác giả xác nhận có sử dụng các công cụ trí tuệ nhân tạo với mục đích hỗ trợ sau đây, và cam kết con người chịu trách nhiệm hoàn toàn về độ chính xác và tính xác thực của nội dung:",
        "",
        ...allAiItems.map(item =>
          `- **${item.toolName}** (${item.purpose}): ${item.purposeDescription}${item.affectedScope ? ` (Phạm vi: ${item.affectedScope})` : ""}. *Người chịu trách nhiệm kiểm chứng: ${item.userName}*.`
        ),
        "",
        "> [!NOTE]",
        "> AI không được công nhận là tác giả hoặc đồng tác giả. Mọi lập luận, số liệu và trích dẫn đều đã được nhóm tác giả kiểm chứng độc lập.",
      ].join("\n");

      // 4. CRediT Contributions & Authorship Registry
      // Get stored credit & authorship from project activities
      const creditActivities = await tx.projectActivity.findMany({
        where: { projectId: project.id, type: "MEMBER_CREDIT_UPDATED" as any },
        orderBy: { createdAt: "desc" },
      });
      const memberCreditMap = new Map<string, { creditRoles: CreditRole[]; external?: string }>();
      for (const act of creditActivities) {
        if (!act.entityId || memberCreditMap.has(act.entityId)) continue;
        const m = (act.metadata ?? {}) as any;
        if (Array.isArray(m.creditRoles)) {
          memberCreditMap.set(act.entityId, { creditRoles: m.creditRoles, external: m.externalContribution });
        }
      }

      const creditConfirmations = await tx.projectActivity.findMany({
        where: { projectId: project.id, type: "CREDIT_ROLES_CONFIRMED" as any },
        orderBy: { createdAt: "desc" },
      });
      const confirmedUserMap = new Map<string, { decision: "CONFIRM" | "DISPUTE"; note?: string; date: string }>();
      for (const act of creditConfirmations) {
        if (!act.entityId || confirmedUserMap.has(act.entityId)) continue;
        const m = (act.metadata ?? {}) as any;
        confirmedUserMap.set(act.entityId, {
          decision: m.decision === "DISPUTE" ? "DISPUTE" : "CONFIRM",
          note: m.note,
          date: act.createdAt.toISOString(),
        });
      }

      // Authorship updates
      const latestAuthorshipAct = await tx.projectActivity.findFirst({
        where: { projectId: project.id, type: "AUTHORSHIP_UPDATED" as any },
        orderBy: { createdAt: "desc" },
      });
      const savedAuthorship = (latestAuthorshipAct?.metadata ?? {}) as any;
      const savedAuthorsList: Array<{ userId: string; order: number; isCorresponding: boolean; creditRoles: CreditRole[]; rationale?: string }> =
        Array.isArray(savedAuthorship.authors) ? savedAuthorship.authors : [];

      // Query Evidence: Completed tasks & screened papers
      const [tasksGroup, papersScreenedGroup] = await Promise.all([
        tx.projectTask.groupBy({
          by: ["assigneeId"],
          where: { projectId: project.id, status: "DONE", deletedAt: null },
          _count: { _all: true },
        }),
        tx.projectPaper.groupBy({
          by: ["screenedById"],
          where: { projectId: project.id, screenedById: { not: null } },
          _count: { _all: true },
        }),
      ]);

      const tasksMap = new Map(tasksGroup.map(g => [g.assigneeId, g._count._all]));
      const screenedMap = new Map(papersScreenedGroup.map(g => [g.screenedById, g._count._all]));

      // Build Member Credit Items
      const allProjectPeople = [
        ...(ownerUser ? [{ ...ownerUser, role: "OWNER" as const }] : []),
        ...members.filter(m => m.userId !== project.ownerId).map(m => ({
          ...(userMap.get(m.userId) || { id: m.userId, fullName: "Thành viên", email: "", systemRole: "USER" }),
          role: "MEMBER" as const,
        })),
        ...mentors.map(m => ({
          ...(userMap.get(m.mentorUserId) || { id: m.mentorUserId, fullName: "Mentor", email: "", systemRole: "LECTURER" }),
          role: "ADVISOR" as const,
        })),
      ];

      const memberCreditItems: MemberCreditItem[] = allProjectPeople.map(p => {
        const stored = memberCreditMap.get(p.id);
        const confirm = confirmedUserMap.get(p.id);
        const defaultRoles: CreditRole[] = p.role === "OWNER"
          ? ["PROJECT_ADMINISTRATION", "CONCEPTUALIZATION"]
          : p.role === "ADVISOR"
          ? ["SUPERVISION"]
          : ["INVESTIGATION", "DATA_CURATION"];

        return {
          userId: p.id,
          name: p.fullName || "Nghiên cứu viên",
          email: p.email,
          role: p.role,
          creditRoles: stored?.creditRoles || defaultRoles,
          systemEvidence: {
            tasksCompleted: tasksMap.get(p.id) || 0,
            wordsWritten: 0,
            papersScreened: screenedMap.get(p.id) || 0,
            activeDays: 1,
          },
          externalContribution: stored?.external || null,
          confirmationStatus: confirm ? confirm.decision === "CONFIRM" ? "CONFIRMED" : "DISPUTED" : "PENDING",
          confirmedAt: confirm?.date || null,
          confirmationNote: confirm?.note || null,
        };
      });

      // Build Authorship Registry
      const authorshipItems: AuthorshipRegistryItem[] = savedAuthorsList.length > 0
        ? savedAuthorsList.map(a => {
            const user = userMap.get(a.userId);
            const confirm = confirmedUserMap.get(a.userId);
            return {
              userId: a.userId,
              name: user?.fullName || "Tác giả",
              email: user?.email || "",
              order: a.order,
              isCorresponding: Boolean(a.isCorresponding),
              creditRoles: a.creditRoles || [],
              rationale: a.rationale || "Đóng góp quan trọng vào bản thảo nghiên cứu.",
              confirmationStatus: confirm ? confirm.decision === "CONFIRM" ? "CONFIRMED" : "DISPUTED" : "PENDING",
              confirmationNote: confirm?.note || null,
              confirmedAt: confirm?.date || null,
            };
          })
        : memberCreditItems.filter(m => m.role !== "ADVISOR").map((m, idx) => ({
            userId: m.userId,
            name: m.name,
            email: m.email,
            order: idx + 1,
            isCorresponding: idx === 0,
            creditRoles: m.creditRoles,
            rationale: idx === 0 ? "Tác giả chính (Lead author)" : "Đồng tác giả nghiên cứu (Co-author)",
            confirmationStatus: m.confirmationStatus,
            confirmationNote: m.confirmationNote,
            confirmedAt: m.confirmedAt,
          }));

      const allConfirmed = memberCreditItems.every(m => m.confirmationStatus === "CONFIRMED");

      // 5. Access Permissions & Provenance Audit
      const accessRoles: AccessProvenanceItem[] = allProjectPeople.map(p => {
        const isAuthor = authorshipItems.some(a => a.userId === p.id);
        const isOwner = p.role === "OWNER";
        const isMentor = p.role === "ADVISOR";

        return {
          userId: p.id,
          name: p.fullName || "Thành viên",
          email: p.email,
          systemRole: p.systemRole,
          projectRole: isOwner ? "OWNER" : isAuthor ? "AUTHOR" : isMentor ? "MENTOR" : "CONTRIBUTOR",
          documentPermissions: {
            canViewManuscript: true,
            canEditManuscript: isOwner || p.role === "MEMBER",
            canComment: true,
            mentorScope: isMentor ? "Chỉ truy cập bản thảo snapshot & tài liệu hỗ trợ được chia sẻ" : null,
          },
          copyrightHolder: isOwner,
        };
      });

      // Security Overview & Audit Events
      const securityOverview = await researchLedgerService.getProjectSecurityOverview(project.id, actorId, 20);
      const openDisputesCount = await tx.researchIntegrityCase.count({
        where: {
          projectId: project.id,
          status: { in: ["REPORTED", "UNDER_REVIEW", "CONTAINED"] },
        },
      });

      // 6. Pre-Submission Checklist
      const citationsReady = brokenCount === 0;
      const citationsWarning = brokenCount > 0
        ? `Có ${brokenCount} trích dẫn thiếu khóa trong references.bib.`
        : unverifiedCount > 0
        ? `Có ${unverifiedCount} nguồn chưa có DOI cần kiểm tra thủ công trước khi nộp chính thức.`
        : null;

      const aiDeclarationsReady = unverifiedAiCount === 0;
      const aiWarning = unverifiedAiCount > 0
        ? `Có ${unverifiedAiCount} hoạt động AI chưa được thành viên phụ trách xác nhận kiểm chứng.`
        : null;

      const authorshipReady = authorshipItems.length > 0;
      const authorshipWarning = !authorshipReady
        ? "Chưa xác định danh sách tác giả dự kiến."
        : !allConfirmed
        ? "Một số thành viên chưa xác nhận vai trò đóng góp CRediT."
        : null;

      const accessReady = true;
      const accessWarning = null;

      const readyForOfficialSubmission = citationsReady && aiDeclarationsReady && authorshipReady;

      return {
        projectId: project.id,
        projectTitle: project.title,
        citations: {
          totalCount: citationItems.length,
          validCount,
          brokenCount,
          mismatchedCount,
          unverifiedCount,
          items: citationItems,
        },
        aiTransparency: {
          platformRunsCount: platformAiItems.length,
          manualDeclarationsCount: manualDeclarations.length,
          unverifiedCount: unverifiedAiCount,
          items: allAiItems,
          declarationSummaryMarkdown,
        },
        contributions: {
          members: memberCreditItems,
          authors: authorshipItems,
          allConfirmed,
        },
        access: {
          roles: accessRoles,
          recentEvents: securityOverview.recentEvents,
          openDisputesCount,
        },
        submissionChecklist: {
          citationsReady,
          citationsWarning,
          aiDeclarationsReady,
          aiWarning,
          authorshipReady,
          authorshipWarning,
          accessReady,
          accessWarning,
          readyForOfficialSubmission,
        },
      };
    });
  },

  async verifyCitation(projectId: string, actorId: string, input: VerifyCitationInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;
      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "CITATION_VERIFIED" as any,
          entityKind: "CITATION",
          entityId: input.citationKey,
          metadata: {
            citationKey: input.citationKey,
            action: input.action,
            note: input.note || null,
            verifiedAt: new Date().toISOString(),
          },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "CITATION_VERIFIED",
        resourceKind: "CITATION",
        resourceId: input.citationKey,
        reason: input.note || (input.action === "VERIFY" ? "Xác minh trích dẫn tài liệu" : "Hủy xác minh trích dẫn"),
        metadata: { citationKey: input.citationKey, action: input.action },
      });

      return act;
    });
  },

  async declareExternalAi(projectId: string, actorId: string, input: DeclareExternalAiInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;
      const declarationId = input.id || randomUUID();

      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "EXTERNAL_AI_DECLARED" as any,
          entityKind: "AI_DECLARATION",
          entityId: declarationId,
          metadata: {
            toolName: input.toolName,
            purpose: input.purpose,
            purposeDescription: input.purposeDescription,
            affectedScope: input.affectedScope || null,
            humanOversightVerified: input.humanOversightVerified,
            humanOversightNote: input.humanOversightNote || null,
            active: true,
          },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "EXTERNAL_AI_DECLARED",
        resourceKind: "AI_DECLARATION",
        resourceId: declarationId,
        reason: `Khai báo sử dụng AI: ${input.toolName} (${input.purpose})`,
        metadata: { toolName: input.toolName, purpose: input.purpose },
      });

      return act;
    });
  },

  async deleteExternalAi(projectId: string, actorId: string, declarationId: string) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;
      return tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "EXTERNAL_AI_DECLARED" as any,
          entityKind: "AI_DECLARATION",
          entityId: declarationId,
          metadata: { active: false },
        },
      });
    });
  },

  async updateMemberCredit(projectId: string, actorId: string, input: UpdateMemberCreditInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;

      if (context.role !== "OWNER" && actorId !== input.memberUserId) {
        throw AppError.forbidden("Chỉ chủ dự án hoặc chính thành viên mới được chỉnh sửa vai trò đóng góp");
      }

      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "MEMBER_CREDIT_UPDATED" as any,
          entityKind: "CREDIT_ROLES",
          entityId: input.memberUserId,
          metadata: {
            creditRoles: input.creditRoles,
            externalContribution: input.externalContribution || null,
          },
        },
      });

      // Create Task for the member if updated by owner
      if (context.role === "OWNER" && actorId !== input.memberUserId) {
        const clientKey = randomUUID();
        await tx.projectTask.upsert({
          where: {
            projectId_createdById_clientKey: {
              projectId: project.id,
              createdById: actorId,
              clientKey,
            },
          },
          create: {
            projectId: project.id,
            title: "Xác nhận vai trò đóng góp CRediT cho nghiên cứu",
            description: "Chủ dự án đã đề xuất các vai trò CRediT. Vui lòng kiểm tra và xác nhận vai trò của bạn.",
            status: "TODO",
            assigneeId: input.memberUserId,
            createdById: actorId,
            clientKey,
          },
          update: {},
        });
      }

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "MEMBER_CREDIT_UPDATED",
        resourceKind: "CREDIT_ROLES",
        resourceId: input.memberUserId,
        reason: `Cập nhật vai trò CRediT (${input.creditRoles.length} vai trò)`,
        metadata: { creditRoles: input.creditRoles },
      });

      return act;
    });
  },

  async confirmCredit(projectId: string, actorId: string, input: ConfirmCreditInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;

      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "CREDIT_ROLES_CONFIRMED" as any,
          entityKind: "CREDIT_CONFIRMATION",
          entityId: actorId,
          metadata: {
            decision: input.decision,
            note: input.note || null,
          },
        },
      });

      // Mark any related CRediT confirmation task as done
      await tx.projectTask.updateMany({
        where: {
          projectId: project.id,
          assigneeId: actorId,
          title: { contains: "vai trò đóng góp CRediT" },
          status: "TODO",
        },
        data: {
          status: "DONE",
          completedAt: new Date(),
          completedById: actorId,
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "CREDIT_ROLES_CONFIRMED",
        resourceKind: "CREDIT_CONFIRMATION",
        resourceId: actorId,
        reason: input.decision === "CONFIRM" ? "Xác nhận vai trò đóng góp CRediT" : `Bất đồng vai trò đóng góp: ${input.note || ""}`,
        metadata: { decision: input.decision },
      });

      return act;
    });
  },

  async updateAuthorship(projectId: string, actorId: string, input: UpdateAuthorshipInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;

      if (context.role !== "OWNER") {
        throw AppError.forbidden("Chỉ chủ dự án mới có quyền quản lý danh sách và thứ tự tác giả dự kiến");
      }

      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "AUTHORSHIP_UPDATED" as any,
          entityKind: "AUTHORSHIP",
          entityId: project.id,
          metadata: {
            authors: input.authors,
            copyrightHolders: input.copyrightHolders || [],
          },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "AUTHORSHIP_UPDATED",
        resourceKind: "AUTHORSHIP",
        resourceId: project.id,
        reason: `Cập nhật danh sách ${input.authors.length} tác giả dự kiến`,
        metadata: { authorCount: input.authors.length },
      });

      return act;
    });
  },

  async confirmAuthorship(projectId: string, actorId: string, input: ConfirmAuthorshipInput) {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;

      const act = await tx.projectActivity.create({
        data: {
          projectId: project.id,
          actorId,
          type: "AUTHORSHIP_CONFIRMED" as any,
          entityKind: "AUTHORSHIP_CONFIRMATION",
          entityId: actorId,
          metadata: {
            decision: input.decision,
            note: input.note || null,
          },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId,
        eventType: "AUTHORSHIP_CONFIRMED",
        resourceKind: "AUTHORSHIP_CONFIRMATION",
        resourceId: actorId,
        reason: input.decision === "CONFIRM" ? "Đồng thuận phiên bản bản thảo và danh sách tác giả" : `Bất đồng về quyền tác giả: ${input.note || ""}`,
        metadata: { decision: input.decision },
      });

      return act;
    });
  },
};
