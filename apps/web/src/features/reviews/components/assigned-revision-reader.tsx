import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { submissionsApi } from "@/features/submissions";
import { useI18n } from "@/i18n";

export function AssignedRevisionReader({ submissionId, revisionId, contentType, text, compact = false }: { submissionId: string; revisionId?: string; contentType?: string; text?: string; compact?: boolean }) {
  const { t } = useI18n();
  const readerId = useId();
  const sections = useMemo(() => {
    const parts: Array<{ title: string; content: string }> = [];
    for (const line of (text ?? "").split("\n")) {
      const heading = line.match(/^#{1,6}\s+(.+)/)?.[1] ?? line.match(/^\\(?:chapter|section|subsection)\*?\{([^}]+)\}/)?.[1];
      if (!parts.length || heading && parts.length < 60) parts.push({ title: heading ?? t("mentorWorkspace.documentStart"), content: line });
      else parts[parts.length - 1]!.content += `\n${line}`;
    }
    return parts;
  }, [text, t]);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setUrl(""); setFailed(false);
    if (contentType !== "PDF" || !revisionId) return;
    const controller = new AbortController();
    let objectUrl = "";
    submissionsApi.revisionBlob(submissionId, revisionId, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [submissionId, revisionId, contentType, attempt]);
  if (contentType === "PDF") return <div className={compact ? "rw-reader-body" : "mt-4"} aria-live="polite">{url ? <iframe title={t("Assigned manuscript PDF")} src={url} className={compact ? "rw-pdf-frame" : "h-[70vh] w-full rounded-md border"} /> : failed ? <div className="rounded-md border p-4 text-sm"><p>{t("Could not load the assigned PDF.")}</p><Button variant="outline" className="mt-2" onClick={() => setAttempt(n => n + 1)}>{t("Retry")}</Button></div> : <p className="p-4 text-sm text-muted-foreground">{t("Loading assigned PDF…")}</p>}{!compact ? <p className="mt-2 text-xs text-muted-foreground">{t("Use the PDF toolbar to navigate pages. Feedback uses page or section references; quotations must be checked manually.")}</p> : null}</div>;
  return <div className={compact ? "rw-reader-body rw-reader-text-wrap" : "mt-4"}>
    {sections.length > 1 && <label className="mb-3 block text-sm">{t("mentorWorkspace.goToSection")}<select className="ml-3 max-w-full rounded-md border bg-background p-2" defaultValue="" onChange={event => document.getElementById(`${readerId}-${event.target.value}`)?.scrollIntoView({ block: "start", behavior: "auto" })}><option value="" disabled>{t("mentorWorkspace.chooseSection")}</option>{sections.map((section, index) => <option key={index} value={index}>{section.title}</option>)}</select></label>}
    <div className={compact ? "rw-text-frame" : "max-h-[70vh] overflow-auto rounded-lg border bg-muted/20 p-4"}>{text ? sections.map((section, index) => <pre key={index} id={`${readerId}-${index}`} className="scroll-mt-4 whitespace-pre-wrap break-words text-sm leading-7">{section.content}</pre>) : <p>{t("No text snapshot available")}</p>}</div>
  </div>;
}
