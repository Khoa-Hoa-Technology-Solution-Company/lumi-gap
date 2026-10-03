import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { forumPaperApi, type ForumResolvedPaper } from "../api/forum-paper.api";
import { useI18n } from "@/i18n";

/** Metadata preview is read-only; only the explicit Attach action imports a paper. */
export function ForumDoiLookup({ doi, onAttach }: { doi: string; onAttach: (paper: ForumResolvedPaper & { paperId: string }) => void }) {
  const { t } = useI18n();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const preview = useMutation({ mutationFn: () => forumPaperApi.preview(doi) });
  const attach = useMutation({ mutationFn: () => forumPaperApi.attach(doi), onSuccess: (paper) => { if (mounted.current) onAttach(paper); } });
  return <div className="space-y-2 py-2">
    {!preview.data ? <Button type="button" variant="outline" className="h-10" disabled={preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{t(preview.isPending ? "Resolving DOI…" : "Resolve DOI")}</Button> : <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3" aria-label={t("Paper metadata preview")}>
      <p className="text-sm font-medium">{preview.data.title}</p>
      <p className="text-xs leading-5 text-muted-foreground">{[preview.data.authors.slice(0, 4).join(", "), preview.data.publicationYear, preview.data.doi].filter(Boolean).join(" · ")}</p>
      {preview.data.canAttach ? <Button type="button" className="h-10" disabled={attach.isPending} onClick={() => attach.mutate()}>{attach.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{t(attach.isPending ? "Attaching paper…" : "Attach paper")}</Button> : <p className="text-sm text-muted-foreground">{t("This paper does not meet LumiGap's public metadata quality requirements. Search for another paper.")}</p>}
    </div>}
    {preview.isError || attach.isError ? <p role="alert" className="text-sm text-destructive">{t("Could not resolve or attach this DOI. Check the DOI and try again.")}</p> : null}
  </div>;
}
