import type { LecturerEvidenceType } from "@trend/shared-types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EvidenceBlobPreview, SavedEvidencePreview } from "./evidence-blob-preview";

export type EvidenceDraft = {
  id: string; type: LecturerEvidenceType; sourceKind: "URL" | "DOCUMENT";
  reference: string; customEvidenceName: string; additionalExplanation: string; file?: File;
  retainedSourceId?: string; retainedFileName?: string;
};
const documentTypes = new Set<LecturerEvidenceType>(["INSTITUTION_ISSUED_PROFILE", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID"]);
const labels: Record<LecturerEvidenceType, string> = {
  OFFICIAL_FACULTY_PROFILE: "Official faculty/staff profile", OFFICIAL_STAFF_DIRECTORY: "Official staff directory", DEPARTMENT_DIRECTORY: "Department directory",
  EMPLOYMENT_DOCUMENT: "Employment confirmation", APPOINTMENT_DOCUMENT: "Appointment letter", STAFF_ID: "Staff/faculty ID", OTHER_INSTITUTION_SOURCE: "Other — Specify your evidence",
  INSTITUTION_ISSUED_PROFILE: "Institution-issued faculty/staff profile",
};
export const newEvidenceDraft = (id: string): EvidenceDraft => ({ id, type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: "", customEvidenceName: "", additionalExplanation: "" });
export function evidenceDraftIssue(source: EvidenceDraft): string | undefined {
  if (source.type === "OTHER_INSTITUTION_SOURCE" && source.customEvidenceName.trim().length < 2) return "Enter a name or description for your evidence.";
  if (source.sourceKind === "DOCUMENT") {
    if (!source.file) return source.retainedSourceId ? undefined : "Choose an evidence document.";
    if (!source.file.size || source.file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(source.file.type)) return "Choose a PDF, JPEG or PNG of up to 10 MB.";
  } else {
    try {
      const url = new URL(source.reference.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !url.hostname.includes(".") || /^\[|^[\d.]+$/.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error();
    } catch { return "Enter a public HTTPS institution source URL."; }
  }
  return undefined;
}
export function LecturerEvidenceEntry({ value, index, disabled, removable, onChange, onRemove, requestId }: {
  value: EvidenceDraft; index: number; disabled: boolean; removable: boolean; onChange: (value: EvidenceDraft) => void; onRemove: () => void; requestId?: string;
}) {
  const { t } = useI18n(), custom = value.type === "OTHER_INSTITUTION_SOURCE";
  const [previewOpen, setPreviewOpen] = useState(false);
  const id = index === 0 ? "lecturer-primary-evidence" : `lecturer-evidence-${value.id}`;
  const label = index === 0 ? "Official institution source" : "Additional institution evidence";
  const fileIssue = value.file && evidenceDraftIssue({ ...value, customEvidenceName: custom ? "valid" : "" });
  const urlIssue = value.sourceKind === "URL" && value.reference.trim() && evidenceDraftIssue({ ...value, customEvidenceName: custom ? "valid" : "" });
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-md border p-3">
    <legend className="px-1 text-sm font-medium">{t("Evidence {{number}}", { number: index + 1 })}</legend>
    <div className="flex items-center justify-between gap-2"><Label htmlFor={`${id}-type`}>{t("Evidence type")} *</Label>{removable && <Button type="button" size="sm" variant="ghost" onClick={onRemove}>{t("Remove evidence")}</Button>}</div>
    <select id={`${id}-type`} aria-label={t(label)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.type} onChange={event => {
      const type = event.target.value as LecturerEvidenceType;
      onChange({ ...value, type, retainedSourceId: type === value.type ? value.retainedSourceId : undefined, sourceKind: type === "OTHER_INSTITUTION_SOURCE" ? value.sourceKind : documentTypes.has(type) ? "DOCUMENT" : "URL" });
    }}>{Object.entries(labels).map(([type, text]) => <option key={type} value={type}>{t(text)}</option>)}</select>
    {custom && <>
      <div className="space-y-1.5"><Label htmlFor={`${id}-name`}>{t("Evidence name / description")} *</Label><Input id={`${id}-name`} required minLength={2} maxLength={200} placeholder={t("e.g. Teaching confirmation issued by your department")} value={value.customEvidenceName} onChange={e => onChange({ ...value, customEvidenceName: e.target.value })} /></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("Evidence format")} *</legend>{(["URL", "DOCUMENT"] as const).map(kind => <label key={kind} className="flex items-center gap-2 text-sm"><input type="radio" name={`${id}-format`} value={kind} checked={value.sourceKind === kind} onChange={() => onChange({ ...value, sourceKind: kind })} />{t(kind === "URL" ? "Official website URL" : "Institution-issued document")}</label>)}</fieldset>
    </>}
    {value.sourceKind === "URL" ? <div className="space-y-1.5"><Label htmlFor={id}>{t("Official profile / source URL")} *</Label><Input id={id} type="url" placeholder="https://" required maxLength={500} aria-invalid={Boolean(urlIssue)} aria-describedby={`${id}-url-issue`} value={value.reference} onChange={e => onChange({ ...value, reference: e.target.value })} /><p id={`${id}-url-issue`} aria-live="polite" className="text-xs text-destructive">{urlIssue ? t(urlIssue) : null}</p></div> : <div className="space-y-1.5">
      <Label htmlFor={id}>{t("Upload evidence")} *</Label>
      {value.file && <p className="break-all text-xs text-muted-foreground">{value.file.name} · {(value.file.size / 1024 / 1024).toFixed(1)} MB</p>}
      {(value.file && !fileIssue || value.retainedSourceId && requestId) && <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>{t("Preview evidence")}</Button>}
      {!value.file && value.retainedSourceId && <p className="break-all text-xs text-muted-foreground">{t("Previously submitted evidence")}: {value.retainedFileName}</p>}
      <Input id={id} type="file" required={!value.file && !value.retainedSourceId} accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" aria-label={t(value.file || value.retainedSourceId ? "Replace uploaded document" : "Upload evidence")} aria-invalid={Boolean(fileIssue)} onChange={e => onChange({ ...value, file: e.target.files?.[0] ?? value.file, retainedSourceId: e.target.files?.[0] ? undefined : value.retainedSourceId })} />
      <p className="text-xs leading-5 text-muted-foreground">{t("PDF, JPEG or PNG, up to 10 MB. Visible only to you and authorized administrators.")}</p>
      {fileIssue && <p role="alert" className="text-xs text-destructive">{t(fileIssue)}</p>}
    </div>}
    <details open={Boolean(value.additionalExplanation)}><summary className="cursor-pointer text-xs text-muted-foreground">{t("Additional explanation (optional)")}</summary><textarea id={`${id}-explanation`} aria-label={t("Additional explanation (optional)")} className="mt-2 min-h-16 w-full rounded-md border bg-background p-2 text-sm" maxLength={1000} value={value.additionalExplanation} placeholder={t("Who issued it, its institution, and how it confirms your current position.")} onChange={e => onChange({ ...value, additionalExplanation: e.target.value })} /></details>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl" data-no-i18n><DialogHeader><DialogTitle className="break-all">{value.file?.name ?? value.retainedFileName}</DialogTitle><DialogDescription>{t("Review this evidence before submitting.")}</DialogDescription></DialogHeader>{value.file ? <EvidenceBlobPreview blob={value.file} name={value.file.name} /> : requestId && <SavedEvidencePreview requestId={requestId} sourceId={value.retainedSourceId} name={value.retainedFileName} />}</DialogContent></Dialog>
  </fieldset>;
}
