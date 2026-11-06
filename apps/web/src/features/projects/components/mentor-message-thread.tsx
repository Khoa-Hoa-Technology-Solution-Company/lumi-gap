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
  const submit = async () => {
    const body = draft.trim();
    if (!canWrite || pending || query.isLoading || query.isError || body.length < 1 || body.length > 5000) return;
    if (await onSend(body, reply?.id ?? null)) { setDraft(""); setReply(null); jumpToLatest(); }
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
            !query.isError && !messages.length ? <div className="project-chat-empty"><MessageSquare size={28} aria-hidden="true" /><h4>Bắt đầu trò chuyện</h4><p>Nhắn tin cho cố vấn và các thành viên trong nhóm.</p></div> : messages.map((item, index) => {
              const own = item.authorId === actorId;
              const date = new Date(item.createdAt);
              const previous = messages[index - 1];
              const parent = item.replyToId ? messages.find(message => message.id === item.replyToId) : null;
              return <div key={item.id} data-message-id={item.id}>
                {(!previous || date.toDateString() !== new Date(previous.createdAt).toDateString()) && <div className="project-chat-date"><time dateTime={item.createdAt}>{date.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" })}</time></div>}
                {item.replyToId && <div className="mentor-message-reply-context" data-own={own}><Reply size={13} aria-hidden="true" /><span>{parent ? `${parent.authorName}: ${parent.body}` : "Trả lời tin nhắn trước"}</span></div>}
                <ProjectChatMessage own={own} author={`${item.authorName}${own ? " (Bạn)" : item.mentor ? " · Cố vấn" : ""}`} createdAt={item.createdAt} locale="vi-VN" content={item.body}
                  footer={<>{item.shareId && <span>{entry.shares.find(share => share.id === item.shareId)?.title ?? "Nội dung đã ngừng chia sẻ"}</span>}{canWrite && !item.shareId && <button type="button" aria-label={`Trả lời ${item.authorName}`} onClick={() => { setReply(item); inputRef.current?.focus(); }}><Reply size={14} aria-hidden="true" /></button>}</>} />
                {item.response && <ProjectChatMessage own={false} author={item.handledByName ?? "Nhóm dự án"} createdAt={item.handledAt ?? item.createdAt} locale="vi-VN" content={item.response} />}
              </div>;
            })}
        </div>
        {!atBottom && <button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={15} aria-hidden="true" />{hasNewMessages ? "Có tin nhắn mới" : "Về tin mới nhất"}</button>}
      </div>
      {query.isError && <div role="alert" className="project-chat-error"><span>{denied ? "Bạn không còn quyền xem cuộc trò chuyện này." : "Chưa tải được tin nhắn. Nội dung đang soạn vẫn được giữ."}</span><Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Thử lại</Button></div>}
      {error}
      {canWrite ? <div className="mentor-collab-composer">
        {reply && <div className="mentor-message-reply"><div><strong>Trả lời {reply.authorName}</strong><p>{reply.body}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Hủy trả lời" onClick={() => setReply(null)}><X size={16} aria-hidden="true" /></Button></div>}
        <ProjectChatComposer value={draft} onChange={setDraft} onSend={() => void submit()} pending={pending} disabled={query.isLoading || query.isError} textareaRef={inputRef} minLength={1} maxLength={5000}
          label="Tin nhắn với cố vấn và nhóm" placeholder="Nhắn tin cho cố vấn và nhóm…" sendLabel="Gửi" keyboardHint="Enter để gửi · Shift+Enter để xuống dòng" mobileHint="Cố vấn và nhóm dự án" />
      </div> : <p role="status" className="mentor-message-readonly">{readOnly ? "Cuộc trò chuyện đang ở chế độ chỉ đọc." : "Nhóm chưa cấp quyền chat cho cố vấn."}</p>}
    </div>
  </section>;
}
