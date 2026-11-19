import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mentorRoleLabelKeys, type MentorRole } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";

export function MentorRoleAssignments({ projectId }: { projectId: string }) {
  const { t } = useI18n(), actor = useAuthStore(s => s.user?.id), cache = useQueryClient();
  const [choices, setChoices] = useState<Record<string, MentorRole>>({}), lock = useRef(false), receipt = useRef<{ signature: string; key: string }>();
  const query = useQuery({ queryKey: ["mentorship-roles", actor, projectId], queryFn: () => academicSupportApi.roles(projectId), retry: false });
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => {
    receipt.current = undefined; setChoices({}); await Promise.all([cache.invalidateQueries({ queryKey: ["mentorship-roles"] }), cache.invalidateQueries({ queryKey: ["academic-support"] }), cache.invalidateQueries({ queryKey: ["mentor-workspace"] })]);
  } });
  const run = async (action: () => Promise<unknown>) => { if (lock.current) return; lock.current = true; try { await mutation.mutateAsync(action); } catch { /* Keep the proposed choices visible. */ } finally { lock.current = false; } };
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("mentorRoles.loading")}</p>;
  if (!query.data) return <div role="alert" className="text-sm"><p>{t("mentorRoles.loadError")}</p><Button variant="ghost" onClick={() => void query.refetch()}>{t("Try again")}</Button></div>;
  const data = query.data, pending = data.proposals.find(p => p.status === "PENDING");
  if (data.mentors.length < 2 && !data.proposals.length) return null;
  return <details className="mentor-role-assignments rounded-lg border p-4 text-sm" open={pending ? true : undefined}>
    <summary className="cursor-pointer font-medium">{t("mentorRoles.title")}</summary>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("mentorRoles.explanation")}</p>
    {data.canPropose && !pending && <form className="mt-4 space-y-3" onSubmit={e => {
      e.preventDefault(); const assignments = data.mentors.map(m => ({ relationshipId: m.relationshipId, role: choices[m.relationshipId] ?? m.role }));
      const signature = JSON.stringify(assignments); if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
      void run(() => academicSupportApi.proposeRoles(projectId, { assignments, clientKey: receipt.current!.key }));
    }}>
      {data.mentors.map(m => <label className="flex flex-wrap items-center justify-between gap-3" key={m.relationshipId}><span>{m.fullName}</span><select className="rounded-md border bg-background px-3 py-2 text-sm" disabled={mutation.isPending} value={choices[m.relationshipId] ?? m.role} onChange={e => setChoices(current => ({ ...current, [m.relationshipId]: e.target.value as MentorRole }))}>{(["UNASSIGNED", "PRIMARY", "SECONDARY"] as const).map(role => <option key={role} value={role}>{t(mentorRoleLabelKeys[role])}</option>)}</select></label>)}
      <Button type="submit" size="sm" variant="outline" disabled={mutation.isPending || !data.mentors.some(m => choices[m.relationshipId] && choices[m.relationshipId] !== m.role)}>{t("mentorRoles.propose")}</Button>
    </form>}
    {pending && <section className="mt-4 space-y-3">
      {pending.assignments.map(a => <p key={a.relationshipId}>{a.fullName}: {t(mentorRoleLabelKeys[a.from])} → <strong>{t(mentorRoleLabelKeys[a.to])}</strong></p>)}
      <p className="text-xs text-muted-foreground">{t("mentorRoles.confirmed")} {pending.confirmedBy.length}/{pending.assignments.length}</p>
      <div className="flex flex-wrap gap-2">{pending.canConfirm && <><Button size="sm" disabled={mutation.isPending} onClick={() => void run(() => academicSupportApi.respondRoles(projectId, pending.id, "ACCEPT"))}>{t("mentorRoles.accept")}</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => void run(() => academicSupportApi.respondRoles(projectId, pending.id, "DECLINE"))}>{t("Decline")}</Button></>}{pending.canCancel && <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => void run(() => academicSupportApi.respondRoles(projectId, pending.id, "CANCEL"))}>{t("Cancel")}</Button>}</div>
    </section>}
    {mutation.isError && <p role="alert" className="mt-3 text-sm text-destructive">{t(mentorshipError(mutation.error))}</p>}
    {data.proposals.some(p => p.status !== "PENDING") && <ul className="mt-4 space-y-2 border-t pt-3 text-xs text-muted-foreground">{data.proposals.filter(p => p.status !== "PENDING").slice(0, 5).map(p => <li key={p.id}>{new Date(p.createdAt).toLocaleString()} · {t(`mentorRoles.${p.status}`)} · {p.assignments.map(a => `${a.fullName}: ${t(mentorRoleLabelKeys[a.to])}`).join("; ")}</li>)}</ul>}
  </details>;
}
