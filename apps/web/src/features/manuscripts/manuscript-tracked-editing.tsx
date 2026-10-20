import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { ProposalSourceEditor } from "./source-editor";
import { sourceDiff } from "./manuscript-version-diff";
import { TrackedProposalSaver, type ProposalReceipt } from "./tracked-proposal-saver";

export function ManuscriptTrackedEditing({ original, filename, disabled, create, update, onDirty, onClose, onReview }: { original: string; filename: string; disabled: boolean; create: (text: string) => Promise<ProposalReceipt>; update: (receipt: ProposalReceipt, text: string) => Promise<ProposalReceipt>; onDirty: (dirty: boolean) => void; onClose: () => void; onReview: () => void }) {
  const { t } = useI18n(), [value, setValue] = useState(original), [, refresh] = useState(0), [showDiff, setShowDiff] = useState(false);
  const active = useRef(true), createRef = useRef(create), updateRef = useRef(update);
  createRef.current = create; updateRef.current = update;
  const [saver] = useState(() => new TrackedProposalSaver(original, text => createRef.current(text), (receipt, text) => updateRef.current(receipt, text), () => { if (active.current) refresh(revision => revision + 1); }));
  useEffect(() => { active.current = true; return () => { active.current = false; queueMicrotask(() => { if (!active.current) saver.dispose(); }); }; }, [saver]);
  // Do not dispose the saver in StrictMode's effect rehearsal. Real unmounts
  // simply stop scheduling new saves; the in-flight request can finish safely.
  useUnsavedWorkspace(saver.dirty);
  useEffect(() => { onDirty(saver.dirty); return () => onDirty(false); }, [saver.dirty, onDirty]);
  const overLimit = value.length > 100000;
  const save = () => { if (!disabled && !overLimit) void saver.save().catch(() => undefined); };
  useEffect(() => {
    if (!saver.dirty || saver.failed || disabled || overLimit) return;
    const timer = setTimeout(save, 900); return () => clearTimeout(timer);
  }, [value, saver.dirty, saver.failed, disabled, overLimit]);
  const lines = showDiff ? sourceDiff(original, value) : [];
  return <section className="writing-tracked-editing" aria-label={t("Track changes")}>
    <header><div><strong>{t("Track changes")} · {filename}</strong><p>{t("Typing saves a proposal automatically. Shared source changes only after acceptance.")}</p></div><Button size="sm" variant="ghost" onClick={onClose}>{t("Exit tracking")}</Button></header>
    <div className="writing-tracked-status"><span role="status">{t(saver.failed ? "Proposal save interrupted; your text is retained." : saver.busy ? "Saving proposal…" : saver.dirty ? "Proposal changes pending" : saver.revision ? "Proposal saved for review" : "Edit the proposal to start tracking")}{saver.revision ? ` · v${saver.revision}` : ""}</span><span>{value.length} / 100.000</span></div>
    {overLimit ? <p role="alert" className="writing-error">{t("This proposal exceeds 100,000 characters. Shorten it or copy the text before exiting; nothing is truncated.")}</p> : null}
    <ProposalSourceEditor initial={original} disabled={disabled} onChange={text => { saver.edit(text); setValue(text); }} />
    <div className="writing-actions"><Button size="sm" disabled={disabled || overLimit || saver.busy || !saver.dirty} onClick={save}>{t(saver.failed ? "Retry save" : "Save proposal")}</Button><Button size="sm" variant="outline" aria-pressed={showDiff} onClick={() => setShowDiff(open => !open)}>{t("Compare changes")}</Button><Button size="sm" variant="ghost" onClick={onReview}>{t("Review proposals")}</Button></div>
    {showDiff ? <pre className="writing-tracked-diff" aria-label={t("Source comparison")}>{lines.slice(0, 1500).map((line, index) => <span key={index} className={`writing-diff-${line.kind}`}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text}{"\n"}</span>)}</pre> : null}
    {disabled ? <p role="alert">{t("Editing is unavailable until source synchronization and permissions recover.")}</p> : null}
  </section>;
}
