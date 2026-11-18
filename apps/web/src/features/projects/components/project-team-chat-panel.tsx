import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CheckCheck, FileText, Lightbulb, Loader2, Trash2, Users, XCircle, MoreHorizontal, Reply, Search, X, Bookmark, Maximize2 } from "lucide-react";
import { isAdminSystemRole, type ProjectChatReference, type ProjectTeamChatMessage } from "@trend/shared-types";
import { useSearchParams } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChatShareMenu, ChatReferencePicker, ChatReferenceCard, ChatDecisionDialog } from "./research-chat-tools";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { projectTeamChatApi } from "../api/project-team-chat.api";
import { ProjectChatComposer, ProjectChatMessage } from "./project-chat-primitives";
import { useChatScroll } from "../hooks/use-chat-scroll";

interface ProjectTeamChatPanelProps {
  projectId: string;
  ownerId?: string;
  draft?: string;
  onDraftChange?: (value: string) => void;
  onSent?: (content: string) => void;
  initialReference?: ProjectChatReference;
  onReferenceConsumed?: () => void;
  compact?: boolean;
  onExpandFullScreen?: () => void;
  onClose?: () => void;
}

export function ProjectTeamChatPanel({
  projectId,
  ownerId,
  draft,
  onDraftChange,
  onSent,
  initialReference: externalReference,
  onReferenceConsumed,
  compact = false,
  onExpandFullScreen,
  onClose,
}: ProjectTeamChatPanelProps) {
  const { t, language } = useI18n();
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [localMessage, setLocalMessage] = useState("");
  const message = draft ?? localMessage;
  const setMessage = onDraftChange ?? setLocalMessage;
  const [params, setParams] = useSearchParams();
  const draftKey = `lumigap-team-draft:${currentUser?.id}:${projectId}`;
  const [stored] = useState(() => readChatDraft(draftKey));
  const [replyId, setReplyId] = useState<string | undefined>(stored?.replyId);
  const sharedKind = params.get("shareKind"), sharedId = params.get("shareId");
  const initialReference = sharedId && /^[0-9a-f-]{36}$/i.test(sharedId) && ["PAPER", "TASK", "MANUSCRIPT_SNAPSHOT", "SUBMISSION_REVISION"].includes(sharedKind ?? "") ? { kind: sharedKind as ProjectChatReference["kind"], id: sharedId } : stored?.reference;
  const [reference, setReference] = useState<ProjectChatReference | undefined>(initialReference);
  const [picker, setPicker] = useState<ProjectChatReference["kind"]>();
  const [decisionMessage, setDecisionMessage] = useState<ProjectTeamChatMessage>();
  const [searchOpen, setSearchOpen] = useState(false), [searchText, setSearchText] = useState(""), [searchQ, setSearchQ] = useState("");
  const [searchBefore, setSearchBefore] = useState<string>();
  const [focusedWindow, setFocusedWindow] = useState<ProjectTeamChatMessage[] | null>(null);
  const [highlight, setHighlight] = useState<string>();
  const anchor = useRef<{ height: number; top: number; id?: string; offset?: number; ready?: boolean }>();
  useEffect(() => { if (stored?.text && !message) setMessage(stored.text); }, []);
  useEffect(() => {
    if (externalReference) {
      setReference(externalReference);
      onReferenceConsumed?.();
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [externalReference, onReferenceConsumed]);
  useEffect(() => { const timer = window.setTimeout(() => { setSearchQ(searchText.trim()); setSearchBefore(undefined); }, 250); return () => clearTimeout(timer); }, [searchText]);
  useEffect(() => { if (sharedId) setParams(previous => { const next = new URLSearchParams(previous); next.delete("shareId"); next.delete("shareKind"); return next; }, { replace: true }); }, []);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const sending = useRef(false), receipt = useRef<{ content: string; key: string } | undefined>(stored?.signature && stored.key ? { content: stored.signature, key: stored.key } : undefined);
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

  const historyQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const current = queryClient.getQueryData<ProjectTeamChatMessage[]>(queryKey) ?? [];
      const recent = await projectTeamChatApi.listMessages(projectId);
      let result = mergeMessages(current, recent);
      const retained = current.filter(item => !recent.some(newer => newer.id === item.id));
      // Refresh retained pages too: an original or reply can be removed while disconnected.
      for (let index = 0; index < retained.length; index += 100) {
        const refreshed = await projectTeamChatApi.listMessages(projectId, { ids: retained.slice(index, index + 100).map(item => item.id).join(",") });
        result = mergeMessages(result, refreshed);
      }
      // Fetch the gap rather than assuming the newest page contains every missed event.
      let cursor = current.at(-1)?.id;
      if (cursor && recent.length && !recent.some(item => item.id === cursor)) {
        for (let page = 0; page < 100; page++) {
          const missed = await projectTeamChatApi.listMessages(projectId, { afterId: cursor, limit: 100 });
          result = mergeMessages(result, missed);
          if (missed.length < 100 || missed.at(-1)?.id === cursor) break;
          cursor = missed.at(-1)!.id;
        }
      }
      return mergeMessages(queryClient.getQueryData<ProjectTeamChatMessage[]>(queryKey) ?? [], result);
    },
    retry: false,
    refetchInterval: liveStatus === "live" ? 15000 : 5000,
    refetchIntervalInBackground: false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => {
      const signature = JSON.stringify({ content, replyToId: replyId, reference });
      if (receipt.current?.content !== signature) receipt.current = { content: signature, key: crypto.randomUUID() };
      try { sessionStorage.setItem(draftKey, JSON.stringify({ text: content, replyId, reference, signature, key: receipt.current.key })); } catch { /* In-memory draft still works. */ }
      return replyId || reference ? projectTeamChatApi.sendMessage(projectId, content, receipt.current.key, { replyToId: replyId, reference }) : projectTeamChatApi.sendMessage(projectId, content, receipt.current.key);
    },
    onSuccess: (sent, content) => {
      queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current = []) =>
        mergeMessages(current, [sent]),
      );
      const savedDraft = readChatDraft(draftKey);
      const sameContext = !savedDraft || (savedDraft.replyId === replyId && JSON.stringify(savedDraft.reference) === JSON.stringify(reference));
      if (sameContext) { if (onSent) onSent(content); else setMessage(""); }
      receipt.current = undefined;
      setReplyId(undefined); setReference(undefined);
      try { const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null"); if (saved?.text?.trim() === content) sessionStorage.removeItem(draftKey); } catch { /* Optional draft persistence. */ }
      void queryClient.invalidateQueries({
        queryKey,
      });
    },
    onSettled: () => { sending.current = false; },
  });

  useEffect(() => {
    if (sendMutation.isSuccess || sendMutation.isError) textareaRef.current?.focus({ preventScroll: true });
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
    mutationFn: (messageId: string) => projectTeamChatApi.deleteMessage(projectId, messageId, "Removed from team chat"),
    onSuccess: deleted => {
      const update = (items: ProjectTeamChatMessage[]) => items.map(item => item.id === deleted.id ? deleted : item.replyTo?.id === deleted.id ? { ...item, replyTo: { ...item.replyTo, content: "", isDeleted: true } } : item);
      queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, current => current ? update(current) : current);
      setOlderMessages(update); setFocusedWindow(current => current ? update(current) : null);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey }); },
  });

  const messages = useMemo(() => {
    if (focusedWindow) return focusedWindow;
    const merged = new Map(olderMessages.map(item => [item.id, item]));
    for (const item of historyQuery.data ?? []) merged.set(item.id, item);
    return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [olderMessages, historyQuery.data, focusedWindow]);
  const older = useMutation({ mutationFn: () => projectTeamChatApi.listMessages(projectId, { limit: 50, beforeId: messages[0]!.id }), onSuccess: items => {
    if (anchor.current) anchor.current.ready = true;
    if (focusedWindow) setFocusedWindow(current => mergeMessages(items, current ?? []));
    else setOlderMessages(current => mergeMessages(items, current));
    if (items.length < 50) setHistoryComplete(true);
  }, onError: () => { anchor.current = undefined; } });
  const pendingUserMessage: ProjectTeamChatMessage | null = sendMutation.isPending
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
    () => (pendingUserMessage && !messages.some(item => item.clientKey && item.clientKey === receipt.current?.key && item.sender.id === currentUser?.id) ? [...messages, pendingUserMessage] : messages),
    [messages, pendingUserMessage],
  );

  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(visibleMessages.at(-1)?.id);

  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ text: message, replyId, reference, signature: receipt.current?.content, key: receipt.current?.key })); } catch { /* Draft remains in memory. */ }
  }, [draftKey, message, replyId, reference]);
  const search = useQuery({ queryKey: ["team-chat-search", projectId, currentUser?.id, searchQ, searchBefore], queryFn: () => projectTeamChatApi.listMessages(projectId, { q: searchQ, limit: 30, beforeId: searchBefore }), enabled: searchOpen && !!searchQ, retry: false });
  const locate = useMutation({ mutationFn: (id: string) => projectTeamChatApi.listMessages(projectId, { aroundId: id, limit: 50 }), onSuccess: (items, id) => { setFocusedWindow(items); setHistoryComplete(false); setHighlight(id); setSearchOpen(false); } });
  const newer = useMutation({ mutationFn: () => projectTeamChatApi.listMessages(projectId, { afterId: messages.at(-1)!.id, limit: 50 }), onSuccess: items => setFocusedWindow(current => mergeMessages(current ?? [], items)) });
  useLayoutEffect(() => {
    const feed = containerRef.current;
    if (feed && anchor.current?.ready) {
      const saved = anchor.current;
      const item = saved.id ? document.getElementById(`team-message-${saved.id}`)?.querySelector(".project-chat-message") : null;
      if (item && item.getBoundingClientRect().height && saved.offset !== undefined) feed.scrollTop += item.getBoundingClientRect().top - saved.offset;
      else feed.scrollTop = saved.top + feed.scrollHeight - saved.height;
      anchor.current = undefined;
    }
    if (highlight) { const element = document.getElementById(`team-message-${highlight}`); element?.scrollIntoView?.({ block: "center", behavior: "instant" }); element?.focus({ preventScroll: true }); }
  }, [messages[0]?.id, messages.length, highlight]);
  useEffect(() => { const id = params.get("message"); if (id) locate.mutate(id); }, [params.get("message")]);
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
            void queryClient.invalidateQueries({ queryKey });
            return;
          }
          if (!event.message) return;
          if (event.type === "message.deleted") {
            void queryClient.invalidateQueries({ queryKey: ["team-chat-search", projectId] });
            setOlderMessages(current => current.map(item => item.id === event.message!.id ? event.message! : item.replyTo?.id === event.message!.id ? { ...item, replyTo: { ...item.replyTo, content: "", isDeleted: true } } : item));
          }
          setFocusedWindow(current => current?.map(item => item.id === event.message!.id ? event.message! : item.replyTo?.id === event.message!.id && event.type === "message.deleted" ? { ...item, replyTo: { ...item.replyTo, content: "", isDeleted: true } } : item) ?? null);
          queryClient.setQueryData<ProjectTeamChatMessage[]>(queryKey, (current) => {
            const existing = current ?? [];
            const index = existing.findIndex((item) => item.id === event.message!.id);
            const updated = existing.map((item) => item.id === event.message!.id ? event.message! : item.replyTo?.id === event.message!.id && event.type === "message.deleted" ? { ...item, replyTo: { ...item.replyTo, content: "", isDeleted: true } } : item);
            return index >= 0 ? updated : mergeMessages(updated, [event.message!]);
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
    if ((!text && !reference) || sending.current || sendMutation.isPending || historyQuery.isError || historyQuery.isLoading) return;
    sending.current = true;
    setFocusedWindow(null); setHighlight(undefined); jumpToLatest();
    sendMutation.mutate(text);
  };

  const isDisabled = sendMutation.isPending || historyQuery.isError;

  const selectStarter = (text: string) => { setMessage(text); textareaRef.current?.focus({ preventScroll: true }); };
  const locale = language === "vi" ? "vi-VN" : "en-GB";

  return (
    <div className={`project-team-chat-panel project-chat-surface ${compact ? "project-quick-chat-surface" : ""}`}>
      {compact ? (
        <div className="quick-chat-dock-header flex items-center justify-between border-b px-3.5 py-2.5 bg-muted/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-none truncate text-foreground">{t("Trò chuyện nhóm")}</h3>
              <span className="project-chat-connection text-[11px] leading-tight text-muted-foreground flex items-center gap-1.5 mt-0.5" data-live={liveStatus === "live"} role="status">
                <i aria-hidden="true" />
                {t(liveStatusLabel(liveStatus))}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
              title={t("chat.search")}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            {onExpandFullScreen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onExpandFullScreen}
                title={t("Mở toàn màn hình")}
                aria-label={t("Mở toàn màn hình")}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                title={t("Đóng")}
                aria-label={t("Đóng")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="project-chat-context">
          <Button variant="ghost" size="sm" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
            <Search size={15} />
            {t("chat.search")}
          </Button>
          <span className="project-chat-connection ml-auto" data-live={liveStatus === "live"} role="status">
            <i aria-hidden="true" />
            {t(liveStatusLabel(liveStatus))}
          </span>
        </div>
      )}
      {searchOpen && <section className="research-chat-search" aria-label={t("chat.search")}><div><input autoFocus type="search" aria-label={t("chat.search")} placeholder={t("chat.search")} value={searchText} maxLength={200} onChange={e => setSearchText(e.target.value)} /><Button size="icon" variant="ghost" aria-label={t("Close")} onClick={() => setSearchOpen(false)}><X size={16} /></Button></div>{searchQ && <div className="research-chat-search-results" aria-busy={search.isFetching}>{search.isError ? <p role="alert">{t("chat.searchError")} <button onClick={() => void search.refetch()}>{t("Try again")}</button></p> : search.isLoading ? <p role="status">{t("Loading…")}</p> : !search.data?.length ? <p>{t("chat.noMessages")}</p> : [...search.data].reverse().map(item => <button key={item.id} onClick={() => locate.mutate(item.id)}><span><strong>{item.sender.fullName || t("Member")}</strong><time>{new Date(item.createdAt).toLocaleString(locale)}</time></span><span>{item.content}</span></button>)}{(search.data?.length ?? 0) === 30 && <Button size="sm" variant="ghost" onClick={() => setSearchBefore(search.data![0]!.id)}>{t("chat.olderResults")}</Button>}{searchBefore && <Button size="sm" variant="ghost" onClick={() => setSearchBefore(undefined)}>{t("chat.firstResults")}</Button>}</div>}</section>}
      {locate.isError && <p className="project-chat-error" role="alert">{t("chat.messageUnavailable")}</p>}
      <div className="project-chat-body">
        <div className="project-chat-feed-region">
        <div ref={containerRef} onScroll={onScroll} className="project-chat-feed" role="log" aria-label={t("Team messages")} aria-live="polite" aria-relevant="additions" aria-busy={historyQuery.isLoading} tabIndex={0}>
          {!historyComplete && (focusedWindow || olderMessages.length > 0 || (historyQuery.data?.length ?? 0) >= 50) && <Button type="button" size="sm" variant="ghost" disabled={older.isPending} onClick={() => { const feed = containerRef.current; if (feed) anchor.current = { height: feed.scrollHeight, top: feed.scrollTop, id: messages[0]?.id, offset: document.getElementById(`team-message-${messages[0]?.id}`)?.querySelector(".project-chat-message")?.getBoundingClientRect().top }; setHighlight(undefined); older.mutate(); }}>{t(older.isPending ? "Loading…" : "Load older messages")}</Button>}
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
            return <div key={item.id} id={`team-message-${item.id}`} tabIndex={-1} data-highlight={highlight === item.id}>
              {newDay && <div className="project-chat-date"><time dateTime={item.createdAt}>{date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</time></div>}
              <ProjectChatMessage own={isMe} author={isMe ? t("You") : item.sender.fullName || item.sender.email || t("Member")} avatarUrl={item.sender.avatarUrl} createdAt={item.createdAt} locale={locale} deleted={item.isDeleted} content={item.isDeleted ? t("This message was removed.") : item.content} footer={<>

                    {isMe && !item.isDeleted && <span><CheckCheck size={13} aria-hidden="true" />{isPending ? t("Sending…") : readByOthers ? t("Seen by {{count}}", { count: readByOthers }) : t("Sent")}</span>}
                    {!isPending && !item.isDeleted && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={t("chat.messageActions")}><MoreHorizontal size={16} /></button></DropdownMenuTrigger><DropdownMenuContent align={isMe ? "end" : "start"}><DropdownMenuItem onSelect={() => { setReplyId(item.id); textareaRef.current?.focus({ preventScroll: true }); }}><Reply size={15} />{t("chat.reply")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setDecisionMessage(item)}><Bookmark size={15} />{t("chat.saveDecision")}</DropdownMenuItem>{canDelete && <DropdownMenuItem disabled={deleteMutation.isPending} onSelect={() => deleteMutation.mutate(item.id)}><Trash2 size={15} />{t("Delete message")}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
              </>} >{item.replyTo && <button type="button" className="research-chat-reply" onClick={() => locate.mutate(item.replyTo!.id)}><strong>{item.replyTo.sender.fullName || t("chat.reply")}</strong><span>{item.replyTo.isDeleted ? t("This message was removed.") : item.replyTo.content || t("chat.sharedReference")}</span></button>}{!item.isDeleted && item.reference && <ChatReferenceCard projectId={projectId} reference={item.reference} />}</ProjectChatMessage>
            </div>;
          })}
        </div>
        {focusedWindow && <div className="research-chat-context-navigation"><Button variant="outline" size="sm" disabled={newer.isPending} onClick={() => newer.mutate()}>{t("chat.loadNewer")}</Button><Button size="sm" variant="ghost" onClick={() => { setFocusedWindow(null); setHighlight(undefined); jumpToLatest(); }}>{t("Jump to latest")}</Button>{newer.isError && <p role="alert">{t("chat.historyError")}</p>}</div>}
        {!atBottom && !focusedWindow && <button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={15} aria-hidden="true" />{t(hasNewMessages ? "New messages" : "Jump to latest")}</button>}
        </div>
        {(sendMutation.isError || deleteMutation.isError) && <div className="project-chat-error" role="alert"><XCircle size={16} aria-hidden="true" />{t(sendMutation.isError ? "Could not send. Your message is kept below; try again." : "Could not remove this message. Try again.")}{sendMutation.isError && <Button type="button" size="sm" variant="ghost" disabled={historyQuery.isError} onClick={submit}>{t("Try again")}</Button>}</div>}
        <ProjectChatComposer hasAttachment={!!reference} leading={<ChatShareMenu disabled={isDisabled} onChoose={kind => setPicker(kind)} />} preview={<>{picker && <ChatReferencePicker key={picker} projectId={projectId} kind={picker} onSelect={ref => { setReference(ref); setPicker(undefined); textareaRef.current?.focus({ preventScroll: true }); }} onClose={() => { setPicker(undefined); textareaRef.current?.focus({ preventScroll: true }); }} />}{replyId && <div className="research-chat-compose-preview"><Reply size={16} /><span>{t("chat.replyingTo")}<strong>{messages.find(item => item.id === replyId)?.content.slice(0, 140) || t("chat.selectedMessage")}</strong></span><Button type="button" variant="ghost" size="icon" aria-label={t("chat.cancelReply")} onClick={() => { setReplyId(undefined); textareaRef.current?.focus({ preventScroll: true }); }}><X size={15} /></Button></div>}{reference && <div className="research-chat-compose-preview"><ChatReferenceCard projectId={projectId} reference={reference} /><Button type="button" variant="ghost" size="icon" aria-label={t("chat.removeReference")} onClick={() => { setReference(undefined); textareaRef.current?.focus({ preventScroll: true }); }}><X size={15} /></Button></div>}</>} value={message} onChange={value => { setMessage(value); if (sendMutation.isError) sendMutation.reset(); }} onSend={submit} textareaRef={textareaRef} disabled={isDisabled || historyQuery.isLoading} pending={sendMutation.isPending} label={t("Message your team")} placeholder={t("Message your team…")} sendLabel={t("Send")} keyboardHint={t("Enter to send · Shift+Enter for a new line")} mobileHint={t("Only visible to your team")} />
      </div>
      {decisionMessage && <ChatDecisionDialog projectId={projectId} message={decisionMessage} onClose={() => { setDecisionMessage(undefined); textareaRef.current?.focus({ preventScroll: true }); }} />}
    </div>
  );
}

function liveStatusLabel(status: "connecting" | "live" | "reconnecting" | "offline"): string {
  if (status === "live") return "Connected";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "offline") return "Offline";
  return "Connecting";
}

function mergeMessages(first: ProjectTeamChatMessage[], second: ProjectTeamChatMessage[]) {
  return [...new Map([...first, ...second].map(item => [item.id, item])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function readChatDraft(key: string): { text?: string; replyId?: string; reference?: ProjectChatReference; signature?: string; key?: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value || typeof value !== "object" || typeof value.text !== "string" || value.text.length > 2000) return null;
    if (value.reference && (!["PAPER", "TASK", "MANUSCRIPT_SNAPSHOT", "SUBMISSION_REVISION"].includes(value.reference.kind) || !/^[0-9a-f-]{36}$/i.test(value.reference.id))) return null;
    if (value.replyId && (typeof value.replyId !== "string" || !/^[0-9a-f-]{24,36}$/i.test(value.replyId))) return null;
    return value;
  } catch { return null; }
}
