import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookMarked,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  Users,
  X,
} from "lucide-react";
import type {
  MentorPaperAccessMode,
  MentorResourceCategory,
  MentorResourceInboxItem,
  MentorResourceSort,
  MentorResourceSummary,
} from "@trend/shared-types";

const RESOURCE_CATEGORIES: readonly MentorResourceCategory[] = ["ALL", "MANUSCRIPT_REPORT", "REFERENCE_PAPER", "RESEARCH_PLAN", "RESEARCH_GAP"];
const RESOURCE_SORTS: readonly MentorResourceSort[] = ["newest", "oldest", "title"];
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { mentorAccessApi } from "../api/mentor-access.api";
import {
  buildMentorResourcesReturn,
  mentorWorkspaceDestination,
  resolveManuscriptDestination,
  withMentorWorkReturn,
} from "../utils/mentor-workspace-navigation";
import "../mentor-workspace.css";

const PaperPdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SharedDate({ value }: { value?: string }) {
  const { language } = useI18n();
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return <time dateTime={value}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}</time>;
}

export function MentorPaperSharing({ projectId, paperId, disabled = false, initialAccessId, label = "Chia sẻ với cố vấn" }: { projectId: string; paperId: string; disabled?: boolean; initialAccessId?: string; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}><Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t(label)}</Button>{open && <PaperSharingDialog projectId={projectId} paperId={paperId} initialAccessId={initialAccessId} onClose={() => setOpen(false)} />}</>;
}

function PaperSharingDialog({ projectId, paperId, initialAccessId, onClose }: { projectId: string; paperId: string; initialAccessId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const actor = useAuthStore(s => s.user?.id);
  const cache = useQueryClient(), busy = useRef(false);
  const [selected, setSelected] = useState(initialAccessId ?? "");
  const [mode, setMode] = useState<MentorPaperAccessMode | null>(null);
  const [message, setMessage] = useState("");
  const [confirmedRevoke, setConfirmedRevoke] = useState(false);
  const workspace = useQuery({ queryKey: ["mentor-access", actor, projectId, "paper-share"], queryFn: () => mentorAccessApi.workspace(projectId, 1, true), retry: false });
  const mentors = workspace.data?.policies.filter(p => p.policy.effective && p.invitationState === "ACCEPTED") ?? [];
  const mentor = mentors.find(p => p.policy.id === selected) ?? mentors[0];
  const current = mentor?.shares.find(s => s.kind === "PAPER" && s.resourceId === paperId && s.sectionKey === "" && !s.revokedAt);
  const selectedMode = mode ?? (current && (current.accessMode === "VIEW" || !current.accessMode && !current.canComment) ? "VIEW" : "COMMENT");
  const canManage = !current || Boolean(current.canUnshare ?? workspace.data?.canManage);
  const mutation = useMutation({
    mutationFn: async (revoke: boolean) => {
      if (!mentor) throw Error("No mentor");
      if (revoke && current) return mentorAccessApi.unshare(projectId, mentor.policy.id, current.id, { expectedVersion: mentor.policy.version, confirmed: true });
      return mentorAccessApi.sharePaper(projectId, mentor.policy.id, { kind: "PAPER", resourceId: paperId, accessMode: selectedMode, expectedVersion: mentor.policy.version, ...(!current && message.trim() ? { message: message.trim() } : {}) });
    },
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ["mentor-access"] }), cache.invalidateQueries({ queryKey: ["mentor-workspace"] })]);
      onClose();
    },
    onError: () => { void workspace.refetch(); },
  });
  const run = async (revoke: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try { await mutation.mutateAsync(revoke); } catch { /* Keep input available for retry. */ } finally { busy.current = false; }
  };
  return <Dialog open onOpenChange={v => { if (!v && !mutation.isPending) onClose(); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t("Chia sẻ với cố vấn")}</DialogTitle><DialogDescription>{t("Cố vấn chỉ được truy cập bài báo này, không phải toàn bộ thư viện.")}</DialogDescription></DialogHeader>
    {workspace.isLoading ? <p role="status">{t("Đang tải cố vấn…")}</p> : workspace.error ? <div role="alert"><p>{t("Không thể tải danh sách cố vấn.")}</p><Button variant="outline" onClick={() => void workspace.refetch()}>{t("Thử lại")}</Button></div> : !mentors.length ? <p>{t("Chưa có cố vấn đã chấp nhận và đang hướng dẫn.")}</p> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(false); }}>
      <label className="block space-y-1.5 text-sm font-medium">{t("Chọn cố vấn")}<select className={`${selectClass} w-full`} value={mentor?.policy.id ?? ""} disabled={mutation.isPending} onChange={e => { setSelected(e.target.value); setConfirmedRevoke(false); setMode(null); }}>{mentors.map(m => <option key={m.policy.id} value={m.policy.id}>{m.mentorName}</option>)}</select></label>
      <fieldset disabled={mutation.isPending || !canManage} className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("Quyền truy cập")}</legend>{(["COMMENT", "VIEW"] as const).map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"><input type="radio" name="paper-share-mode" checked={selectedMode === value} onChange={() => setMode(value)} />{t(value === "COMMENT" ? "Xem và góp ý" : "Chỉ xem")}</label>)}</fieldset>
      {!current ? <label className="block space-y-1.5 text-sm font-medium">{t("Lời nhắn cho cố vấn (không bắt buộc)")}<textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="mentor-share-message" autoComplete="off" maxLength={2000} value={message} disabled={mutation.isPending} onChange={e => setMessage(e.target.value)} placeholder={t("Thầy/cô có thể xem giúp nhóm phương pháp trong bài báo này có phù hợp với đề tài không ạ?")} /></label> : current.message ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{current.message}</p> : null}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{t("Chưa thể lưu thay đổi. Nội dung bạn chọn vẫn được giữ; vui lòng thử lại.")}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" type="button" disabled={mutation.isPending} onClick={onClose}>{t("Hủy")}</Button><Button disabled={mutation.isPending || workspace.isFetching || !canManage}>{t(mutation.isPending ? "Đang lưu…" : current ? "Lưu thay đổi" : "Chia sẻ")}</Button></div>
      {current && canManage && <details className="border-t pt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">{t("Ngừng chia sẻ")}</summary><p className="my-2">{t("Chỉ thu hồi quyền chia sẻ trực tiếp. Yêu cầu đánh giá bản thảo được giữ riêng.")}</p><label className="flex gap-2"><input type="checkbox" checked={confirmedRevoke} onChange={e => setConfirmedRevoke(e.target.checked)} />{t("Tôi xác nhận ngừng chia sẻ bài báo này.")}</label><Button type="button" variant="destructive" className="mt-2" disabled={!confirmedRevoke || mutation.isPending} onClick={() => void run(true)}>{t("Ngừng chia sẻ")}</Button></details>}
    </form>}
  </DialogContent></Dialog>;
}

function safeSourceUrl(value?: string | null) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

/** One grant-scoped reader and conversation, reused in Resources, Support and Paper Detail. */
export function MentorSharedPaper({ projectId, accessId, resource, version = 0, initiallyOpen = false, commentsOnly = false, embedded = false, context }: { projectId: string; accessId: string; resource: MentorResourceSummary; version?: number; initiallyOpen?: boolean; commentsOnly?: boolean; embedded?: boolean; context?: ReactNode }) {
  const { t } = useI18n();
  const actor = useAuthStore(s => s.user?.id), cache = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen || commentsOnly || embedded), [body, setBody] = useState(""), [feedbackPage, setFeedbackPage] = useState(1);
  const key = useRef(crypto.randomUUID()), busy = useRef(false);
  const scope = ["mentor-access", actor, projectId, accessId, resource.id, version];
  const document = useQuery({ queryKey: [...scope, "reader"], queryFn: () => mentorAccessApi.resource(projectId, accessId, resource.id), enabled: open, retry: false, refetchInterval: open ? 5000 : false });
  const feedback = useQuery({ queryKey: [...scope, "paper-feedback", feedbackPage], queryFn: () => mentorAccessApi.feedback(projectId, accessId, feedbackPage, resource.id), enabled: open && Boolean(document.data) && !document.error, retry: false, refetchInterval: open ? 5000 : false });
  const pdf = useQuery({ queryKey: [...scope, "pdf"], queryFn: ({ signal }) => mentorAccessApi.resourcePdf(projectId, accessId, resource.id, signal), enabled: !commentsOnly && open && Boolean(document.data?.hasPdf) && !document.error, retry: false });
  const send = useMutation({
    mutationFn: () => mentorAccessApi.comment(projectId, accessId, { shareId: resource.id, replyToId: null, kind: "COMMENT", body: body.trim(), creditRoles: [], clientKey: key.current }),
    onSuccess: async () => { setBody(""); setFeedbackPage(1); key.current = crypto.randomUUID(); await cache.invalidateQueries({ queryKey: [...scope, "paper-feedback"] }); },
  });
  const paper = document.data?.paper;
  const originalUrl = safeSourceUrl(paper?.originalUrl);
  const content = open && <div className="mt-4 space-y-5">
    {document.isLoading ? <p role="status">{t("Đang tải tài liệu…")}</p> : document.error ? <div role="alert"><p>{t("Tài liệu không còn được chia sẻ hoặc kết nối bị gián đoạn.")}</p><Button size="sm" variant="outline" onClick={() => void document.refetch()}>{t("Thử lại")}</Button></div> : document.data && <>
      {!commentsOnly && <>
        {paper && <div className="space-y-1 text-sm text-muted-foreground">{!context && paper.authors.length > 0 && <p>{paper.authors.join(", ")}{paper.publicationYear ? ` · ${paper.publicationYear}` : ""}</p>}{!context && !paper.authors.length && paper.publicationYear ? <p>{paper.publicationYear}</p> : null}{paper.doi && <p className="break-all">DOI: {paper.doi}</p>}{paper.source && <p>{paper.source}</p>}</div>}
        {document.data.message && <div className="rounded-md bg-muted/50 px-4 py-3"><h3 className="text-sm font-medium">{t("Lời nhắn từ nhóm")}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{document.data.message}</p></div>}
        <div><h3 className="mb-2 text-sm font-semibold">{t("Tóm tắt")}</h3><p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-7">{document.data.content}</p></div>
        {originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"><span>{t("Xem bài báo gốc")}</span><ExternalLink size={14} aria-hidden="true" /></a>}
        {document.data.hasPdf ? <div className="min-w-0 rounded-md border p-2">{pdf.isLoading ? <p role="status">{t("Đang tải PDF…")}</p> : pdf.error ? <div role="alert"><p>{t("Không thể tải PDF được chia sẻ.")}</p><Button size="sm" variant="outline" onClick={() => void pdf.refetch()}>{t("Thử lại")}</Button></div> : pdf.data && <Suspense fallback={<p role="status">{t("Đang tải PDF…")}</p>}><PaperPdfPreview key={resource.id} blob={pdf.data} zoomable /></Suspense>}</div> : <p className="text-sm text-muted-foreground">{t("Chưa có PDF được chia sẻ. Bạn có thể đọc tóm tắt và xem nguồn bài báo.")}</p>}
      </>}
      <section className="space-y-3 border-t pt-4" aria-label={t("Góp ý cho nhóm")}>
        <h3 className="text-sm font-semibold">{t("Góp ý cho nhóm")}</h3>
        {feedback.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Đang tải góp ý…")}</p>}
        {!feedback.error && feedback.data?.items.filter(f => f.shareId === resource.id).map(f => <article key={f.id} className="space-y-1 text-sm"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="font-medium">{f.authorName}</strong><span className="text-xs text-muted-foreground"><SharedDate value={f.createdAt} /></span></div><p className="whitespace-pre-wrap break-words leading-6">{f.body}</p></article>)}
        {!feedback.error && feedback.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("Chưa có góp ý cho bài báo này.")}</p>}
        {!feedback.error && feedback.data && (feedbackPage > 1 || feedback.data.hasNext) && <ResourcePager page={feedbackPage} hasNext={feedback.data.hasNext} setPage={setFeedbackPage} label={t("Phân trang góp ý")} />}
        {feedback.error && <div role="alert" className="text-sm"><p>{t("Không thể tải góp ý.")}</p><Button variant="outline" size="sm" onClick={() => void feedback.refetch()}>{t("Thử lại")}</Button></div>}
        {document.data.canComment ? <form onSubmit={async e => { e.preventDefault(); if (busy.current || !body.trim()) return; busy.current = true; try { await send.mutateAsync(); } catch { /* Preserve input for retry. */ } finally { busy.current = false; } }} className="space-y-2">
          <label className="block text-sm"><span className="sr-only">{t("Góp ý cho nhóm")}</span><textarea name="paper-mentor-comment" autoComplete="off" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={5000} value={body} disabled={send.isPending} placeholder={t("Nhập nhận xét về bài báo, phương pháp nghiên cứu hoặc khả năng áp dụng vào đề tài…")} onChange={e => { setBody(e.target.value); key.current = crypto.randomUUID(); }} /></label>
          {send.isError && <p role="alert" className="text-sm text-destructive">{t("Chưa thể gửi góp ý. Nội dung vẫn được giữ.")}</p>}
          <Button size="sm" disabled={!body.trim() || send.isPending}>{t(send.isPending ? "Đang gửi…" : "Gửi góp ý")}</Button>
        </form> : <p className="text-xs text-muted-foreground">{t(resource.revokedAt ? "Đã ngừng chia sẻ. Lịch sử góp ý được giữ lại." : "Chỉ xem")}</p>}
      </section>
    </>}
  </div>;
  if (commentsOnly || embedded) return content;
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="min-w-0"><summary className="cursor-pointer break-words rounded-sm text-foreground underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span className="text-base font-semibold leading-6">{resource.title}</span>{context}{!open && context && resource.message && <span className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{resource.message}</span>}</summary>{content}</details>;
}

function ResourcePager({ page, hasNext, setPage, label }: { page: number; hasNext: boolean; setPage: (page: number) => void; label: string }) {
  const { t } = useI18n();
  return <nav className="flex items-center justify-between gap-3" aria-label={label}><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("Trang trước")}</Button><span className="text-xs tabular-nums text-muted-foreground">{page}</span><Button size="sm" variant="outline" disabled={!hasNext} onClick={() => setPage(page + 1)}>{t("Trang sau")}</Button></nav>;
}

/** Team comments stay beside the existing Paper Detail, including revoked shares. */
export function PaperMentorComments({ projectId, paperId }: { projectId: string; paperId: string }) {
  const { t } = useI18n(), actor = useAuthStore(s => s.user?.id);
  const [params] = useSearchParams();
  const region = useRef<HTMLElement>(null), focused = useRef(false);
  const [page, setPage] = useState(1);
  const shares = useQuery({ queryKey: ["mentor-access", actor, projectId, "paper-conversations", paperId, page], queryFn: () => mentorAccessApi.paperShares(projectId, paperId, page), retry: false });
  const showComments = params.get("section") === "mentor-comments";
  useEffect(() => {
    if (!showComments || !shares.data?.items.length || focused.current) return;
    region.current?.scrollIntoView({ block: "start" });
    region.current?.focus({ preventScroll: true });
    focused.current = true;
  }, [showComments, shares.data]);
  if (shares.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Đang tải góp ý…")}</p>;
  if (shares.error) return <div role="alert"><p>{t("Không thể tải góp ý.")}</p><Button variant="outline" size="sm" onClick={() => void shares.refetch()}>{t("Thử lại")}</Button></div>;
  if (!shares.data?.items.length) return null;
  return <section id="mentor-comments" ref={region} tabIndex={-1} className="space-y-4 border-t pt-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><h2 className="text-base font-semibold">{t("Trao đổi với cố vấn")}</h2>{shares.data.items.map(item => <div key={item.resource.id} className="space-y-1"><h3 className="text-sm font-medium">{item.mentorName}</h3><MentorSharedPaper commentsOnly projectId={projectId} accessId={item.accessId} resource={item.resource} /></div>)}{(page > 1 || shares.data.hasNext) && <ResourcePager page={page} hasNext={shares.data.hasNext} setPage={setPage} label={t("Phân trang tài liệu")} />}</section>;
}

const SECTION_LABELS: Record<string, string> = {
  abstract: "Tóm tắt",
  introduction: "Giới thiệu",
  methodology: "Phương pháp",
  results: "Kết quả",
  discussion: "Thảo luận",
  conclusion: "Kết luận",
  appendix: "Phụ lục được duyệt",
};

const CATEGORY_LABEL_KEYS: Record<MentorResourceCategory, string> = {
  ALL: "Tất cả",
  MANUSCRIPT_REPORT: "Bản thảo & báo cáo",
  REFERENCE_PAPER: "Bài báo tham khảo",
  RESEARCH_PLAN: "Kế hoạch",
  RESEARCH_GAP: "Cơ hội nghiên cứu",
};

const SORT_LABEL_KEYS: Record<MentorResourceSort, string> = {
  newest: "Mới chia sẻ nhất",
  oldest: "Cũ nhất",
  title: "Tiêu đề A–Z",
};

function resolveItemCategory(item: MentorResourceInboxItem): Exclude<MentorResourceCategory, "ALL"> {
  if (item.category) return item.category;
  if (item.resource.kind === "PAPER") return "REFERENCE_PAPER";
  if (item.resource.kind === "GAP") return "RESEARCH_GAP";
  if (item.resource.kind === "SUBMISSION" && item.documentType === "RESEARCH_PLAN") return "RESEARCH_PLAN";
  return "MANUSCRIPT_REPORT";
}

function resourceTypeLabelKey(item: MentorResourceInboxItem): string {
  const kind = item.resource.kind;
  if (kind === "PAPER") return "mentorResources.type.PAPER";
  if (kind === "GAP") return "mentorResources.type.GAP";
  if (kind === "MANUSCRIPT") return "Phần bản thảo";
  if (kind === "SUBMISSION") {
    if (item.documentType === "RESEARCH_PLAN") return "Kế hoạch nghiên cứu";
    if (item.documentType === "RESEARCH_PROPOSAL") return "Đề cương nghiên cứu";
    if (item.documentType === "GENERAL_REPORT" || item.documentType === "GAP_ANALYSIS" || item.documentType === "EVIDENCE_SYNTHESIS") {
      return "Báo cáo nghiên cứu";
    }
    return "Bản thảo nghiên cứu";
  }
  return "Tài liệu được chia sẻ";
}

function primaryCtaLabelKey(item: MentorResourceInboxItem): string {
  if (item.resource.kind === "PAPER") return "Xem bài báo";
  if (item.resource.kind === "GAP") return "Xem cơ hội nghiên cứu";
  if (item.resource.kind === "SUBMISSION" && item.documentType === "RESEARCH_PLAN") return "Xem kế hoạch";
  if (item.resource.kind === "SUBMISSION") return "Xem bản thảo";
  return "Xem tài liệu";
}

function permissionMeta(item: MentorResourceInboxItem): { labelKey: string; tone: "review" | "comment" | "view" } {
  const mode = item.permissionMode ?? (item.resource.canComment ? "COMMENT" : "VIEW_ONLY");
  if (mode === "REVIEW_ASSIGNED") return { labelKey: "Được giao phản biện", tone: "review" };
  if (mode === "COMMENT") return { labelKey: "Xem và góp ý", tone: "comment" };
  return { labelKey: "Chỉ xem", tone: "view" };
}

function ResourceCategoryIcon({ category }: { category: Exclude<MentorResourceCategory, "ALL"> }) {
  if (category === "REFERENCE_PAPER") return <BookOpen className="h-4 w-4" aria-hidden="true" />;
  if (category === "RESEARCH_PLAN") return <ClipboardList className="h-4 w-4" aria-hidden="true" />;
  if (category === "RESEARCH_GAP") return <Lightbulb className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

/** Read-only viewer for approved non-paper explicit shares (manuscript section, gap, explicit submission). */
function SharedResourceSnapshotViewer({ item }: { item: MentorResourceInboxItem }) {
  const { t } = useI18n();
  const actor = useAuthStore(s => s.user?.id);
  const query = useQuery({
    queryKey: ["mentor-access", actor, item.projectId, item.accessId, item.resource.id, "reader-snapshot"],
    queryFn: () => mentorAccessApi.resource(item.projectId, item.accessId, item.resource.id),
    retry: false,
  });

  if (query.isLoading) {
    return <p role="status" className="py-4 text-sm text-muted-foreground">{t("Đang tải tài liệu…")}</p>;
  }
  if (query.error || !query.data) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="text-destructive">{t("Tài liệu không còn được chia sẻ hoặc kết nối bị gián đoạn.")}</p>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t("Thử lại")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {query.data.message ? (
        <div className="rounded-lg border border-border/70 bg-muted/40 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Lời nhắn từ nhóm")}</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{query.data.message}</p>
        </div>
      ) : null}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Nội dung được chia sẻ")}</h3>
        <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
          <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
            {query.data.content || t("Không có nội dung hiển thị cho mục này.")}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Chế độ chỉ đọc — không tạo bản nháp hay thay đổi trạng thái phản biện.")}
      </p>
    </div>
  );
}

export function MentorSharedResourceInbox() {
  const { t } = useI18n();
  const actor = useAuthStore(s => s.user?.id);
  const [params, setParams] = useSearchParams();
  const [activeReader, setActiveReader] = useState<MentorResourceInboxItem | null>(null);
  const [reviewPickerItem, setReviewPickerItem] = useState<MentorResourceInboxItem | null>(null);
  const autoOpenedPaperRef = useRef<string | null>(null);

  const search = params.get("q") ?? "";
  const projectId = params.get("projectId") ?? "";
  const paperId = params.get("paper") ?? "";
  const rawCategory = params.get("category") ?? "ALL";
  const category: MentorResourceCategory = (RESOURCE_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as MentorResourceCategory)
    : "ALL";
  const rawSort = params.get("sort") ?? "newest";
  const sort: MentorResourceSort = (RESOURCE_SORTS as readonly string[]).includes(rawSort)
    ? (rawSort as MentorResourceSort)
    : "newest";
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const q = useDebouncedValue(search, 250);

  const queryPayload = useMemo(() => ({
    q,
    ...(projectId ? { projectId } : {}),
    ...(paperId ? { paperId } : {}),
    ...(category !== "ALL" ? { category } : {}),
    ...(sort !== "newest" ? { sort } : {}),
  }), [q, projectId, paperId, category, sort]);

  const inbox = useQuery({
    queryKey: ["mentor-access", actor, "inbox", page, q, projectId, paperId, category, sort],
    queryFn: () => mentorAccessApi.inbox(page, queryPayload),
    retry: false,
    refetchInterval: activeReader ? false : 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    if (!("page" in values)) next.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const clear = () => update({ q: "", projectId: "", paper: "", category: "", sort: "" });

  const items = inbox.data?.items ?? [];
  const filtered = Boolean(q || projectId || paperId || category !== "ALL" || sort !== "newest");
  const showToolbar = !inbox.error && Boolean(inbox.data && ((inbox.data.unfilteredTotal ?? items.length) > 0 || filtered));
  const returnTo = useMemo(() => buildMentorResourcesReturn(params), [params]);

  // Deep-link support for ?paper=<paperId>: auto-open focused paper reader once
  useEffect(() => {
    if (!paperId || !items.length || autoOpenedPaperRef.current === paperId) return;
    const match = items.find(i => i.resource.kind === "PAPER" && i.resource.resourceId === paperId);
    if (match) {
      autoOpenedPaperRef.current = paperId;
      setActiveReader(match);
    }
  }, [paperId, items]);

  const hasCategoryCounts = Boolean(inbox.data?.categoryCounts);

  return (
    <section className="mentor-res-page space-y-5" data-no-i18n>
      <header className="mentor-page-header">
        <div className="min-w-0">
          <h1>{t("mentorWorkspace.resources")}</h1>
          <p>{t("Truy cập bản thảo, báo cáo, bài báo tham khảo, kế hoạch và cơ hội nghiên cứu được chia sẻ từ các dự án bạn hướng dẫn.")}</p>
        </div>
      </header>

      {showToolbar ? (
        <div className="mentor-res-controls-wrap">
          <div className="mentor-res-categories" role="tablist" aria-label={t("Danh mục tài liệu")}>
            {RESOURCE_CATEGORIES.map(cat => {
              const active = category === cat;
              const count = inbox.data?.categoryCounts?.[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="mentor-res-cat-pill"
                  data-active={active ? "true" : undefined}
                  onClick={() => update({ category: cat === "ALL" ? "" : cat, paper: "" })}
                >
                  <span>{t(CATEGORY_LABEL_KEYS[cat])}</span>
                  {hasCategoryCounts ? (
                    <span className="mentor-res-cat-count">{count ?? 0}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <form
            role="search"
            onSubmit={e => {
              e.preventDefault();
              update({ q: search.trim(), paper: "" });
            }}
            className="mentor-res-toolbar"
          >
            <div className="mentor-res-search">
              <Search className="mentor-res-search-icon" size={16} aria-hidden="true" />
              <Input
                name="q"
                type="search"
                autoComplete="off"
                maxLength={160}
                aria-label={t("Tìm theo tiêu đề, dự án, tên tệp, tác giả hoặc DOI")}
                placeholder={t("Tìm theo tiêu đề, dự án, tên tệp, tác giả hoặc DOI…")}
                className="pl-9 pr-8"
                value={search}
                onChange={e => update({ q: e.target.value, paper: "" })}
              />
              {search ? (
                <button
                  type="button"
                  className="mentor-search-clear"
                  aria-label={t("mentorWorkspace.clearProjectSearch")}
                  onClick={() => update({ q: "", paper: "" })}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <select
              className={`${selectClass} mentor-res-select`}
              aria-label={t("Lọc theo dự án")}
              value={projectId}
              onChange={e => update({ projectId: e.target.value, paper: "" })}
            >
              <option value="">{t("Tất cả dự án")}</option>
              {inbox.data?.projects?.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>

            <select
              className={`${selectClass} mentor-res-sort`}
              aria-label={t("Sắp xếp tài liệu")}
              value={sort}
              onChange={e => update({ sort: e.target.value === "newest" ? "" : e.target.value })}
            >
              {RESOURCE_SORTS.map(s => (
                <option key={s} value={s}>{t(SORT_LABEL_KEYS[s])}</option>
              ))}
            </select>

            {filtered ? (
              <Button type="button" variant="ghost" size="sm" className="h-10 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground" onClick={clear}>
                <RotateCcw size={13} aria-hidden="true" />
                <span>{t("mentorWorkspace.clearFilters")}</span>
              </Button>
            ) : null}
          </form>
        </div>
      ) : null}

      {inbox.isLoading ? (
        <div role="status" className="mentor-res-skeleton-list" aria-label={t("Đang tải tài liệu…")}>
          <span className="sr-only">{t("Đang tải tài liệu…")}</span>
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="mentor-res-skeleton-row">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
              <div className="h-8 w-28 shrink-0 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : inbox.error ? (
        <div role="alert" className="mentor-queue-empty">
          <p>{t("Chưa thể tải danh sách tài liệu được chia sẻ.")}</p>
          <Button onClick={() => void inbox.refetch()} variant="outline" size="sm">
            {t("Thử lại")}
          </Button>
        </div>
      ) : !items.length ? (
        <div className="mentor-queue-empty" role="status">
          <BookMarked size={26} aria-hidden="true" />
          <h3>{t(filtered ? "Không tìm thấy tài liệu phù hợp." : "Chưa có tài liệu nào được chia sẻ với bạn.")}</h3>
          {filtered ? (
            <Button variant="outline" size="sm" onClick={clear}>
              {t("mentorWorkspace.clearFilters")}
            </Button>
          ) : (
            <>
              <p>{t("Khi nhóm nghiên cứu chia sẻ tài liệu hoặc gửi bản thảo để phản biện, tài liệu sẽ xuất hiện tại đây.")}</p>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/mentor-workspace?view=projects">
                  <Users size={14} aria-hidden="true" />
                  <span>{t("Xem dự án hướng dẫn")}</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mentor-res-meta-bar">
            <span>
              {t("Hiển thị {{shown}} / {{total}} tài liệu", {
                shown: items.length,
                total: inbox.data?.total ?? items.length,
              })}
            </span>
            {paperId ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear}>
                {t("Xem tất cả tài liệu")}
              </Button>
            ) : null}
          </div>

          <div className="mentor-res-list" aria-busy={inbox.isFetching}>
            {items.map(item => {
              const itemCategory = resolveItemCategory(item);
              const perm = permissionMeta(item);
              const reviewReqs = item.reviewRequests ?? [];
              const primaryReviewReq = reviewReqs[0];
              const manuscriptReadHref =
                item.resource.kind === "SUBMISSION" && primaryReviewReq && item.latestRevisionId
                  ? resolveManuscriptDestination({
                      actorRole: "REVIEWER",
                      requestId: primaryReviewReq.requestId,
                      revisionId: item.latestRevisionId,
                      returnTo,
                    })
                  : null;
              const singleReview = reviewReqs.length === 1 ? reviewReqs[0] : undefined;
              const singleReviewActive = singleReview
                ? ["ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(singleReview.status)
                : false;
              const singleReviewHref = singleReview
                ? withMentorWorkReturn(
                    mentorWorkspaceDestination(
                      singleReviewActive
                        ? `/reviews/${encodeURIComponent(singleReview.assignmentId)}`
                        : `/review-requests/${encodeURIComponent(singleReview.requestId)}`,
                    ),
                    returnTo,
                  )
                : null;

              const sectionDisplay =
                item.resource.kind === "MANUSCRIPT" && item.resource.sectionKey
                  ? (SECTION_LABELS[item.resource.sectionKey] ?? item.resource.sectionKey)
                  : null;
              const paperExtra = item.resource.paper
                ? [
                    item.resource.paper.authors.slice(0, 3).join(", ") +
                      (item.resource.paper.authors.length > 3 ? " et al." : ""),
                    item.resource.paper.publicationYear ? String(item.resource.paper.publicationYear) : "",
                    item.resource.paper.doi ? `DOI: ${item.resource.paper.doi}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null;
              const versionLabel =
                item.latestRevisionNumber != null
                  ? (item.sharedVersionCount ?? 0) > 1
                    ? `v${item.latestRevisionNumber} · ${t("{{count}} phiên bản được chia sẻ", { count: item.sharedVersionCount ?? 0 })}`
                    : `v${item.latestRevisionNumber}`
                  : null;

              return (
                <article key={item.id} className="mentor-res-row" data-category={itemCategory}>
                  <div className="mentor-res-icon" data-category={itemCategory}>
                    <ResourceCategoryIcon category={itemCategory} />
                  </div>

                  <div className="mentor-res-body">
                    <div className="mentor-res-title-line">
                      {manuscriptReadHref ? (
                        <Link to={manuscriptReadHref} className="mentor-res-title">
                          {item.resource.title}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="mentor-res-title text-left"
                          onClick={() => setActiveReader(item)}
                        >
                          {item.resource.title}
                        </button>
                      )}
                      <div className="mentor-res-badges">
                        <span className="mentor-res-type-badge" data-category={itemCategory}>
                          {t(resourceTypeLabelKey(item))}
                        </span>
                        {versionLabel ? (
                          <span className="mentor-res-version-badge">{versionLabel}</span>
                        ) : null}
                        {item.resource.hasPdf ? (
                          <span className="mentor-res-pdf-badge">PDF</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mentor-res-meta">
                      <span className="font-medium text-foreground/85">{item.projectTitle}</span>
                      {sectionDisplay ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{sectionDisplay}</span>
                        </>
                      ) : null}
                      {paperExtra ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{paperExtra}</span>
                        </>
                      ) : null}
                      {!paperExtra && item.originalFileName ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{item.originalFileName}</span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>
                        {t("Người chia sẻ")}: {item.sharedByName ?? t("Nhóm chia sẻ")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <SharedDate value={item.sharedAt ?? item.resource.createdAt} />
                    </div>

                    {item.resource.message ? (
                      <p className="mentor-res-note">{item.resource.message}</p>
                    ) : null}
                  </div>

                  <div className="mentor-res-actions">
                    <span className="mentor-res-perm-badge" data-tone={perm.tone}>
                      {perm.tone === "comment" ? (
                        <MessageSquare size={12} aria-hidden="true" />
                      ) : (
                        <Eye size={12} aria-hidden="true" />
                      )}
                      <span>{t(perm.labelKey)}</span>
                    </span>

                    <div className="mentor-res-cta-group">
                      {manuscriptReadHref ? (
                        <Button asChild size="sm" variant="default" className="h-8 gap-1.5 text-xs">
                          <Link to={manuscriptReadHref}>
                            <span>{t(primaryCtaLabelKey(item))}</span>
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setActiveReader(item)}
                        >
                          <span>{t(primaryCtaLabelKey(item))}</span>
                        </Button>
                      )}

                      {singleReviewHref ? (
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <Link to={singleReviewHref}>
                            {t(singleReviewActive ? "Mở phản biện" : "Xem yêu cầu")}
                          </Link>
                        </Button>
                      ) : reviewReqs.length > 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setReviewPickerItem(item)}
                        >
                          {t("{{count}} yêu cầu phản biện", { count: reviewReqs.length })}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {!inbox.error &&
      inbox.data &&
      (inbox.data.unfilteredTotal ?? inbox.data.total ?? items.length) > 0 &&
      (page > 1 || inbox.data.hasNext) ? (
        <ResourcePager
          page={page}
          hasNext={inbox.data.hasNext}
          setPage={value => update({ page: value <= 1 ? "" : String(value) })}
          label={t("Phân trang tài liệu")}
        />
      ) : null}

      {/* Focused Read-Only Reader Dialog (reuses MentorSharedPaper for PAPER & grant-scoped snapshot for MANUSCRIPT/GAP/EXPLICIT SUBMISSION) */}
      <Dialog
        open={Boolean(activeReader)}
        onOpenChange={open => {
          if (!open) setActiveReader(null);
        }}
      >
        <DialogContent
          className="max-h-[88dvh] max-w-3xl overflow-y-auto"
          closeLabel={t("Đóng trình xem tài liệu")}
          data-no-i18n
        >
          {activeReader ? (
            <>
              <DialogHeader className="space-y-1.5 pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[11px] font-semibold">
                    {t(resourceTypeLabelKey(activeReader))}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium">
                    {t(permissionMeta(activeReader).labelKey)}
                  </Badge>
                </div>
                <DialogTitle className="break-words text-lg leading-snug">
                  {activeReader.resource.title}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-medium text-foreground/85">{activeReader.projectTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t("Người chia sẻ")}: {activeReader.sharedByName ?? t("Nhóm chia sẻ")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <SharedDate value={activeReader.sharedAt ?? activeReader.resource.createdAt} />
                </DialogDescription>
              </DialogHeader>

              <div className="pt-1">
                {activeReader.resource.kind === "PAPER" ? (
                  <MentorSharedPaper
                    key={activeReader.id}
                    projectId={activeReader.projectId}
                    accessId={activeReader.accessId}
                    resource={activeReader.resource}
                    initiallyOpen
                    embedded
                  />
                ) : (
                  <SharedResourceSnapshotViewer key={activeReader.id} item={activeReader} />
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Disambiguation Dialog when a submission has multiple valid review requests */}
      <Dialog
        open={Boolean(reviewPickerItem)}
        onOpenChange={open => {
          if (!open) setReviewPickerItem(null);
        }}
      >
        <DialogContent className="max-w-lg" data-no-i18n>
          {reviewPickerItem ? (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base">{t("Chọn yêu cầu phản biện")}</DialogTitle>
                <DialogDescription className="text-xs leading-5">
                  {t("Tài liệu này có nhiều yêu cầu phản biện hợp lệ. Chọn đúng yêu cầu bạn muốn mở:")}
                </DialogDescription>
              </DialogHeader>
              <ul className="divide-y rounded-lg border border-border">
                {(reviewPickerItem.reviewRequests ?? []).map(req => {
                  const isActive = ["ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(req.status);
                  const targetHref = withMentorWorkReturn(
                    mentorWorkspaceDestination(
                      isActive
                        ? `/reviews/${encodeURIComponent(req.assignmentId)}`
                        : `/review-requests/${encodeURIComponent(req.requestId)}`,
                    ),
                    returnTo,
                  );
                  const readHref = resolveManuscriptDestination({
                    actorRole: "REVIEWER",
                    requestId: req.requestId,
                    revisionId: req.revisionId,
                    returnTo,
                  });
                  return (
                    <li key={req.requestId} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-sm">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">v{req.revisionNumber}</span>
                          <Badge variant="outline" className="h-5 px-2 text-[11px]">
                            {t(`reviewCenter.status.${req.status}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <SharedDate value={req.createdAt} />
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {readHref ? (
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            <Link to={readHref} onClick={() => setReviewPickerItem(null)}>
                              {t("Xem bản thảo")}
                            </Link>
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                          <Link to={targetHref} onClick={() => setReviewPickerItem(null)}>
                            {t(isActive ? "Mở phản biện" : "Xem yêu cầu")}
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
