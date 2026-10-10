import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { academicProfileApi } from "../api/academic-profile.api";

const PdfPreview = lazy(() => import("./private-evidence-pdf-preview"));
export function EvidenceBlobPreview({ blob, name }: { blob: Blob; name: string }) {
  const { t } = useI18n(), [url, setUrl] = useState<string>();
  useEffect(() => {
    const url = URL.createObjectURL(blob); setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  if (!["application/pdf", "image/png", "image/jpeg"].includes(blob.type)) return <p role="alert">{t("Choose a PDF, JPEG or PNG of up to 10 MB.")}</p>;
  return <div className="space-y-3">
    {blob.type === "application/pdf" ? <Suspense fallback={<p role="status">{t("Loading private PDF…")}</p>}><PdfPreview blob={blob} /></Suspense> : <img src={url} alt={t("Private verification evidence")} className="mx-auto max-h-[60dvh] max-w-full object-contain" />}
    <Button asChild variant="outline"><a href={url} download={name}>{t("Download private document")}</a></Button>
  </div>;
}

export function SavedEvidencePreview({ requestId, sourceId, name = "verification-evidence" }: { requestId: string; sourceId?: string; name?: string }) {
  const { t } = useI18n(), [blob, setBlob] = useState<Blob>(), [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setBlob(undefined); setError(false);
    void academicProfileApi.ownVerificationEvidenceFile(requestId, sourceId).then(value => { if (active) setBlob(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [requestId, sourceId]);
  if (error) return <p role="alert">{t("Evidence is unavailable or you no longer have access. Refresh verification status.")}</p>;
  return blob ? <EvidenceBlobPreview blob={blob} name={name} /> : <p role="status">{t("Loading private evidence…")}</p>;
}
