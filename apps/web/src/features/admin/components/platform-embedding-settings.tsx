import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { platformEmbeddingApi, type PlatformEmbeddingDraft } from "../api/platform-embedding.api";

const fresh = (): PlatformEmbeddingDraft => ({ name: "", baseUrl: "", apiKey: "", model: "" });
const queryKey = ["admin", "embedding-connections"];
function message(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not complete this request. Please try again.";
}

/**
 * The endpoint that serves embeddings for search, reports and gaps, independent of the Platform AI connection.
 * Vectors are shared by everyone, so an endpoint must reproduce the stored ones: the server checks it on save and activation.
 */
export function PlatformEmbeddingSettings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlatformEmbeddingDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const query = useQuery({ queryKey, queryFn: platformEmbeddingApi.get });
  const save = useMutation({ mutationFn: platformEmbeddingApi.save });
  const activate = useMutation({ mutationFn: platformEmbeddingApi.activate });
  const remove = useMutation({ mutationFn: platformEmbeddingApi.remove });
  const busy = save.isPending || activate.isPending || remove.isPending;
  const settings = query.data;

  const update = (field: keyof PlatformEmbeddingDraft, value: string) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: value }); setError(""); setNotice("");
  };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setError(""); setNotice("");
    try { await work(); setNotice(done); await queryClient.invalidateQueries({ queryKey }); } catch (err) { setError(message(err)); }
  };

  const canSave = draft && draft.name.trim() && draft.baseUrl.trim() && draft.model.trim();
  return <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Layers className="h-4 w-4 text-blue-600" />Embedding connection</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">The OpenAI-compatible endpoint that serves embeddings for search, reports and research gaps, whichever AI connection is active. It must run the model that made the stored vectors: the server compares its output with stored papers on save and activation, sending only public paper titles and abstracts. Changes reach every worker within 30 seconds.</p>
      </div>
      <Button size="sm" disabled={busy} onClick={() => { setDraft(fresh()); setError(""); setNotice(""); }}><Plus className="mr-2 h-4 w-4" />Add connection</Button>
    </header>

    {((error && !draft) || query.isError) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error || message(query.error)}</p>}
    {notice && <p role="status" className="flex gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}

    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Server defaults (.env)</h3>
          <p className="mt-1 text-xs text-muted-foreground">Gemini · <span className="font-mono">{settings?.environmentDefaults.model ?? "…"}</span> · {settings?.environmentDefaults.dimensions ?? "…"} dimensions</p>
        </div>
        {!settings?.activeConnectionId ? <Badge>Active</Badge> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => activate.mutateAsync(null), "Embeddings now use the server defaults.")}>Use server defaults</Button>}
      </div>
    </div>

    {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading connections…</p> : settings?.connections.map((connection) => <article key={connection.id} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{connection.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">OpenAI-compatible · {connection.hasApiKey ? "API key saved" : "No API key"} · {connection.verifiedSimilarity === null ? "Not compared yet: no stored vectors" : `Matches stored vectors (cosine ${connection.verifiedSimilarity.toFixed(4)})`}</p>
          <p className="mt-2 break-all text-xs">model: <span className="font-mono">{connection.model}</span></p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{connection.baseUrl}</p>
        </div>
        {connection.isActive && <Badge>Active</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!connection.isActive && <Button size="sm" disabled={busy} onClick={() => void run(() => activate.mutateAsync(connection.id), `Embeddings now use "${connection.name}".`)}>{activate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Use for embeddings</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({ connectionId: connection.id, name: connection.name, baseUrl: connection.baseUrl, apiKey: "", model: connection.model }); setError(""); setNotice(""); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleteId(connection.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
      </div>
      {deleteId === connection.id && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm"><span>Delete this connection? If it is active, embeddings fall back to the server defaults.</span><Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(async () => { await remove.mutateAsync(connection.id); setDeleteId(null); if (draft?.connectionId === connection.id) setDraft(null); }, "Connection deleted.")}>Confirm delete</Button><Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button></div>}
    </article>)}

    {draft && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await save.mutateAsync(draft); setDraft(null); }, "Connection saved. Select Use for embeddings to switch to it."); }} className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />{draft.connectionId ? "Edit embedding connection" : "Add embedding connection"}</h3>
      <div className="space-y-2"><Label htmlFor="platform-embedding-name">Connection name</Label><Input id="platform-embedding-name" value={draft.name} maxLength={100} required disabled={busy} onChange={(event) => update("name", event.target.value)} placeholder="e.g. University gateway" /></div>
      <div className="space-y-2"><Label htmlFor="platform-embedding-base-url">Base URL</Label><Input id="platform-embedding-base-url" type="url" value={draft.baseUrl} required disabled={busy} onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://gateway.example.com/v1" /><p className="text-xs text-muted-foreground">Requests go to this URL plus /embeddings. In Docker, localhost is the host computer.</p></div>
      <div className="space-y-2"><Label htmlFor="platform-embedding-api-key">API key</Label><Input id="platform-embedding-api-key" type="password" autoComplete="new-password" value={draft.apiKey} disabled={busy} onChange={(event) => update("apiKey", event.target.value)} placeholder={draft.connectionId ? "Leave blank to keep the saved key at the same endpoint" : "Enter the API key"} /><p className="text-xs text-muted-foreground">Encrypted and never shown again. A new endpoint requires entering its key again.</p></div>
      <div className="space-y-2"><Label htmlFor="platform-embedding-model">Model</Label><Input id="platform-embedding-model" value={draft.model} maxLength={200} required disabled={busy} onChange={(event) => update("model", event.target.value)} placeholder="vendor/model-id" /><p className="text-xs text-muted-foreground">Exactly as the endpoint names it, which can differ from {settings?.environmentDefaults.model ?? "the stored model"}. The server checks the vectors, not the name.</p></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !canSave}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Check and save</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</Button></div>
    </form>}
  </section>;
}
