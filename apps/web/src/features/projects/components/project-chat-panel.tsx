import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  ArrowDown,
  LockKeyhole,
  ArrowUpRight,
  BookOpen,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Lightbulb,
  Loader2,
  Pin,
  Search,
  SendHorizonal,
  Sparkles,
  XCircle,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ProjectChatMessage, ProjectChatScope } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectChatApi } from "../api/project-chat.api";
import { useChatScroll } from "../hooks/use-chat-scroll";

interface ProjectChatPanelProps {
  projectId: string;
  paperCount: number;
  currentUserName: string;
  scope?: ProjectChatScope;
  onAddPapers?: () => void;
  draft?: string;
  onDraftChange?: (val: string) => void;
  onSent?: (content: string) => void;
}

export function ProjectChatPanel({
  projectId,
  paperCount,
  currentUserName,
  scope = "private",
  onAddPapers,
  draft,
  onDraftChange,
  onSent,
}: ProjectChatPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [localMessage, setLocalMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "idle" | "connecting" | "live" | "reconnecting" | "offline"
  >("idle");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sending = useRef(false);

  const smartPrompts = [
    {
      icon: BookOpen,
      iconColor: "text-blue-500 bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/20",
      accentBorder: "group-hover:border-blue-500/50",
      title: t("Summarise key findings"),
      desc: t("Synthesise core contributions and takeaways from project papers."),
      prompt: t(
        "Summarise the key findings, methodologies, and main conclusions from the papers in this project.",
      ),
    },
    {
      icon: Search,
      iconColor: "text-purple-500 bg-purple-500/10 border-purple-500/20 dark:bg-purple-500/20",
      accentBorder: "group-hover:border-purple-500/50",
      title: t("Compare methods & limitations"),
      desc: t("Identify common methodologies and critical research constraints."),
      prompt: t(
        "What research methodologies were used in these papers, and what are their main stated limitations?",
      ),
    },
    {
      icon: Lightbulb,
      iconColor: "text-amber-500 bg-amber-500/10 border-amber-500/20 dark:bg-amber-500/20",
      accentBorder: "group-hover:border-amber-500/50",
      title: t("Discover research gaps"),
      desc: t("Uncover unresolved questions and potential opportunities."),
      prompt: t(
        "Based on the papers in this project, what research gaps or unaddressed challenges should we focus on?",
      ),
    },
    {
      icon: FileText,
      iconColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-500/20",
      accentBorder: "group-hover:border-emerald-500/50",
      title: t("Formulate research questions"),
      desc: t("Propose feasible and impactful research directions."),
      prompt: t(
        "Propose 3 feasible, rigorous research questions that could form the basis of our next study.",
      ),
    },
  ];

  const message = draft ?? localMessage;
  const setMessage = (value: string) => {
    if (onDraftChange) {
      onDraftChange(value);
      return;
    }
    setLocalMessage(value);
  };

  const handleSelectPrompt = (promptText: string) => {
    setMessage(promptText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 46), 160)}px`;
      }
    }, 50);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 46), 160)}px`;
    }
  }, [message]);

  const chatQueryKey = useMemo(() => ["project-chat", projectId, scope, currentUser?.id], [projectId, scope, currentUser?.id]);
  const historyQuery = useInfiniteQuery({
    queryKey: chatQueryKey,
    queryFn: ({ pageParam }) => projectChatApi.listHistory(projectId, 50, scope, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.length >= 50 ? page[0]?.id : undefined,
    retry: false,
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
      setStreamStatus((status) =>
        status === "offline" || status === "reconnecting"
          ? "reconnecting"
          : "connecting",
      );
      projectChatApi
        .streamEvents(projectId, {
          signal: controller.signal,
          scope: "team",
          onOpen: () => setStreamStatus("live"),
          onEvent: (event) => {
            if (!event.message) return;
            queryClient.setQueryData<InfiniteData<ProjectChatMessage[]>>(
              chatQueryKey,
              (current) => upsertHistoryMessage(current, event.message!),
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
  }, [projectId, queryClient, scope, chatQueryKey]);

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      projectChatApi.sendMessage(projectId, text, scope),
    onSuccess: (_result, content) => {
      if (onSent) onSent(content); else setMessage("");
      void queryClient.invalidateQueries({
        queryKey: chatQueryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onSettled: () => { sending.current = false; },
  });

  useEffect(() => {
    if (sendMutation.isSuccess || sendMutation.isError) textareaRef.current?.focus();
  }, [sendMutation.isSuccess, sendMutation.isError]);

  const pinMutation = useMutation({
    mutationFn: ({
      messageId,
      pinned,
    }: {
      messageId: string;
      pinned: boolean;
    }) => projectChatApi.pinMessage(projectId, messageId, pinned),
    onSuccess: (updated) => {
      queryClient.setQueryData<InfiniteData<ProjectChatMessage[]>>(
        chatQueryKey,
        (current) => upsertHistoryMessage(current, updated),
      );
    },
  });

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(t("AI answer copied") || "AI answer copied");
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const historyMessages = useMemo(() => {
    // Pages arrive newest first. Keep the server's full-precision timestamp
    // order; serialized dates can collapse separate turns to one millisecond.
    const messages = new Map<string, ProjectChatMessage>();
    for (const page of [...(historyQuery.data?.pages ?? [])].reverse()) {
      for (const item of page) messages.set(item.id, item);
    }
    return [...messages.values()];
  }, [historyQuery.data]);

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
    () =>
      pendingUserMessage
        ? [...historyMessages, pendingUserMessage]
        : historyMessages,
    [historyMessages, pendingUserMessage],
  );

  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(visibleMessages.at(-1)?.id);
  const historyUnavailable = historyQuery.isError && !historyQuery.data;

  const submit = () => {
    const text = message.trim();
    if (!text || sending.current || sendMutation.isPending || paperCount === 0 || historyUnavailable || historyQuery.isLoading) return;
    sending.current = true;
    jumpToLatest();
    sendMutation.mutate(text);
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  };

  const isDisabled = sendMutation.isPending || paperCount === 0 || historyUnavailable || historyQuery.isLoading;

  return (
    <div className="project-chat-panel overflow-hidden rounded-2xl border border-border/80 bg-background shadow-xs dark:border-white/10 flex flex-col">
      <div className="project-chat-context">
        {scope === "private" ? (
          <span><LockKeyhole size={14} aria-hidden="true" />{t("Only you can see this AI conversation.")}</span>
        ) : <span />}
        <span>{paperCount} {t("papers grounded")}{scope === "team" && <span className="project-chat-connection" data-live={streamStatus === "live"} role="status"><i aria-hidden="true" />{t(streamStatus === "live" ? "Connected" : streamStatus === "reconnecting" ? "Reconnecting" : "Connecting")}</span>}</span>
      </div>
      <div className="project-chat-body">
        <div className="project-chat-feed-region">
        {/* Messages scroll viewport */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="project-chat-feed project-ai-feed"
          role="log" aria-label={t("AI conversation")} aria-live="polite" aria-relevant="additions" tabIndex={0}
        >
          {historyQuery.hasNextPage && <Button type="button" size="sm" variant="ghost" disabled={historyQuery.isFetching} onClick={() => void historyQuery.fetchNextPage()}>{t(historyQuery.isFetchingNextPage ? "Loading…" : "Load older messages")}</Button>}
          {historyQuery.isFetchNextPageError && <p role="alert">{t("Could not load this conversation")}</p>}
          {historyQuery.isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span>{t("Loading conversation history…")}</span>
            </div>
          ) : historyUnavailable ? (
            <div className="project-chat-empty" role="alert"><XCircle size={24} /><h4>{t("Could not load this conversation")}</h4><p>{t("Check your connection and project access, then try again.")}</p><Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>{t("Try again")}</Button></div>
          ) : visibleMessages.length === 0 && paperCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm">
                <FileText className="h-7 w-7" />
              </div>
              <h4 className="text-base font-bold text-foreground">
                Add papers to start your AI chat
              </h4>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Search and add literature to this project. Your AI questions will be strictly grounded in the research you choose.
              </p>
              {onAddPapers && (
                <Button
                  type="button"
                  className="mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                  onClick={onAddPapers}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Find papers to add
                </Button>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground/70">
                Empty projects are protected before LLM tokens are charged.
              </p>
            </div>
          ) : visibleMessages.length === 0 ? (
            /* Modern Hero Empty State */
            <div className="flex h-full flex-col justify-center px-2 py-4 max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h4 className="text-lg font-bold text-foreground tracking-tight">
                  {t("Smart Research AI Assistant")}
                </h4>
                <p className="mt-1.5 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {t(
                    "Ask questions grounded in your project papers, synthesize findings, or uncover research gaps.",
                  )}
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {paperCount} {t("papers grounded")}
                </div>
              </div>

              {/* 2x2 Interactive Prompt Suggestion Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {smartPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPrompt(item.prompt)}
                      className={`group relative flex items-start gap-3 p-3.5 rounded-2xl border border-border/80 bg-background/80 hover:bg-background hover:shadow-md transition-all duration-200 text-left shadow-2xs ${item.accentBorder}`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${item.iconColor} group-hover:scale-105 transition-transform duration-200`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {item.title}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all text-indigo-500 shrink-0" />
                        </div>
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
            /* Message Feed */
            visibleMessages.map((item) => {
              const isMe =
                item.userId === currentUser?.id ||
                item.requester?.id === currentUser?.id;

              if (item.role === "user") {
                return (
                  <div
                    key={item.id}
                    className="flex gap-2.5 justify-end items-end group"
                  >
                    <div className="project-ai-request-bubble rounded-2xl rounded-tr-xs bg-primary text-primary-foreground shadow-xs px-4 py-3 relative">
                      <div className="mb-1 text-[11px] font-bold text-indigo-200 flex items-center justify-end gap-1.5">
                        <span>{isMe ? "You" : item.requester?.fullName || "Member"}</span>
                        <span className="text-[9px] text-indigo-300" aria-hidden="true">
                          •
                        </span>
                        <span className="font-normal text-indigo-200">
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
                        {item.content}
                      </p>
                    </div>

                    <div className="flex-shrink-0 mb-1">
                      {item.requester?.avatarUrl ? (
                        <img
                          src={item.requester.avatarUrl}
                          className="h-7 w-7 rounded-full object-cover border border-indigo-200/40 shadow-2xs"
                          alt="avatar"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-700 text-white text-[11px] font-bold shadow-2xs">
                          {getInitials(
                            item.requester?.fullName || item.requester?.email,
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                // Assistant Message (AI)
                const requestedByName =
                  item.requester?.fullName || item.requester?.email;
                const isCopied = copiedId === item.id;

                return (
                  <div key={item.id} className="flex justify-start gap-3 items-start group">
                    <div className="flex-shrink-0 mt-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-xs ring-2 ring-indigo-500/10">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="project-ai-response-bubble rounded-2xl rounded-tl-xs border border-border/80 bg-card/90 dark:bg-zinc-900/90 px-4 py-3.5 shadow-2xs text-foreground backdrop-blur-xs">
                      {/* Message meta header */}
                      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                          AI Assistant
                        </span>
                        {requestedByName && scope === "team" && (
                          <>
                            <span className="text-[9px] text-muted-foreground/60" aria-hidden="true">
                              •
                            </span>
                            <span className="font-normal text-muted-foreground">
                              requested by {requestedByName}
                            </span>
                          </>
                        )}
                        <span className="text-[9px] text-muted-foreground/60" aria-hidden="true">
                          •
                        </span>
                        <time
                          className="font-normal text-muted-foreground/80"
                          dateTime={item.createdAt}
                        >
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>

                      {/* Rich Markdown Formatted Body */}
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed text-foreground prose-p:my-2 prose-headings:font-bold prose-headings:my-2.5 prose-strong:text-foreground prose-strong:font-bold prose-li:my-0.5">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 dark:text-indigo-400 font-semibold underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-0.5"
                              >
                                {children}
                                <ExternalLink className="h-3 w-3 inline opacity-70" />
                              </a>
                            ),
                            code: ({ className, children, ...props }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code
                                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-indigo-600 dark:text-indigo-300 border border-border/50"
                                  {...props}
                                >
                                  {children}
                                </code>
                              ) : (
                                <div className="my-2.5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-100 font-mono text-xs shadow-inner">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </div>
                              );
                            },
                            table: ({ children }) => (
                              <div className="my-3 overflow-x-auto rounded-xl border border-border/80 shadow-2xs">
                                <table className="min-w-full divide-y divide-border text-xs">
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="bg-muted/70 px-3 py-2 text-left font-bold text-foreground">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-3 py-2 text-muted-foreground border-t border-border/50">
                                {children}
                              </td>
                            ),
                            ul: ({ children }) => (
                              <ul className="my-2 list-disc pl-5 space-y-1">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="my-2 list-decimal pl-5 space-y-1">
                                {children}
                              </ol>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="my-2 border-l-4 border-indigo-500/50 bg-indigo-500/5 pl-3.5 py-1 text-muted-foreground italic rounded-r-md">
                                {children}
                              </blockquote>
                            ),
                          }}
                        >
                          {item.content}
                        </Markdown>
                      </div>

                      {/* Action Bar */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                        {typeof item.creditCost === "number" && (
                          <Badge
                            variant="secondary"
                            className="rounded-full text-[10px] font-semibold bg-muted/80 text-muted-foreground"
                          >
                            <Sparkles className="mr-1 h-2.5 w-2.5 text-amber-500" />
                            {item.creditCost} credit
                          </Badge>
                        )}
                        {item.isPinned && (
                          <Badge
                            variant="outline"
                            className="rounded-full bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-300 border-amber-500/30"
                          >
                            <Pin className="mr-1 h-2.5 w-2.5" />
                            Pinned
                          </Badge>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.content)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all shadow-2xs ${
                            isCopied
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border/80 bg-background/80 text-muted-foreground hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10"
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Clipboard className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

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
                            className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-amber-300 hover:text-amber-600 disabled:opacity-50 dark:border-white/10 shadow-2xs"
                          >
                            <Pin className="h-3 w-3" />
                            {item.isPinned ? "Unpin" : "Pin"}
                          </button>
                        )}

                        <Link
                          to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}
                          className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 shadow-2xs"
                        >
                          <FileText className="h-3 w-3" />
                          {t("Open manuscripts")}
                        </Link>
                        <Link
                          to={`/projects/${encodeURIComponent(projectId)}?tab=gaps`}
                          className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 shadow-2xs"
                        >
                          <Search className="h-3 w-3" />
                          Explore gaps
                        </Link>
                      </div>

                      {/* Grounded Paper Citations */}
                      {item.citedPaperIds.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
                          <span className="text-[11px] font-bold text-muted-foreground mr-1 flex items-center gap-1">
                            <BookOpen className="h-3 w-3 text-indigo-500" />
                            Grounded in:
                          </span>
                          {item.citedPaperIds.map((paperId) => (
                            <Link key={paperId} to={`/papers/${paperId}`}>
                              <Badge
                                variant="outline"
                                className="rounded-full bg-background hover:bg-muted text-[11px] text-foreground/80 hover:text-indigo-600 border-border/80 transition-colors shadow-2xs gap-1"
                              >
                                <span>Paper {paperId.slice(-6)}</span>
                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
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

          {/* AI Thinking / Synthesizing State */}
          {sendMutation.isPending && (
            <div className="flex justify-start gap-3 items-start animate-fade-in">
              <div className="flex-shrink-0 mt-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
              </div>
              <div className="rounded-2xl rounded-tl-xs border border-border/80 bg-card/90 dark:bg-zinc-900/90 px-4.5 py-3.5 shadow-2xs text-foreground max-w-[80%]">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                  </span>
                  <span>AI Assistant is reading project papers...</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-indigo-500/80 animate-bounce [animation-delay:-0.3s]" />
                  <div className="h-2 w-2 rounded-full bg-indigo-500/80 animate-bounce [animation-delay:-0.15s]" />
                  <div className="h-2 w-2 rounded-full bg-indigo-500/80 animate-bounce" />
                  <span className="ml-2 text-xs text-muted-foreground/80 italic">
                    Synthesizing findings & evidence
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!atBottom && <button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={15} aria-hidden="true" />{t(hasNewMessages ? "New messages" : "Jump to latest")}</button>}
        </div>
        {sendMutation.isError && <div className="project-chat-error" role="alert"><XCircle size={16} />{t("Could not send. Your message is kept below; try again.")}</div>}
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
              aria-label={t("Ask AI about papers in this project…")}
              placeholder={t(paperCount === 0 ? "Add papers before asking AI." : "Ask AI about papers in this project…")}
              disabled={isDisabled}
            />
            <div className="project-chat-compose-toolbar">
              <span className="project-chat-keyboard-hint">{t("Enter to send · Shift+Enter for a new line")}</span>
              <span className="project-chat-mobile-hint">{t(scope === "private" ? "Private AI conversation" : "Shared with your team")}</span>
              <div className="project-chat-send-actions">{message.length > 1600 && <small>{message.length}/2000</small>}<Button type="submit" size="sm" disabled={!message.trim() || isDisabled}>{sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}{t("Send")}</Button></div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function upsertHistoryMessage(
  history: InfiniteData<ProjectChatMessage[]> | undefined,
  next: ProjectChatMessage,
): InfiniteData<ProjectChatMessage[]> {
  if (!history) return { pages: [[next]], pageParams: [undefined] };
  const exists = history.pages.some(page => page.some(message => message.id === next.id));
  return {
    ...history,
    pages: history.pages.map((page, index) => exists
      ? page.map(message => message.id === next.id ? next : message)
      : index === 0 ? [...page, next] : page),
  };
}
