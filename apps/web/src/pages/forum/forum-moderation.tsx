import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { forumApi, type ForumMyAction } from "@/features/forum/api/forum.api";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";

export function ForumModerationPage() {
  const { t } = useI18n();
  const viewer = useAuthStore((state) => state.user?.id);
  const actions = useQuery({ queryKey: ["forum", "my-moderation", viewer], queryFn: forumApi.myModerationActions });
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-10">
    <Link to="/forum" className="text-sm text-primary hover:underline">{t("Back to forum")}</Link>
    <header><h1 className="flex items-center gap-3 text-2xl font-semibold"><ShieldCheck className="h-6 w-6 text-primary" />{t("My moderation decisions")}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Review decisions affecting your content or posting access. You can submit one appeal within the displayed deadline.")}</p></header>
    {actions.isPending ? <p role="status">{t("Loading…")}</p> : actions.isError ? <div role="alert" className="rounded-lg border p-5"><p>{t("Could not load moderation decisions.")}</p><Button className="mt-3" variant="outline" onClick={() => { void actions.refetch(); }}>{t("Retry")}</Button></div> : actions.data?.length ? actions.data.map((action) => <ActionCard key={action.id} action={action} />) : <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("No moderation decisions affect your account.")}</p>}
  </main>;
}

function ActionCard({ action }: { action: ForumMyAction }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const submit = useMutation({ mutationFn: () => forumApi.submitAppeal(action.id, reason.trim()), onSuccess: async () => { toast.success(t("Appeal submitted")); await qc.invalidateQueries({ queryKey: ["forum", "my-moderation"] }); }, onError: () => toast.error(t("Could not submit the appeal. Refresh and try again.")) });
  return <article className="space-y-4 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t(action.action)}</h2><time className="text-xs text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</time></div>
    <p className="whitespace-pre-wrap text-sm leading-6">{action.reason || t("No reason was recorded.")}</p>
    {action.postId ? <Link to={"/forum/" + encodeURIComponent(action.postId) + (action.commentId ? "#comment-" + encodeURIComponent(action.commentId) : "")} className="inline-block text-sm text-primary hover:underline">{t("Open discussion")}</Link> : null}
    {action.appeal ? <div className="space-y-2 border-t pt-4 text-sm"><p className="font-medium">{t("Appeal status")}: {t(action.appeal.status)}</p><p className="whitespace-pre-wrap text-muted-foreground">{action.appeal.reason}</p>{action.appeal.decisionReason ? <p className="whitespace-pre-wrap">{action.appeal.decisionReason}</p> : null}</div> : action.canAppeal ? <form className="space-y-3 border-t pt-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 3) submit.mutate(); }}><label className="block space-y-2 text-sm"><span className="font-medium">{t("Reason for appeal")}</span><textarea required minLength={3} maxLength={5000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><p className="text-xs text-muted-foreground">{t("Appeal deadline")}: {new Date(action.deadline).toLocaleString()}</p><Button type="submit" disabled={submit.isPending || reason.trim().length < 3}>{t(submit.isPending ? "Working…" : "Submit appeal")}</Button></form> : <p className="border-t pt-4 text-sm text-muted-foreground">{t("The appeal window has expired.")}</p>}
  </article>;
}
