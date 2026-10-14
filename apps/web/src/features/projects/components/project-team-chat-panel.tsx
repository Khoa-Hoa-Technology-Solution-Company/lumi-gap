import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CheckCircle2, FileText, Lightbulb, Loader2, Radio, SendHorizonal, Trash2, Users, XCircle } from "lucide-react";
import { isAdminSystemRole, type ProjectTeamChatMessage } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectTeamChatApi } from "../api/project-team-chat.api";

interface ProjectTeamChatPanelProps {
  projectId: string;
  ownerId?: string;
}

export function ProjectTeamChatPanel({ projectId, ownerId }: ProjectTeamChatPanelProps) {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const queryKey = useMemo(() => ["project-team-chat", projectId] as const, [projectId]);

  const teamStarters = [
    {
      icon: FileText,
      label: t("Hi team! I've updated the initial paper collection for this project."),
    },
    {
      icon: CheckCircle2,
      label: t("Let's align on our screening criteria before we start reviewing."),
    },
    {
      icon: Lightbulb,
      label: t("Check out the candidate research gaps identified in the Gaps tab."),
    },
  ];

  const historyQuery = useQuery({
    queryKey,
    queryFn: () => projectTeamChatApi.listMessages(projectId),
    // Avoid repeatedly retrying permission errors; let the user retry manually.
    retry: false,
    refetchInterval: liveStatus === "live" ? false : 5000,
    refetchIntervalInBackground: false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      projectTeamChatApi.sendMessage(projectId, content),
    onSuccess: () => {
      setMessage("");
      void queryClient.invalidateQueries({
        queryKey,
      });
    },
  });

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

  const messages = historyQuery.data ?? [];
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
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || latest.id === lastMarkedReadRef.current || latest.sender.id === currentUser?.id) return;
    const alreadyRead = latest.readBy.some((reader) => reader.id === currentUser?.id);
    if (alreadyRead) return;
    lastMarkedReadRef.current = latest.id;
    markReadMutation.mutate(latest.id);
  }, [currentUser?.id, markReadMutation, messages]);

  const submit = () => {
    const text = message.trim();
    if (!text || sendMutation.isPending || historyQuery.isError) return;
    sendMutation.mutate(text);
  };

  const getInitials = (sender: { fullName?: string; email?: string }) => {
    const name = sender.fullName || sender.email || "?";
    return name.charAt(0).toUpperCase();
  };

  const isDisabled = sendMutation.isPending || historyQuery.isError;

  return (
    <div className="project-team-chat-panel mt-2 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-xs dark:border-white/10">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5 bg-gradient-to-r from-blue-500/[0.04] via-transparent to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">{t("Team Chat")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("Internal member discussion")}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className={liveStatusBadgeClass(liveStatus)}>
          <Radio className="w-3 h-3" />
          {liveStatusLabel(liveStatus)}
        </Badge>
      </div>

      <div className="flex h-[560px] flex-col">
        {/* Messages Area */}
        <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/20 px-5 py-5 dark:bg-black/20">
          {historyQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
              Loading team messages...
            </div>
          ) : historyQuery.isError ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6">
              <XCircle className="mb-2 h-8 w-8 text-red-500 animate-pulse" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">Access Denied / Error</p>
              <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {(historyQuery.error as any)?.response?.data?.error?.message ||
                  "You are not a member of this project or don't have access to this team chat."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 rounded-full"
                onClick={() => void historyQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex h-full flex-col justify-center px-4 py-8 max-w-xl mx-auto text-center">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 mx-auto">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-foreground">
                {t("Team collaboration chat")}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {t("Internal discussion workspace for project members.")}
              </p>
              <div className="mt-5 space-y-2 text-left w-full">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  {t("Quick prompts")}:
                </p>
                {teamStarters.map((starter, idx) => {
                  const Icon = starter.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setMessage(starter.label);
                        containerRef.current?.closest(".project-team-chat-panel")?.querySelector("textarea")?.focus();
                      }}
                      className="group flex w-full items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background hover:bg-muted/40 hover:border-blue-500/40 transition-all text-xs text-foreground/90 hover:text-foreground shadow-2xs"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-blue-500" />
                      <span className="flex-1 truncate">{starter.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            visibleMessages.map((item) => {
              const isMe = item.sender.id === currentUser?.id;
              const canDelete = isMe || currentUser?.id === ownerId || isAdminSystemRole(currentUser?.systemRole);
              const isPending = item.id === "pending-team-msg";
              const readByOthers = Math.max(0, item.readCount - (isMe ? 1 : 0));
              return (
                <div
                  key={item.id}
                  className={`flex gap-3 ${isMe ? "justify-end" : "justify-start"}`}
                >
                  {!isMe && (
                    <div className="flex-shrink-0 mt-1">
                      {item.sender.avatarUrl ? (
                        <img
                          src={item.sender.avatarUrl}
                          className="h-8 w-8 rounded-full object-cover border border-slate-100 dark:border-white/5"
                          alt={item.sender.fullName || item.sender.email || "Member avatar"}
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5">
                          {getInitials(item.sender)}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm relative ${
                      isMe
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200/80 bg-white text-slate-800 dark:border-white/10 dark:bg-zinc-950 dark:text-slate-100"
                    }`}
                  >
                    {!isMe && (
                      <div className="mb-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span>
                          {item.sender.fullName ||
                            item.sender.email ||
                            "Member"}
                        </span>
                        <span className="text-[9px] text-slate-300 dark:text-slate-700" aria-hidden="true">•</span>
                        <span className="font-normal text-slate-400">
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {isMe && (
                      <div className="mb-1 text-[11px] font-bold text-indigo-200 flex items-center justify-end gap-1.5">
                        <span>You</span>
                        <span className="text-[9px] text-indigo-400" aria-hidden="true">•</span>
                        <span className="font-normal text-indigo-300">
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {item.isDeleted ? (
                      <p className={`italic ${isMe ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"}`}>
                        This message was removed.
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap">{item.content}</p>
                    )}
                    <div className={`mt-2 flex items-center gap-2 text-[10px] ${isMe ? "justify-end text-indigo-200" : "text-slate-400"}`}>
                      {isMe ? (
                        <>
                          <CheckCheck className="h-3 w-3" />
                          <span>{isPending ? "Sending..." : readByOthers > 0 ? `Seen by ${readByOthers}` : "Sent"}</span>
                        </>
                      ) : (
                        <span>{item.readBy.some((reader) => reader.id === currentUser?.id) ? "Read" : "Unread"}</span>
                      )}
                      {canDelete && !isPending && !item.isDeleted && (
                        <button
                          type="button"
                          className="ml-1 inline-flex items-center rounded-full p-1 text-indigo-100 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          aria-label="Delete team chat message"
                          title="Delete message"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

        </div>

        {/* Mutation Send Error */}
        {sendMutation.isError && (
          <div className="border-t border-red-100 bg-red-50 dark:border-red-950/20 dark:bg-red-950/10 px-5 py-2.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {(sendMutation.error as any)?.response?.data?.error?.message ||
                "Failed to send message. Please try again."}
            </span>
          </div>
        )}

        {/* Input Box */}
        <div className="border-t border-border/70 p-4 bg-muted/10">
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                maxLength={2000}
                rows={2}
                placeholder={
                  historyQuery.isError
                    ? t("Chat is unavailable due to access error")
                    : t("Send a message to your project team members...")
                }
                className="min-h-[50px] w-full resize-none rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-sm shadow-2xs outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDisabled}
              />
              <span className="text-[10px] text-muted-foreground/70 mt-1 px-1">
                {t("Press Enter to send · Shift+Enter for new line")}
              </span>
            </div>
            <Button
              type="button"
              onClick={submit}
              disabled={!message.trim() || isDisabled}
              className="h-auto rounded-xl px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-xs self-stretch"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function liveStatusLabel(status: "connecting" | "live" | "reconnecting" | "offline"): string {
  if (status === "live") return "Live";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "offline") return "Offline";
  return "Connecting";
}

function liveStatusBadgeClass(status: "connecting" | "live" | "reconnecting" | "offline"): string {
  const base = "rounded-full flex items-center gap-1";
  if (status === "live") return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300`;
  if (status === "reconnecting") return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300`;
  if (status === "offline") return `${base} bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300`;
  return `${base} bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300`;
}
