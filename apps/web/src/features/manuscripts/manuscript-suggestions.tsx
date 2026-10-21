import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateManuscriptSuggestion } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { manuscriptsApi } from "./manuscripts.api";

export function ManuscriptSuggestions({ project, manuscript, user, canWrite, canCapture = true, capture, refresh }: { project: string; manuscript: string; user: string; canWrite: boolean; canCapture?: boolean; capture: () => Omit<CreateManuscriptSuggestion, "clientKey" | "replacement" | "note">; refresh: () => void }) {
  const { t } = useI18n(), client = useQueryClient();
  const key = ["manuscript", user, project, manuscript, "suggestions"];
  const query = useQuery({ queryKey: key, queryFn: () => manuscriptsApi.suggestions(project, manuscript), refetchInterval: 5000 });
  const [draft, setDraft] = useState<CreateManuscriptSuggestion>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [filter, setFilter] = useState("PENDING"), submitted = useRef(false);
  useUnsavedWorkspace(Boolean(draft) || busy);
  const run = async (work: () => Promise<void>) => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setError("");
    try { await work(); await client.invalidateQueries({ queryKey: key }); refresh(); }
    catch { setError(t("The suggestion could not be saved or applied. The source may have changed; review the current file.")); }
    finally { submitted.current = false; setBusy(false); }
  };
  return <div className="writing-context writing-suggestions">
    <h2>{t("Suggested edits")}</h2><p className="writing-small">{t("Proposals keep the source unchanged until a team member accepts. Changed source is never overwritten.")}</p>
    {canWrite && !draft ? <Button size="sm" variant="outline" disabled={!canCapture} onClick={() => { try { const scope = capture(); if (scope.original.length > 100000) throw new Error(); setDraft({ ...scope, replacement: scope.original, note: "", clientKey: crypto.randomUUID() }); setError(""); } catch { setError(t("Select up to 100000 characters in a synchronized source file first.")); } }}>{t("Suggest an edit to selection")}</Button> : null}
    {draft ? <form onSubmit={event => { event.preventDefault(); void run(async () => { await manuscriptsApi.suggest(project, manuscript, draft); setDraft(undefined); }); }}>
      <label>{t("Original source")}<pre>{draft.original || t("Insert at cursor")}</pre></label>
      <label>{t("Proposed source")}<textarea rows={8} maxLength={100000} value={draft.replacement} onChange={event => setDraft({ ...draft, replacement: event.target.value })} disabled={busy} /></label>
      <label>{t("Reason (optional)")}<textarea rows={2} maxLength={2000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} disabled={busy} /></label>
      <div className="writing-actions"><Button size="sm" disabled={busy || !canWrite || draft.original === draft.replacement}>{t("Submit suggestion")}</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setDraft(undefined)}>{t("Cancel")}</Button></div>
    </form> : null}
    {error ? <p role="alert" className="writing-error">{error}</p> : null}
    <label>{t("Review status")}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="PENDING">{t("Pending suggestions")}</option><option value="ALL">{t("All suggestions")}</option><option value="ACCEPTED">{t("Accepted suggestions")}</option><option value="REJECTED">{t("Rejected suggestions")}</option></select></label>
    {query.isLoading ? <p role="status">{t("Loading suggestions…")}</p> : query.error ? <div role="alert"><p>{t("Could not load suggestions.")}</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : null}
    {query.data?.filter(row => filter === "ALL" || row.status === filter).map(row => <article key={row.id}>
      <header><strong>{row.author.name}</strong><small>{new Date(row.createdAt).toLocaleString()} · v{row.revision}</small></header><code>{row.path}</code>
      <div className="writing-proposal-diff"><del><pre>{row.original || t("Insert at cursor")}</pre></del><ins><pre>{row.replacement || t("Delete selection")}</pre></ins></div>
      {row.note ? <p>{row.note}</p> : null}
      {row.status === "PENDING" && canWrite ? <div className="writing-actions"><Button size="sm" disabled={busy || row.original === row.replacement} onClick={() => void run(async () => { await manuscriptsApi.resolveSuggestion(project, manuscript, row.id, "ACCEPTED", row.revision); })}>{t("Accept edit")}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await manuscriptsApi.resolveSuggestion(project, manuscript, row.id, "REJECTED", row.revision); })}>{t("Reject edit")}</Button></div> : <p className="writing-small">{t(row.status === "ACCEPTED" ? "Accepted suggestions" : row.status === "REJECTED" ? "Rejected suggestions" : "Pending suggestions")}{row.resolvedBy ? ` · ${row.resolvedBy.name}` : ""}</p>}
    </article>)}
    {query.data && !query.data.some(row => filter === "ALL" || row.status === filter) ? <p>{t("No suggestions in this view.")}</p> : null}
  </div>;
}
