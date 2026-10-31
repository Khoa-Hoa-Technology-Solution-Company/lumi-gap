import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ForumModerationQueue, useForumPosts, useModerateForumContent, type CommunityView, type ForumPostView } from "@/features/forum";
import { useI18n } from "@/i18n";

type Action = "THREAD_PINNED" | "THREAD_UNPINNED" | "THREAD_LOCKED" | "THREAD_UNLOCKED" | "THREAD_HIDDEN" | "THREAD_RESTORED";

/** Moderation of the posts scoped to this community. The API checks the actor is its owner, a moderator or an admin. */
export function CommunityModerationTab({ community, frozen }: { community: CommunityView; frozen: boolean }) {
  const { t } = useI18n();
  const posts = useForumPosts({ researchCommunityId: community.id, includeModerated: true, pageSize: 30, sort: "latest" });
  const moderate = useModerateForumContent();
  const [target, setTarget] = useState<ForumPostView>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const rows = posts.data?.data ?? [];

  async function run(post: ForumPostView, action: Action, why?: string) {
    setError("");
    try { await moderate.mutateAsync({ targetType: "post", targetId: post.id, action, reason: why }); setTarget(undefined); setReason(""); }
    catch { setError(t("Could not update this discussion.")); }
  }

  return <section>
    <h2 className="text-lg font-semibold">{t("Moderation")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t("Pin, lock or hide discussions posted in this community.")}</p>
    {frozen ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t("This community is archived, so its discussions can no longer be moderated here. Only an administrator can.")}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    {posts.isLoading ? <div className="mt-5 h-24 animate-pulse rounded-lg bg-muted" />
      : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">{t("No discussions in this community yet.")}</p>
        : <div className="mt-5 divide-y border-y">{rows.map((post) => <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link to={`/forum/${post.publicSlug ?? post.id}`} className="block truncate font-medium hover:text-blue-700">{post.title}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{post.isPinned ? <Badge variant="secondary">{t("Pinned")}</Badge> : null}{post.status === "locked" ? <Badge variant="secondary">{t("Locked")}</Badge> : null}{post.status === "hidden" ? <Badge variant="destructive">{t("Hidden")}</Badge> : null}<span>{post.author.fullName}</span></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {post.status !== "hidden" ? <>
              <Button size="sm" variant="ghost" disabled={frozen || moderate.isPending} onClick={() => run(post, post.isPinned ? "THREAD_UNPINNED" : "THREAD_PINNED")}><Pin className="h-4 w-4" />{t(post.isPinned ? "Unpin" : "Pin")}</Button>
              <Button size="sm" variant="ghost" disabled={frozen || moderate.isPending} onClick={() => run(post, post.status === "locked" ? "THREAD_UNLOCKED" : "THREAD_LOCKED")}><Lock className="h-4 w-4" />{t(post.status === "locked" ? "Unlock" : "Lock")}</Button>
            </> : null}
            <Button size="sm" variant="ghost" className={post.status === "hidden" ? "text-emerald-700" : "text-red-600"} disabled={frozen || moderate.isPending} onClick={() => setTarget(post)}>{t(post.status === "hidden" ? "Restore" : "Hide")}</Button>
          </div>
        </div>)}</div>}
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) { setTarget(undefined); setReason(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t(target?.status === "hidden" ? "Restore this discussion?" : "Hide this discussion?")}</DialogTitle><DialogDescription>{target?.title}</DialogDescription></DialogHeader>
        <Input aria-label={t("Reason")} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Reason (required)")} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button>
          <Button disabled={reason.trim().length < 3 || moderate.isPending} onClick={() => target && run(target, target.status === "hidden" ? "THREAD_RESTORED" : "THREAD_HIDDEN", reason.trim())}>{t(target?.status === "hidden" ? "Restore" : "Hide")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="mt-10 border-t pt-7"><ForumModerationQueue communityId={community.id} /></div>
  </section>;
}
