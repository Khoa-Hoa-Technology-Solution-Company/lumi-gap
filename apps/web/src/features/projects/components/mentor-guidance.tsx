import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi, type MentorWorkspace } from "../api/academic-support.api";
import { useUnsavedWorkspace, WorkspaceDate, WorkspaceError } from "./workspace-common";
import "../mentor-guidance.css";

export function MentorGuidance({ projectId, data }: { projectId: string; data: MentorWorkspace }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id), cache = useQueryClient();
  const [note, setNote] = useState(""), [saved, setSaved] = useState(false);
  const busy = useRef(false);
  useUnsavedWorkspace(Boolean(note.trim()));
  const send = useMutation({ mutationFn: (text: string) => academicSupportApi.guidance(projectId, text), onSuccess: () => {
    setNote(""); setSaved(true);
    void cache.invalidateQueries({ queryKey: ["academic-support", userId, "workspace", projectId] });
    void cache.invalidateQueries({ queryKey: ["projects"] });
  } });
  return <aside className="mentor-project-guidance"><h2>{t(data.accessRole === "TEAM" ? "Guidance & team updates" : "Guidance for the team")}</h2><p>{t(data.accessRole === "TEAM" ? "Read your mentor's guidance and share a progress update or follow-up question." : "Leave a clear next step. The team can read your guidance in the project.")}</p>
    {data.canProvideFeedback ? <form onSubmit={async e => { e.preventDefault(); if (busy.current || !note.trim()) return; busy.current = true; try { await send.mutateAsync(note.trim()); } catch { /* Keep the draft so it can be retried. */ } finally { busy.current = false; } }}><label className="sr-only" htmlFor="mentor-guidance-note">{t("Guidance note")}</label><textarea id="mentor-guidance-note" rows={5} maxLength={2000} value={note} disabled={send.isPending} placeholder={t("What should the team focus on next?")} onChange={e => { setSaved(false); setNote(e.target.value); if (send.isError) send.reset(); }} /><div><span>{note.length}/2000</span><Button type="submit" size="sm" disabled={send.isPending || !note.trim()}><Send size={14} aria-hidden="true" />{t(send.isPending ? "Sending…" : "Send guidance")}</Button></div>{send.isError && <WorkspaceError error={send.error} />}{saved && <p role="status">{t("Guidance sent to the team.")}</p>}</form> : <p className="mentor-project-readonly">{t("This project is read-only. Previous guidance remains available.")}</p>}
    <h3>{t("Recent guidance")}</h3>{!data.guidance.length ? <p className="mentor-project-no-guidance">{t("No guidance yet. Start with one concrete suggestion for the team.")}</p> : <ol>{data.guidance.map(item => <li key={item.id}><div><strong>{item.author?.fullName ?? t("Former participant")}</strong><span>{t(item.attribution === "MENTOR" ? "Academic Mentor" : "Team member")}</span></div><p>{item.note}</p><WorkspaceDate value={item.createdAt} /></li>)}</ol>}
  </aside>;
}
