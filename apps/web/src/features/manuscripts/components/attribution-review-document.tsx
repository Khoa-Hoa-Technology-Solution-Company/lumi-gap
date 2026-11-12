import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "../manuscripts.api";
export function AttributionReviewDocument({projectId,manuscriptId,snapshotId,available}:{projectId:string;manuscriptId:string;snapshotId:string;available:boolean}) {
  const {t}=useI18n(),[url,setUrl]=useState<string>();
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  const request=useMutation({mutationFn:()=>manuscriptsApi.attributionDocument(projectId,manuscriptId,snapshotId),onSuccess:blob=>setUrl(URL.createObjectURL(blob))});
  return <div className="space-y-2"><Button type="button" size="sm" variant="outline" disabled={!available||request.isPending} onClick={()=>request.mutate()}>{t("Review this exact snapshot PDF")}</Button>{!available&&<p className="text-xs text-muted-foreground">{t("No compiled PDF for this snapshot. Ask the team to compile the selected version for review.")}</p>}{url&&<a className="block text-sm text-primary underline" href={url} target="_blank" rel="noreferrer">{t("Open review PDF in a new tab")}</a>}{request.isError&&<p role="alert" className="text-sm text-destructive">{t("The review PDF is unavailable or your access changed. Reload the declaration.")}</p>}</div>;
}
