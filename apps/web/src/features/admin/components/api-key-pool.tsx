import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, KeyRound, Loader2, Pencil, Plus, Power, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { PlatformApiKey, PlatformApiKeyProvider, PlatformApiKeySettings, PlatformApiKeyStatus } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { apiKeysApi, type ApiKeyChanges } from "../api/api-keys.api";
import { AdminErrorPanel } from "./admin-state-panels";

const queryKey = ["admin", "api-keys"];
type Translate = ReturnType<typeof useI18n>["t"];

function errorMessage(error: unknown, t: Translate) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t("Could not complete this request. Please try again.");
}

const STATUS_STYLE: Record<PlatformApiKeyStatus, string> = {
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  COOLDOWN: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  INVALID: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  DISABLED: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

function StatusBadge({ status, t }: { status: PlatformApiKeyStatus; t: Translate }) {
  const label = { ACTIVE: t("Ready"), COOLDOWN: t("Cooling down"), INVALID: t("Rejected"), DISABLED: t("Disabled") }[status];
  return <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_STYLE[status])}>{label}</Badge>;
}

interface Form { label: string; apiKey: string; priority: string }
const emptyForm = (priority: number): Form => ({ label: "", apiKey: "", priority: String(priority) });

function KeyForm({ form, onChange, keyRequired, busy, submitLabel, onSubmit, onCancel, t }: {
  form: Form; onChange: (form: Form) => void; keyRequired: boolean; busy: boolean; submitLabel: string;
  onSubmit: () => void; onCancel: () => void; t: Translate;
}) {
  const valid = form.label.trim() && (!keyRequired || form.apiKey.trim().length >= 8) && /^\d+$/.test(form.priority);
  return <form className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 sm:grid-cols-[1fr_1.4fr_7rem_auto] sm:items-end dark:border-blue-900 dark:bg-blue-950/20" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(); }}>
    <div className="space-y-1.5"><Label htmlFor="api-key-label">{t("Name")}</Label>
      <Input id="api-key-label" value={form.label} maxLength={100} placeholder={t("e.g. Project lumiGAP")} onChange={(event) => onChange({ ...form, label: event.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor="api-key-secret">{keyRequired ? t("API key") : t("New API key (optional)")}</Label>
      <Input id="api-key-secret" type="password" autoComplete="off" spellCheck={false} value={form.apiKey} placeholder={keyRequired ? t("Paste the key") : t("Leave empty to keep the current key")} onChange={(event) => onChange({ ...form, apiKey: event.target.value })} /></div>
    <div className="space-y-1.5"><Label htmlFor="api-key-priority">{t("Priority")}</Label>
      <Input id="api-key-priority" inputMode="numeric" value={form.priority} onChange={(event) => onChange({ ...form, priority: event.target.value.replace(/\D/g, "").slice(0, 5) })} /></div>
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={!valid || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{submitLabel}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button>
    </div>
  </form>;
}

function KeyRow({ item, busy, onTest, onUpdate, onRemove, t, formatDate }: {
  item: PlatformApiKey; busy: boolean; onTest: () => void; onUpdate: (changes: ApiKeyChanges) => Promise<boolean>; onRemove: () => void;
  t: Translate; formatDate: (value: string | null) => string;
}) {
  const [editing, setEditing] = useState<Form | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (editing) {
    return <li className="py-3"><KeyForm form={editing} onChange={setEditing} keyRequired={false} busy={busy} submitLabel={t("Save")} t={t}
      onCancel={() => setEditing(null)}
      onSubmit={async () => {
        const ok = await onUpdate({ label: editing.label.trim(), priority: Number(editing.priority), ...(editing.apiKey.trim() ? { apiKey: editing.apiKey.trim() } : {}) });
        if (ok) setEditing(null);
      }} /></li>;
  }
  return <li className="grid gap-3 py-3 lg:grid-cols-[3rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] lg:items-center">
    <span className="text-xs font-semibold tabular-nums text-muted-foreground" title={t("Priority")}>#{item.priority}</span>
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
        <span className="truncate">{item.label}</span>
        {item.inUse ? <Badge className="bg-blue-600 text-white hover:bg-blue-600">{t("In use")}</Badge> : null}
      </p>
      <p className="font-mono text-xs text-muted-foreground">••••{item.keyHint}</p>
    </div>
    <div className="space-y-1 text-xs text-muted-foreground">
      <StatusBadge status={item.status} t={t} />
      {item.status === "COOLDOWN" && item.cooldownUntil ? <p>{t("Retried after {{time}}", { time: formatDate(item.cooldownUntil) })}</p> : null}
      <p className="tabular-nums">{t("{{ok}} ok · {{failed}} rejected", { ok: item.successCount.toLocaleString(), failed: item.failureCount.toLocaleString() })}</p>
      <p>{t("Last used: {{time}}", { time: formatDate(item.lastUsedAt) })}</p>
    </div>
    <p className={cn("line-clamp-3 break-words text-xs", item.lastError ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground")} title={item.lastError ?? undefined}>
      {item.lastError ? `${formatDate(item.lastErrorAt)} · ${item.lastError}` : t("No errors")}
    </p>
    <div className="flex flex-wrap gap-1.5 lg:justify-end">
      <Button size="sm" variant="outline" disabled={busy} onClick={onTest} title={t("Call the provider with this key")}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("Test")}</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void onUpdate({ isEnabled: !item.isEnabled })}><Power className="mr-1.5 h-3.5 w-3.5" />{item.isEnabled ? t("Disable") : t("Enable")}</Button>
      <Button size="sm" variant="ghost" disabled={busy} aria-label={t("Edit")} onClick={() => setEditing({ label: item.label, apiKey: "", priority: String(item.priority) })}><Pencil className="h-3.5 w-3.5" /></Button>
      {confirmDelete
        ? <Button size="sm" variant="destructive" disabled={busy} onClick={onRemove} onBlur={() => setConfirmDelete(false)}>{t("Confirm delete")}</Button>
        : <Button size="sm" variant="ghost" disabled={busy} aria-label={t("Delete")} onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>}
    </div>
  </li>;
}

const PROVIDER_COPY: Record<PlatformApiKeyProvider, { name: string; usage: string; icon: typeof Sparkles }> = {
  GEMINI: { name: "Gemini (Google AI Studio)", usage: "Embeddings, paper analysis, reports, research gaps and chat for users without a personal AI connection.", icon: Sparkles },
  OPENALEX: { name: "OpenAlex", usage: "Paper sync, million-scale ingest campaigns, taxonomy sync and trend lookups.", icon: BookOpen },
};

function ProviderSection({ entry, t, formatDate }: { entry: PlatformApiKeySettings["providers"][number]; t: Translate; formatDate: (value: string | null) => string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({ mutationFn: (draft: Parameters<typeof apiKeysApi.create>[0]) => apiKeysApi.create(draft) });
  const update = useMutation({ mutationFn: ({ id, changes }: { id: string; changes: ApiKeyChanges }) => apiKeysApi.update(id, changes) });
  const test = useMutation({ mutationFn: (id: string) => apiKeysApi.test(id) });
  const remove = useMutation({ mutationFn: (id: string) => apiKeysApi.remove(id) });
  const busy = create.isPending || update.isPending || test.isPending || remove.isPending;
  const copy = PROVIDER_COPY[entry.provider];
  const Icon = copy.icon;
  const nextPriority = (entry.keys.at(-1)?.priority ?? 0) + 10;
  const usable = entry.keys.some((key) => key.status === "ACTIVE");

  const run = async <T,>(work: () => Promise<T>, done: (result: T) => { ok: boolean; text: string }) => {
    setNotice(null);
    try { const result = await work(); setNotice(done(result)); await refresh(); return true; } catch (error) { setNotice({ ok: false, text: errorMessage(error, t) }); return false; }
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900" aria-labelledby={`api-keys-${entry.provider}`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={`api-keys-${entry.provider}`} className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Icon className="h-4 w-4 text-blue-600" />{t(copy.name)}</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t(copy.usage)}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{t("{{count}} keys in the pool", { count: entry.keys.length })}</Badge>
          <Badge variant="outline" className={entry.hasEnvKey ? "" : "text-muted-foreground"}>{entry.hasEnvKey ? t("Env key set (last fallback)") : t("No env key")}</Badge>
          {entry.usingEnvKey ? <Badge variant="outline" className={STATUS_STYLE.COOLDOWN}>{t("Calls use the env key now")}</Badge> : null}
          {!usable && !entry.hasEnvKey ? <Badge variant="outline" className={STATUS_STYLE.INVALID}>{t("No usable key")}</Badge> : null}
        </div>
      </div>
      <Button size="sm" disabled={busy || Boolean(form)} onClick={() => { setForm(emptyForm(nextPriority)); setNotice(null); }}><Plus className="mr-2 h-4 w-4" />{t("Add key")}</Button>
    </header>

    {form ? <KeyForm form={form} onChange={setForm} keyRequired busy={busy} submitLabel={t("Save and test")} t={t}
      onCancel={() => setForm(null)}
      onSubmit={async () => {
        const ok = await run(() => create.mutateAsync({ provider: entry.provider, label: form.label.trim(), apiKey: form.apiKey.trim(), priority: Number(form.priority) }),
          (result) => ({ ok: result.ok, text: result.ok ? t("Key saved. The provider accepted it.") : t("Key saved, but the test failed: {{message}}", { message: result.message }) }));
        if (ok) setForm(null);
      }} /> : null}

    {notice ? <p role="status" className={cn("rounded-lg border px-3 py-2 text-xs", notice.ok ? STATUS_STYLE.ACTIVE : STATUS_STYLE.INVALID)}>{notice.text}</p> : null}

    {entry.keys.length === 0
      ? <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{entry.hasEnvKey ? t("No pool keys yet. Calls use the env key; add keys here to fail over automatically.") : t("No keys yet. Add a key to enable this provider.")}</p>
      : <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {entry.keys.map((item) => <KeyRow key={item.id} item={item} busy={busy} t={t} formatDate={formatDate}
          onTest={() => void run(() => test.mutateAsync(item.id), (result) => ({ ok: result.ok, text: result.ok ? t("“{{name}}” works and is in rotation.", { name: item.label }) : t("“{{name}}” failed: {{message}}", { name: item.label, message: result.message }) }))}
          onUpdate={(changes) => run(() => update.mutateAsync({ id: item.id, changes }), () => ({ ok: true, text: t("Saved. Every worker uses the change within 30 seconds.") }))}
          onRemove={() => void run(() => remove.mutateAsync(item.id), () => ({ ok: true, text: t("Key deleted.") }))} />)}
      </ul>}
  </section>;
}

/**
 * Admin → API Keys: the Gemini and OpenAlex key pools. Calls use the ready key with the lowest priority number and
 * move to the next one when the provider rejects a key, so a revoked key, a billing problem or a used-up daily quota
 * does not stop the platform.
 */
export function ApiKeyPool() {
  const { t, language } = useI18n();
  const query = useQuery({ queryKey, queryFn: apiKeysApi.list, refetchInterval: 30_000 });
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString(language) : t("never");
  return <div className="space-y-6">
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-slate-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-slate-300">
      <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><KeyRound className="h-4 w-4 text-blue-600" />{t("How key rotation works")}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>{t("Calls use the ready key with the lowest priority number. The env key (.env) is the last fallback.")}</li>
        <li>{t("When the provider rejects a key (invalid, billing, daily quota), the call is repeated with the next key at once and the rejected key rests: 1 hour for Gemini, until the next UTC day for an OpenAlex daily budget.")}</li>
        <li>{t("A rejected key stays out until you test it again or replace it. Keys are stored encrypted and never shown again.")}</li>
        <li>{t("Use extra keys as backups for outages, not to multiply free quota: spreading one workload over many free projects can break the provider's terms.")}</li>
      </ul>
    </section>
    {query.isLoading ? <div className="space-y-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div> : null}
    {query.isError ? <AdminErrorPanel message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
    {query.data?.providers.map((entry) => <ProviderSection key={entry.provider} entry={entry} t={t} formatDate={formatDate} />)}
  </div>;
}
