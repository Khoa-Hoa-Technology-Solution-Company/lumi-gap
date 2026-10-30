import type { ScreeningBoard, ScreeningMetrics, ScreeningChoice } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { withWorkspace, workspaceId, jsonSnapshot, expectWorkspaceVersion, assertWorkspaceAssignee } from "./workspace-access.js";
import { researchPaper } from "./project-evidence.service.js";
import { balancedReviewers, cohenKappa, screeningConsensus } from "./screening.calculator.js";
import { effectiveAssignments, projectScreeningStatus, recomputeScreening, roundView, roundSettings, screeningCommand, screeningPeople, screeningRound, screeningSettings } from "./screening-context.js";
import { screeningConfigSchema, screeningResolveSchema } from "./dto/screening.schema.js";
import type * as s from "./dto/screening.schema.js";
import { assessmentContext, meaningfulLegacyScreening } from "./screening-review-context.js";

type Page = Omit<z.infer<typeof s.screeningPageSchema>, "sort"> & { sort?: "newest" | "oldest" | "title" | "year" };
export const screeningService = {
  async config(project: string, actor: string) { return withWorkspace(project, actor, {}, async c => ({ settings: await screeningSettings(c), canManage: c.role === "OWNER", people: await screeningPeople(c) })); },
  async configure(project: string, actor: string, raw: z.input<typeof s.screeningConfigSchema>) {
    const input = screeningConfigSchema.parse(raw);
    return screeningCommand(project, actor, "CONFIGURED", input, { owner: true }, async c => {
      const previous = await screeningSettings(c); expectWorkspaceVersion(previous.version, input.expectedVersion);
      const { clientKey: _key, expectedVersion: _version, ...data } = input;
      const row = await c.tx.screeningSettings.upsert({ where: { projectId: c.project.id }, create: { projectId: c.project.id, ...data }, update: { ...data, version: { increment: 1 } } });
      // Legacy votes have no round snapshot. Never unblind them by changing future-round settings.
      await c.tx.project.update({ where: { id: c.project.id }, data: { screeningMode: "INDEPENDENT", screeningBlinded: true, inclusionCriteria: data.inclusionCriteria, exclusionCriteria: data.exclusionCriteria, version: { increment: 1 } } });
      return { result: { version: row.version }, details: { ...data, version: row.version, appliesTo: "FUTURE_ROUNDS" } };
    });
  },
  async start(project: string, actor: string, input: z.infer<typeof s.screeningStartSchema>) {
    return screeningCommand(project, actor, "ROUND_STARTED", input, { owner: true }, async c => {
      const settings = await screeningSettings(c), roundIds: string[] = [];
      if (settings.reviewMode !== "COLLABORATIVE" && settings.stages?.length && !settings.stages.includes(input.phase)) throw AppError.badRequest("Giai đoạn này không nằm trong quy trình đã chọn");
      for (const paperId of [...input.paperIds].sort()) {
        const link = await researchPaper(c, paperId);
        const previous = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId }, orderBy: { number: "desc" } });
        if (previous && !["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(previous.status)) throw AppError.conflict("Hoàn thành vòng hiện tại trước khi mở vòng mới");
        if (settings.reviewMode !== "COLLABORATIVE" && input.phase === "FULL_TEXT" && settings.stages?.includes("TITLE_ABSTRACT") && !(previous?.phase === "TITLE_ABSTRACT" && previous.status === "INCLUDED") && previous?.phase !== "FULL_TEXT") throw AppError.conflict("Hoàn thành lựa chọn ở giai đoạn tiêu đề / tóm tắt trước khi đánh giá toàn văn");
        if ((previous || ["INCLUDED", "EXCLUDED"].includes(link.screeningStatus)) && !input.confirmRescreen) throw AppError.conflict("Cần xác nhận đánh giá lại; kết quả cũ vẫn được giữ trong lịch sử");
        if (!previous && meaningfulLegacyScreening({ ...link, status: link.screeningStatus })) await c.tx.screeningLegacyRecord.upsert({ where: { projectId_paperId: { projectId: c.project.id, paperId } }, create: { projectId: c.project.id, paperId, snapshot: jsonSnapshot({ provenance: "PRE_PROTOCOL_STATUS", status: link.screeningStatus, screenedById: link.screenedById, screenedAt: link.screenedAt, inclusionReason: link.inclusionReason, exclusionReason: link.exclusionReason, exclusionNote: link.exclusionNote }) }, update: {} });
        if (previous) await c.tx.screeningRound.update({ where: { id: previous.id }, data: { active: false, version: { increment: 1 } } });
        const row = await c.tx.screeningRound.create({ data: { projectId: c.project.id, paperId, phase: input.phase, number: (previous?.number ?? 0)+1, settings: jsonSnapshot(settings), createdById: c.actorId } });
        await projectScreeningStatus(c, row, "NOT_REVIEWED"); roundIds.push(row.id);
      }
      await c.tx.project.update({ where: { id: c.project.id }, data: { screeningMode: "INDEPENDENT", screeningBlinded: true, version: { increment: 1 } } });
      return { result: { roundIds } };
    });
  },
  async assign(project: string, actor: string, input: z.infer<typeof s.screeningAssignSchema>) {
    // Discover then lock candidate accounts before the project lock, matching membership lock order.
    const candidates = input.mode === "AUTO" ? await withWorkspace(project, actor, {}, screeningPeople) : input.reviewerIds.map(id => ({ id, name: "" }));
    return screeningCommand(project, actor, "ASSIGNED", input, { owner: true, accounts: candidates.map(p => p.id) }, async c => {
      const livePeople = new Set((await screeningPeople(c)).map(p => p.id)), eligible = candidates.map(p => p.id).filter(id => livePeople.has(id));
      if (input.mode === "MANUAL" && eligible.length !== input.reviewerIds.length) throw AppError.badRequest("Chỉ phân công thành viên đang hoạt động");
      const activeRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true }, select: { id: true } });
      const assignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: { in: activeRounds.map(r => r.id) }, active: true } });
      const loads = new Map<string, { pending: number; total: number }>();
      const roundAudits: { roundId: string; details: unknown }[] = [];
      for (const a of assignments) { const load = loads.get(a.reviewerId) ?? { pending: 0, total: 0 }; load.total++; if (!a.submittedAt) load.pending++; loads.set(a.reviewerId, load); }
      for (const roundId of [...input.roundIds].sort()) {
        const round = await screeningRound(c, roundId), settings = roundSettings(round.settings);
        if (!round.active || (round.unblindedAt && !["NOT_REVIEWED", "IN_REVIEW"].includes(round.status))) throw AppError.conflict("Không thay phân công sau khi vòng đã công bố phiếu");
        const existing = await effectiveAssignments(c, roundId), submitted = existing.filter(a => a.submittedAt);
        const selected = input.mode === "AUTO" ? balancedReviewers(eligible, existing.map(a => a.reviewerId), settings.requiredReviewers, loads) : [...new Set([...input.reviewerIds, ...submitted.map(a => a.reviewerId)])];
        if (selected.length < settings.requiredReviewers || selected.length > 10) throw AppError.badRequest(`Cần từ ${settings.requiredReviewers} đến 10 người đánh giá khác nhau`);
        if (settings.reviewMode === "SIMPLE" && selected.length !== 1) throw AppError.badRequest("Simple Review chỉ phân công một reviewer");
        if (submitted.some(a => !selected.includes(a.reviewerId))) throw AppError.conflict("Không được hủy phân công đã có phiếu gửi");
        const all = await c.tx.screeningAssignment.findMany({ where: { roundId, projectId: c.project.id } });
        roundAudits.push({ roundId, details: { mode: input.mode, previousAssignments: all.filter(a => a.active), reviewerIds: selected, dueAtForUnfinished: input.dueAt, ruleVersion: settings.version } });
        for (const a of all.filter(a => a.active && !selected.includes(a.reviewerId))) await c.tx.screeningAssignment.update({ where: { id: a.id }, data: { active: false } });
        for (const reviewerId of selected) {
          const old = all.find(a => a.reviewerId === reviewerId);
          if (old?.submittedAt) continue;
          await assertWorkspaceAssignee(c, reviewerId);
          await c.tx.screeningAssignment.upsert({ where: { roundId_reviewerId: { roundId, reviewerId } }, create: { projectId: c.project.id, roundId, reviewerId, dueAt: input.dueAt ? new Date(input.dueAt) : null }, update: { active: true, dueAt: input.dueAt ? new Date(input.dueAt) : null } });
        }
        await recomputeScreening(c, round);
      }
      return { result: { roundIds: input.roundIds }, roundAudits };
    });
  },
  async submit(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningSubmitSchema>) {
    return screeningCommand(project, actor, "REVIEW_SUBMITTED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      if (!row.active || ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)) throw AppError.conflict("Vòng sàng lọc đã kết thúc");
      const assignment = await c.tx.screeningAssignment.findFirst({ where: { id: input.assignmentId, roundId, projectId: c.project.id, reviewerId: c.actorId, active: true } });
      if (!assignment) throw AppError.forbidden("Bạn không được phân công đánh giá bài này");
      expectWorkspaceVersion(assignment.revision, input.expectedRevision);
      if (assignment.submittedAt) throw AppError.conflict("Phiếu đã khóa. Chủ dự án cần mở lại để sửa");
      const context = await assessmentContext(c, input, row.phase as "TITLE_ABSTRACT" | "FULL_TEXT", false);
      const review = await c.tx.screeningReview.create({ data: { projectId: c.project.id, assignmentId: assignment.id, revision: assignment.revision, decision: input.decision, exclusionReason: input.decision === "EXCLUDE" ? input.exclusionReason : "", comment: input.comment, ...context } });
      await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: review.submittedAt } });
      const next = await recomputeScreening(c, row);
      return { roundId, result: { roundId, version: next.version }, details: { assignmentId: assignment.id, reviewId: review.id, reviewerId: c.actorId, revision: review.revision } };
    });
  },
  async resolve(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningResolveSchema>) {
    input = screeningResolveSchema.parse(input);
    return screeningCommand(project, actor, "FINALIZED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      if (c.actorId !== (row.finalizerId ?? c.project.ownerId)) throw AppError.forbidden("Chỉ người được phân công chốt mới có quyền ghi quyết định cuối");
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || !["AWAITING_FINALIZATION", "NEEDS_RESOLUTION"].includes(row.status) || !row.unblindedAt) throw AppError.conflict("Chỉ chốt sau khi hoàn thành tất cả phiếu");
      const view = await roundView(c, row);
      if (view.assigned < view.settings.requiredReviewers || view.completed !== view.assigned) throw AppError.conflict("Chờ tất cả người được phân công gửi phiếu");
      if (view.settings.reviewMode !== "COLLABORATIVE" && view.reviews.some(r => r.decision === "UNSURE")) throw AppError.conflict("Còn phiếu chưa đủ thông tin. Bổ sung minh chứng và mở lại phiếu trước khi chốt");
      const unanimous = view.reviews.every(r => r.decision === (input.decision === "INCLUDED" ? "INCLUDE" : "EXCLUDE"));
      if (view.settings.reviewMode !== "COLLABORATIVE" && !unanimous && view.settings.resolutionPolicy !== "ADJUDICATION") throw AppError.conflict("Quy tắc yêu cầu reviewer thống nhất quyết định. Thảo luận rồi mở lại phiếu cần cập nhật");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { status: input.decision, version: { increment: 1 } } });
      await c.tx.screeningFinalDecision.create({ data: { projectId: c.project.id, roundId, roundVersion: next.version, decision: input.decision, source: "MANUAL", reason: input.reason, resolverId: c.actorId, reviewIds: view.reviews.map(r => r.id) } });
      await projectScreeningStatus(c, row, input.decision, input.reason, c.actorId);
      return { roundId, result: { roundId, version: next.version }, details: { ...input, version: next.version, ruleVersion: view.settings.version, reviewIds: view.reviews.map(r => r.id) } };
    });
  },
  async finalizer(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningFinalizerSchema>) {
    return screeningCommand(project, actor, "FINALIZER_ASSIGNED", { ...input, roundId }, { owner: true, accounts: [input.finalizerId] }, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)) throw AppError.conflict("Chỉ giao người chốt khi vòng chưa có kết quả cuối");
      await assertWorkspaceAssignee(c, input.finalizerId);
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { finalizerId: input.finalizerId, version: { increment: 1 } } });
      return { roundId, result: { roundId, version: next.version }, details: { ...input, previousFinalizerId: row.finalizerId ?? c.project.ownerId } };
    });
  },
  async proposal(project: string, actor: string, paperId: string, input: z.infer<typeof s.screeningProposalSchema>) {
    return screeningCommand(project, actor, "PROPOSAL_REASON_UPDATED", { ...input, paperId }, {}, async c => {
      const link = await researchPaper(c, paperId);
      if (link.addedById !== c.actorId) throw AppError.forbidden("Chỉ người đề xuất được sửa lý do đề xuất của mình");
      if (link.updatedAt.toISOString() !== input.expectedUpdatedAt) throw AppError.conflict("Thông tin bài đã thay đổi, tải lại trước khi lưu");
      const updated = await c.tx.projectPaper.update({ where: { id: link.id }, data: { proposalReason: input.reason, updatedAt: new Date(Math.max(Date.now(), link.updatedAt.getTime()+1)) } });
      return { result: { id: link.id, updatedAt: updated.updatedAt.toISOString() }, details: { paperId, before: link.proposalReason, reason: input.reason } };
    });
  },
  async unblind(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningActionSchema>) {
    return screeningCommand(project, actor, "EARLY_UNBLIND", { ...input, roundId }, { owner: true }, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      if (roundSettings(row.settings).blindReview) throw AppError.conflict("Cần hoàn thành tất cả phiếu trước khi công bố theo quy tắc đã lưu");
      if (!row.active || row.unblindedAt) throw AppError.conflict("Vòng đã công bố phiếu hoặc không còn hoạt động");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { unblindedAt: new Date(), independenceCompromised: true, version: { increment: 1 } } });
      return { roundId, result: { roundId, version: next.version } };
    });
  },
  async reopen(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningReopenSchema>) {
    const assignee = await getPrisma().screeningAssignment.findUnique({ where: { id: input.assignmentId }, select: { reviewerId: true } });
    return screeningCommand(project, actor, "REVIEW_REOPENED", { ...input, roundId }, { owner: true, accounts: assignee ? [assignee.reviewerId] : [] }, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      const assignment = await c.tx.screeningAssignment.findFirst({ where: { id: input.assignmentId, roundId, projectId: c.project.id, active: true } });
      if (!row.active || !assignment?.submittedAt) throw AppError.conflict("Chỉ mở lại phiếu đã gửi trong vòng hiện tại");
      await assertWorkspaceAssignee(c, assignment.reviewerId);
      await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: null, revision: { increment: 1 } } });
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { status: "IN_REVIEW", independenceCompromised: row.independenceCompromised || Boolean(row.unblindedAt), version: { increment: 1 } } });
      await projectScreeningStatus(c, row, "IN_REVIEW");
      return { roundId, result: { roundId, version: next.version }, details: { ...input, reviewerId: assignment.reviewerId, previousRevision: assignment.revision } };
    });
  },
  async comment(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningCommentSchema>) {
    return screeningCommand(project, actor, "DISCUSSION", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      if (!row.active || (roundSettings(row.settings).blindReview && !row.unblindedAt)) throw AppError.conflict("Thảo luận chỉ mở sau khi công bố đánh giá độc lập");
      return { roundId, result: { roundId }, details: { comment: input.comment } };
    });
  },
  async detail(project: string, actor: string, roundId: string) { return withWorkspace(project, actor, {}, async c => roundView(c, await screeningRound(c, roundId))); },
  async board(project: string, actor: string, query: Page): Promise<ScreeningBoard> {
    return withWorkspace(project, actor, {}, async c => {
      const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true }, select: { id: true, paperId: true, status: true } });
      const mine = query.filter !== "ALL" && query.filter !== "CONFLICT" ? await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, reviewerId: c.actorId, active: true, ...(query.filter === "COMPLETED" ? { submittedAt: { not: null } } : ["PENDING", "OVERDUE"].includes(query.filter) ? { submittedAt: null } : {}), ...(query.filter === "OVERDUE" ? { dueAt: { lt: new Date() } } : {}) }, select: { roundId: true } }) : null;
      const roundIds = mine ? new Set(mine.map(a => a.roundId)) : null;
      const paperIds = query.filter === "CONFLICT" ? rounds.filter(r => r.status === "NEEDS_RESOLUTION").map(r => r.paperId) : roundIds ? rounds.filter(r => roundIds.has(r.id)).map(r => r.paperId) : null;
      const allLinks = await c.tx.projectPaper.findMany({ where: { projectId: c.project.id }, select: { paperId: true, screeningStatus: true, addedById: true, tags: true, notes: true } });
      const allAssignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, active: true, roundId: { in: rounds.map(r => r.id) } }, select: { roundId: true, reviewerId: true, submittedAt: true } });
      const source = query.source ? await c.tx.paper.findUnique({ where: workspaceId(query.source), select: { id: true } }) : null;
      const linkedIds = allLinks.map(l => l.paperId);
      const relatedMatches = query.q ? await Promise.all([
        c.tx.paperAuthor.findMany({ where: { paperId: { in: linkedIds }, displayName: { contains: query.q, mode: "insensitive" } }, select: { paperId: true } }),
        c.tx.paperKeyword.findMany({ where: { paperId: { in: linkedIds }, keywordName: { contains: query.q, mode: "insensitive" } }, select: { paperId: true } }),
      ]) : [];
      const matches = query.q ? await c.tx.paper.findMany({ where: { id: { in: linkedIds }, OR: [{ title: { contains: query.q, mode: "insensitive" } }, { doi: { contains: query.q, mode: "insensitive" } }, { id: { in: relatedMatches.flat().map(match => match.paperId) } }] }, select: { id: true } }) : null;
      const roundByPaper = new Map(rounds.map(r => [r.paperId, r]));
      const reviewerRounds = new Set(allAssignments.filter(a => a.reviewerId === query.reviewerId).map(a => a.roundId));
      // Shared legacy labels are evidence of a past classification, never of a completed protocol.
      const state = (l: typeof allLinks[number]) => roundByPaper.get(l.paperId)?.status ?? "NOT_REVIEWED";
      const matchIds = matches ? new Set(matches.map(p => p.id)) : null, filteredIds = paperIds ? new Set(paperIds) : null;
      const ids = allLinks.filter(l => (!filteredIds || filteredIds.has(l.paperId)) && (!query.source || source?.id === l.paperId) && (!matchIds || matchIds.has(l.paperId) || l.tags.some(t => t.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) || l.notes?.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) && (!query.tag || l.tags.includes(query.tag)) && (!query.proposerId || l.addedById === query.proposerId) && (!query.status || state(l) === query.status) && (!query.reviewerId || reviewerRounds.has(roundByPaper.get(l.paperId)?.id ?? ""))).map(l => l.paperId);
      const reviewed = new Set(allAssignments.filter(a => a.submittedAt).map(a => a.roundId));
      const progress = { total: allLinks.length, reviewed: reviewed.size, finalized: allLinks.filter(l => ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(state(l))).length, legacy: allLinks.filter(l => !roundByPaper.has(l.paperId) && l.screeningStatus !== "UNDECIDED").length };
      const sortPapers = query.sort === "title" || query.sort === "year" ? await c.tx.paper.findMany({ where: { id: { in: ids } }, orderBy: query.sort === "title" ? [{ title: "asc" }, { id: "asc" }] : [{ publicationYear: "desc" }, { id: "asc" }], select: { id: true } }) : null;
      const sortedPage = sortPapers?.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(p => p.id);
      const where = { projectId: c.project.id, paperId: { in: ids } };
      const [links, total, people, settings] = await Promise.all([c.tx.projectPaper.findMany({ where: sortedPage ? { projectId: c.project.id, paperId: { in: sortedPage } } : where, orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: "desc" }], ...(sortedPage ? {} : { skip: (query.page-1)*query.pageSize, take: query.pageSize }) }), c.tx.projectPaper.count({ where }), screeningPeople(c), screeningSettings(c)]);
      const [papers, legacy, authors, files] = await Promise.all([
        c.tx.paper.findMany({ where: { id: { in: links.map(l => l.paperId) } }, select: { id: true, title: true, abstractText: true, doi: true, publicationYear: true, journalName: true, paperKind: true, paperLink: true, openAccessUrl: true, pdfPath: true } }),
        c.tx.screeningLegacyRecord.findMany({ where: { projectId: c.project.id, paperId: { in: links.map(l => l.paperId) } }, select: { paperId: true, snapshot: true } }),
        c.tx.paperAuthor.findMany({ where: { paperId: { in: links.map(l => l.paperId) } }, orderBy: { position: "asc" }, select: { paperId: true, displayName: true } }),
        c.tx.projectPaperFile.findMany({ where: { projectId: c.project.id, paperId: { in: links.map(l => l.paperId) } }, select: { paperId: true } }),
      ]);
      const pageRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true, paperId: { in: links.map(l => l.paperId) } } });
      const myAssignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, reviewerId: c.actorId, active: true, roundId: { in: rounds.map(r => r.id) } }, select: { submittedAt: true, dueAt: true } });
      const myProgress = { assigned: myAssignments.length, completed: myAssignments.filter(a => a.submittedAt).length, pending: myAssignments.filter(a => !a.submittedAt).length, overdue: myAssignments.filter(a => !a.submittedAt && a.dueAt && a.dueAt < new Date()).length };
      const proposerIds = new Set(allLinks.flatMap(l => l.addedById ? [l.addedById] : [])), reviewerIds = new Set(allAssignments.map(a => a.reviewerId));
      const proposers = await c.tx.user.findMany({ where: { id: { in: [...new Set([...proposerIds, ...reviewerIds])] } }, select: { id: true, fullName: true } });
      const filterPeople = proposers.map(p => ({ id: p.id, name: p.fullName || "Thành viên" }));
      const filters = { proposers: filterPeople.filter(p => proposerIds.has(p.id)), reviewers: filterPeople.filter(p => reviewerIds.has(p.id)) };
      if (sortedPage) links.sort((a, b) => sortedPage.indexOf(a.paperId) - sortedPage.indexOf(b.paperId));
      const items = await Promise.all(links.map(async l => { const paper = papers.find(p => p.id === l.paperId)!, round = pageRounds.find(r => r.paperId === l.paperId); return { tags: l.tags, notes: l.notes, importSource: l.importSource, proposer: l.addedById ? { id: l.addedById, name: proposers.find(p => p.id === l.addedById)?.fullName || "Thành viên" } : null, proposedAt: l.createdAt.toISOString(), proposalReason: l.proposalReason, updatedAt: l.updatedAt.toISOString(), canEditProposal: l.addedById === c.actorId && c.project.status !== "ARCHIVED", paperId: l.paperId, title: paper.title, abstractText: paper.abstractText, doi: paper.doi, publicationYear: paper.publicationYear, journalName: paper.journalName, paperKind: paper.paperKind, authors: authors.filter(a => a.paperId === l.paperId).map(a => a.displayName), paperLink: paper.paperLink ?? paper.openAccessUrl, fullTextAvailable: Boolean(paper.openAccessUrl || paper.pdfPath || files.some(f => f.paperId === l.paperId)), legacyStatus: l.screeningStatus, legacyProvenance: !round && (legacy.some(r => r.paperId === l.paperId && meaningfulLegacyScreening(r.snapshot)) || ["INCLUDED", "EXCLUDED"].includes(l.screeningStatus)), round: round ? await roundView(c, round) : null }; }));
      return { librarySummary: { selected: rounds.filter(r => r.status === "INCLUDED").length, attention: allLinks.length - progress.finalized, discussion: rounds.filter(r => r.status === "NEEDS_RESOLUTION").length }, tags: [...new Set(allLinks.flatMap(l => l.tags))].sort(), filters, progress, items, page: query.page, pageSize: query.pageSize, total, hasNext: query.page*query.pageSize<total, people, settings, myProgress, canManage: c.role === "OWNER" && c.project.status !== "ARCHIVED" };
    });
  },
  async history(project: string, actor: string, roundId: string, page = 1, kind: "ALL" | "DISCUSSION" | "HISTORY" = "ALL") {
    return withWorkspace(project, actor, {}, async c => {
      const round = await screeningRound(c, roundId), where = { projectId: c.project.id, ...(kind === "DISCUSSION" ? { type: "DISCUSSION" } : kind === "HISTORY" ? { type: { not: "DISCUSSION" } } : {}), OR: [{ roundId }, { type: "PROPOSAL_REASON_UPDATED", details: { path: ["paperId"], equals: round.paperId } }] };
      const [rows, total] = await Promise.all([c.tx.screeningAudit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page-1)*20, take: 20 }), c.tx.screeningAudit.count({ where })]);
      const items = await Promise.all(rows.map(async r => {
        const visible = r.type === "PROPOSAL_REASON_UPDATED" || !roundSettings(round.settings).blindReview || Boolean(round.unblindedAt);
        let details = visible || r.actorId === c.actorId ? r.details as Record<string, unknown> : null;
        if (details && typeof details.reviewId === "string") {
          const review = await c.tx.screeningReview.findFirst({ where: { id: details.reviewId, projectId: c.project.id } });
          const assignment = review ? await c.tx.screeningAssignment.findFirst({ where: { id: review.assignmentId, roundId, projectId: c.project.id } }) : null;
          if (review && assignment && (visible || assignment.reviewerId === c.actorId)) details = { ...details, review: { decision: review.decision, exclusionReason: review.exclusionReason, comment: review.comment, revision: review.revision, scope: review.scope, fullTextReference: review.fullTextReference, researchQuestions: review.researchQuestions, submittedAt: review.submittedAt.toISOString() } };
        }
        const author = await c.tx.user.findUnique({ where: { id: r.actorId }, select: { fullName: true } });
        return { id: r.id, type: r.type, actorId: r.actorId, actorName: author?.fullName || "Thành viên", createdAt: r.createdAt.toISOString(), details };
      }));
      return { items, page, pageSize: 20, total, hasNext: page*20<total };
    });
  },
  async rounds(project: string, actor: string, paperId: string, page = 1) {
    return withWorkspace(project, actor, {}, async c => {
      await researchPaper(c, paperId);
      const where = { projectId: c.project.id, paperId };
      const [rows, total, legacy] = await Promise.all([c.tx.screeningRound.findMany({ where, orderBy: { number: "desc" }, skip: (page-1)*10, take: 10 }), c.tx.screeningRound.count({ where }), c.tx.screeningLegacyRecord.findUnique({ where: { projectId_paperId: { projectId: c.project.id, paperId } } })]);
      return { items: await Promise.all(rows.map(r => roundView(c, r))), page, pageSize: 10, total, hasNext: page*10<total, legacy: meaningfulLegacyScreening(legacy?.snapshot) ? legacy!.snapshot : null };
    });
  },
  async analytics(project: string, actor: string): Promise<ScreeningMetrics> {
    return withWorkspace(project, actor, {}, async c => {
      const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true } });
      const metrics: ScreeningMetrics = { reviewedPapers: 0, finalizedPapers: 0, legacyPapers: 0, totalPapers: await c.tx.projectPaper.count({ where: { projectId: c.project.id } }), evaluatedPapers: rounds.length, fullyParticipated: 0, fullyReviewed: 0, agreements: 0, disagreements: 0, pendingReviews: 0, submittedReviews: 0, assignedReviews: 0, completionRate: null, agreementRate: null, conflictRate: null, unresolved: 0, resolved: 0, excludedFromAgreement: 0, distribution: { NOT_REVIEWED: 0, IN_REVIEW: 0, NEEDS_RESOLUTION: 0, AWAITING_FINALIZATION: 0, INCLUDED: 0, EXCLUDED: 0, BACKGROUND: 0 }, exclusionReasons: [], workload: [], kappa: cohenKappa([]) };
      const pairs: { reviewers: string[]; decisions: ScreeningChoice[] }[] = [], workload = new Map<string, ScreeningMetrics["workload"][number]>(), reasons = new Map<string, number>(); let conflicts = 0;
      for (const row of rounds) {
        const view = await roundView(c, row);
        metrics.distribution[view.status]++; if (view.completed) metrics.reviewedPapers++; if (view.finalDecision) metrics.finalizedPapers++; metrics.assignedReviews+=view.assigned; metrics.submittedReviews+=view.completed;
        for (const a of view.assignments) { const load = workload.get(a.reviewerId) ?? { reviewerId: a.reviewerId, name: a.name, assigned: 0, completed: 0, overdue: 0 }; load.assigned++; if (a.completed) load.completed++; if (a.overdue) load.overdue++; workload.set(a.reviewerId, load); }
        if (view.status === "NEEDS_RESOLUTION") metrics.unresolved++;
        if (view.finalDecision?.source === "MANUAL" && new Set(view.reviews.map(r => r.decision)).size > 1) metrics.resolved++;
        // Never compute any decision-derived statistic on still-blinded/incomplete rounds.
        if (!view.unblindedAt || view.assigned < view.settings.requiredReviewers || view.completed !== view.assigned) continue;
        metrics.fullyParticipated++;
        if (view.independenceCompromised) { metrics.excludedFromAgreement++; continue; }
        if (view.settings.reviewMode === "SIMPLE" || !view.settings.blindReview) continue;
        metrics.fullyReviewed++;
        const decisions = view.reviews.map(r => r.decision);
        if (new Set(decisions).size === 1) metrics.agreements++; else metrics.disagreements++;
        if (screeningConsensus(decisions, view.assigned, view.settings.requiredReviewers, "UNANIMOUS") === "NEEDS_RESOLUTION") conflicts++;
        pairs.push({ reviewers: view.reviews.map(r => r.reviewerId), decisions });
        for (const r of view.reviews.filter(r => r.decision === "EXCLUDE")) reasons.set(r.exclusionReason, (reasons.get(r.exclusionReason) ?? 0)+1);
      }
      const started = new Set(rounds.map(r => r.paperId));
      for (const link of await c.tx.projectPaper.findMany({ where: { projectId: c.project.id }, select: { paperId: true, screeningStatus: true } })) {
        if (!started.has(link.paperId)) {
          metrics.distribution.NOT_REVIEWED++;
          if (link.screeningStatus !== "UNDECIDED") metrics.legacyPapers++;
        }
      }
      metrics.pendingReviews=metrics.assignedReviews-metrics.submittedReviews; metrics.completionRate=metrics.assignedReviews ? 100*metrics.submittedReviews/metrics.assignedReviews : null;
      metrics.agreementRate=metrics.fullyReviewed ? 100*metrics.agreements/metrics.fullyReviewed : null; metrics.conflictRate=metrics.fullyReviewed ? 100*conflicts/metrics.fullyReviewed : null;
      metrics.workload=[...workload.values()]; metrics.exclusionReasons=[...reasons].map(([reason, count]) => ({ reason, count })); metrics.kappa=cohenKappa(pairs); return metrics;
    });
  },
};
