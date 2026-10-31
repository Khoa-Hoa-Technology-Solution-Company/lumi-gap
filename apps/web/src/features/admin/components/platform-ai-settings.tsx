import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { AiConnectionProvider } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { platformAiApi, type PlatformAiDraft } from "../api/platform-ai.api";

type Model = { id: string; name: string };
const defaults: Record<AiConnectionProvider, string> = { gemini: "https://generativelanguage.googleapis.com", "openai-compatible": "https://api.openai.com/v1" };
const fresh = (): PlatformAiDraft => ({ name: "", provider: "gemini", baseUrl: defaults.gemini, apiKey: "", fastModel: "", deepModel: "" });
const queryKey = ["admin", "ai-connections"];
function message(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not complete this request. Please try again.";
}

function ModelSelect({ id, label, hint, value, models, disabled, onChange }: { id: string; label: string; hint: string; value: string; models: Model[]; disabled: boolean; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>
    <select id={id} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={models.length ? value : ""} disabled={!models.length || disabled} required onChange={(event) => onChange(event.target.value)}>
      <option value="">{models.length ? "Choose a model" : "Fetch models first"}</option>
      {models.map((model) => <option key={model.id} value={model.id}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>)}
    </select>
    <p className="text-xs text-muted-foreground">{hint}</p>
  </div>;
}

/**
 * The AI connection every user without a personal one uses: provider, endpoint, key and a fast and a deep model.
 * Mirrors the personal AI connection settings, so admins and users configure AI the same way.
 */
export function PlatformAiSettings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlatformAiDraft | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const query = useQuery({ queryKey, queryFn: platformAiApi.get });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const discover = useMutation({ mutationFn: platformAiApi.models });
  const save = useMutation({ mutationFn: platformAiApi.save });
  const activate = useMutation({ mutationFn: platformAiApi.activate });
  const remove = useMutation({ mutationFn: platformAiApi.remove });
  const busy = discover.isPending || save.isPending || activate.isPending || remove.isPending;
  const settings = query.data;

  const update = (field: keyof PlatformAiDraft, value: string) => {
    if (!draft) return;
    const next = { ...draft, [field]: value };
    if (field === "provider") next.baseUrl = defaults[value as AiConnectionProvider];
    if (["provider", "baseUrl", "apiKey"].includes(field)) { setModels([]); next.fastModel = ""; next.deepModel = ""; }
    setDraft(next); setError(""); setNotice("");
  };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setError("");
    try { await work(); setNotice(done); await refresh(); } catch (err) { setError(message(err)); }
  };
  async function fetchModels() {
    if (!draft) return;
    setError(""); setNotice("");
    try {
      const result = await discover.mutateAsync(draft);
      const keep = (id: string) => (result.some((model) => model.id === id) ? id : "");
      setModels(result);
      setDraft({ ...draft, fastModel: keep(draft.fastModel), deepModel: keep(draft.deepModel) });
      setNotice(`Found ${result.length} models. Choose a fast and a deep model.`);
    } catch (err) { setModels([]); setError(message(err)); }
  }

  const canSave = draft && draft.name.trim() && models.some((model) => model.id === draft.fastModel) && models.some((model) => model.id === draft.deepModel);
  return <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Bot className="h-4 w-4 text-blue-600" />Platform AI connection</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">The AI provider and models used by everyone without a personal AI connection: reports, research gaps, scoring, paper analysis and chat. Search embeddings always use the server's Gemini key, so stored vectors stay comparable. Changes reach every worker within 30 seconds.</p>
      </div>
      <Button size="sm" disabled={busy} onClick={() => { setDraft(fresh()); setModels([]); setError(""); setNotice(""); }}><Plus className="mr-2 h-4 w-4" />Add connection</Button>
    </header>

    {(error || query.isError) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error || message(query.error)}</p>}
    {notice && <p role="status" className="flex gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}

    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Server defaults (.env)</h3>
          <p className="mt-1 text-xs text-muted-foreground">Gemini · fast: <span className="font-mono">{settings?.environmentDefaults.fastModel ?? "…"}</span> · deep: <span className="font-mono">{settings?.environmentDefaults.deepModel ?? "…"}</span></p>
        </div>
        {!settings?.activeConnectionId ? <Badge>Active</Badge> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => activate.mutateAsync(null), "AI tasks now use the server defaults.")}>Use server defaults</Button>}
      </div>
    </div>

    {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading connections…</p> : settings?.connections.map((connection) => <article key={connection.id} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{connection.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{connection.provider === "gemini" ? "Gemini" : "OpenAI-compatible"} · {connection.hasApiKey ? "API key saved" : "No API key"}</p>
          <p className="mt-2 break-all text-xs">fast: <span className="font-mono">{connection.fastModel}</span> · deep: <span className="font-mono">{connection.deepModel}</span></p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{connection.baseUrl}</p>
        </div>
        {connection.isActive && <Badge>Active</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!connection.isActive && <Button size="sm" disabled={busy} onClick={() => void run(() => activate.mutateAsync(connection.id), `AI tasks now use "${connection.name}".`)}>Use for the platform</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({ connectionId: connection.id, name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, apiKey: "", fastModel: connection.fastModel, deepModel: connection.deepModel }); setModels([]); setError(""); setNotice(""); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleteId(connection.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
      </div>
      {deleteId === connection.id && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm"><span>Delete this connection? If it is active, AI tasks fall back to the server defaults.</span><Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(async () => { await remove.mutateAsync(connection.id); setDeleteId(null); if (draft?.connectionId === connection.id) setDraft(null); }, "Connection deleted.")}>Confirm delete</Button><Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button></div>}
    </article>)}

    {draft && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await save.mutateAsync(draft); setDraft(null); setModels([]); }, "Connection saved. Select Use for the platform to switch to it."); }} className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />{draft.connectionId ? "Edit platform AI connection" : "Add platform AI connection"}</h3>
      <div className="space-y-2"><Label htmlFor="platform-ai-name">Connection name</Label><Input id="platform-ai-name" value={draft.name} maxLength={100} required disabled={busy} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Gemini paid project, OpenRouter, university gateway" /></div>
      <div className="space-y-2"><Label htmlFor="platform-ai-provider">API protocol</Label><select id="platform-ai-provider" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.provider} disabled={busy} onChange={(event) => update("provider", event.target.value)}><option value="gemini">Gemini</option><option value="openai-compatible">OpenAI-compatible (OpenAI, OpenRouter, gateways)</option></select></div>
      <div className="space-y-2"><Label htmlFor="platform-ai-base-url">Base URL</Label><Input id="platform-ai-base-url" type="url" value={draft.baseUrl} required disabled={busy} onChange={(event) => update("baseUrl", event.target.value)} /><p className="text-xs text-muted-foreground">OpenAI-compatible endpoints usually include /v1. In Docker, localhost is the host computer.</p></div>
      <div className="space-y-2"><Label htmlFor="platform-ai-api-key">API key</Label><Input id="platform-ai-api-key" type="password" autoComplete="new-password" value={draft.apiKey} disabled={busy} onChange={(event) => update("apiKey", event.target.value)} placeholder={draft.connectionId ? "Leave blank to keep the saved key at the same endpoint" : "Enter the API key"} /><p className="text-xs text-muted-foreground">Encrypted and never shown again. A new endpoint requires entering its key again.</p></div>
      <Button type="button" variant="outline" onClick={() => void fetchModels()} disabled={busy || !draft.baseUrl.trim()}>{discover.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Fetch models</Button>
      <div className="grid gap-4 sm:grid-cols-2">
        <ModelSelect id="platform-ai-fast" label="Fast model" hint="Summaries, scoring, reranking, chat. Pick a cheap, quick model." value={draft.fastModel} models={models} disabled={busy} onChange={(value) => update("fastModel", value)} />
        <ModelSelect id="platform-ai-deep" label="Deep model" hint="Reports, research gaps, trends. Pick a stronger model." value={draft.deepModel} models={models} disabled={busy} onChange={(value) => update("deepModel", value)} />
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy || !canSave}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save connection</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); setModels([]); setError(""); }}>Cancel</Button></div>
    </form>}
  </section>;
}
