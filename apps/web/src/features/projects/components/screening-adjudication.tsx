import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import type { ScreeningAdjudicationPacket } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { useUnsavedWorkspace } from "./workspace-common";
import { choiceLabels, ScreeningError, ScreeningStatus, useScreeningCommand } from "./screening-common";
import "../screening.css";

export function ScreeningPacket({ packet }: { packet: ScreeningAdjudicationPacket }) {
  return <section className="space-y-4 break-words rounded-lg border bg-card p-4" aria-label="Gói phân xử được chia sẻ">
    <div><h3 className="text-base font-semibold">{packet.paper.title}</h3><p className="mt-1 text-sm text-muted-foreground">{packet.paper.publicationYear} · {packet.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / tóm tắt"}{packet.paper.doi && ` · DOI: ${packet.paper.doi}`}</p></div>
    <div><h4 className="text-sm font-semibold">Tóm tắt bài báo</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{packet.paper.abstractText || "Bài chưa có tóm tắt. Cần làm rõ thông tin trước khi kết luận."}</p></div>
    {([["Câu hỏi nghiên cứu", packet.researchQuestions], ["Tiêu chí đưa vào", packet.inclusionCriteria], ["Tiêu chí loại", packet.exclusionCriteria]] as const).map(([label, items]) => <div key={label}><h4 className="text-sm font-semibold">{label}</h4>{items.length ? <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-6">{items.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa được khai báo trong quy trình này.</p>}</div>)}
    <h4 className="text-sm font-semibold">Các phiếu được chia sẻ</h4>
    {packet.reviews.map((review, i) => <article key={review.id} className="space-y-1 rounded-md border p-3 text-sm leading-6"><h5 className="font-semibold">Reviewer {i + 1} · {choiceLabels[review.decision]}</h5>{review.exclusionReason && <p>Lý do loại: {review.exclusionReason}</p>}<p className="whitespace-pre-wrap">{review.comment || "Không có nhận xét bổ sung."}</p>{review.fullTextReference && <p className="whitespace-pre-wrap">Nguồn toàn văn do reviewer ghi: {review.fullTextReference}</p>}<small className="text-muted-foreground">Phiên bản phiếu {review.revision}</small></article>)}
    {Boolean(packet.discussion?.length) && <div className="space-y-2"><h4 className="text-sm font-semibold">Thảo luận được chọn để chia sẻ</h4>{packet.discussion!.map(item => <blockquote key={item.id} className="space-y-1 border-b pb-2 text-sm"><p className="whitespace-pre-wrap">{item.comment}</p><small className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("vi-VN")}</small></blockquote>)}</div>}
    <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">Gói chỉ gồm bài báo, tiêu chí, các phiếu và nội dung thảo luận đã được duyệt riêng. Quyền này không mở thư viện dự án, bản thảo hoặc toàn bộ thảo luận nội bộ.</p>
  </section>;
}

export function ScreeningPacketPreview({ projectId, roundId, onReady, selectedDiscussionIds = [], onDiscussionChange }: { projectId: string; roundId: string; onReady?: (version: number | null) => void; selectedDiscussionIds?: string[]; onDiscussionChange?: (ids: string[]) => void }) {
  const query = useResearchResource(projectId, ["adjudication-preview", roundId], () => screeningApi.adjudication(projectId, roundId));
  useEffect(() => { onReady?.(query.isSuccess && !query.isFetching ? query.data.version : null); }, [onReady, query.isSuccess, query.isFetching, query.data?.version]);
  return query.isLoading ? <p role="status">Đang tải gói để duyệt…</p> : query.isError ? <ScreeningError error={query.error} retry={() => void query.refetch()} /> : query.data ? <>
    {onDiscussionChange && Boolean(query.data.availableDiscussion?.length) && <fieldset className="space-y-2"><legend className="font-medium">Chọn thảo luận cần giảng viên xem (tùy chọn)</legend><p className="text-sm text-muted-foreground">Tối đa 20 mục từ 50 thảo luận gần nhất. Mặc định không chia sẻ mục nào.</p>{query.data.availableDiscussion!.map(item => <label className="screening-check items-start" key={item.id}><input type="checkbox" checked={selectedDiscussionIds.includes(item.id)} disabled={!selectedDiscussionIds.includes(item.id) && selectedDiscussionIds.length >= 20} onChange={e => onDiscussionChange(e.target.checked ? [...selectedDiscussionIds, item.id] : selectedDiscussionIds.filter(id => id !== item.id))} /><span className="whitespace-pre-wrap break-words text-sm">{item.comment}</span></label>)}</fieldset>}
    <ScreeningPacket packet={{ ...query.data.packet, discussion: query.data.availableDiscussion?.filter(item => selectedDiscussionIds.includes(item.id)) ?? query.data.packet.discussion }} />
  </> : null;
}

export default function ScreeningAdjudicationPage() {
  const { projectId = "", roundId = "" } = useParams();
  return <AdjudicationForm key={`${projectId}:${roundId}`} projectId={projectId} roundId={roundId} />;
}

function AdjudicationForm({ projectId, roundId }: { projectId: string; roundId: string }) {
  const query = useResearchResource(projectId, ["screening-adjudication", roundId], () => screeningApi.adjudication(projectId, roundId), true, view => Boolean(view?.canResolve));
  const [decision, setDecision] = useState<"INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO">("INCLUDED"), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [version, setVersion] = useState<number | null>(null);
  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(Boolean(reason) || confirmed || command.isPending);
  const view = query.data, stale = version !== null && version !== view?.version;
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-7" data-no-i18n><Link to="/academic-support?view=active" className="text-sm text-primary underline underline-offset-4">Về không gian cố vấn</Link><header><h1 className="text-2xl font-semibold">Phân xử bài báo</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Đọc gói được chia sẻ và ghi kết luận dựa trên tiêu chí nghiên cứu. Kết luận được lưu riêng với các phiếu ban đầu.</p></header>
    {query.isLoading ? <p role="status">Đang tải gói phân xử…</p> : query.isError ? <ScreeningError error={query.error} retry={() => void query.refetch()} /> : view && <><ScreeningStatus status={view.status} /><ScreeningPacket packet={view.packet} />
      {view.resolution && <section role="status" className="rounded-lg border p-4"><h2 className="font-semibold">Cần đọc thêm / bổ sung thông tin</h2><p className="mt-2 whitespace-pre-wrap text-sm">{view.resolution.reason}</p></section>}{view.finalDecision ? <section role="status" className="rounded-lg border p-4"><h2 className="font-semibold">Đã ghi kết luận: {view.finalDecision.decision === "INCLUDED" ? "Phù hợp" : view.finalDecision.decision === "EXCLUDED" ? "Không phù hợp" : "Tài liệu nền"}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{view.finalDecision.reason}</p></section> : !view.canResolve ? <p role="status">Bạn có thể xem gói này, nhưng hiện không có quyền ghi kết luận.</p> : <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (!confirmed || stale || !view.canResolve || reason.trim().length < 10) return; const payload = { decision, reason, confirmed: true, expectedVersion: version ?? view.version }; if (await command.run({ roundId, ...payload }, clientKey => screeningApi.action(projectId, roundId, "resolve", { ...payload, clientKey }))) { setReason(""); setConfirmed(false); setVersion(null); } }}>
        <fieldset disabled={command.isPending || stale} className="space-y-4"><legend className="text-base font-semibold">Kết luận phân xử</legend><div className="flex flex-wrap gap-5">{(["INCLUDED", "EXCLUDED", "NEEDS_MORE_INFO"] as const).map(value => <label className="flex items-center gap-2 text-sm" key={value}><input type="radio" name="adjudication-decision" checked={decision === value} onChange={() => { setDecision(value); setConfirmed(false); setVersion(view.version); }} />{value === "INCLUDED" ? "Phù hợp" : value === "EXCLUDED" ? "Không phù hợp" : "Cần đọc thêm / bổ sung thông tin"}</label>)}</div><label className="block space-y-2 text-sm"><span>Lý do dựa trên tiêu chí (ít nhất 10 ký tự)</span><textarea className="min-h-28 w-full rounded-md border bg-background p-3" value={reason} maxLength={2000} minLength={10} required onChange={e => { setReason(e.target.value); setConfirmed(false); if (version === null) setVersion(view.version); }} /></label><label className="flex items-start gap-2 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); if (version === null) setVersion(view.version); }} />Tôi đã xem các phiếu và xác nhận kết luận này.</label></fieldset>
        {stale && <div role="alert" className="space-y-2 text-sm"><p>Gói hoặc phân công đã thay đổi. Lý do của bạn được giữ; hãy đọc lại trước khi xác nhận.</p><Button type="button" variant="outline" onClick={() => { setVersion(view.version); setConfirmed(false); }}>Tôi đã kiểm tra gói hiện tại</Button></div>}
        <ScreeningError error={command.error} /><Button disabled={command.isPending || stale || !confirmed || reason.trim().length < 10}>Ghi kết luận và lưu lịch sử</Button>
      </form>}
    </>}
  </main>;
}
