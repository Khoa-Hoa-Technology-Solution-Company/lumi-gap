import { Badge } from "@/components/ui/badge";
import { useCommunityPublicMembers, type CommunityView } from "@/features/forum";
import { useI18n } from "@/i18n";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

/** Active-member roster. It carries no email addresses, so it is safe to show to every member. */
export function CommunityMembersTab({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const members = useCommunityPublicMembers(community.id, !community.contentRestricted);

  if (community.contentRestricted) return <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("Request membership to see who belongs to this community.")}</p>;
  if (members.isLoading) return <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (members.error) return <p className="text-sm text-red-600">{t("Unable to load members.")}</p>;
  if (!members.data?.length) return <p className="text-sm text-muted-foreground">{t("No members yet.")}</p>;

  return <ul className="divide-y overflow-hidden rounded-xl border bg-card">
    {members.data.map((member) => <li key={member.id} className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(member.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.fullName}</p>
        {member.institution ? <p className="truncate text-xs text-muted-foreground">{member.institution}</p> : null}
      </div>
      {member.role !== "member" ? <Badge variant="outline" className="font-normal">{t(member.role)}</Badge> : null}
    </li>)}
  </ul>;
}
