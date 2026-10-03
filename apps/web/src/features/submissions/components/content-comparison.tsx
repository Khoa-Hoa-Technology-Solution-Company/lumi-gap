import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchVersion } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";
import { diffContent } from "../content-diff";
import { submissionsApi } from "../api/submissions.api";

export function ContentComparison({ id, before, after }: { id: string; before?: ResearchVersion; after?: ResearchVersion }) {
  const selectionRef = useRef("");
  selectionRef.current = `${before?.id}:${after?.id}`;
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const diff = useMemo(() => before?.contentSnapshot != null && after?.contentSnapshot != null ? diffContent(before.contentSnapshot, after.contentSnapshot) : undefined, [before?.contentSnapshot, after?.contentSnapshot]);
  useEffect(() => { setUrls([]); setError(false); }, [before?.id, after?.id]);
  useEffect(() => () => { urls.forEach(URL.revokeObjectURL); }, [urls]);
  if (!before || !after) return null;
  return <details className="mt-5 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Đối chiếu nội dung v{before.revisionNumber} / v{after.revisionNumber}</summary>
    {diff ? <div className="mt-3 max-h-96 overflow-auto rounded-md border font-mono text-xs leading-6" aria-label="Thay đổi nội dung Markdown"><p className="sticky top-0 bg-background px-3 py-2 font-sans text-xs">+ Thêm · − Xóa · = Giữ nguyên</p>{diff.map((line, index) => <div key={index} className={`whitespace-pre-wrap break-words px-3 ${line.kind === "added" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : line.kind === "removed" ? "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : "text-muted-foreground"}`}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "= "}{line.text || " "}</div>)}</div> : before.hasPdf && after.hasPdf ? <div className="mt-3"><p className="text-xs text-muted-foreground">Xem hai PDF cạnh nhau để tự đối chiếu. Hệ thống chưa trích xuất và đánh dấu khác biệt trong PDF.</p><Button className="mt-3" variant="outline" size="sm" disabled={loading} onClick={async () => { const selection = selectionRef.current; setLoading(true); setError(false); try { const responses = await Promise.all([before, after].map((version) => api.get(API_ROUTES.submissions.revisionDownload(id, version.id), { responseType: "blob" }))); if (selection !== selectionRef.current) return; setUrls(responses.map((response) => URL.createObjectURL(response.data as Blob))); } catch { setError(true); } finally { setLoading(false); } }}>{loading ? "Đang tải…" : "Mở hai PDF"}</Button>{error ? <p className="mt-2 text-xs text-red-700">Không thể mở PDF. Bạn có thể tải từng bản bên dưới.</p> : null}<div className="mt-3 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">{[before, after].map((version, index) => <div key={`${version.id}-${index}`} className="min-w-0"><p className="text-sm font-medium">v{version.revisionNumber}</p>{urls[index] ? <iframe title={`Nội dung PDF v${version.revisionNumber}`} src={urls[index]} className="mt-2 h-[500px] w-full rounded-md border" /> : null}<Button className="mt-2" size="sm" variant="ghost" onClick={() => submissionsApi.downloadRevision(id, version.id, version.revisionNumber).catch(() => setError(true))}>Tải PDF v{version.revisionNumber}</Button></div>)}</div></div> : <div className="mt-3"><p className="text-xs text-muted-foreground">{diff === null ? "Tài liệu dài: hiển thị hai bản nội dung để đối chiếu trực tiếp." : "Hai bản có loại nội dung khác nhau; xem nội dung và tải PDF trong danh sách phiên bản."}</p>{diff === null ? <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">{[before, after].map((version, index) => <pre key={`${version.id}-${index}`} className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs">{version.contentSnapshot}</pre>)}</div> : null}</div>}
  </details>;
}
