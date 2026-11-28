import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  ArrowDown,
  BookOpen,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Library,
  Loader2,
  LockKeyhole,
  Pin,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ProjectChatCitation, ProjectChatMessage, ProjectChatScope } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/loading";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectChatApi } from "../api/project-chat.api";
import { useChatScroll } from "../hooks/use-chat-scroll";
import { ProjectChatComposer } from "./project-chat-primitives";
import {
  ProjectChatCitationPreviewDialog,
  ProjectChatSourcesDialog,
  sourceCoverageLabel,
} from "./project-chat-sources-dialog";

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

function safeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return trimmed;
  } catch {
    return undefined;
  }
  return undefined;
}

/** Replaces inline `[1]` or `[1, 3]` tokens in prose text with interactive buttons mapped to real citations. */
function renderInlineCitations(
  children: ReactNode,
  citationByNumber: Map<number, ProjectChatCitation>,
  onSelectCitation: (citation: ProjectChatCitation) => void,
): ReactNode {
  if (citationByNumber.size === 0) return children;

  const transformNode = (node: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof node === "string") {
      if (!/\[\d+/.test(node)) return node;
      const parts: ReactNode[] = [];
      let lastIndex = 0;
      const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(node)) !== null) {
        if (match.index > lastIndex) {
          parts.push(node.slice(lastIndex, match.index));
        }
        const nums = match[1]!.split(",").map((n) => Number(n.trim())).filter(Number.isInteger);
        const mapped = nums.filter((n) => citationByNumber.has(n));
        if (mapped.length === 0) {
          parts.push(match[0]);
        } else {
          parts.push(
            <Fragment key={`${keyPrefix}-${match.index}`}>
              {nums.map((num, idx) => {
                const target = citationByNumber.get(num);
                if (!target) return <span key={idx}>[{num}]</span>;
                return (
                  <button
                    key={`${num}-${idx}`}
                    type="button"
                    className="project-ai-cite-btn"
                    title={target.title}
                    aria-label={`[${num}] ${target.title}`}
                    onClick={() => onSelectCitation(target)}
                  >
                    [{num}]
                  </button>
                );
              })}
            </Fragment>,
          );
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < node.length) parts.push(node.slice(lastIndex));
      return parts.length === 1 ? parts[0] : parts;
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => <Fragment key={`${keyPrefix}-${idx}`}>{transformNode(child, `${keyPrefix}-${idx}`)}</Fragment>);
    }
    return node;
  };

  return transformNode(children, "cite");
}

function retrievalSummaryText(
  item: ProjectChatMessage,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  const meta = item.retrievalMeta;
  if (!meta) return null;
  if (meta.intent === "methodology") {
    return t("General research methodology guidance (not derived from project papers).");
  }
  if (meta.intent === "grounded" && meta.admittedCount > 0) {
    return t("Answer generated from {{admitted}} retrieved source(s) out of {{eligible}} eligible project paper(s).", {
      admitted: meta.admittedCount,
      eligible: meta.eligibleCount,
    });
  }
  return null;
}

const AiMessageItem = memo(function AiMessageItem({
  item,
  scope,
  projectId,
  locale,
  isCopied,
  onCopy,
  onPin,
  pinPending,
  onSelectCitation,
  t,
}: {
  item: ProjectChatMessage;
  scope: ProjectChatScope;
  projectId: string;
  locale: string;
  isCopied: boolean;
  onCopy: (id: string, text: string) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  pinPending: boolean;
  onSelectCitation: (citation: ProjectChatCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const timeLabel = new Date(item.createdAt).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (item.role === "user") {
    return (
      <div className="project-ai-user-row">
        <div className="project-ai-user-bubble">
          <p>{item.content}</p>
          {" "}
          <div className="project-ai-user-time">
            <time dateTime={item.createdAt}>{timeLabel}</time>
          </div>
        </div>
      </div>
    );
  }

  const citations = item.citations ?? [];
  const citationByNumber = new Map<number, ProjectChatCitation>();
  for (const cite of citations) {
    if (typeof cite.citationNumber === "number") {
      citationByNumber.set(cite.citationNumber, cite);
    }
  }
  const hasLegacyUnmappedCitations = citations.length > 0 && citationByNumber.size === 0;
  const fallbackLegacyIds = citations.length === 0 ? item.citedPaperIds : [];
  const summaryLine = retrievalSummaryText(item, t);
  const showResearchLinks = !item.retrievalMeta || item.retrievalMeta.intent === "grounded";
  const requestedByName = item.requester?.fullName || item.requester?.email;

  return (
    <article id={`ai-message-${item.id}`} className="project-ai-assistant-row">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20" aria-hidden="true">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="project-ai-assistant-body space-y-2.5">
        <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">LumiGap AI</span>
          {scope === "team" && requestedByName ? (
            <span>· {requestedByName}</span>
          ) : null}
          <time dateTime={item.createdAt}>· {timeLabel}</time>
          {item.isPinned ? (
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-medium text-amber-700 border-amber-500/30 bg-amber-500/10 dark:text-amber-300">
              <Pin className="h-2.5 w-2.5" aria-hidden="true" />
              {t("Pinned")}
            </Badge>
          ) : null}
        </header>

        <div className="project-ai-prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{renderInlineCitations(children, citationByNumber, onSelectCitation)}</p>,
              li: ({ children }) => <li>{renderInlineCitations(children, citationByNumber, onSelectCitation)}</li>,
              td: ({ children }) => (
                <td className="px-3 py-2 text-foreground/90 border-t border-border/60 align-top">
                  {renderInlineCitations(children, citationByNumber, onSelectCitation)}
                </td>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-2.5 border-l-3 border-primary/40 bg-muted/35 pl-3.5 py-1.5 text-muted-foreground rounded-r-md">
                  {renderInlineCitations(children, citationByNumber, onSelectCitation)}
                </blockquote>
              ),
              a: ({ href, children }) => {
                const validated = safeHref(href);
                if (!validated) return <span>{children}</span>;
                const external = validated.startsWith("http");
                return (
                  <a
                    href={validated}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="text-primary font-medium underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-0.5"
                  >
                    {children}
                    {external ? <ExternalLink className="h-3 w-3 inline opacity-70" aria-hidden="true" /> : null}
                  </a>
                );
              },
              code: ({ className, children, ...props }) => {
                const isInline = !className;
                return isInline ? (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground border border-border/60"
                    {...props}
                  >
                    {children}
                  </code>
                ) : (
                  <div className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs text-foreground">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </div>
                );
              },
              table: ({ children }) => (
                <div className="project-ai-table-wrap">
                  <table className="min-w-full divide-y divide-border text-xs">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="bg-muted/70 px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                  {children}
                </th>
              ),
              ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
            }}
          >
            {item.content}
          </Markdown>
        </div>

        {summaryLine ? (
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">{summaryLine}</p>
        ) : null}

        {citations.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{t("References")} ({citations.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((cite) => {
                const shortAuthor = cite.authors[0]?.split(/\s+/).at(-1);
                const metaSuffix = [shortAuthor, cite.publicationYear].filter(Boolean).join(", ");
                return (
                  <button
                    key={`${cite.paperId}-${cite.citationNumber ?? "legacy"}`}
                    type="button"
                    onClick={() => onSelectCitation(cite)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/45 hover:bg-muted/50"
                  >
                    {cite.citationNumber !== null ? (
                      <span className="font-mono text-[11px] font-semibold text-primary shrink-0">[{cite.citationNumber}]</span>
                    ) : null}
                    <span className="truncate max-w-[260px] font-medium">{cite.title}</span>
                    {metaSuffix ? <span className="shrink-0 text-[11px] text-muted-foreground">({metaSuffix})</span> : null}
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {cite.available ? sourceCoverageLabel(cite.sourceKind, t) : t("Source unavailable")}
                    </span>
                  </button>
                );
              })}
            </div>
            {hasLegacyUnmappedCitations ? (
              <p className="text-[11px] text-muted-foreground">
                {t("Detailed inline citation mapping is unavailable for this legacy message.")}
              </p>
            ) : null}
          </div>
        ) : fallbackLegacyIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {t("References")} ({fallbackLegacyIds.length}):
            </span>
            {fallbackLegacyIds.map((paperId, idx) => (
              <Link
                key={paperId}
                to={`/papers/${encodeURIComponent(paperId)}`}
                className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1 text-xs text-foreground hover:border-primary/40"
              >
                <span>{t("References")} #{idx + 1}</span>
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => onCopy(item.id, item.content)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{t(isCopied ? "Copied" : "Copy")}</span>
          </button>

          {scope === "team" ? (
            <button
              type="button"
              onClick={() => onPin(item.id, !item.isPinned)}
              disabled={pinPending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t(item.isPinned ? "Unpin" : "Pin")}</span>
            </button>
          ) : null}

          {showResearchLinks ? (
            <>
              <Link
                to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("Open Manuscript")}</span>
              </Link>
              <Link
                to={`/projects/${encodeURIComponent(projectId)}?tab=gaps`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("Explore Research Gaps")}</span>
              </Link>
            </>
          ) : null}

          {typeof item.creditCost === "number" && item.creditCost > 0 ? (
            <span className="ml-auto text-[11px] text-muted-foreground/80 tabular-nums">
              {t(item.creditCost === 1 ? "{{count}} credit" : "{{count}} credits", { count: item.creditCost })}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
});

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
  const { t, language } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [localMessage, setLocalMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<ProjectChatCitation | null>(null);
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "live" | "reconnecting" | "offline">("idle");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sending = useRef(false);
  const receipt = useRef<{ content: string; clientKey: string } | undefined>(undefined);

  const examplePrompts = useMemo(
    () => [
      t("Summarise main research directions"),
      t("Compare paper methodologies"),
      t("What limitations are reported in the literature?"),
      t("Which research directions need further investigation?"),
    ],
    [t],
  );

  const message = draft ?? localMessage;
  const setMessage = useCallback(
    (value: string) => {
      if (onDraftChange) onDraftChange(value);
      else setLocalMessage(value);
    },
    [onDraftChange],
  );

  const chatQueryKey = useMemo(() => ["project-chat", projectId, scope, currentUser?.id] as const, [projectId, scope, currentUser?.id]);
  const sourcesQueryKey = useMemo(() => ["project-chat-sources", projectId, currentUser?.id] as const, [projectId, currentUser?.id]);

  const sourcesQuery = useQuery({
    queryKey: sourcesQueryKey,
    queryFn: () => projectChatApi.getSources(projectId),
    enabled: Boolean(projectId) && typeof projectChatApi.getSources === "function",
    staleTime: 30_000,
    retry: false,
  });

  const historyQuery = useInfiniteQuery({
    queryKey: chatQueryKey,
    queryFn: ({ pageParam }) => projectChatApi.listHistory(projectId, 50, scope, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length >= 50 ? page[0]?.id : undefined),
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
      setStreamStatus((status) => (status === "offline" || status === "reconnecting" ? "reconnecting" : "connecting"));
      projectChatApi
        .streamEvents(projectId, {
          signal: controller.signal,
          scope: "team",
          onOpen: () => setStreamStatus("live"),
          onEvent: (event) => {
            if (!event.message) return;
            queryClient.setQueryData<InfiniteData<ProjectChatMessage[]>>(chatQueryKey, (current) =>
              upsertHistoryMessage(current, event.message!),
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
    mutationFn: ({ text, clientKey }: { text: string; clientKey: string }) =>
      projectChatApi.sendMessage(projectId, text, scope, clientKey),
    onSuccess: (result, vars) => {
      // Immediately reconcile returned persisted messages into the exact conversation cache to avoid flicker.
      if (result?.userMessage || result?.assistantMessage) {
        queryClient.setQueryData<InfiniteData<ProjectChatMessage[]>>(chatQueryKey, (current) => {
          let next = current;
          if (result.userMessage) next = upsertHistoryMessage(next, result.userMessage);
          if (result.assistantMessage) next = upsertHistoryMessage(next, result.assistantMessage);
          return next;
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: chatQueryKey });
      }
      receipt.current = undefined;
      if (onSent) onSent(vars.text);
      else setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      projectChatApi.pinMessage(projectId, messageId, pinned),
    onSuccess: (updated) => {
      queryClient.setQueryData<InfiniteData<ProjectChatMessage[]>>(chatQueryKey, (current) =>
        upsertHistoryMessage(current, updated),
      );
    },
  });

  const handleCopy = useCallback(
    (id: string, text: string) => {
      void navigator.clipboard?.writeText(text);
      setCopiedId(id);
      toast.success(t("Copied"));
      setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2000);
    },
    [t],
  );

  const handlePin = useCallback(
    (messageId: string, pinned: boolean) => {
      pinMutation.mutate({ messageId, pinned });
    },
    [pinMutation],
  );

  const historyMessages = useMemo(() => {
    const messages = new Map<string, ProjectChatMessage>();
    for (const page of [...(historyQuery.data?.pages ?? [])].reverse()) {
      for (const item of page) messages.set(item.id, item);
    }
    return [...messages.values()];
  }, [historyQuery.data]);

  const pendingClientKey = sendMutation.isPending ? sendMutation.variables?.clientKey : undefined;
  const alreadyPersisted = Boolean(
    pendingClientKey && historyMessages.some((m) => m.role === "user" && m.clientKey === pendingClientKey),
  );

  const pendingUserMessage = sendMutation.isPending && !alreadyPersisted
    ? ({
        id: `pending-user-${pendingClientKey ?? "active"}`,
        projectId,
        userId: currentUser?.id ?? "me",
        scope,
        role: "user",
        content: sendMutation.variables?.text ?? message,
        citedPaperIds: [],
        clientKey: pendingClientKey,
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
    () => (pendingUserMessage ? [...historyMessages, pendingUserMessage] : historyMessages),
    [historyMessages, pendingUserMessage],
  );

  const lastMessage = visibleMessages.at(-1);
  const latestAssistantElementId = lastMessage?.role === "assistant" ? `ai-message-${lastMessage.id}` : undefined;

  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(lastMessage?.id, {
    policy: "ai-turn",
    latestAssistantElementId,
  });

  const historyUnavailable = historyQuery.isError && !historyQuery.data;
  const aiDisabledByPolicy = sourcesQuery.data?.aiDataPolicy === "DISABLED";
  const eligibleCount = sourcesQuery.data?.eligibleCount ?? paperCount;

  const submit = () => {
    const text = message.trim();
    if (!text || sending.current || sendMutation.isPending || historyUnavailable || historyQuery.isLoading || aiDisabledByPolicy) return;
    if (receipt.current?.content !== text) {
      receipt.current = { content: text, clientKey: crypto.randomUUID() };
    }
    sending.current = true;
    jumpToLatest();
    sendMutation.mutate({ text, clientKey: receipt.current.clientKey });
  };

  const sendErrorStatus = isAxiosError(sendMutation.error) ? sendMutation.error.response?.status : undefined;
  const sendErrorMessage = sendErrorStatus === 402
    ? t("Insufficient credits to run this AI request.")
    : sendErrorStatus === 403
    ? t("AI processing is disabled by this project's security policy.")
    : sendErrorStatus === 409
    ? t("Archived projects are read-only.")
    : t("AI is temporarily unavailable. Your question is kept below; try again.");

  const isDisabled = sendMutation.isPending || historyUnavailable || historyQuery.isLoading || aiDisabledByPolicy;

  return (
    <div className="project-chat-panel project-chat-surface">
      <div className="project-chat-context">
        {scope === "private" ? (
          <span>
            <LockKeyhole size={14} aria-hidden="true" />
            <span>{t("Only you can see this AI conversation.")}</span>
          </span>
        ) : (
          <span className="project-chat-connection" data-live={streamStatus === "live"} role="status">
            <i aria-hidden="true" />
            {t(streamStatus === "live" ? "Connected" : streamStatus === "reconnecting" ? "Reconnecting" : "Connecting")}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setSourcesOpen(true)}
          >
            <Library className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>
              {t("Research Sources")}
              {sourcesQuery.data ? ` (${sourcesQuery.data.eligibleCount})` : ""}
            </span>
          </Button>
        </div>
      </div>

      {aiDisabledByPolicy ? (
        <div role="status" className="flex items-center gap-2 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("AI processing is disabled by this project's security policy.")}</span>
        </div>
      ) : null}

      <div className="project-chat-body">
        <div className="project-chat-feed-region">
          <div
            ref={containerRef}
            onScroll={onScroll}
            className="project-chat-feed project-ai-feed"
            role="log"
            aria-label={t("AI conversation")}
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
          >
            {historyQuery.hasNextPage ? (
              <div className="flex justify-center pb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={historyQuery.isFetching}
                  onClick={() => void historyQuery.fetchNextPage()}
                >
                  {t(historyQuery.isFetchingNextPage ? "Loading…" : "Load older messages")}
                </Button>
              </div>
            ) : null}
            {historyQuery.isFetchNextPageError ? <p role="alert" className="text-xs text-destructive">{t("Could not load this conversation")}</p> : null}

            {historyQuery.isLoading ? (
              <PageSkeleton variant="chat" label={t("loading.chatHistory")} />
            ) : historyUnavailable ? (
              <div className="project-chat-empty" role="alert">
                <XCircle size={24} aria-hidden="true" />
                <h4>{t("Could not load this conversation")}</h4>
                <p>{t("Check your connection and project access, then try again.")}</p>
                <Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>
                  {t("Try again")}
                </Button>
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="project-chat-empty">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                {eligibleCount === 0 ? (
                  <>
                    <h4>{t("This project does not have research papers for AI analysis yet.")}</h4>
                    <p>{t("You can still ask about LumiGap AI's capabilities or general research methodology.")}</p>
                    {onAddPapers ? (
                      <Button type="button" size="sm" variant="outline" className="mt-1 gap-1.5" onClick={onAddPapers}>
                        <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("Add research papers")}</span>
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h4>{t("What would you like to explore?")}</h4>
                    <p>{t("LumiGap AI helps you understand and cross-check research papers within the project's available sources.")}</p>
                    <div className="project-chat-starters">
                      {examplePrompts.map((promptText) => (
                        <button
                          key={promptText}
                          type="button"
                          disabled={aiDisabledByPolicy}
                          onClick={() => {
                            setMessage(promptText);
                            textareaRef.current?.focus({ preventScroll: true });
                          }}
                        >
                          <Sparkles size={15} aria-hidden="true" />
                          <span>{promptText}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              visibleMessages.map((item) => (
                <AiMessageItem
                  key={item.id}
                  item={item}
                  scope={scope}
                  projectId={projectId}
                  locale={locale}
                  isCopied={copiedId === item.id}
                  onCopy={handleCopy}
                  onPin={handlePin}
                  pinPending={pinMutation.isPending}
                  onSelectCitation={setSelectedCitation}
                  t={t}
                />
              ))
            )}

            {sendMutation.isPending ? (
              <div role="status" className="flex items-center gap-2.5 text-xs text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                <span>{t("AI is processing your question…")}</span>
              </div>
            ) : null}
          </div>

          {!atBottom ? (
            <div className="project-chat-jump-bar">
              <button type="button" className="project-chat-jump" onClick={jumpToLatest}>
                <ArrowDown size={14} aria-hidden="true" />
                {t(hasNewMessages ? "New messages" : "Jump to latest")}
              </button>
            </div>
          ) : null}
        </div>

        {sendMutation.isError ? (
          <div className="project-chat-error" role="alert">
            <XCircle size={15} aria-hidden="true" />
            <span>{sendErrorMessage}</span>
            {sendErrorStatus === 402 ? (
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to="/credits">{t("Manage credits")}</Link>
              </Button>
            ) : sendErrorStatus !== 403 && sendErrorStatus !== 409 ? (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={submit}>
                {t("Retry")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <ProjectChatComposer
          value={message}
          onChange={(val) => {
            setMessage(val);
            if (sendMutation.isError) sendMutation.reset();
          }}
          onSend={submit}
          disabled={isDisabled}
          pending={sendMutation.isPending}
          textareaRef={textareaRef}
          label={t("Ask about research papers, methodology, or research gaps…")}
          placeholder={
            aiDisabledByPolicy
              ? t("AI processing is disabled by this project's security policy.")
              : t("Ask about research papers, methodology, or research gaps…")
          }
          sendLabel={t("Send")}
          keyboardHint={t("Enter to send · Shift+Enter for a new line")}
          mobileHint={t(scope === "private" ? "Private Conversation" : "Shared with your team")}
        />
      </div>

      <ProjectChatSourcesDialog
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        projectId={projectId}
        sources={sourcesQuery.data}
        isLoading={sourcesQuery.isLoading}
        isError={sourcesQuery.isError}
        onRetry={() => void sourcesQuery.refetch()}
        onAddPapers={onAddPapers}
      />

      <ProjectChatCitationPreviewDialog
        citation={selectedCitation}
        projectId={projectId}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}

function upsertHistoryMessage(
  history: InfiniteData<ProjectChatMessage[]> | undefined,
  next: ProjectChatMessage,
): InfiniteData<ProjectChatMessage[]> {
  if (!history) return { pages: [[next]], pageParams: [undefined] };
  const exists = history.pages.some((page) => page.some((message) => message.id === next.id));
  return {
    ...history,
    pages: history.pages.map((page, index) =>
      exists
        ? page.map((message) => (message.id === next.id ? next : message))
        : index === 0
        ? [...page, next]
        : page,
    ),
  };
}
