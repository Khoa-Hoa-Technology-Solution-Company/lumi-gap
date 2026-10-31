import { useState } from "react";
import { Link } from "react-router-dom";
import type { PaperRef } from "@trend/shared-types";
import { papersApi } from "@/features/papers/api/papers.api";
import { Button } from "@/components/ui/button";
import { projectsApi } from "../api/projects.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ScreeningError, useScreeningCommand } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";

export function LibraryRelatedPapers({ projectId, paperId, readOnly }: { projectId: string; paperId: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const data = useResearchResource(projectId, ["library-relations", paperId], async () => {
    const [references, related] = await Promise.allSettled([papersApi.references(paperId), papersApi.related(paperId)]);
    return { references, related };
  }, open);
  const project = useResearchResource(projectId, ["library-membership"], () => projectsApi.detail(projectId), open);
  const command = useScreeningCommand(projectId), [added, setAdded] = useState<string[]>([]);
  function has(p: PaperRef) {
    return added.includes(p.id) || project.data?.papers.some(l => typeof l.targetId === "string" ? l.targetId === p.id : l.targetId._id === p.id || ("id" in l.targetId && l.targetId.id === p.id) || Boolean(p.doi && l.targetId.doi?.toLowerCase() === p.doi.toLowerCase()));
  }
  function list(items: PaperRef[]) {
    return <ul className="library-related-list">{items.slice(0, 6).map(p => <li key={p.id}><div><Link to={`/papers/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer">{p.title}</Link><small>{p.publicationYear || "Chưa rõ năm"}</small></div><Button variant="outline" size="sm" disabled={readOnly || command.isPending || project.isLoading || project.isError || has(p)} onClick={() => void command.run({ related: p.id }, async () => { await projectsApi.addPaper(projectId, { paperId: p.id }); setAdded(ids => [...ids, p.id]); })}>{has(p) ? "Đã có trong dự án" : "Thêm vào dự án"}</Button></li>)}</ul>;
  }
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>Bài báo liên quan</summary>
    <p className="text-sm text-muted-foreground">Dữ liệu quan hệ từ nguồn đã lưu. Danh sách chỉ hiển thị các bài hiện có trong hệ thống.</p>
    {data.isLoading && <WorkspaceLoading />}
    {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
    {project.isError && <ScreeningError error={project.error} retry={() => void project.refetch()} />}
    {data.data && <>
      <h4>Tài liệu được bài này trích dẫn</h4>
      {data.data.references.status === "rejected" ? <ScreeningError error={data.data.references.reason} retry={() => void data.refetch()} /> : <>{list(data.data.references.value.references)}<p className="text-sm text-muted-foreground">{data.data.references.value.inCorpus}{data.data.references.value.totalReferenced !== undefined && `/${data.data.references.value.totalReferenced}`} tài liệu có trong hệ thống.{!data.data.references.value.totalReferenced && " Chưa có tổng số trích dẫn từ nguồn; danh sách trống không đồng nghĩa bài không có tài liệu tham khảo."}</p></>}
      <h4>Bài tương tự do nguồn đề xuất</h4>
      <p className="text-sm text-muted-foreground">Quan hệ tương tự; không phải bằng chứng hai bài trích dẫn nhau.</p>
      {data.data.related.status === "rejected" ? <ScreeningError error={data.data.related.reason} retry={() => void data.refetch()} /> : <>{list(data.data.related.value.relatedWorks)}<p className="text-sm text-muted-foreground">{data.data.related.value.inCorpus}{data.data.related.value.totalRelated !== undefined && `/${data.data.related.value.totalRelated}`} bài có trong hệ thống.{!data.data.related.value.totalRelated && " Chưa có tổng số bài tương tự từ nguồn; chỉ hiển thị quan hệ đã được lưu trong hệ thống."}</p></>}
    </>}
    <ScreeningError error={command.error} />
  </details>;
}
