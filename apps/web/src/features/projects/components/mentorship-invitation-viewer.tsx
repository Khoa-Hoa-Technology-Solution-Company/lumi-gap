import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Calendar, CheckCircle2, Clock3, GraduationCap, Info, RefreshCw, ShieldCheck, User } from "lucide-react";
import { mentorRoleLabelKeys, type MentorshipRequest, type NeedScopeConfirmation, type NeedScopeConfirmationResponse } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipViewer } from "../utils/mentorship-viewer";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import { InvitationDossierView } from "./invitation-dossier-view";
import { mentorshipError } from "./mentoring-preferences";
import { MentorPolicySummary } from "./mentor-access-workspace";
import { MentorshipClarificationPanel, MentorshipCounterProposalDialog, MentorshipRevisionHistory } from "./mentorship-request-actions";
import { formatSupportLabel } from "./research-team-dossier-sheet";
import "../mentorship-invitation-viewer.css";

/** All viewers fetch the same authorized snapshot. Only server-derived actions can mutate it. */
export function MentorshipInvitationViewer(props: { projectId: string; requestId: string; currentProjectId?: string; onClose: () => void }) {
  const userId = useAuthStore(state => state.user?.id);
  return <InvitationViewer key={`${userId}:${props.projectId}:${props.requestId}`} {...props} />;
}

function formatAvailabilityCode(value: string | undefined, isVi: boolean): string | undefined {
  if (!value) return undefined;
  const labels: Record<string, { vi: string; en: string }> = {
    FLEXIBLE: { vi: "Linh hoạt / Thống nhất sau", en: "Flexible" },
    WEEKLY: { vi: "Hàng tuần", en: "Weekly" },
    BIWEEKLY: { vi: "Hai tuần một lần", en: "Biweekly" },
    MONTHLY: { vi: "Hàng tháng", en: "Monthly" },
    MILESTONE_BASED: { vi: "Theo mốc nghiên cứu", en: "By milestone" },
    "1_SEMESTER": { vi: "1 học kỳ", en: "1 semester" },
    "2_SEMESTERS": { vi: "2 học kỳ", en: "2 semesters" },
    FULL_PROJECT: { vi: "Toàn bộ dự án", en: "Full project" },
    ONLINE: { vi: "Trực tuyến", en: "Online" },
    HYBRID: { vi: "Kết hợp", en: "Hybrid" },
    IN_PERSON: { vi: "Trực tiếp", en: "In person" },
  };
  const found = labels[value];
  return found ? (isVi ? found.vi : found.en) : value;
}

function blockedReasonMessage(reason: string | undefined, isVi: boolean): string | null {
  switch (reason) {
    case "LECTURER_NOT_ACCEPTING":
      return isVi
        ? "Giảng viên hiện đã tạm ngừng nhận hướng dẫn nhóm mới nên không thể kích hoạt trực tiếp đề nghị này."
        : "This lecturer is no longer accepting new mentorships, so this proposal cannot be activated.";
    case "LECTURER_UNVERIFIED":
      return isVi
        ? "Trạng thái xác minh giảng viên hiện không còn hiệu lực."
        : "Lecturer verification status is no longer active.";
    case "OWNER_CHANGED":
      return isVi
        ? "Chủ dự án đã thay đổi sau khi điều kiện quyền truy cập được thiết lập. Hãy đề xuất điều chỉnh để hai bên xác nhận lại."
        : "Project ownership changed after the access policy was configured. Propose updated terms to re-confirm.";
    case "ACCESS_REVOKED_OR_EXPIRED":
      return isVi
        ? "Chính sách quyền truy cập đề xuất đã hết hạn hoặc bị thu hồi."
        : "The proposed access policy has expired or been revoked.";
    case "ROLE_OR_CAPACITY_UNAVAILABLE":
      return isVi
        ? "Vị trí cố vấn hoặc giới hạn số cố vấn đang hoạt động của dự án đã đầy."
        : "The requested mentor role or project mentor capacity is full.";
    case "PROJECT_CLOSED":
      return isVi
        ? "Dự án đã hoàn thành hoặc lưu trữ nên không thể kích hoạt hướng dẫn mới."
        : "This project is archived or completed.";
    default:
      return null;
  }
}

function InvitationViewer({ projectId, requestId, currentProjectId, onClose }: { projectId: string; requestId: string; currentProjectId?: string; onClose: () => void }) {
  const { t, language } = useI18n(), userId = useAuthStore(state => state.user?.id), cache = useQueryClient(), lock = useRef(false);
  const isVi = language === "vi";
  const [activeRequestId, setActiveRequestId] = useState(requestId);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [scopeResponses, setScopeResponses] = useState<Record<string, NeedScopeConfirmationResponse>>({});
  const key = ["academic-support", userId, "invitation-detail", projectId, activeRequestId];
  const query = useQuery({ queryKey: key, queryFn: () => academicSupportApi.requestDetail(projectId, activeRequestId), enabled: Boolean(userId), retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const item = query.data;
  const viewer = item ? mentorshipViewer(item, userId) : "TEAM";
  const pending = item?.status === "PENDING";
  const scopeTopics: Array<{ id: string; title: string }> = [
    ...(item?.project?.supportTypes ?? []).map(st => ({ id: `support-${st.toLowerCase()}`, title: formatSupportLabel(st, language, t) })),
    ...(item?.dossier?.expectations.supportAreas ?? [])
      .filter(st => !(item?.project?.supportTypes ?? []).includes(st as never))
      .map(st => ({ id: `support-${st.toLowerCase()}`, title: formatSupportLabel(st, language, t) })),
  ];
  const mutation = useMutation({
    mutationFn: async (action: "accept" | "decline" | "cancel") => {
      if (!item || useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
      const needConfirmations: NeedScopeConfirmation[] = action === "accept"
        ? scopeTopics
            .filter(topic => Boolean(scopeResponses[topic.id]))
            .map(topic => ({ needId: topic.id, needTitle: topic.title, response: scopeResponses[topic.id]! }))
        : [];
      return needConfirmations.length
        ? academicSupportApi.respond(item, action, "", needConfirmations)
        : academicSupportApi.respond(item, action, "");
    },
    onSuccess: async (result: MentorshipRequest) => {
      if (useAuthStore.getState().user?.id !== userId) return;
      setConfirmWithdraw(false);
      if (result?.kind === "REQUEST") cache.setQueryData(key, result);
      await Promise.all(["academic-support", "mentor-workspace", "notifications", "projects", "home-research"].map(group => cache.invalidateQueries({ queryKey: [group] })));
    },
    onError: () => { void query.refetch(); },
  });

  const act = async (action: "accept" | "decline" | "cancel") => {
    if (lock.current || mutation.isPending || query.isFetching || !item || !pending || !item.actions[action] || (action === "cancel" ? viewer !== "SENDER" : viewer !== "RECIPIENT")) return;
    lock.current = true;
    try { await mutation.mutateAsync(action); } catch { /* Keep the snapshot and show the error. */ } finally { lock.current = false; }
  };

  const isLecturerProposal = item?.direction === "LECTURER_TO_PROJECT";
  const recipientMentor = viewer === "RECIPIENT" && item?.direction === "PROJECT_TO_LECTURER";
  const statusTone = item?.status === "ACCEPTED" ? "emerald" : item?.status === "PENDING" ? "amber" : "slate";
  const statusBadgeClass = statusTone === "emerald"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : statusTone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      : "border-border bg-muted text-muted-foreground";
  const blockedMsg = blockedReasonMessage(item?.acceptBlockedReason, isVi);

  const dialogTitle = isLecturerProposal
    ? viewer === "SENDER"
      ? (isVi ? "Đề nghị hướng dẫn đã gửi" : "Sent mentorship proposal")
      : (isVi ? "Đề nghị hướng dẫn nhận được" : "Received mentorship proposal")
    : t(viewer === "SENDER" ? "supervisor.sentTitle" : "supervisor.receivedTitle");

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open && !lock.current && !mutation.isPending && !counterOpen) onClose(); }}>
        <DialogContent className="mentor-invitation-viewer" data-no-i18n showClose={!mutation.isPending} closeLabel={t("Close")} onInteractOutside={event => event.preventDefault()}>
          <DialogHeader className="mentor-invitation-viewer-header">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{dialogTitle}</DialogTitle>
              {item?.proposalVersion ? (
                <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold">
                  v{item.proposalVersion}
                </Badge>
              ) : null}
              {item ? (
                <Badge variant="outline" className={`h-6 gap-1.5 px-2.5 text-xs font-semibold ${statusBadgeClass}`}>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      statusTone === "emerald" ? "bg-emerald-500" : statusTone === "amber" ? "bg-amber-500" : "bg-muted-foreground/60"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{t(item.status)}</span>
                </Badge>
              ) : null}
            </div>
            <DialogDescription>{t("supervisor.snapshotDescription")}</DialogDescription>
          </DialogHeader>
          <div className="mentor-invitation-viewer-body" role="region" aria-label={t("supervisor.invitationContent")} tabIndex={0}>
            <div className="space-y-4">
              {query.isLoading && <p role="status">{t("Loading…")}</p>}
              {query.isError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p>{t(mentorshipError(query.error))}</p>
                  <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t("Reload invitation")}</Button>
                </div>
              ) : item && (
                <>
                  <div className="miv-meta-grid">
                    <div className="miv-meta-item">
                      <span className="miv-meta-icon" aria-hidden="true"><GraduationCap size={15} /></span>
                      <div className="min-w-0">
                        <p className="miv-meta-label">{isLecturerProposal ? (isVi ? "Giảng viên đề nghị" : "Proposing lecturer") : t("supervisor.recipient")}</p>
                        <Link className="block truncate text-sm font-semibold text-primary hover:underline" target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}>
                          {item.mentorUser.fullName}
                        </Link>
                      </div>
                    </div>
                    <div className="miv-meta-item">
                      <span className="miv-meta-icon" aria-hidden="true"><User size={15} /></span>
                      <div className="min-w-0">
                        <p className="miv-meta-label">{isVi ? "Vai trò đề xuất" : "Proposed role"}</p>
                        <p className="truncate text-sm font-semibold text-foreground">{t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"])}</p>
                      </div>
                    </div>
                    {item.createdAt ? (
                      <div className="miv-meta-item">
                        <span className="miv-meta-icon" aria-hidden="true"><Calendar size={15} /></span>
                        <div className="min-w-0">
                          <p className="miv-meta-label">{t("supervisor.sentOn")}</p>
                          <p className="text-sm font-medium text-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {blockedMsg && pending && viewer === "RECIPIENT" ? (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{blockedMsg}</span>
                    </div>
                  ) : null}

                  {/* Structured Formal Proposal / Counter-Proposal Terms */}
                  {item.terms ? (
                    <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                          <span>
                            {item.terms.proposalKind === "COUNTER_PROPOSAL"
                              ? (isVi ? "Điều kiện hợp tác đề xuất điều chỉnh" : "Proposed revised collaboration terms")
                              : (isVi ? "Điều kiện đề nghị hướng dẫn chính thức" : "Formal mentorship proposal terms")}
                          </span>
                        </span>
                        {item.terms.consentConfirmedAt ? (
                          <span className="text-[11px] text-muted-foreground">
                            {isVi ? "Đã xác nhận đồng thuận:" : "Consent confirmed:"}{" "}
                            {new Date(item.terms.consentConfirmedAt).toLocaleString(isVi ? "vi-VN" : "en-US")}
                          </span>
                        ) : null}
                      </div>

                      {item.terms.changeSummary ? (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-foreground">
                          <p className="font-semibold text-[11px] uppercase tracking-wide text-amber-900 dark:text-amber-200">
                            {isVi ? "Nội dung điều chỉnh so với phiên bản trước" : "Changes from previous version"}
                          </p>
                          <p className="mt-0.5">{item.terms.changeSummary}</p>
                        </div>
                      ) : null}

                      {item.terms.supportAreas.length > 0 ? (
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">{isVi ? "Phạm vi hỗ trợ:" : "Support scope:"}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.terms.supportAreas.map(area => (
                              <span key={area} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                {formatSupportLabel(area, language, t)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {item.terms.needConfirmations && item.terms.needConfirmations.length > 0 ? (
                        <div className="space-y-1.5 pt-1 border-t border-border/60">
                          <p className="font-medium text-muted-foreground">
                            {isVi ? "Phạm vi hướng dẫn giảng viên đã xác nhận:" : "Lecturer-confirmed mentoring scope:"}
                          </p>
                          <ul className="space-y-1">
                            {item.terms.needConfirmations.map(nc => (
                              <li key={nc.needId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/80 px-2.5 py-1.5">
                                <span className="font-medium text-foreground">{nc.needTitle}</span>
                                <span className={`text-[11px] font-semibold ${
                                  nc.response === "CAN_SUPPORT"
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : nc.response === "NEEDS_DISCUSSION"
                                      ? "text-amber-700 dark:text-amber-300"
                                      : "text-muted-foreground"
                                }`}>
                                  {nc.response === "CAN_SUPPORT"
                                    ? (isVi ? "Có thể hỗ trợ" : "Can support")
                                    : nc.response === "NEEDS_DISCUSSION"
                                      ? (isVi ? "Cần trao đổi thêm" : "Needs discussion")
                                      : (isVi ? "Ngoài phạm vi dự kiến" : "Outside intended scope")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {item.terms.availability ? (
                        <p className="text-muted-foreground">
                          <strong className="text-foreground">{isVi ? "Khả năng đồng hành: " : "Availability: "}</strong>
                          {[
                            formatAvailabilityCode(item.terms.availability.frequency, isVi),
                            formatAvailabilityCode(item.terms.availability.duration, isVi),
                            formatAvailabilityCode(item.terms.availability.mode, isVi),
                            item.terms.availability.note,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}

                      {item.terms.requestedAccessNote ? (
                        <p className="text-muted-foreground">
                          <strong className="text-foreground">{isVi ? "Ghi chú đề xuất quyền truy cập: " : "Access note: "}</strong>
                          {item.terms.requestedAccessNote}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  {item.legacyPreview && !item.dossier ? (
                    <div role="status" className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
                      <Info size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>{t("supervisor.legacySnapshot")}</span>
                    </div>
                  ) : null}

                  <InvitationDossierView dossier={item.dossier} legacyProject={item.project} legacySender={item.requestedBy} legacyMessage={item.message} attachments={item.attachments} showAccessNotice={false} />

                  {item.accessPolicy ? <MentorPolicySummary policy={item.accessPolicy} /> : null}

                  <MentorshipRevisionHistory history={item.revisionHistory} />

                  <MentorshipClarificationPanel item={item} />

                  {pending && viewer === "SENDER" ? (
                    <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                      <Clock3 size={15} className="shrink-0" aria-hidden="true" />
                      <span>{t(item.direction === "PROJECT_TO_LECTURER" ? "supervisor.waitingMentor" : "supervisor.waitingTeam")}</span>
                    </div>
                  ) : null}

                  {pending && viewer === "RECIPIENT" && recipientMentor && scopeTopics.length > 0 ? (
                    <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-foreground">
                          {isVi ? "Xác nhận phạm vi hỗ trợ dự kiến (tùy chọn)" : "Confirm intended support scope (optional)"}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {isVi
                            ? "Cho nhóm biết nội dung thầy/cô có thể đồng hành, nội dung cần trao đổi thêm hoặc nằm ngoài phạm vi dự kiến."
                            : "Let the team know which areas you can support, want to discuss, or consider outside scope."}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {scopeTopics.map(topic => {
                          const current = scopeResponses[topic.id];
                          return (
                            <div key={topic.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
                              <span className="font-medium text-foreground">{topic.title}</span>
                              <div className="flex flex-wrap gap-1">
                                {([
                                  { value: "CAN_SUPPORT", vi: "Có thể hỗ trợ", en: "Can support" },
                                  { value: "NEEDS_DISCUSSION", vi: "Cần trao đổi thêm", en: "Needs discussion" },
                                  { value: "OUTSIDE_SCOPE", vi: "Ngoài phạm vi", en: "Outside scope" },
                                ] as const).map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    aria-pressed={current === opt.value}
                                    onClick={() => setScopeResponses(prev => ({ ...prev, [topic.id]: opt.value }))}
                                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                      current === opt.value
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border/75 bg-background text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {isVi ? opt.vi : opt.en}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {pending && viewer === "RECIPIENT" ? (
                    <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 text-xs leading-5">
                      <p className="font-semibold text-foreground">{t("supervisor.ifAccepted")}</p>
                      <p className="text-muted-foreground">{t(recipientMentor ? "supervisor.acceptedAccess" : "supervisor.offerAccess")}</p>
                    </div>
                  ) : null}

                  {!pending ? (
                    item.status === "ACCEPTED" ? (
                      <div className="space-y-2.5">
                        {/* Block 1: Original accepted agreement */}
                        <div className="rounded-xl border border-border/80 bg-muted/25 px-3.5 py-3 text-xs space-y-1">
                          <p className="font-semibold text-foreground">
                            {isVi ? "Thỏa thuận ban đầu khi chấp nhận" : "Original accepted agreement"}
                          </p>
                          <p className="text-muted-foreground">
                            {isVi
                              ? `Yêu cầu hướng dẫn với vai trò ${t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"])} đã được chấp nhận${item.respondedAt ? ` vào ${new Date(item.respondedAt).toLocaleString("vi-VN")}` : ""}.`
                              : `Mentorship request as ${t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"])} was accepted${item.respondedAt ? ` on ${new Date(item.respondedAt).toLocaleString("en-US")}` : ""}.`}
                          </p>
                        </div>

                        {/* Block 2: Current live relationship status */}
                        {item.currentRelationship ? (
                          <div
                            role="status"
                            className={`rounded-xl border px-3.5 py-3 text-xs space-y-1 ${
                              item.currentRelationship.status === "ACTIVE" && item.currentRelationship.accessEffective
                                ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-900 dark:text-emerald-200"
                                : "border-border bg-muted/40 text-foreground"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 font-semibold">
                                {item.currentRelationship.status === "ACTIVE" && item.currentRelationship.accessEffective ? (
                                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                ) : (
                                  <Info size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                                )}
                                <span>
                                  {isVi ? "Quan hệ hướng dẫn hiện tại: " : "Current mentoring relationship: "}
                                  {item.currentRelationship.status === "ACTIVE" && item.currentRelationship.accessEffective
                                    ? (isVi ? "Đang hiệu lực" : "Active")
                                    : item.currentRelationship.status === "ACTIVE"
                                      ? (isVi ? "Quyền truy cập đã hết hạn hoặc thu hồi" : "Access expired or revoked")
                                      : (isVi ? "Đã kết thúc" : "Ended")}
                                </span>
                              </span>
                              <Badge variant="outline" className="text-[10.5px]">
                                {t(mentorRoleLabelKeys[item.currentRelationship.mentorRole ?? "UNASSIGNED"])}
                              </Badge>
                            </div>
                            {item.currentRelationship.status === "ACTIVE" && item.currentRelationship.accessEffective ? (
                              <p className="text-emerald-800/90 dark:text-emerald-300/90">
                                {item.currentRelationship.accessExpiresAt
                                  ? isVi
                                    ? `Quyền truy cập cố vấn đang hoạt động (hiệu lực đến ${new Date(item.currentRelationship.accessExpiresAt).toLocaleDateString("vi-VN")}).`
                                    : `Mentor access is currently active (valid until ${new Date(item.currentRelationship.accessExpiresAt).toLocaleDateString("en-US")}).`
                                  : isVi
                                    ? "Quyền truy cập cố vấn đang hoạt động theo chính sách hiện hành của dự án."
                                    : "Mentor access is currently active under the project's effective policy."}
                              </p>
                            ) : (
                              <p className="text-muted-foreground">
                                {item.currentRelationship.endedAt
                                  ? isVi
                                    ? `Quan hệ hướng dẫn đã kết thúc vào ${new Date(item.currentRelationship.endedAt).toLocaleDateString("vi-VN")}${item.currentRelationship.endReason ? ` (${item.currentRelationship.endReason})` : ""}. Quyền truy cập không gian dự án không còn hiệu lực.`
                                    : `Mentorship ended on ${new Date(item.currentRelationship.endedAt).toLocaleDateString("en-US")}${item.currentRelationship.endReason ? ` (${item.currentRelationship.endReason})` : ""}. Workspace access is no longer active.`
                                  : item.currentRelationship.accessRevokedAt
                                    ? isVi
                                      ? `Quyền truy cập cố vấn đã được thu hồi vào ${new Date(item.currentRelationship.accessRevokedAt).toLocaleDateString("vi-VN")}.`
                                      : `Mentor access was revoked on ${new Date(item.currentRelationship.accessRevokedAt).toLocaleDateString("en-US")}.`
                                    : isVi
                                      ? "Quyền truy cập không gian dự án hiện không còn hiệu lực. Hồ sơ lịch sử và đóng góp vẫn được bảo toàn."
                                      : "Workspace access is no longer active. Historical mentorship records remain preserved."}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div
                            role="status"
                            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3.5 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300"
                          >
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span>{t(recipientMentor ? "supervisor.accepted" : item.status)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        role="status"
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm font-semibold text-foreground"
                      >
                        <span>{t(item.status)}</span>
                      </div>
                    )
                  ) : null}

                  {query.isFetching ? <p role="status" className="text-xs text-muted-foreground">{t("Checking the latest invitation…")}</p> : null}
                  {mutation.error ? <p role="alert" className="text-sm text-destructive">{t(mentorshipError(mutation.error))}</p> : null}
                </>
              )}
            </div>
          </div>

          {confirmWithdraw && pending && viewer === "SENDER" && item?.actions.cancel ? (
            <div role="alertdialog" aria-labelledby="withdraw-confirm-title" className="mx-6 mb-3 rounded-xl border border-destructive/35 bg-destructive/[0.06] p-3.5 text-xs space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <div className="space-y-1">
                  <p id="withdraw-confirm-title" className="font-semibold text-foreground">
                    {t("supervisor.withdrawConfirmTitle")}
                    {item.direction === "PROJECT_TO_LECTURER" && item.mentorUser.fullName ? ` (${item.mentorUser.fullName})` : ""}
                  </p>
                  <p className="leading-5 text-muted-foreground">{t("supervisor.withdrawConfirmBody")}</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setConfirmWithdraw(false)}>
                  {t("supervisor.withdrawKeep")}
                </Button>
                <Button size="sm" variant="destructive" disabled={mutation.isPending || query.isFetching} onClick={() => void act("cancel")}>
                  {t("supervisor.withdrawConfirm")}
                </Button>
              </div>
            </div>
          ) : null}

          <footer className="mentor-invitation-viewer-footer">
            <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("Close")}</Button>
            {!query.isError && pending && viewer === "SENDER" && item?.actions.cancel && !confirmWithdraw ? (
              <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive" disabled={mutation.isPending || query.isFetching} onClick={() => setConfirmWithdraw(true)}>
                {isLecturerProposal ? (isVi ? "Rút đề nghị" : "Withdraw Proposal") : t("supervisor.withdraw")}
              </Button>
            ) : null}
            {!query.isError && pending && viewer === "RECIPIENT" ? (
              <>
                {item?.actions.counterPropose ? (
                  <Button variant="outline" className="gap-1.5" disabled={mutation.isPending || query.isFetching} onClick={() => setCounterOpen(true)}>
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>{isVi ? "Đề xuất điều chỉnh" : "Propose Changes"}</span>
                  </Button>
                ) : null}
                {item?.actions.decline ? (
                  <Button variant="outline" disabled={mutation.isPending || query.isFetching} onClick={() => void act("decline")}>{t("Decline")}</Button>
                ) : null}
                {item?.actions.accept ? (
                  <Button disabled={mutation.isPending || query.isFetching} onClick={() => void act("accept")}>
                    {isLecturerProposal ? (isVi ? "Chấp nhận đề nghị" : "Accept Proposal") : t("supervisor.accept")}
                  </Button>
                ) : null}
              </>
            ) : null}
            {!query.isError && !pending && item?.actions.openProject && (!item.currentRelationship || item.currentRelationship.accessEffective) && !currentProjectId ? (
              <Button asChild className="gap-1.5">
                <Link to={item.mentorUser._id === userId ? mentorWorkspaceDestination(`/academic-support/projects/${encodeURIComponent(projectId)}`) : `/projects/${encodeURIComponent(projectId)}?tab=support`}>
                  <span>{t("Open project")}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </footer>
        </DialogContent>
      </Dialog>

      {counterOpen && item ? (
        <MentorshipCounterProposalDialog
          item={item}
          onClose={() => setCounterOpen(false)}
          onCreated={next => setActiveRequestId(next.id)}
        />
      ) : null}
    </>
  );
}
