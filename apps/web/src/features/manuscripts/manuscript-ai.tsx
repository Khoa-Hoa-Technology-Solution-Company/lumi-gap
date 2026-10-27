import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MANUSCRIPT_AI_ACTIONS, type ManuscriptAiAction, type ManuscriptAiInput, type ManuscriptAiRun, type ManuscriptAiResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import type { AiSelection } from "./ai-selection";

const labels: Record<ManuscriptAiAction, string> = { improve: "Improve academic writing", continue: "Continue writing", rewrite: "Rewrite", expand: "Expand", shorten: "Shorten", grammar: "Fix grammar", translate: "Translate", repair: "Find and fix LaTeX errors", explain: "Explain LaTeX", citations: "Find citations", custom: "Custom instruction" };
const translationLanguages = ["Vietnamese", "English", "Japanese", "Korean", "Simplified Chinese", "French", "German", "Spanish", "Portuguese", "Thai"] as const;
export function ManuscriptAi({ project, manuscript, filename, selectionLength, canWrite, capture, apply, repairRequest = 0, onCompile, canCompile = false, repairCompiled = false, sourceVersion }: {
  project: string; manuscript: string; filename: string; selectionLength: number; canWrite: boolean;
  capture: (wholeFileIfEmpty?: boolean) => { target: AiSelection; input: Pick<ManuscriptAiInput, "fileId" | "from" | "to" | "original"> };
  apply: (target: AiSelection, text: string, mode: "insert" | "replace", paperId?: string, sources?: ManuscriptAiResult["citations"], preserveReferences?: boolean) => Promise<void>;
  repairRequest?: number; onCompile?: () => void; canCompile?: boolean; repairCompiled?: boolean; sourceVersion?: number;
}) {
  const { t } = useI18n();
  const [action, setAction] = useState<ManuscriptAiAction>("improve"), [instruction, setInstruction] = useState("");
  const [languageChoice, setLanguageChoice] = useState("English"), [customLanguage, setCustomLanguage] = useState("");
  const language = languageChoice === "other" ? customLanguage.trim() : languageChoice;
  const [run, setRun] = useState<ManuscriptAiRun | null>(null), [target, setTarget] = useState<AiSelection | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [applied, setApplied] = useState(false);
  const [inserted, setInserted] = useState<string[]>([]);
  const alive = useRef(true), operating = useRef(false), accepted = useRef(false), insertedIds = useRef(new Set<string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (repairRequest) setAction("repair"); }, [repairRequest]);
  const query = useQuery({ queryKey: ["manuscript-ai", project, manuscript, run?.id], queryFn: () => manuscriptsApi.aiRun(project, manuscript, run!.id), enabled: Boolean(run), retry: false,
    refetchInterval: q => q.state.data && ["queued", "running"].includes(q.state.data.status) ? 1500 : false });
  const current = query.data ?? run, waiting = (busy && current?.status !== "completed") || Boolean(current && ["queued", "running"].includes(current.status));
  const result = current?.status === "completed" ? current.result : null;
  const hasAccepted = applied || inserted.length > 0;
  const repairing = current?.input?.action === "repair";
  const repairChanged = Boolean(repairing && result?.text && result.text.replace(/\r\n/g, "\n").trim() !== current?.input.original.replace(/\r\n/g, "\n").trim());
  const compiledReport = repairing && ["COMPILED", "WARNINGS"].includes(result?.repair?.outcome ?? "");
  const repairStale = repairing && result?.repair && sourceVersion !== undefined && result.repair.sourceVersion !== sourceVersion;
  const needsSelection = !["continue", "explain", "custom", "repair"].includes(action);
  const insertable = Boolean(result?.text.trim() && !result.needsContext && !/^\s*```|```\s*$/.test(result.text) && !["explain", "citations"].includes(current!.input.action) && (!result.scope || result.scope.fileId === current!.input.fileId));
  const submit = async (regenerate = false) => {
    if (operating.current || !canWrite || waiting || (!regenerate && result && !hasAccepted) || (!regenerate && action === "translate" && !language)) return;
    if (regenerate && (!current || !target || !result || hasAccepted)) return;
    operating.current = true;
    setError(""); setBusy(true);
    try {
      const selected = regenerate ? { target: target!, input: current!.input } : capture(action === "repair");
      if (selected.input.original.length > 12000) { setError(t("This file is too long for one AI request. Select the section around the error and try again.")); return; }
      const request = regenerate ? { ...current!.input, regenerateOf: current!.id } : { ...selected.input, action, instruction, language: language || "English" };
      const created = await manuscriptsApi.assist(project, manuscript, request);
      if (alive.current) { setRun(created); setTarget(selected.target); setApplied(false); setInserted([]); accepted.current = false; insertedIds.current.clear(); }
    } catch { if (alive.current) setError(t("Could not request AI assistance. Wait for saved source and try again.")); }
    finally { operating.current = false; if (alive.current) setBusy(false); }
  };
  const accept = async (mode: "insert" | "replace", paperId?: string) => {
    if (!target || !result || !canWrite || operating.current || accepted.current || (!paperId && !insertable) || (repairing && (!repairChanged || compiledReport)) || (paperId && (insertedIds.current.has(paperId) || !result.citations.some(source => source.id === paperId)))) return;
    operating.current = true;
    setBusy(true); setError("");
    try {
      if (paperId) await apply(target, result.text, mode, paperId);
      else if (repairing) await apply(target, result.text, "replace", undefined, [], true);
      else await apply(target, result.text, mode, undefined, result.citations);
      if (paperId) { insertedIds.current.add(paperId); if (alive.current) setInserted([...insertedIds.current]); }
      else { accepted.current = true; if (alive.current) setApplied(true); }
    }
    catch { if (alive.current) setError(t("The source or permissions changed. Open the original file and request a new suggestion.")); }
    finally { operating.current = false; if (alive.current) setBusy(false); }
  };
  const reject = async () => {
    if (operating.current) return;
    operating.current = true; setBusy(true);
    try {
      if (current && ["queued", "running"].includes(current.status)) await manuscriptsApi.cancelAi(project, manuscript, current.id);
      if (alive.current) { setRun(null); setTarget(null); setError(""); setApplied(false); setInserted([]); accepted.current = false; insertedIds.current.clear(); }
    } catch { if (alive.current) setError(t("Could not cancel AI assistance. Try again.")); }
    finally { operating.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="writing-ai" aria-label={t("AI Assistant")}>
    <div className="writing-ai-intro"><h2>{t(action === "repair" ? "LaTeX error assistant" : "Writing assistant")}</h2><p>{t(action === "repair" ? "Inspect the source and compiler log, review the proposed fix, then compile again to verify." : "Use your manuscript and project sources. Review every suggestion before applying it.")}</p></div>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="writing-ai-target"><strong>{filename}</strong><span>{selectionLength ? t("{{count}} characters selected", { count: selectionLength }) : t("At the cursor")}</span></p>
      <label>{t("Writing action")}<select value={action} disabled={waiting} onChange={e => setAction(e.target.value as ManuscriptAiAction)}>{MANUSCRIPT_AI_ACTIONS.map(a => <option key={a} value={a}>{t(labels[a])}</option>)}</select></label>
      {action === "repair" ? <p className="writing-small">{t(selectionLength ? "Checks the selected source. The rest of the file is kept as context." : "Checks the entire open file when no text is selected. Up to 12,000 characters per request.")}</p> : null}
      {action === "translate" ? <>
        <label>{t("Translate to")}<select value={languageChoice} disabled={waiting} onChange={e => setLanguageChoice(e.target.value)}>{translationLanguages.map(name => <option key={name} value={name}>{t(name)}</option>)}<option value="other">{t("Other language…")}</option></select></label>
        {languageChoice === "other" ? <label>{t("Language name")}<input value={customLanguage} maxLength={60} disabled={waiting} onChange={e => setCustomLanguage(e.target.value)} placeholder={t("Enter the target language")} required /></label> : null}
      </> : null}
      <label>{t(action === "custom" ? "Your instruction" : "Additional direction (optional)")}<textarea value={instruction} maxLength={2000} rows={3} disabled={waiting} required={action === "custom"} placeholder={t("For example: preserve the claim and make the argument clearer.")} onChange={e => setInstruction(e.target.value)} /></label>
      {needsSelection && !selectionLength ? <p className="writing-small">{t("Select a passage in the editor first.")}</p> : null}
      <Button size="sm" disabled={!canWrite || waiting || busy || (!filename.endsWith(".tex") && action !== "explain") || (needsSelection && !selectionLength) || (action === "custom" && !instruction.trim()) || (action === "translate" && !language) || Boolean(result && !hasAccepted)}>{waiting ? t("Preparing suggestion…") : t(action === "repair" ? "Analyze LaTeX errors" : "Ask AI")}</Button>
    </form>
    {waiting ? <p role="status">{t("Reading permitted project context and preparing a suggestion…")}</p> : null}
    {error || query.error || current?.status === "failed" ? <p role="alert" className="writing-error">{error || (query.error ? t("Could not load the suggestion. Try again.") : t("Writing assistance failed. Your source is unchanged."))}</p> : null}
    {query.error ? <Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("Try again")}</Button> : null}
    {result && target ? <div className="writing-ai-result" aria-live="polite">
      <h3>{t(repairing && !repairChanged ? "LaTeX check result" : "Suggestion")} · {t(labels[current!.input.action])}</h3>
      {result.scope ? <p className="writing-small"><strong>{result.scope.path}</strong> · {t("Source file revision {{version}}", { version: result.scope.sourceSequence })}</p> : null}
      {result.needsContext ? <p role="status">{t("More research context is needed before proposing an edit.")}</p> : null}
      {!compiledReport && !result.needsContext && !insertable && !["explain", "citations"].includes(current!.input.action) ? <p role="alert" className="writing-error">{t("AI returned no valid editable source. Regenerate or reject this proposal.")}</p> : null}
      {compiledReport ? <p role="status">{t(result.repair?.outcome === "WARNINGS" ? "PDF compiled successfully; warnings remain." : "PDF compiled successfully. No source fix is needed.")}</p> : null}
      {repairing && result.repair ? <p className="writing-small">{t("Checked source revision {{version}}", { version: result.repair.sourceVersion })}</p> : null}
      {repairStale ? <p className="writing-small">{t("Source changed since this check. Request a new check for the current source.")}</p> : null}
      <p>{result.explanation}</p>
      {compiledReport ? result.warnings.length ? <details><summary>{t("Compiler warnings (not blocking PDF)")}</summary>{result.warnings.map((warning, index) => <pre key={index}>{warning}</pre>)}</details> : null : !result.needsContext && current?.input.action !== "citations" && current?.input.action !== "explain" && (!repairing || repairChanged) ? <div className="writing-ai-comparison">
        {target.original ? <details open><summary>{t("Original passage")}</summary><pre className="writing-ai-original">{target.original}</pre></details> : null}
        <h4>{t("Proposed passage")}</h4><pre className="writing-ai-proposed">{result.text}</pre>
      </div> : current?.input.action === "explain" ? <pre>{result.text}</pre> : null}
      {(repairing ? [] : result.citations).map(c => <article className="writing-ai-citation" key={c.id}><h4><Link to={`/papers/${c.id}`} target="_blank" rel="noreferrer">{c.title}</Link></h4><small>{c.authors.join(", ")}{c.year ? ` · ${c.year}` : ""}</small><p>{c.reason}</p>{c.support ? <><blockquote>{c.support.quote}</blockquote><small>{t(c.support.kind === "ABSTRACT" ? "Source quote · abstract only" : "Source quote · reviewed excerpt")} · {c.support.locator}</small></> : null}<span>{t(c.evidenceStatus === "REVIEWED_EVIDENCE" ? "Has reviewed project evidence; check this claim" : "Project source · support needs checking")}</span><small>{t("Uses metadata, abstracts and reviewed excerpts where available. Check the full source.")}</small>{c.doi ? <small>DOI: {c.doi}</small> : null}<code>{c.citationKey}</code><Button size="sm" variant="outline" disabled={!canWrite || busy || applied || inserted.includes(c.id)} onClick={() => void accept("insert", c.id)}>{t("Insert verified citation key")}</Button></article>)}
      {current?.input.action === "citations" && !result.citations.length ? <p>{t("No supporting project source found. Add relevant papers to Literature and try again.")}</p> : null}
      {!compiledReport ? <p className="writing-small">{t(repairing ? repairChanged ? "AI may suggest an incomplete fix. Only compilation can confirm the result." : "No source changes proposed. There is no fix to apply." : "AI suggestions require human review. Project sources do not establish that a claim is supported.")}</p> : null}
      {hasAccepted ? <p role="status">{t("Applied to the editor. Follow the source sync status for server saving.")}</p> : null}
      {!applied && insertable && (!repairing || (repairChanged && !compiledReport)) ? <div className="writing-ai-actions">
        <Button size="sm" disabled={!canWrite || busy || (repairing && result.text === target.original)} onClick={() => void accept(target.original && current?.input.action !== "continue" ? "replace" : "insert")}>{t(repairing ? "Apply proposed fix" : "Accept suggestion")}</Button>
        {!repairing ? <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => void accept("insert")}>{t("Insert after selection")}</Button> : null}
        {!repairing && target.original && current?.input.action !== "continue" ? <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => void accept("replace")}>{t("Replace selection")}</Button> : null}
      </div> : null}
      {!compiledReport ? result.warnings.filter(warning => !["AI suggestions require human review. Project sources do not establish that a claim is supported.", "The proposed fix has not been compiled. Review it and compile again after applying."].includes(warning)).map((warning, index) => <p className="writing-small" key={index}>{t(warning)}</p>) : null}
      {!hasAccepted && !compiledReport && !result.needsContext ? <Button size="sm" variant="outline" disabled={!canWrite || busy || waiting} onClick={() => void submit(true)}>{t("Regenerate suggestion")}</Button> : null}
      {repairing && repairChanged && !compiledReport ? <p className="writing-small" role={applied && repairCompiled ? "status" : undefined}>{t(applied && repairCompiled ? "The current saved source compiled successfully." : "The proposed fix has not been compiled. Review it and compile again after applying.")}</p> : null}
      {repairing && applied && onCompile ? <Button size="sm" disabled={!canWrite || !canCompile || busy} onClick={onCompile}>{t("Compile repaired source")}</Button> : null}
    </div> : null}
    {current ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reject()}>{t(waiting ? "Cancel request" : hasAccepted || result?.needsContext || (repairing && !repairChanged) ? "New suggestion" : "Reject suggestion")}</Button> : null}
  </section>;
}
