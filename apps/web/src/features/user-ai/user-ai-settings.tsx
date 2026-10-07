import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";

type Provider = "gemini" | "openai-compatible";
type Connection = { id: string; name: string; provider: Provider; baseUrl: string; model: string; hasApiKey: boolean };
type Model = { id: string; name: string };
type Settings = { connections: Connection[]; activeConnectionId: string | null };
type Draft = { connectionId?: string; name: string; provider: Provider; baseUrl: string; apiKey: string; model: string };
const defaults: Record<Provider, string> = { gemini: "https://generativelanguage.googleapis.com", "openai-compatible": "https://api.openai.com/v1" };
const fresh = (): Draft => ({ name: "", provider: "gemini", baseUrl: defaults.gemini, apiKey: "", model: "" });
function message(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message ?? "Could not complete this request. Please try again.";
}

export function UserAiSettings() {
  const userId = useAuthStore((state) => state.user?.id);
  return <UserAiSettingsForm key={userId} userId={userId} />;
}

function UserAiSettingsForm({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryKey = ["user-ai", userId];
  const query = useQuery({ queryKey, enabled: Boolean(userId), queryFn: async () => (await api.get<{ data: Settings }>("/user-ai")).data.data });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey }); };
  const discover = useMutation({ mutationFn: async (input: Draft) => (await api.post<{ data: Model[] }>("/user-ai/models", {
    connectionId: input.connectionId, provider: input.provider, baseUrl: input.baseUrl, apiKey: input.apiKey || undefined,
  })).data.data });
  const save = useMutation({ mutationFn: async (input: Draft) => api.post("/user-ai/connections", { ...input, apiKey: input.apiKey || undefined }) });
  const activate = useMutation({ mutationFn: async (connectionId: string | null) => api.put("/user-ai/active", { connectionId }) });
  const remove = useMutation({ mutationFn: async (id: string) => api.delete(`/user-ai/connections/${id}`) });
  const busy = discover.isPending || save.isPending || activate.isPending || remove.isPending;

  const update = (field: keyof Draft, value: string) => {
    if (!draft) return;
    const next = { ...draft, [field]: value };
    if (field === "provider") next.baseUrl = defaults[value as Provider];
    if (["provider", "baseUrl", "apiKey"].includes(field)) { setModels([]); next.model = ""; }
    setDraft(next); setError(""); setNotice("");
  };
  async function fetchModels() {
    if (!draft) return;
    setError(""); setNotice("");
    try {
      const result = await discover.mutateAsync(draft);
      setModels(result);
      setDraft({ ...draft, model: result.some((model) => model.id === draft.model) ? draft.model : "" });
      setNotice(`Found ${result.length} models. Choose a text-generation model to save.`);
    } catch (err) { setModels([]); setError(message(err)); }
  }
  async function saveConnection() {
    if (!draft) return;
    setError("");
    try { await save.mutateAsync(draft); setDraft(null); setModels([]); setNotice("Connection saved. Select Use as default to use it for your AI tasks."); await refresh(); }
    catch (err) { setError(message(err)); }
  }
  async function useConnection(id: string | null) {
    setError("");
    try { await activate.mutateAsync(id); setNotice(id ? "Your next AI tasks will use this connection." : "Your next AI tasks will use the platform AI connection."); await refresh(); }
    catch (err) { setError(message(err)); }
  }
  async function deleteConnection(id: string) {
    setError("");
    try { await remove.mutateAsync(id); setDeleteId(null); setNotice("Connection deleted."); if (draft?.connectionId === id) setDraft(null); await refresh(); }
    catch (err) { setError(message(err)); }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Your AI connections</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Save your API keys and endpoints, fetch available models, then select a connection for your AI tasks.</p></div><Button disabled={busy} onClick={() => { setDraft(fresh()); setModels([]); setError(""); setNotice(""); }}><Plus className="mr-2 h-4 w-4" />Add connection</Button></header>
    <p className="text-sm text-muted-foreground">Applies to reports, research gaps, AI scoring, paper analysis and AI chat. Search embeddings, scheduled corpus jobs and manuscript AI Reviewer use the platform connection.</p>
    {(error || query.isError) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error || message(query.error)}{query.isError && <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Retry</Button>}</p>}
    {notice && <p role="status" className="flex gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
    <div className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Platform AI</h3><p className="mt-1 text-xs text-muted-foreground">Use the application's default AI configuration.</p></div>{!query.data?.activeConnectionId ? <Badge>Default</Badge> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void useConnection(null)}>Use platform AI</Button>}</div></div>
    {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading connections…</p> : query.data?.connections.map((connection) => <article key={connection.id} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{connection.name}</h3><p className="mt-1 text-xs text-muted-foreground">{connection.provider === "gemini" ? "Gemini" : "OpenAI-compatible"} · {connection.hasApiKey ? "API key saved" : "No API key"}</p><p className="mt-2 break-all text-sm">{connection.model}</p><p className="mt-1 break-all text-xs text-muted-foreground">{connection.baseUrl}</p></div>{query.data.activeConnectionId === connection.id && <Badge>Default</Badge>}</div>
      <div className="flex flex-wrap gap-2">{query.data.activeConnectionId !== connection.id && <Button size="sm" disabled={busy} onClick={() => void useConnection(connection.id)}>Use as default</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({ connectionId: connection.id, name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, apiKey: "", model: connection.model }); setModels([]); setError(""); setNotice(""); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleteId(connection.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div>
      {deleteId === connection.id && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm"><span>Delete this connection? If active, your tasks will use platform AI.</span><Button size="sm" variant="destructive" disabled={busy} onClick={() => void deleteConnection(connection.id)}>Confirm delete</Button><Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button></div>}
    </article>)}
    {draft && <form onSubmit={(event) => { event.preventDefault(); void saveConnection(); }} className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />{draft.connectionId ? "Edit AI connection" : "Add AI connection"}</h3>
      <div className="space-y-2"><Label htmlFor="ai-connection-name">Connection name</Label><Input id="ai-connection-name" value={draft.name} maxLength={100} required disabled={busy} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Gemini personal, OpenRouter, local gateway" /></div>
      <div className="space-y-2"><Label htmlFor="ai-provider">API protocol</Label><select id="ai-provider" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.provider} disabled={busy} onChange={(event) => update("provider", event.target.value)}><option value="gemini">Gemini</option><option value="openai-compatible">OpenAI-compatible (OpenAI, OpenRouter, gateways)</option></select></div>
      <div className="space-y-2"><Label htmlFor="ai-base-url">Base URL</Label><Input id="ai-base-url" type="url" value={draft.baseUrl} required disabled={busy} onChange={(event) => update("baseUrl", event.target.value)} /><p className="text-xs text-muted-foreground">OpenAI-compatible endpoints usually include /v1. Local gateways (Ollama, LM Studio or compatible proxies) can use http://localhost:PORT/v1 or a LAN address. In Docker, localhost connects to the host computer.</p></div>
      <div className="space-y-2"><Label htmlFor="ai-api-key">API key</Label><Input id="ai-api-key" type="password" autoComplete="new-password" value={draft.apiKey} disabled={busy} onChange={(event) => update("apiKey", event.target.value)} placeholder={draft.connectionId ? "Leave blank to keep the saved key at the same endpoint" : "Enter your API key"} /><p className="text-xs text-muted-foreground">Keys are encrypted and never displayed after saving. A new endpoint requires entering its key again. OpenAI-compatible gateways without authentication may leave this empty.</p></div>
      <Button type="button" variant="outline" onClick={() => void fetchModels()} disabled={busy || !draft.baseUrl.trim()}>{discover.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Fetch models</Button>
      <div className="space-y-2"><Label htmlFor="ai-model">Model</Label><select id="ai-model" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={models.length ? draft.model : ""} disabled={!models.length || busy} required onChange={(event) => update("model", event.target.value)}><option value="">{models.length ? "Choose a model" : "Fetch models first"}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}</select></div>
      <div className="flex gap-2"><Button type="submit" disabled={busy || !models.some((model) => model.id === draft.model) || !draft.name.trim()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save connection</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setModels([]); setError(""); }}>Cancel</Button></div>
    </form>}
  </div>;
}
