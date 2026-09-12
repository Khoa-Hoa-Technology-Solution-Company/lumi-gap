import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Loader2, Radio, SendHorizonal, Trash2, XCircle } from "lucide-react";
import type { ProjectTeamChatMessage } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { projectTeamChatApi } from "../api/project-team-chat.api";

interface ProjectTeamChatPanelProps {
  projectId: string;
  ownerId?: string;
}

export function ProjectTeamChatPanel({ projectId, ownerId }: ProjectTeamChatPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const queryKey = useMemo(() => ["project-team-chat", projectId] as const, [projectId]);

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
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Team Chat</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Internal discussion workspace for project members.
          </p>
        </div>
        <Badge variant="secondary" className={liveStatusBadgeClass(liveStatus)}>
          <Radio className="w-3 h-3" />
          {liveStatusLabel(liveStatus)}
        </Badge>
      </div>

      <div className="flex h-[520px] flex-col">
        {/* Messages Area */}
        <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 px-5 py-5 dark:bg-black/20">
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
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm border border-slate-100/50 dark:border-white/5">
                No team messages yet
              </div>
              <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Start the discussion with your project members.
              </p>
            </div>
          ) : (
            visibleMessages.map((item) => {
              const isMe = item.sender.id === currentUser?.id;
              const canDelete = isMe || currentUser?.id === ownerId || currentUser?.role === "admin";
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
        <div className="border-t border-slate-100 p-4 dark:border-white/10">
          <div className="flex gap-3">
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
                  ? "Chat is unavailable due to access error"
                  : "Send a message to your project team members..."
              }
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950"
              disabled={isDisabled}
            />
            <Button
              type="button"
              onClick={submit}
              disabled={!message.trim() || isDisabled}
              className="h-auto rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white"
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
