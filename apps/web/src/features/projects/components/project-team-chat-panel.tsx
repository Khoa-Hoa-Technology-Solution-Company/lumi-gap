import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CheckCheck, FileText, Lightbulb, Loader2, SendHorizonal, Trash2, Users, XCircle } from "lucide-react";
import { isAdminSystemRole, type ProjectTeamChatMessage } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectTeamChatApi } from "../api/project-team-chat.api";
import { useChatScroll } from "../hooks/use-chat-scroll";

interface ProjectTeamChatPanelProps {
  projectId: string;
  ownerId?: string;
  draft?: string;
  onDraftChange?: (value: string) => void;
  onSent?: (content: string) => void;
}

export function ProjectTeamChatPanel({ projectId, ownerId, draft, onDraftChange, onSent }: ProjectTeamChatPanelProps) {
  const { t, language } = useI18n();
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [localMessage, setLocalMessage] = useState("");
  const message = draft ?? localMessage;
  const setMessage = onDraftChange ?? setLocalMessage;
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const sending = useRef(false), receipt = useRef<{ content: string; key: string }>();
  const [olderMessages, setOlderMessages] = useState<ProjectTeamChatMessage[]>([]), [historyComplete, setHistoryComplete] = useState(false);
  const queryKey = useMemo(() => ["project-team-chat", projectId, currentUser?.id] as const, [projectId, currentUser?.id]);

  const teamStarters = [
    {
      icon: FileText,
      label: t("Hi team! I've updated the initial paper collection for this project."),
    },
    {
      icon: Users,
      label: t("Let's align on our screening criteria before we start reviewing."),
    },
    {
      icon: Lightbulb,
      label: t("Check out the candidate research gaps identified in the Gaps tab."),
    },
  ];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 46), 160)}px`;
    }
  }, [message]);

  const historyQuery = useQuery({
    queryKey,
    queryFn: () => projectTeamChatApi.listMessages(projectId),
    retry: false,
    refetchInterval: liveStatus === "live" ? false : 5000,
    refetchIntervalInBackground: false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => {
      if (receipt.current?.content !== content) receipt.current = { content, key: crypto.randomUUID() };
      return projectTeamChatApi.sendMessage(projectId, content, receipt.current.key);
    },
    onSuccess: (sent, content) => {
      queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current = []) =>
        current.some(item => item.id === sent.id) ? current.map(item => item.id === sent.id ? sent : item) : [...current, sent],
      );
      if (onSent) onSent(content); else setMessage("");
      receipt.current = undefined;
      void queryClient.invalidateQueries({
        queryKey,
      });
    },
    onSettled: () => { sending.current = false; },
  });

  useEffect(() => {
    if (sendMutation.isSuccess || sendMutation.isError) textareaRef.current?.focus();
  }, [sendMutation.isSuccess, sendMutation.isError]);

  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => projectTeamChatApi.markRead(projectId, messageId),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)) ?? current,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      projectTeamChatApi.deleteMessage(projectId, messageId, "Removed from team chat"),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProjectTeamChatMessage[]>(queryKey);
      queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current) =>
        current?.map((item) =>
          item.id === messageId
            ? {
                ...item,
                content: "",
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                deletedBy: currentUser
                  ? {
                      id: currentUser.id,
                      fullName: currentUser.fullName,
                      email: currentUser.email,
                      avatarUrl: currentUser.avatarUrl,
                    }
                  : undefined,
                deleteReason: "Removed from team chat",
              }
            : item,
        ) ?? current,
      );
      return { previous };
    },
    onError: (_error, _messageId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const messages = useMemo(() => {
    const merged = new Map(olderMessages.map(item => [item.id, item]));
    for (const item of historyQuery.data ?? []) merged.set(item.id, item);
    return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [olderMessages, historyQuery.data]);
  const older = useMutation({ mutationFn: () => projectTeamChatApi.listMessages(projectId, { limit: 50, beforeId: messages[0]!.id }), onSuccess: items => {
    setOlderMessages(current => [...items, ...current]);
    if (items.length < 50) setHistoryComplete(true);
  } });
  const pendingUserMessage = sendMutation.isPending
    ? ({
        id: "pending-team-msg",
        projectId,
        sender: {
          id: currentUser?.id ?? "me",
          fullName: currentUser?.fullName,
          email: currentUser?.email,
          avatarUrl: currentUser?.avatarUrl,
        },
        content: sendMutation.variables ?? message,
        readBy: currentUser
          ? [
              {
                id: currentUser.id,
                fullName: currentUser.fullName,
                email: currentUser.email,
                avatarUrl: currentUser.avatarUrl,
              },
            ]
          : [],
        readCount: currentUser ? 1 : 0,
        isDeleted: false,
        createdAt: new Date().toISOString(),
      } satisfies ProjectTeamChatMessage)
    : null;

  const visibleMessages = useMemo(
    () => (pendingUserMessage ? [...messages, pendingUserMessage] : messages),
    [messages, pendingUserMessage],
  );

  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(visibleMessages.at(-1)?.id);

  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled || historyQuery.isError) return;
      setLiveStatus((current) => (current === "offline" ? "reconnecting" : current));
      void projectTeamChatApi.streamEvents(projectId, {
        signal: controller.signal,
        onOpen: () => setLiveStatus("live"),
        onEvent: (event) => {
          if (event.type === "ready") {
            setLiveStatus("live");
            return;
          }
          if (!event.message) return;
          queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current) => {
            const existing = current ?? [];
            const index = existing.findIndex((item) => item.id === event.message!.id);
            if (index >= 0) {
              return existing.map((item) => (item.id === event.message!.id ? event.message! : item));
            }
            return [...existing, event.message!];
          });
        },
      }).catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[team-chat] event stream disconnected", error);
        setLiveStatus("reconnecting");
        reconnectTimer = window.setTimeout(connect, 3000);
      });
    };

    connect();

    return () => {
      cancelled = true;
      controller.abort();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [historyQuery.isError, projectId, queryClient, queryKey]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (!atBottom || !latest || latest.id === lastMarkedReadRef.current || latest.sender.id === currentUser?.id) return;
    const alreadyRead = latest.readBy.some((reader) => reader.id === currentUser?.id);
    if (alreadyRead) return;
    lastMarkedReadRef.current = latest.id;
    markReadMutation.mutate(latest.id);
  }, [atBottom, currentUser?.id, markReadMutation, messages]);

  const submit = () => {
    const text = message.trim();
    if (!text || sending.current || sendMutation.isPending || historyQuery.isError || historyQuery.isLoading) return;
    sending.current = true;
    jumpToLatest();
    sendMutation.mutate(text);
  };

  const getInitials = (sender: { fullName?: string; email?: string }) => {
    const name = sender.fullName || sender.email || "?";
    return name.charAt(0).toUpperCase();
  };

  const isDisabled = sendMutation.isPending || historyQuery.isError;

  const selectStarter = (text: string) => { setMessage(text); textareaRef.current?.focus(); };
  const locale = language === "vi" ? "vi-VN" : "en-GB";

  return (
    <div className="project-team-chat-panel project-chat-surface">
      <div className="project-chat-context">
        <span className="project-chat-connection ml-auto" data-live={liveStatus === "live"} role="status">
          <i aria-hidden="true" />{t(liveStatusLabel(liveStatus))}
        </span>
      </div>
      <div className="project-chat-body">
        <div className="project-chat-feed-region">
        <div ref={containerRef} onScroll={onScroll} className="project-chat-feed" role="log" aria-label={t("Team messages")} aria-live="polite" aria-relevant="additions" aria-busy={historyQuery.isLoading} tabIndex={0}>
          {!historyComplete && (olderMessages.length > 0 || (historyQuery.data?.length ?? 0) >= 50) && <Button type="button" size="sm" variant="ghost" disabled={older.isPending} onClick={() => older.mutate()}>{t(older.isPending ? "Loading…" : "Load older messages")}</Button>}
          {older.isError && <p role="alert">{t("Could not load team messages")}</p>}
          {historyQuery.isLoading ? (
            <div className="project-chat-empty"><Loader2 className="h-5 w-5 animate-spin" /><p>{t("Loading team messages…")}</p></div>
          ) : historyQuery.isError ? (
            <div className="project-chat-empty" role="alert"><XCircle size={24} /><h4>{t("Could not load team messages")}</h4><p>{t("Check your connection and project access, then try again.")}</p><Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>{t("Try again")}</Button></div>
          ) : visibleMessages.length === 0 ? (
            <div className="project-chat-empty">
              <Users size={28} aria-hidden="true" />
              <h4>{t("Start a conversation with your team")}</h4>
              <p>{t("Share an update, ask a question or agree on your next step.")}</p>
              <div className="project-chat-starters">
                {teamStarters.map(starter => <button type="button" key={starter.label} onClick={() => selectStarter(starter.label)}><starter.icon size={16} aria-hidden="true" /><span>{starter.label}</span></button>)}
              </div>
            </div>
          ) : visibleMessages.map((item, index) => {
            const isMe = item.sender.id === currentUser?.id;
            const canDelete = isMe || currentUser?.id === ownerId || isAdminSystemRole(currentUser?.systemRole);
            const isPending = item.id === "pending-team-msg";
            const readByOthers = Math.max(0, item.readCount - (isMe ? 1 : 0));
            const previous = visibleMessages[index - 1];
            const date = new Date(item.createdAt);
            const newDay = !previous || date.toDateString() !== new Date(previous.createdAt).toDateString();
            return <div key={item.id}>
              {newDay && <div className="project-chat-date"><time dateTime={item.createdAt}>{date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</time></div>}
              <div className="project-chat-message" data-own={isMe} data-deleted={item.isDeleted}>
                {!isMe && <div className="project-chat-avatar" aria-hidden="true">{item.sender.avatarUrl ? <img src={item.sender.avatarUrl} alt="" /> : getInitials(item.sender)}</div>}
                <div className="project-chat-message-main">
                  <div className="project-chat-message-meta"><strong>{isMe ? t("You") : item.sender.fullName || item.sender.email || t("Member")}</strong><time dateTime={item.createdAt} title={date.toLocaleString(locale)}>{date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time></div>
                  <div className="project-chat-bubble"><p>{item.isDeleted ? t("This message was removed.") : item.content}</p></div>
                  <div className="project-chat-message-footer">
                    {isMe && !item.isDeleted && <span><CheckCheck size={13} aria-hidden="true" />{isPending ? t("Sending…") : readByOthers ? t("Seen by {{count}}", { count: readByOthers }) : t("Sent")}</span>}
                    {canDelete && !isPending && !item.isDeleted && <button type="button" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending} aria-label={t("Delete message")} title={t("Delete message")}><Trash2 size={14} aria-hidden="true" /></button>}
                  </div>
                </div>
              </div>
            </div>;
          })}
        </div>
        {!atBottom && <button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={15} aria-hidden="true" />{t(hasNewMessages ? "New messages" : "Jump to latest")}</button>}
        </div>
        {(sendMutation.isError || deleteMutation.isError) && <div className="project-chat-error" role="alert"><XCircle size={16} aria-hidden="true" />{t(sendMutation.isError ? "Could not send. Your message is kept below; try again." : "Could not remove this message. Try again.")}</div>}
        <div className="project-chat-compose">
          <form onSubmit={event => { event.preventDefault(); submit(); }}>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={event => { setMessage(event.target.value); if (sendMutation.isError) sendMutation.reset(); }}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); submit(); }
              }}
              maxLength={2000}
              rows={1}
              aria-label={t("Message your team")}
              placeholder={t("Message your team…")}
              disabled={isDisabled || historyQuery.isLoading}
            />
            <div className="project-chat-compose-toolbar">
              <span className="project-chat-keyboard-hint">{t("Enter to send · Shift+Enter for a new line")}</span>
              <span className="project-chat-mobile-hint">{t("Only visible to your team")}</span>
              <div className="project-chat-send-actions">{message.length > 1600 && <small>{message.length}/2000</small>}<Button type="submit" size="sm" disabled={!message.trim() || isDisabled || historyQuery.isLoading}>{sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}{t("Send")}</Button></div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function liveStatusLabel(status: "connecting" | "live" | "reconnecting" | "offline"): string {
  if (status === "live") return "Connected";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "offline") return "Offline";
  return "Connecting";
}
