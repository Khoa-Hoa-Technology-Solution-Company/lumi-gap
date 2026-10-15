import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Bot, Clipboard, FileText, Lightbulb, Loader2, Pin, Search, SendHorizonal, Sparkles, Users, Wifi, WifiOff, XCircle } from "lucide-react";
import type { ProjectChatMessage, ProjectChatScope } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectChatApi } from "../api/project-chat.api";

interface ProjectChatPanelProps {
  projectId: string;
  paperCount: number;
  currentUserName: string;
  scope?: ProjectChatScope;
  onSwitchToTeamAI?: () => void;
  onAddPapers?: () => void;
  draft?: string;
  onDraftChange?: (val: string) => void;
}

export function ProjectChatPanel({
  projectId,
  paperCount,
  currentUserName,
  scope = "private",
  onSwitchToTeamAI,
  onAddPapers,
  draft,
  onDraftChange,
}: ProjectChatPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [localMessage, setLocalMessage] = useState("");
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "reconnecting" | "offline">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const smartPrompts = [
    {
      icon: BookOpen,
      iconColor: "text-blue-500 bg-blue-500/10 border-blue-500/20",
      title: t("Summarise key findings"),
      desc: t("Synthesise core contributions and takeaways from project papers."),
      prompt: t("Summarise the key findings, methodologies, and main conclusions from the papers in this project."),
    },
    {
      icon: Search,
      iconColor: "text-purple-500 bg-purple-500/10 border-purple-500/20",
      title: t("Compare methods & limitations"),
      desc: t("Identify common methodologies and critical research constraints."),
      prompt: t("What research methodologies were used in these papers, and what are their main stated limitations?"),
    },
    {
      icon: Lightbulb,
      iconColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      title: t("Discover research gaps"),
      desc: t("Uncover unresolved questions and potential opportunities."),
      prompt: t("Based on the papers in this project, what research gaps or unaddressed challenges should we focus on?"),
    },
    {
      icon: FileText,
      iconColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      title: t("Formulate research questions"),
      desc: t("Propose feasible and impactful research directions."),
      prompt: t("Propose 3 feasible, rigorous research questions that could form the basis of our next study."),
    },
  ];

  const handleSelectPrompt = (promptText: string) => {
    setMessage(promptText);
    const textarea = containerRef.current?.closest(".project-chat-panel")?.querySelector("textarea") || document.querySelector("textarea");
    textarea?.focus();
  };

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
    <div className="project-chat-panel mt-2 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-xs dark:border-white/10">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 bg-gradient-to-r from-indigo-500/[0.04] via-transparent to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            {scope === "private" ? <Sparkles className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">
                {scope === "private" ? t("My AI") : t("Team AI Room")}
              </h3>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                paperCount > 0
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${paperCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                {paperCount > 0 ? `${paperCount} ${t("papers grounded")}` : t("No papers yet")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scope === "private"
                ? t("Only you can see this AI conversation.")
                : t("Visible to all project members. Use this for decisions and shared research memory.")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scope === "team" && (
            <Badge variant="outline" className="rounded-full bg-background/90 text-[11px] text-muted-foreground shadow-2xs">
              {streamStatus === "live" ? (
                <Wifi className="mr-1 h-3 w-3 text-emerald-500" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3 text-amber-500" />
              )}
              {streamStatus === "live"
                ? t("Live")
                : streamStatus === "reconnecting"
                  ? t("Reconnecting")
                  : t("Connecting")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex h-[560px] flex-col">
        {/* Messages list */}
        <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/20 px-5 py-5 dark:bg-black/20">
          {historyQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
              Loading AI history...
            </div>
          ) : visibleMessages.length === 0 && paperCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                Add papers to start your AI chat
              </h4>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Search and add papers from LumiGap. Your questions will be grounded in the research you choose.
              </p>
              {onAddPapers && (
                <Button type="button" className="mt-4" onClick={onAddPapers}>
                  <Search className="mr-2 h-4 w-4" />
                  Find papers to add
                </Button>
              )}
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                Empty projects are blocked before credits are charged.
              </p>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex h-full flex-col justify-center px-4 py-6 max-w-2xl mx-auto">
              <div className="text-center mb-5">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25 mb-2.5">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h4 className="text-base font-bold text-foreground">
                  {t("Smart Research AI Assistant")}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {t("Ask questions grounded in your project papers, synthesize findings, or uncover research gaps.")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {smartPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPrompt(item.prompt)}
                      className="group flex items-start gap-3 p-3.5 rounded-xl border border-border/80 bg-background hover:bg-muted/40 hover:border-indigo-500/40 hover:shadow-md transition-all text-left shadow-2xs"
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.iconColor} group-hover:scale-105 transition-transform`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center justify-between">
                          {item.title}
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                        </span>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
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
          {!historyQuery.isLoading && visibleMessages.length > 0 && paperCount === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
              <span className="text-amber-900 dark:text-amber-200">Add a paper to continue asking AI about this project.</span>
              {onAddPapers && <Button type="button" size="sm" variant="outline" onClick={onAddPapers}><Search className="mr-2 h-4 w-4" />Find papers</Button>}
            </div>
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
        <div className="border-t border-border/70 p-4 bg-muted/10 space-y-2.5">
          {paperCount > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
              <span className="text-[11px] font-bold text-muted-foreground shrink-0 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                {t("Quick prompts")}:
              </span>
              {smartPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPrompt(item.prompt)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-border/80 bg-background hover:bg-muted/60 hover:border-indigo-400 text-muted-foreground hover:text-foreground shrink-0 transition-all shadow-2xs"
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
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
                    ? t("Add papers before asking AI.")
                    : t("Ask AI about papers in this project…")
                }
                className="min-h-[50px] w-full resize-none rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-sm shadow-2xs outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDisabled}
              />
              <div className="flex items-center justify-between mt-1 px-1">
                {scope === "private" && onSwitchToTeamAI && message.trim().length > 0 ? (
                  <button
                    type="button"
                    onClick={onSwitchToTeamAI}
                    className="text-[11px] text-muted-foreground hover:text-indigo-600 transition-colors flex items-center gap-1 font-semibold"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {t("Ask in Team AI Room instead")}
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground/70">
                    {t("Press Enter to send · Shift+Enter for new line")}
                  </span>
                )}
              </div>
            </div>
            <Button
              type="button"
              onClick={submit}
              disabled={!message.trim() || isDisabled}
              className="h-auto rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-stretch"
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
