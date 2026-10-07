import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaperKnowledge } from "@trend/shared-types";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";

const labels: Record<string, string> = {
  USES_METHOD: "Method", USES_DATASET: "Dataset", REPORTS_FINDING: "Finding",
  HAS_LIMITATION: "Limitation", PROPOSES_FUTURE_WORK: "Future work", STUDIES_CONCEPT: "Concept",
};

export function PaperKnowledgePanel({ paperId }: { paperId: string }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const key = ["paper-knowledge", paperId];
  const query = useQuery({
    queryKey: key, enabled: Boolean(user),
    queryFn: async () => (await api.get(`/papers/${paperId}/knowledge`)).data.data as PaperKnowledge,
    refetchInterval: (state) => ["queued", "processing"].includes(state.state.data?.status ?? "") ? 4000 : false,
  });
  const index = useMutation({
    mutationFn: () => api.post(`/papers/${paperId}/knowledge`, { force: query.data?.status === "ready" }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const data = query.data;
  const busy = index.isPending || ["queued", "processing"].includes(data?.status ?? "");
  const nodeById = new Map(data?.nodes.map((node) => [node.id, node]) ?? []);
  return <section aria-label="Paper knowledge and source evidence" className="space-y-4 rounded-2xl border bg-card p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Knowledge & source evidence</h2><p className="text-sm text-muted-foreground">Prepare this paper for evidence-based reports and research gaps.</p></div>
      {user && <Button disabled={busy || query.isLoading || query.isError} onClick={() => index.mutate()}>{busy ? "Indexing…" : data?.status === "ready" ? "Refresh index" : data?.status === "failed" ? "Retry indexing" : "Index paper"}</Button>}
    </div>
    {!user ? <p className="text-sm"><Link className="underline" to="/login">Sign in</Link> to index this paper and inspect its evidence.</p> : <>
      <p role="status" className="text-sm">{query.isLoading ? "Loading evidence…" : `Status: ${data?.status.replaceAll("_", " ") ?? "unavailable"}`}{data?.status === "ready" ? ` · ${data.sourceKind === "abstract" ? "Abstract only" : `PDF text · ${data.pageCount} pages`} · ${data.chunkCount} passages` : ""}</p>
      {(query.isError || index.isError) && <div role="alert" className="text-sm text-destructive">{(index.error ?? query.error)?.message ?? "Could not load paper knowledge"}{query.isError && <Button variant="ghost" onClick={() => void query.refetch()}>Retry</Button>}</div>}
      {data?.errorMessage && <p role="alert" className="text-sm text-destructive">{data.errorMessage}</p>}
      {data?.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
      {data?.status === "ready" && <>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Knowledge graph · {data.nodes.length} entities</summary>
          <p className="my-2 text-xs text-muted-foreground">Each relation connects this paper to an extracted entity. The source quote supports the relation; it does not independently verify the paper’s claim.</p>
          <ul className="space-y-3">{data.edges.map((edge) => <li key={edge.id} className="border-t pt-3 text-sm"><p className="font-medium">This paper → {labels[edge.kind] ?? edge.kind} → {nodeById.get(edge.targetId)?.name}</p><blockquote className="mt-1 border-l-2 pl-3 text-muted-foreground">{edge.quote}</blockquote><p className="mt-1 break-all text-xs text-muted-foreground">{edge.pageNumber ? `PDF page ${edge.pageNumber}` : "Abstract"} · chunk {edge.chunkId}</p></li>)}</ul>
          {!data.edges.length && <p className="text-sm text-muted-foreground">No relations with verifiable source quotes were extracted.</p>}
        </details>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Source passages · showing {data.passages.length} of {data.chunkCount}</summary><ul className="mt-3 space-y-3">{data.passages.map((passage) => <li key={passage.id} className="text-sm"><p className="break-all text-xs text-muted-foreground">{passage.pageNumber ? `PDF page ${passage.pageNumber}` : "Abstract"} · {passage.id}</p><p className="mt-1 whitespace-pre-wrap">{passage.text}</p></li>)}</ul></details>
      </>}
    </>}
  </section>;
}
