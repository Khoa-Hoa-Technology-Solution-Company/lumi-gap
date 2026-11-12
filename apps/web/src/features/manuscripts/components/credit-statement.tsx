import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "../manuscripts.api";
export function CreditStatement({ projectId, manuscriptId, snapshotId, enabled }: {projectId:string;manuscriptId:string;snapshotId:string;enabled:boolean}) {
  const {t}=useI18n(), [format,setFormat]=useState<'text'|'latex'|'json'>('text');
  const query=useMutation({mutationFn:()=>manuscriptsApi.creditStatement(projectId,manuscriptId,snapshotId)});
  const output=query.data?(format==='json'?JSON.stringify(query.data,null,2):query.data[format]):'';
  return <section className="space-y-3 border-t pt-4"><h3 className="font-medium">{t("CRediT contribution statement")}</h3><Button type="button" variant="outline" disabled={!enabled||query.isPending} onClick={()=>query.mutate()}>{t("Generate approved statement")}</Button>{query.isError&&<p role="alert" className="text-sm text-destructive">{query.error.message}</p>}{query.data&&enabled&&<><label className="block text-sm">{t("Export format")}<select className="ml-2 rounded border bg-background p-2" value={format} onChange={event=>setFormat(event.target.value as typeof format)}><option value="text">{t("Plain text")}</option><option value="json">JSON</option><option value="latex">LaTeX</option></select></label><textarea className="w-full rounded border bg-background p-3 font-mono text-xs" rows={8} readOnly value={output} aria-label={t("Approved CRediT statement")}/><Button type="button" size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(output).then(()=>toast.success(t("Copied"))).catch(()=>toast.error(t("Select and copy the statement manually.")))}>{t("Copy statement")}</Button></>}</section>;
}
