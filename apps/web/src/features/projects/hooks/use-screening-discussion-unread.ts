import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationItem } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { useNotifications } from "@/features/notifications/hooks/use-notifications";
import { notificationsApi } from "@/features/notifications/api/notifications.api";

export function unreadScreeningDiscussion(items: NotificationItem[], roundId: string) {
  return items.filter(item => !item.isRead && item.type === "SCREENING_DISCUSSION_MESSAGE" && item.targetKind === "project" && item.screeningRoundId === roundId && item.screeningMessageId);
}

export function useScreeningDiscussionUnread(roundId: string, enabled = true) {
  const query = useNotifications({ enabled: Boolean(roundId) && enabled });
  return unreadScreeningDiscussion(query.data ?? [], roundId);
}

/** Only acknowledge messages actually loaded in a visible conversation at its latest message. */
export function useReadScreeningDiscussion(roundId: string, messageIds: string[], visible: boolean) {
  const actorId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const unread = useScreeningDiscussionUnread(roundId);
  const pending = useRef(new Set<string>());
  const [documentVisible, setDocumentVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const changed = () => setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!actorId || !visible || !documentVisible) return;
    const loaded = new Set(messageIds);
    const seen = unread.filter(item => loaded.has(item.screeningMessageId!) && !pending.current.has(item.id));
    if (!seen.length) return;
    seen.forEach(item => pending.current.add(item.id));
    void Promise.allSettled(seen.map(async item => {
      try {
        await notificationsApi.read(item.id);
        client.setQueryData<NotificationItem[]>(["notifications", actorId], items => items?.map(row => row.id === item.id ? { ...row, isRead: true } : row));
        return true;
      } catch {
        return false;
      } finally { pending.current.delete(item.id); }
    })).then(results => {
      if (results.some(result => result.status === "fulfilled" && result.value)) void client.invalidateQueries({ queryKey: ["notifications", actorId] });
    });
  }, [actorId, client, documentVisible, visible, messageIds, unread]);
}
