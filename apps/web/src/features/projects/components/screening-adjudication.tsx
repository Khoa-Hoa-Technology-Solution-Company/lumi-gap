import { ScreeningCaseControls, adjudicatorRoleLabels } from "./screening-case-controls";
import { ResolutionEvidenceFields, emptyResolutionEvidence } from "./screening-resolution-evidence";
import { useState, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ScreeningAdjudicationPacket, ScreeningAdjudicationView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { useUnsavedWorkspace } from "./workspace-common";
import { choiceLabels, ScreeningError, ScreeningStatus, useScreeningCommand } from "./screening-common";
import { Scale, ExternalLink } from "lucide-react";
import "../screening.css";

function PacketReviewBallot({ review, index }: { review: ScreeningAdjudicationPacket["reviews"][number]; index: number }) {
  const [open, setOpen] = useState(false);
  const title = `Reviewer ${index === 0 ? "A" : "B"}${review.reviewerName ? ` · ${review.reviewerName}` : ""} · ${choiceLabels[review.decision]}`;
  const fields = [
    { label: "Lý do loại", text: review.exclusionReason },
    { label: "Nhận xét / Căn cứ", text: review.comment },
    { label: "Nguồn toàn văn do reviewer ghi", text: review.fullTextReference },
  ].filter((field): field is { label: string; text: string } => Boolean(field.text));
  const isLong = (text: string) => text.length > 180 || text.split("\n").length > 3;
  const hasLongText = fields.some(field => isLong(field.text));
  return <Dialog open={open} onOpenChange={setOpen}><article className="min-w-0 space-y-2 rounded-md border p-3 text-sm leading-6 [overflow-wrap:anywhere]">
    <h5 className="font-semibold">{title}</h5>
    {fields.map(field => <div key={field.label}>
      <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
      <p className={`whitespace-pre-wrap ${isLong(field.text) ? "line-clamp-3" : ""}`}>
        {isLong(field.text) ? `${field.text.slice(0, 180).split("\n").slice(0, 3).join("\n")}…` : field.text}
      </p>
    </div>)}
    {!review.comment && !review.exclusionReason && <p>Không có nhận xét bổ sung.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <small className="text-muted-foreground">Phiên bản phiếu {review.revision}</small>
      {hasLongText && <DialogTrigger asChild><Button type="button" variant="link" size="sm" className="h-auto px-0 py-1" aria-label={`Xem đầy đủ phiếu Reviewer ${index === 0 ? "A" : "B"}`}>Xem đầy đủ</Button></DialogTrigger>}
    </div>
      <DialogContent closeLabel="Đóng" className="flex max-h-[85dvh] min-w-0 flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-6 text-left [overflow-wrap:anywhere]">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Phiên bản phiếu {review.revision}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain pr-2 text-sm leading-6 [overflow-wrap:anywhere]" tabIndex={0} role="region" aria-label="Nội dung đầy đủ của phiếu">
          {fields.map(field => <section key={field.label} className="space-y-1">
            <h4 className="font-semibold">{field.label}</h4>
            <p className="whitespace-pre-wrap">{field.text}</p>
          </section>)}
        </div>
      </DialogContent>
  </article></Dialog>;
}

export function ScreeningPacket({
  packet,
  projectId,
  caseId,
  showAllReviews = false,
  showDiscussion = false,
}: {
  packet: ScreeningAdjudicationPacket;
  projectId?: string;
  caseId?: string;
  showAllReviews?: boolean;
  showDiscussion?: boolean;
}) {
  const [sourceError, setSourceError] = useState<unknown>(null);
  const download = async (fileId: string) => {
    if (!projectId) return;
    try {
      setSourceError(null);
      const blob = await screeningApi.caseSource(projectId, packet.roundId, fileId, caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "paper-source.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setSourceError(error);
    }
  };
  return (
    <section className="space-y-4 break-words rounded-lg border bg-card p-4" aria-label="Gói phân xử được chia sẻ">
      <div>
        <h3 className="text-base font-semibold">{packet.paper.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {packet.paper.publicationYear} · {packet.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / tóm tắt"}
          {packet.paper.doi && ` · DOI: ${packet.paper.doi}`}
        </p>
        {packet.protocol && (
          <p className="text-xs text-muted-foreground">
            Quy trình phiên bản {packet.protocol.version} · Luồng sàng lọc {packet.protocol.workflowVersion ?? "lịch sử"}
          </p>
        )}
        {packet.paper.doi && (
          <a className="text-sm text-primary underline" href={`https://doi.org/${encodeURI(packet.paper.doi)}`} target="_blank" rel="noreferrer">
            Mở nguồn nhà xuất bản
          </a>
        )}
      </div>
      {packet.reviews.length ? (
        <div>
          <h4 className="text-sm font-semibold">Tóm tắt bài báo</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
            {packet.paper.abstractText || "Bài chưa có tóm tắt. Cần làm rõ thông tin trước khi kết luận."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Hồ sơ chưa có đủ thông tin nguồn để hiển thị.</p>
      )}
      {([
        ["Câu hỏi nghiên cứu", packet.researchQuestions],
        ["Tiêu chí đưa vào", packet.inclusionCriteria],
        ["Tiêu chí loại", packet.exclusionCriteria],
      ] as const).map(([label, items]) => (
        <div key={label}>
          <h4 className="text-sm font-semibold">{label}</h4>
          {items.length ? (
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-6">
              {items.map((text, i) => <li key={i}>{text}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa được khai báo trong quy trình này.</p>
          )}
        </div>
      ))}
      {Boolean(packet.sources?.length) && projectId && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Tài liệu nguồn được cấp quyền</h4>
          {packet.sources!.map((f, i) => (
            <Button key={f.id} type="button" size="sm" variant="outline" onClick={() => void download(f.id)}>
              Tải PDF {i + 1} ({Math.ceil(f.byteSize / 1024)} KB)
            </Button>
          ))}
          <ScreeningError error={sourceError} />
        </section>
      )}
      {Boolean(packet.reviews.length) && <h4 className="text-sm font-semibold">Hai phiếu hiện hành</h4>}
      <div className="grid gap-4 sm:grid-cols-2">
        {[...packet.reviews]
          .sort((a, b) => (a.reviewerId ?? a.id).localeCompare(b.reviewerId ?? b.id))
          .map((review, i) => <PacketReviewBallot key={review.id} review={review} index={i} />)}
      </div>
      {showAllReviews && Boolean(packet.allReviews?.length) && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Lịch sử phiếu độc lập và các phiên bản sửa</summary>
          <div className="mt-3 space-y-3">
            {packet.allReviews!.map(r => (
              <article key={r.id} className="border-t pt-2 text-sm">
                <p className="font-medium">
                  {packet.reviews.find(v => v.reviewerId === r.reviewerId)?.reviewerName ?? "Reviewer"} · Bản {r.revision} · {choiceLabels[r.decision]}
                </p>
                <p className="whitespace-pre-wrap">{r.exclusionReason || r.comment}</p>
                {r.exclusionReason && r.comment && <p className="whitespace-pre-wrap">{r.comment}</p>}
                <small>{new Date(r.submittedAt).toLocaleString("vi-VN")}</small>
              </article>
            ))}
          </div>
        </details>
      )}
      {showDiscussion && Boolean(packet.discussion?.length) && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Thảo luận trước khi mở hồ sơ ({packet.discussion!.length})</summary>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Thảo luận đã có</h4>
            {packet.discussion!.map(item => (
              <blockquote key={item.id} className="space-y-1 border-b pb-2 text-sm">
                <p className="whitespace-pre-wrap">{item.comment}</p>
                <small className="text-muted-foreground">{item.actorName && `${item.actorName} · `}{new Date(item.createdAt).toLocaleString("vi-VN")}</small>
              </blockquote>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function ScreeningPacketPreview({ projectId, roundId, onReady, selectedDiscussionIds = [], onDiscussionChange }: { projectId: string; roundId: string; onReady?: (version: number | null) => void; selectedDiscussionIds?: string[]; onDiscussionChange?: (ids: string[]) => void }) {
  const query = useResearchResource(projectId, ["adjudication-preview", roundId], () => screeningApi.adjudication(projectId, roundId));
  useEffect(() => { onReady?.(query.isSuccess && !query.isFetching ? query.data.version : null); }, [onReady, query.isSuccess, query.isFetching, query.data?.version]);
  return query.isLoading ? <p role="status">Đang tải gói để duyệt…</p> : query.isError ? <ScreeningError error={query.error} retry={() => void query.refetch()} /> : query.data ? <>
    {onDiscussionChange && Boolean(query.data.availableDiscussion?.length) && <fieldset className="space-y-2"><legend className="font-medium">Chọn thảo luận cần giảng viên xem (tùy chọn)</legend><p className="text-sm text-muted-foreground">Tối đa 20 mục từ 50 thảo luận gần nhất. Mặc định không chia sẻ mục nào.</p>{query.data.availableDiscussion!.map(item => <label className="screening-check items-start" key={item.id}><input type="checkbox" checked={selectedDiscussionIds.includes(item.id)} disabled={!selectedDiscussionIds.includes(item.id) && selectedDiscussionIds.length >= 20} onChange={e => onDiscussionChange(e.target.checked ? [...selectedDiscussionIds, item.id] : selectedDiscussionIds.filter(id => id !== item.id))} /><span className="whitespace-pre-wrap break-words text-sm">{item.comment}</span></label>)}</fieldset>}
    <ScreeningPacket packet={{ ...query.data.packet, discussion: query.data.availableDiscussion?.filter(item => selectedDiscussionIds.includes(item.id)) ?? query.data.packet.discussion }} showDiscussion />
  </> : null;
}

export function AdjudicationBody({
  projectId,
  roundId,
  view,
  onSaved,
}: {
  projectId: string;
  roundId: string;
  view: ScreeningAdjudicationView;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<"INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO">("INCLUDED"),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [version, setVersion] = useState<number | null>(null),
    [caseVersion, setCaseVersion] = useState<number | null>(null);
  const [evidence, setEvidence] = useState(emptyResolutionEvidence);

  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(Boolean(reason || evidence.sourceMaterial || evidence.exclusionReason) || confirmed || command.isPending);
  const stale = version !== null && (version !== view.version || caseVersion !== (view.case?.version ?? null));

  return (
    <>
      {view.case ? (
        <ScreeningCaseControls key={view.case.id} projectId={projectId} roundId={roundId} data={view.case} onSaved={onSaved} />
      ) : (
        <ScreeningStatus status={view.status} />
      )}

      <ScreeningPacket packet={view.packet} projectId={projectId} caseId={view.case?.id} />

      {view.resolution && (
        <section role="status" className="rounded-lg border p-4">
          <h2 className="font-semibold">Cần đọc thêm / bổ sung thông tin</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {view.resolution.resolverName} · {adjudicatorRoleLabels[view.resolution.resolverRole ?? ""]} ·{" "}
            {new Date(view.resolution.createdAt).toLocaleString("vi-VN")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{view.resolution.reason}</p>
          <p className="mt-2 text-sm">Căn cứ: {view.resolution.sourceMaterial}</p>
        </section>
      )}

      {view.finalDecision ? (
        <section role="status" className="rounded-lg border p-4">
          <h2 className="font-semibold">
            Đã ghi kết luận:{" "}
            {view.finalDecision.decision === "INCLUDED"
              ? "Qua vòng sàng lọc"
              : view.finalDecision.decision === "EXCLUDED"
              ? "Không phù hợp"
              : "Tài liệu nền"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {view.finalDecision.resolverName} · {adjudicatorRoleLabels[view.finalDecision.resolverRole ?? ""]} ·{" "}
            {new Date(view.finalDecision.createdAt).toLocaleString("vi-VN")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{view.finalDecision.reason}</p>
          {view.finalDecision.exclusionReason && (
            <p className="mt-2 text-sm">Lý do loại chính thức: {view.finalDecision.exclusionReason}</p>
          )}
          {view.finalDecision.sourceMaterial && (
            <p className="mt-2 text-sm">Nguồn đã xem xét: {view.finalDecision.sourceMaterial}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Hai phiếu ban đầu và lịch sử bất đồng được giữ nguyên. Kết quả chỉ được xem xét lại qua quy trình mở lại có lý do.
          </p>
        </section>
      ) : !view.canResolve ? null : (
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault();
            if (!confirmed || stale || !view.canResolve || reason.trim().length < 10) return;
            const payload = {
              decision,
              reason,
              ...evidence,
              retrieveFullText: decision === "NEEDS_MORE_INFO" && evidence.retrieveFullText,
              confirmed: true,
              expectedCaseVersion: caseVersion ?? view.case?.version,
              expectedVersion: version ?? view.version,
            };
            if (
              await command.run({ roundId, ...payload }, clientKey =>
                screeningApi.action(projectId, roundId, "resolve", { ...payload, clientKey })
              )
            ) {
              setReason("");
              setEvidence(emptyResolutionEvidence);
              setConfirmed(false);
              setVersion(null);
              setCaseVersion(null);
              onSaved();
            }
          }}
        >
          <fieldset disabled={command.isPending || stale} className="space-y-4">
            <legend className="text-base font-semibold">Quyết định phân xử</legend>
            <div className="flex flex-wrap gap-5">
              {(["INCLUDED", "EXCLUDED", "NEEDS_MORE_INFO"] as const).map(value => (
                <label className="flex items-center gap-2 text-sm" key={value}>
                  <input
                    type="radio"
                    name="adjudication-decision"
                    checked={decision === value}
                    onChange={() => {
                      setDecision(value);
                      setConfirmed(false);
                      setVersion(view.version);
                      setCaseVersion(view.case?.version ?? null);
                    }}
                  />
                  {value === "INCLUDED" ? "Qua vòng sàng lọc" : value === "EXCLUDED" ? "Loại khỏi vòng sàng lọc" : "Cần thêm thông tin"}
                </label>
              ))}
            </div>
            <label className="block space-y-2 text-sm">
              <span>Lý do dựa trên tiêu chí (ít nhất 10 ký tự)</span>
              <textarea
                className="min-h-28 w-full rounded-md border bg-background p-3"
                value={reason}
                maxLength={2000}
                minLength={10}
                required
                onChange={e => {
                  setReason(e.target.value);
                  setConfirmed(false);
                  if (version === null) {
                    setVersion(view.version);
                    setCaseVersion(view.case?.version ?? null);
                  }
                }}
              />
            </label>
            <ResolutionEvidenceFields
              value={evidence}
              onChange={value => {
                setEvidence(value);
                setConfirmed(false);
                if (version === null) {
                  setVersion(view.version);
                  setCaseVersion(view.case?.version ?? null);
                }
              }}
              decision={decision}
              criteria={view.packet.exclusionCriteria}
              required
              canRetrieveFullText={
                view.packet.phase === "TITLE_ABSTRACT" &&
                view.packet.protocol?.allowConservativeFullText &&
                view.packet.protocol.stages.includes("FULL_TEXT")
              }
            />
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                className="mt-1"
                type="checkbox"
                checked={confirmed}
                onChange={e => {
                  setConfirmed(e.target.checked);
                  if (version === null) {
                    setVersion(view.version);
                    setCaseVersion(view.case?.version ?? null);
                  }
                }}
              />
              Tôi đã xem các phiếu và xác nhận kết luận này.
            </label>
          </fieldset>
          {stale && (
            <div role="alert" className="space-y-2 text-sm">
              <p>Gói hoặc phân công đã thay đổi. Lý do của bạn được giữ; hãy đọc lại trước khi xác nhận.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setVersion(view.version);
                  setCaseVersion(view.case?.version ?? null);
                  setConfirmed(false);
                }}
              >
                Tôi đã kiểm tra gói hiện tại
              </Button>
            </div>
          )}
          <ScreeningError error={command.error} />
          <Button disabled={command.isPending || stale || !confirmed || reason.trim().length < 10}>
            Ghi kết luận và lưu lịch sử
          </Button>
        </form>
      )}
    </>
  );
}

export function ScreeningAdjudicationDialog({
  projectId,
  roundId,
  caseId,
  open,
  onClose,
}: {
  projectId: string;
  roundId: string;
  caseId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useResearchResource(
    projectId,
    ["screening-adjudication", roundId, ...(caseId ? [caseId] : [])],
    () => screeningApi.adjudication(projectId, roundId, ...(caseId ? [caseId] as [string] : [])),
    open,
    view => Boolean(view?.case?.active)
  );
  const view = query.data;

  const handleSaved = () => {
    void query.refetch();
    void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" data-no-i18n>
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Scale size={18} className="text-purple-600 dark:text-purple-400" />
              <span>Hồ sơ phân xử</span>
            </DialogTitle>
            <Link
              to={`/academic-support/projects/${encodeURIComponent(projectId)}/screening/${encodeURIComponent(roundId)}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 underline underline-offset-4"
              title="Mở hồ sơ ở tab mới"
            >
              <span>Mở toàn trang</span>
              <ExternalLink size={12} />
            </Link>
          </div>
          <DialogDescription className="text-xs text-muted-foreground line-clamp-2">
            {view?.packet.paper.title || "Tài liệu nguồn, tiêu chí, phiếu đánh giá và lịch sử trao đổi của hai reviewer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {query.isLoading ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              Đang tải gói phân xử…
            </p>
          ) : query.isError ? (
            <ScreeningError error={query.error} retry={() => void query.refetch()} />
          ) : view ? (
            <AdjudicationBody
              projectId={projectId}
              roundId={roundId}
              view={view}
              onSaved={handleSaved}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ScreeningAdjudicationPage() {
  const actorId = useAuthStore(s => s.user?.id);
  const { projectId = "", roundId = "" } = useParams();
  const [params] = useSearchParams();
  const caseId = params.get("caseId") ?? undefined;
  return <AdjudicationForm key={`${actorId}:${projectId}:${roundId}:${caseId ?? "latest"}`} projectId={projectId} roundId={roundId} caseId={caseId} />;
}

function AdjudicationForm({ projectId, roundId, caseId }: { projectId: string; roundId: string; caseId?: string }) {
  const query = useResearchResource(
    projectId,
    ["screening-adjudication", roundId, ...(caseId ? [caseId] : [])],
    () => screeningApi.adjudication(projectId, roundId, ...(caseId ? [caseId] as [string] : [])),
    true,
    view => Boolean(view?.case?.active)
  );
  const view = query.data;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-7" data-no-i18n>
      <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=my-work`} className="text-sm text-primary underline underline-offset-4">
        Về Việc của tôi
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Hồ sơ phân xử</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{view?.packet.paper.title}</p>
      </header>
      {query.isLoading ? (
        <p role="status">Đang tải gói phân xử…</p>
      ) : query.isError ? (
        <ScreeningError error={query.error} retry={() => void query.refetch()} />
      ) : view ? (
        <AdjudicationBody projectId={projectId} roundId={roundId} view={view} onSaved={() => void query.refetch()} />
      ) : null}
    </main>
  );
}
