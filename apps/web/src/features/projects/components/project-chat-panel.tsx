import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clipboard, FileText, Loader2, Pin, Search, SendHorizonal, Sparkles, Users, Wifi, WifiOff, XCircle } from "lucide-react";
import type { ProjectChatMessage, ProjectChatScope } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { projectChatApi } from "../api/project-chat.api";

interface ProjectChatPanelProps {
  projectId: string;
  paperCount: number;
  currentUserName: string;
  scope?: ProjectChatScope;
  onSwitchToTeamAI?: () => void;
  draft?: string;
  onDraftChange?: (val: string) => void;
}

export function ProjectChatPanel({
  projectId,
  paperCount,
  currentUserName,
  scope = "private",
  onSwitchToTeamAI,
  draft,
  onDraftChange,
}: ProjectChatPanelProps) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [localMessage, setLocalMessage] = useState("");
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "reconnecting" | "offline">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const message = draft ?? localMessage;
  const setMessage = (value: string) => {
    if (onDraftChange) {
      onDraftChange(value);
      return;
    }
    setLocalMessage(value);
  };

  const historyQuery = useQuery({
    queryKey: ["project-chat", projectId, scope],
    queryFn: () => projectChatApi.listHistory(projectId, 50, scope),
    refetchInterval: scope === "team" && streamStatus !== "live" ? 5000 : false,
  });

  useEffect(() => {
    if (scope !== "team") {
      setStreamStatus("idle");
      return;
    }

    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const connect = () => {
      controller = new AbortController();
      setStreamStatus((status) => (status === "offline" || status === "reconnecting" ? "reconnecting" : "connecting"));
      projectChatApi
        .streamEvents(projectId, {
          signal: controller.signal,
          scope: "team",
          onOpen: () => setStreamStatus("live"),
          onEvent: (event) => {
            if (!event.message) return;
            queryClient.setQueryData<ProjectChatMessage[]>(
              ["project-chat", projectId, "team"],
              (current = []) => upsertMessage(current, event.message!),
            );
          },
        })
        .catch(() => {
          if (stopped || controller?.signal.aborted) return;
          setStreamStatus("reconnecting");
          retryTimer = setTimeout(connect, 3000);
        });
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
      setStreamStatus("offline");
    };
  }, [projectId, queryClient, scope]);

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      projectChatApi.sendMessage(projectId, text, scope),
    onSuccess: () => {
      setMessage("");
      void queryClient.invalidateQueries({
        queryKey: ["project-chat", projectId, scope],
      });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      projectChatApi.pinMessage(projectId, messageId, pinned),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProjectChatMessage[]>(
        ["project-chat", projectId, "team"],
        (current = []) => upsertMessage(current, updated),
      );
    },
  });

  const rawMessages = historyQuery.data ?? [];

  // Sắp xếp tin nhắn theo thời gian tăng dần, ưu tiên user đứng trước assistant nếu thời gian quá sát nhau (cùng giây do backend insert)
  const sortedMessages = useMemo(() => {
    const list = [...rawMessages];
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();

      // Nếu chênh lệch thời gian lớn hơn 5 giây, sắp xếp theo thời gian tăng dần
      if (Math.abs(timeA - timeB) > 5000) {
        return timeA - timeB;
      }

      // Nếu chênh lệch thời gian nhỏ hơn hoặc bằng 5 giây, ưu tiên tin nhắn user đứng trước assistant
      if (a.role !== b.role) {
        return a.role === "user" ? -1 : 1;
      }

      return timeA - timeB;
    });
  }, [rawMessages]);

  const pendingUserMessage = sendMutation.isPending
    ? ({
        id: "pending-user",
        projectId,
        userId: currentUser?.id ?? "me",
        scope,
        role: "user",
        content: sendMutation.variables ?? message,
        citedPaperIds: [],
        requester: {
          id: currentUser?.id ?? "me",
          fullName: currentUser?.fullName ?? currentUserName,
          email: currentUser?.email,
          avatarUrl: currentUser?.avatarUrl,
        },
        createdAt: new Date().toISOString(),
      } satisfies ProjectChatMessage)
    : null;

  const visibleMessages = useMemo(
    () => (pendingUserMessage ? [...sortedMessages, pendingUserMessage] : sortedMessages),
    [sortedMessages, pendingUserMessage],
  );

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  const submit = () => {
    const text = message.trim();
    if (!text || sendMutation.isPending || paperCount === 0) return;
    sendMutation.mutate(text);
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  };

  const isDisabled = sendMutation.isPending || paperCount === 0;

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {scope === "private" ? (
              <>
                <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>My AI</span>
              </>
            ) : (
              <>
                <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Team AI Room</span>
              </>
            )}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {scope === "private"
              ? "Only you can see this AI conversation."
              : "Visible to all project members. Use this for decisions and shared research memory."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-full bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300"
          >
            {scope === "private" ? "Private AI" : "Team AI"}
          </Badge>
          {scope === "team" && (
            <Badge variant="outline" className="rounded-full bg-white text-[11px] text-slate-500 dark:bg-zinc-950">
              {streamStatus === "live" ? (
                <Wifi className="mr-1 h-3 w-3 text-emerald-500" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3 text-amber-500" />
              )}
              {streamStatus === "live"
                ? "Live"
                : streamStatus === "reconnecting"
                  ? "Reconnecting"
                  : "Connecting"}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex h-[520px] flex-col">
        {/* Messages list */}
        <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 px-5 py-5 dark:bg-black/20">
          {historyQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
              Loading AI history...
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm border border-slate-100/50 dark:border-white/5">
                No messages yet
              </div>
              {paperCount === 0 ? (
                <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Add papers before asking AI. Empty projects are blocked before credits are charged.
                </p>
              ) : (
                <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Ask questions about methodologies, limitations, trends, or gaps in your project's papers.
                </p>
              )}
            </div>
          ) : (
            visibleMessages.map((item) => {
              const isMe =
                item.userId === currentUser?.id ||
                item.requester?.id === currentUser?.id;

              if (item.role === "user") {
                return (
                  <div
                    key={item.id}
                    className={`flex gap-3 ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    {!isMe && (
                      <div className="flex-shrink-0 mt-1">
                        {item.requester?.avatarUrl ? (
                          <img
                            src={item.requester.avatarUrl}
                            className="h-8 w-8 rounded-full object-cover border border-slate-100 dark:border-white/5"
                            alt="avatar"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5">
                            {getInitials(item.requester?.fullName || item.requester?.email)}
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
                            {item.requester?.fullName ||
                              item.requester?.email ||
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
                      <p className="whitespace-pre-wrap">{item.content}</p>
                    </div>
                  </div>
                );
              } else {
                // Assistant Message (AI)
                const requestedByName =
                  item.requester?.fullName || item.requester?.email;
                return (
                  <div key={item.id} className="flex justify-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="max-w-[78%] rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-slate-100">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span>AI assistant</span>
                        {requestedByName && (
                          <>
                            <span className="text-[9px] text-slate-300 dark:text-slate-700" aria-hidden="true">•</span>
                            <span className="font-medium text-slate-400">
                              requested by {requestedByName}
                            </span>
                          </>
                        )}
                        <span className="text-[9px] text-slate-300 dark:text-slate-700" aria-hidden="true">•</span>
                        <time className="font-normal text-slate-400" dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{item.content}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                        {typeof item.creditCost === "number" && (
                          <Badge variant="secondary" className="rounded-full text-[11px]">
                            {item.creditCost} credit
                          </Badge>
                        )}
                        {item.isPinned && (
                          <Badge variant="outline" className="rounded-full bg-amber-50 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                            <Pin className="mr-1 h-3 w-3" />
                            Pinned
                          </Badge>
                        )}
                        {scope === "team" && (
                          <button
                            type="button"
                            onClick={() =>
                              pinMutation.mutate({
                                messageId: item.id,
                                pinned: !item.isPinned,
                              })
                            }
                            disabled={pinMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50 dark:border-white/10"
                          >
                            <Pin className="h-3 w-3" />
                            {item.isPinned ? "Unpin" : "Pin"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(item.content);
                            toast.success("AI answer copied");
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10"
                        >
                          <Clipboard className="h-3 w-3" />
                          Copy
                        </button>
                        <Link
                          to={`/reports?projectId=${projectId}&fromAiMessage=${item.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10"
                        >
                          <FileText className="h-3 w-3" />
                          Use in report
                        </Link>
                        <Link
                          to={`/research-gaps?projectId=${projectId}&fromAiMessage=${item.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10"
                        >
                          <Search className="h-3 w-3" />
                          Explore gaps
                        </Link>
                      </div>
                      {item.citedPaperIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                          {item.citedPaperIds.map((paperId) => (
                            <Link key={paperId} to={`/papers/${paperId}`}>
                              <Badge
                                variant="outline"
                                className="rounded-full bg-slate-50 dark:bg-zinc-900 text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                Paper {paperId.slice(-6)}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            })
          )}
          {sendMutation.isPending && (
            <div className="flex justify-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-slate-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                AI is reading project papers...
              </div>
            </div>
          )}

        </div>

        {/* Send Error Banner */}
        {sendMutation.isError && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {(sendMutation.error as any)?.response?.data?.error?.message ||
                "Failed to send question. Check your LLM provider or try again later."}
            </span>
          </div>
        )}

        {/* Form Input Area */}
        <div className="border-t border-slate-100 p-4 dark:border-white/10">
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
                  paperCount === 0
                    ? "Add papers before asking AI."
                    : "Ask AI about papers in this project..."
                }
                className="min-h-[48px] w-full resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950"
                disabled={isDisabled}
              />
              {scope === "private" && onSwitchToTeamAI && message.trim().length > 0 && (
                <button
                  type="button"
                  onClick={onSwitchToTeamAI}
                  className="text-[11px] text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1 font-semibold mt-1.5 self-start"
                >
                  <Users className="w-3.5 h-3.5" />
                  Ask in Team AI Room instead
                </button>
              )}
            </div>
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

function upsertMessage(messages: ProjectChatMessage[], next: ProjectChatMessage): ProjectChatMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  return messages.map((message) => (message.id === next.id ? next : message));
}
