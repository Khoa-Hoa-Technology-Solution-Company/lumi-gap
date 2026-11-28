import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDown, MessageSquare, Reply, X } from "lucide-react";
import { isAxiosError } from "axios";
import type { MentorAccessWorkspace, MentorFeedback } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mentorAccessApi } from "../api/mentor-access.api";
import { useChatScroll } from "../hooks/use-chat-scroll";
import { ProjectChatComposer, ProjectChatMessage } from "./project-chat-primitives";
import { useUnsavedWorkspace } from "./workspace-common";
import "../project-chat.css";
import "../mentor-message-thread.css";

type Entry = MentorAccessWorkspace["policies"][number];
export function MentorMessageThread({ projectId, actorId, entry, readOnly, pending, error, onSend }: {
  projectId: string; actorId: string; entry: Entry; readOnly: boolean; pending: boolean; error: ReactNode;
  onSend: (body: string, replyToId: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<MentorFeedback | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const olderAnchor = useRef<{ height: number; top: number }>();
  const query = useInfiniteQuery({
    queryKey: ["mentor-access", actorId, projectId, entry.policy.id, entry.policy.version, "messages"],
    queryFn: ({ pageParam }) => mentorAccessApi.feedback(projectId, entry.policy.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: page => page.hasNext ? page.page + 1 : undefined,
    retry: false, refetchInterval: 5000,
  });
  const denied = isAxiosError(query.error) && [401, 403, 404].includes(query.error.response?.status ?? 0);
  const messages = useMemo(() => {
    if (denied) return [];
    const items = query.data?.pages.flatMap(page => page.items) ?? [];
    const readable = items.filter(item => actorId !== entry.mentorId || (item.shareId ? entry.shares.some(share => share.id === item.shareId && !share.revokedAt) : entry.policy.permissions.includes("MENTOR_CHAT")));
    return [...new Map(readable.map(item => [item.id, item])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [query.data, denied, actorId, entry]);
  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(messages.at(-1)?.id);
  useLayoutEffect(() => {
    if (query.isFetchingNextPage || !olderAnchor.current || !containerRef.current) return;
    const anchor = olderAnchor.current;
    containerRef.current.scrollTop = anchor.top + containerRef.current.scrollHeight - anchor.height;
    olderAnchor.current = undefined;
  }, [query.isFetchingNextPage, messages, containerRef]);
  useUnsavedWorkspace(Boolean(draft) || pending);
  const canWrite = !readOnly && !denied && (actorId !== entry.mentorId || entry.policy.permissions.includes("MENTOR_CHAT"));
  const starters = actorId === entry.mentorId ? [
    { label: "Hỏi tiến độ", body: "Nhóm cập nhật giúp mình tiến độ và những vướng mắc hiện tại nhé." },
    { label: "Góp ý phương pháp", body: "Mình muốn trao đổi với nhóm về phương pháp nghiên cứu." },
    { label: "Hẹn trao đổi", body: "Nhóm đề xuất giúp mình thời gian phù hợp để cùng trao đổi nhé." },
  ] : [
    { label: "Cập nhật tiến độ", body: "Thưa thầy/cô, nhóm xin cập nhật tiến độ nghiên cứu: " },
    { label: "Xin góp ý", body: "Thưa thầy/cô, nhóm cần góp ý về phương pháp nghiên cứu: " },
    { label: "Hẹn trao đổi", body: "Thưa thầy/cô, nhóm muốn hẹn một buổi trao đổi. Thầy/cô có thể sắp xếp thời gian nào ạ?" },
  ];
  const focusMessage = (messageId: string) => {
    const element = [...(containerRef.current?.querySelectorAll<HTMLDivElement>("[data-message-id]") ?? [])]
      .find(node => node.dataset.messageId === messageId);
    if (!element) return;
    element.scrollIntoView?.({ block: "center" });
    element.focus({ preventScroll: true });
    setHighlightedId(messageId);
  };
  const cancelReply = () => { setReply(null); inputRef.current?.focus(); };
  const submit = async () => {
    const body = draft.trim();
    if (!canWrite || pending || query.isLoading || query.isError || body.length < 1 || body.length > 5000) return;
    const replyToId = reply?.id ?? null;
    if (await onSend(body, replyToId)) {
      setDraft(current => current.trim() === body ? "" : current);
      setReply(current => current?.id === replyToId ? null : current);
      jumpToLatest();
    }
    inputRef.current?.focus();
  };
  return <section className="mentor-message-chat project-chat-surface" aria-label="Tin nhắn với cố vấn">
    <div className="project-chat-body">
      <div className="project-chat-feed-region">
        <div className="project-chat-feed" ref={containerRef} onScroll={onScroll} role="log" aria-label="Lịch sử tin nhắn" aria-live="polite" aria-relevant="additions">
          {query.hasNextPage && !denied && <Button type="button" variant="ghost" size="sm" disabled={query.isFetchingNextPage} onClick={() => {
            const element = containerRef.current;
            if (element) olderAnchor.current = { height: element.scrollHeight, top: element.scrollTop };
            void query.fetchNextPage();
          }}>{query.isFetchingNextPage ? "Đang tải…" : "Xem tin nhắn trước"}</Button>}
          {query.isLoading ? <div role="status" aria-label="Đang tải tin nhắn" className="space-y-4 py-5"><Skeleton className="h-12 w-3/4" /><Skeleton className="ml-auto h-12 w-2/3" /></div> :
            !query.isError && !messages.length ? (
              <div className="project-chat-empty">
                <span className="mentor-chat-empty-badge" aria-hidden="true">
                  <MessageSquare size={22} />
                </span>
                <h4>Bắt đầu trò chuyện</h4>
                <p>
                  {actorId === entry.mentorId
                    ? "Trao đổi trực tiếp với các thành viên nhóm nghiên cứu về tiến độ, phương pháp hoặc bản thảo."
                    : "Nhắn tin cho cố vấn và các thành viên trong nhóm."}
                </p>
                {canWrite && !draft && <div className="mentor-chat-starters" role="group" aria-label="Gợi ý mở đầu cuộc trò chuyện">
                  {starters.map(starter => <button key={starter.label} type="button" disabled={pending} onClick={() => {
                    setDraft(starter.body); inputRef.current?.focus();
                  }}>{starter.label}</button>)}
                </div>}
              </div>
            ) : messages.map((item, index) => {
              const own = item.authorId === actorId;
              const date = new Date(item.createdAt);
              const previous = messages[index - 1];
              const parent = item.replyToId ? messages.find(message => message.id === item.replyToId) : null;
              return <div key={item.id} data-message-id={item.id} data-highlight={highlightedId === item.id} tabIndex={-1}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedId(null); }}>
                {(!previous || date.toDateString() !== new Date(previous.createdAt).toDateString()) && <div className="project-chat-date"><time dateTime={item.createdAt}>{date.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" })}</time></div>}
                {parent ? <button type="button" className="mentor-message-reply-context" data-own={own}
                  aria-label={`Xem tin nhắn gốc của ${parent.authorName}`} onClick={() => focusMessage(parent.id)}>
                  <Reply size={13} aria-hidden="true" /><span>{parent.authorName}: {parent.body}</span>
                </button> : item.replyToId && <div className="mentor-message-reply-context" data-own={own}><Reply size={13} aria-hidden="true" /><span>Trả lời tin nhắn trước</span></div>}
                <ProjectChatMessage own={own} author={`${item.authorName}${own ? " (Bạn)" : item.mentor ? " · Cố vấn" : ""}`} createdAt={item.createdAt} locale="vi-VN" content={item.body}
                  footer={<>{item.shareId && <span>{entry.shares.find(share => share.id === item.shareId)?.title ?? "Nội dung đã ngừng chia sẻ"}</span>}{canWrite && !item.shareId && <button type="button" aria-label={`Trả lời ${item.authorName}`} onClick={() => { setReply(item); inputRef.current?.focus(); }}><Reply size={14} aria-hidden="true" /><span>Trả lời</span></button>}</>} />
                {item.response && <ProjectChatMessage own={false} author={item.handledByName ?? "Nhóm dự án"} createdAt={item.handledAt ?? item.createdAt} locale="vi-VN" content={item.response} />}
              </div>;
            })}
        </div>
        {!atBottom && <div className="project-chat-jump-bar"><button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={14} aria-hidden="true" />{hasNewMessages ? "Tin nhắn mới" : "Về tin nhắn mới nhất"}</button></div>}
      </div>
      {query.isError && <div role="alert" className="project-chat-error"><span>{denied ? "Bạn không còn quyền xem cuộc trò chuyện này." : "Chưa tải được tin nhắn. Nội dung đang soạn vẫn được giữ."}</span><Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Thử lại</Button></div>}
      {error}
      {canWrite ? <div className="mentor-collab-composer" onKeyDown={event => {
        if (event.key === "Escape" && reply && !pending && !event.nativeEvent.isComposing) { event.preventDefault(); cancelReply(); }
      }}>
        {reply && <div className="mentor-message-reply"><div><strong>Trả lời {reply.authorName}</strong><p>{reply.body}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Hủy trả lời" disabled={pending} onClick={cancelReply}><X size={16} aria-hidden="true" /></Button></div>}
        <ProjectChatComposer value={draft} onChange={setDraft} onSend={() => void submit()} pending={pending} disabled={query.isLoading || query.isError} textareaRef={inputRef} minLength={1} maxLength={5000}
          label="Tin nhắn với cố vấn và nhóm" placeholder={actorId === entry.mentorId ? "Nhắn tin trao đổi với nhóm nghiên cứu…" : "Nhắn tin cho cố vấn và nhóm…"} sendLabel="Gửi" />
      </div> : <p role="status" className="mentor-message-readonly">{readOnly ? "Cuộc trò chuyện đang ở chế độ chỉ đọc." : "Nhóm chưa cấp quyền chat cho cố vấn."}</p>}
    </div>
  </section>;
}
