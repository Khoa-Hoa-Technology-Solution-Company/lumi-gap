import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCommunityPublicMembers, type CommunityView } from "@/features/forum";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

/** Active-member roster for signed-in users. It carries no email addresses. Anonymous viewers get a sign-in prompt and no request is sent. */
export function CommunityMembersTab({ community }: { community: CommunityView }) {
  const { t } = useI18n(); const location = useLocation();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const members = useCommunityPublicMembers(community.id, isAuthed);

  if (!isAuthed) return <div className="rounded-xl border border-dashed px-6 py-12 text-center"><p className="text-sm text-muted-foreground">{t("Sign in to see members")}</p><Button asChild variant="outline" className="mt-4 min-h-11"><Link to="/login" state={{ from: location }}>{t("Sign in")}</Link></Button></div>;
  if (members.isLoading) return <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (members.error) return <p className="text-sm text-red-600">{t("Unable to load members.")}</p>;
  const rows = members.data?.pages.flatMap((page) => page.data) ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("No members yet.")}</p>;

  return <div className="space-y-3">
  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
    {rows.map((member) => <li key={member.id} className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(member.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.fullName}</p>
        {member.institution ? <p className="truncate text-xs text-muted-foreground">{member.institution}</p> : null}
      </div>
      {member.role !== "member" ? <Badge variant="outline" className="font-normal">{t(member.role)}</Badge> : null}
    </li>)}
  </ul>
  {members.hasNextPage ? <button type="button" disabled={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()} className="w-full rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">{t(members.isFetchingNextPage ? "Loading…" : "Load more")}</button> : null}
  </div>;
}
