import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Y from "yjs";
import type { ManuscriptComment } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { workspaceApi } from "@/features/projects/api/workspace.api";
import type { ManuscriptProvider } from "./collaboration-provider";

export function ManuscriptCommentThread({ projectId, userId, thread, provider, hidden, canResolve, canReply, onNavigate, onReply, onResolve }: {
  projectId: string; userId: string; thread: ManuscriptComment; provider?: ManuscriptProvider;
  hidden?: boolean;
  canResolve: boolean; canReply: boolean; onNavigate: (file: string) => void;
  onReply: (body: string, key: string) => Promise<boolean>;
  onResolve: (conclusion: string, status: ManuscriptComment["status"], expectedVersion: number) => Promise<boolean>;
}) {
  const { t } = useI18n(), client = useQueryClient();
  const [pending, setPending] = useState<"reply" | "resolve" | null>(null), [reply, setReply] = useState("");
  const [conclusion, setConclusion] = useState(""), [mutationFailed, setMutationFailed] = useState(false);
  const operation = useRef(false), replyAttempt = useRef<{ body: string; key: string }>();
  const [allReplies, setAllReplies] = useState(false), [page, setPage] = useState(1);
  useUnsavedWorkspace(Boolean(reply.trim()) || Boolean(conclusion.trim()) || pending !== null);
  const conversationKey = ["manuscript-conversation", userId, projectId, thread.id];
  const conversation = useQuery({ queryKey: [...conversationKey, page], queryFn: () => workspaceApi.discussion(projectId, thread.id, page), enabled: allReplies && !hidden, refetchInterval: allReplies && !hidden ? 10000 : false });
  // Full conversation reads can be newer than the separately polled comment list.
  const latest = conversation.data?.thread && conversation.data.thread.version >= thread.version ? conversation.data : undefined;
  const status = latest?.thread.status ?? thread.status;
  const version = latest?.thread.version ?? thread.version;
  const resolution = latest?.thread.conclusion ?? thread.conclusion;
  const canSendReply = canReply && status === "OPEN" && (!latest || latest.canReply);
  const canChangeStatus = canResolve && (!latest || latest.canResolve);
  const busy = pending !== null;
  const sendReply = async () => {
    const body = reply.trim();
    if (operation.current || !canSendReply || !body) return;
    // An unchanged retry keeps its receipt; edited content is a new request.
    if (replyAttempt.current?.body !== body) replyAttempt.current = { body, key: crypto.randomUUID() };
    operation.current = true; setPending("reply"); setMutationFailed(false);
    try {
      if (await onReply(body, replyAttempt.current.key)) {
        setReply(""); replyAttempt.current = undefined;
        await client.invalidateQueries({ queryKey: conversationKey });
      } else setMutationFailed(true);
    } catch { setMutationFailed(true); }
    finally { operation.current = false; setPending(null); }
  };
  const changeStatus = async () => {
    if (operation.current || !canChangeStatus || (status === "OPEN" && !conclusion.trim())) return;
    operation.current = true; setPending("resolve"); setMutationFailed(false);
    try {
      if (await onResolve(status === "OPEN" ? conclusion.trim() : "", status === "OPEN" ? "RESOLVED" : "OPEN", version)) {
        setConclusion("");
        await client.invalidateQueries({ queryKey: conversationKey });
      } else setMutationFailed(true);
    } catch { setMutationFailed(true); }
    finally { operation.current = false; setPending(null); }
  };
  let anchored = false;
  if (!hidden && provider && provider.fileId === thread.context.fileId && thread.context.start && thread.context.end) {
    try {
      const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(thread.context.start as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc);
      const end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(thread.context.end as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc);
      anchored = Boolean(start && end && start.type === provider.text && end.type === provider.text && end.index > start.index && provider.text.toString().slice(start.index, end.index).slice(0, 1000) === thread.context.quote);
    } catch { /* Removed text keeps its historical quote. */ }
  }
  const messages = allReplies ? conversation.data?.messages.items ?? [] : thread.messages;
  return <article className="writing-comment" hidden={hidden}>
    <div><strong>{thread.author.name}</strong><span>{t(status === "OPEN" ? "Open" : "Resolved")}</span></div>
    <p>{thread.body}</p>
    {status === "RESOLVED" && resolution ? <div className="writing-reply"><strong>{t("Resolution summary")}</strong><p>{resolution}</p></div> : null}
    {thread.context.quote ? <blockquote>{thread.context.quote}<small>{t(anchored ? "Selection anchor available" : "Historical quote; verify current context")}</small></blockquote> : null}
    {thread.context.fileId ? <button onClick={() => onNavigate(thread.context.fileId!)}>{t("Open commented file")}</button> : null}
    {thread.hasMoreMessages || allReplies ? <Button size="sm" variant="ghost" onClick={() => setAllReplies(value => !value)}>{t(allReplies ? "Latest replies" : "View all replies")}</Button> : null}
    {allReplies && conversation.isLoading ? <p role="status">{t("Loading…")}</p> : null}
    {allReplies && conversation.error ? <div role="alert"><p>{t("Could not load comments.")}</p><Button variant="outline" size="sm" onClick={() => void conversation.refetch()}>{t("Try again")}</Button></div> : null}
    {messages.map(message => <div className="writing-reply" key={message.id}><strong>{message.author.name}</strong><p>{message.body}</p></div>)}
    {allReplies && conversation.data ? <nav className="writing-actions" aria-label={t("Replies pages")}>
      <Button size="sm" variant="outline" disabled={page === 1 || conversation.isFetching} onClick={() => setPage(value => value - 1)}>{t("Previous page")}</Button>
      <span>{page}</span>
      <Button size="sm" variant="outline" disabled={!conversation.data.messages.hasNext || conversation.isFetching} onClick={() => setPage(value => value + 1)}>{t("Next page")}</Button>
    </nav> : null}
    {mutationFailed ? <p role="alert">{t("The operation failed. Your changes are retained; refresh and try again.")}</p> : null}
    {canSendReply ? <form onSubmit={event => { event.preventDefault(); void sendReply(); }}><label>{t("Reply")}<Input value={reply} disabled={busy} maxLength={5000} onChange={event => setReply(event.target.value)} required /></label><Button size="sm" variant="outline" disabled={busy || !reply.trim()}>{t("Send reply")}</Button></form> : null}
    {canChangeStatus ? <div>{status === "OPEN" ? <Input aria-label={t("Resolution summary")} placeholder={t("Resolution summary")} value={conclusion} disabled={busy} maxLength={5000} onChange={event => setConclusion(event.target.value)} /> : null}<Button size="sm" variant="ghost" disabled={busy || (status === "OPEN" && !conclusion.trim())} onClick={() => void changeStatus()}>{t(status === "OPEN" ? "Resolve" : "Reopen")}</Button></div> : null}
  </article>;
}
