import { useRef } from "react";
import type { ScreeningChoice, ScreeningState, ScreeningPaperRow } from "@trend/shared-types";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { useResearchCommand } from "../hooks/use-project-research";
export const stateLabels: Record<ScreeningState, string> = { NOT_REVIEWED: "Chưa có đánh giá", IN_REVIEW: "Đang đánh giá", NEEDS_RESOLUTION: "Cần xem xét thêm", AWAITING_FINALIZATION: "Chờ quyết định", INCLUDED: "Đã chọn", EXCLUDED: "Đã loại", BACKGROUND: "Tài liệu nền" };
export const choiceLabels: Record<ScreeningChoice, string> = { INCLUDE: "Phù hợp", EXCLUDE: "Không phù hợp", UNSURE: "Chưa chắc chắn" };
export function screeningMetadataWarning(paper: Pick<ScreeningPaperRow, "title" | "journalName" | "paperKind">) {
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (paper.journalName && normalize(paper.title) === normalize(paper.journalName)) return "Tiêu đề trùng tên tạp chí. Cần kiểm tra nguồn và DOI để xác nhận đây là một bài báo cụ thể.";
  if (paper.paperKind === "journal" || paper.paperKind === "paratext") return "Nguồn có thể là tạp chí hoặc tài liệu phụ trợ. Cần xác minh loại tài liệu trước khi đánh giá.";
  return null;
}
export function ScreeningStatus({ status }: { status: ScreeningState }) { return <span className="screening-state" data-state={status}>{stateLabels[status]}</span>; }
export function ScreeningError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  const status = isAxiosError(error) ? error.response?.status : null;
  const message = isAxiosError(error) ? error.response?.data?.error?.message : null;
  const explanation = typeof message === "string" && /[À-ỹĐđ]/.test(message) ? message : null;
  return <div role="alert" className="screening-error"><p>{explanation ? `${explanation}. Nội dung bạn nhập vẫn được giữ.` : status === 409 ? "Dữ liệu đã thay đổi. Tải lại để kiểm tra; nội dung bạn nhập vẫn được giữ." : status === 403 || status === 404 ? "Bạn chưa có quyền thực hiện hoặc mục này không còn khả dụng." : "Chưa thể thực hiện yêu cầu. Nội dung bạn nhập vẫn được giữ, vui lòng thử lại."}</p>{retry && <Button type="button" variant="outline" size="sm" onClick={retry}>Tải lại</Button>}</div>;
}
/** Reuse a key on network retry; a changed payload gets a new key. */
export function useScreeningCommand(projectId: string) {
  const command = useResearchCommand(projectId), busy = useRef(false), attempt = useRef<{ content: string; key: string }>();
  const run = async (payload: unknown, execute: (key: string) => Promise<unknown>) => {
    if (busy.current) return false;
    const content = JSON.stringify(payload);
    if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() };
    busy.current = true;
    try { await command.mutateAsync(() => execute(attempt.current!.key)); attempt.current = undefined; return true; }
    catch { return false; } finally { busy.current = false; }
  };
  return { ...command, run };
}
export function ScreeningPager({ page, total, hasNext, onPage }: { page: number; total: number; hasNext: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="Phân trang" className="screening-actions"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page-1)}>Trang trước</Button><span>Trang {page} · {total} mục</span><Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page+1)}>Trang sau</Button></nav>;
}
