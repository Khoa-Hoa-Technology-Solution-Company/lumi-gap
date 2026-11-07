import { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, MessageSquare } from "lucide-react";
import type { ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { screeningApi } from "../api/screening.api";
import { useChatScroll } from "../hooks/use-chat-scroll";
import { ProjectChatComposer, ProjectChatMessage } from "./project-chat-primitives";
import "../project-chat.css";
import { screeningActorId, ScreeningError, useScreeningCommand } from "./screening-common";
import { useUnsavedWorkspace } from "./workspace-common";
import { useReadScreeningDiscussion } from "../hooks/use-screening-discussion-unread";

export function useScreeningDiscussion(projectId: string, round: ScreeningRoundView, visible: boolean) {
  const actorId = useAuthStore(state => state.user?.id);
  return useInfiniteQuery({
    queryKey: ["project-research", actorId, projectId, "screening-discussion", round.id, round.hiddenReviews],
    queryFn: ({ pageParam }) => screeningApi.history(projectId, round.id, pageParam, "DISCUSSION"),
    initialPageParam: 1,
    getNextPageParam: page => page.hasNext ? page.page + 1 : undefined,
    enabled: Boolean(actorId && projectId && round.id && visible),
    refetchInterval: visible && round.active && !round.finalDecision ? 2500 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function ScreeningDiscussion({ projectId, round, people, readOnly, query, visible = true }: {
  projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean;
  query: ReturnType<typeof useScreeningDiscussion>; visible?: boolean;
}) {
  const queryClient = useQueryClient();
  const publicActorId = useAuthStore(state => state.user?.id);
  const actorId = screeningActorId(round, publicActorId);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(false);
  const command = useScreeningCommand(projectId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const olderAnchor = useRef<{ height: number; top: number }>();

  // Events are invalidation hints only. Authorized history remains the source of content.
  useEffect(() => {
    if (!visible || !round.active || round.finalDecision || !publicActorId || typeof screeningApi.streamEvents !== "function") return;
    const controller = new AbortController();
    let reconnectTimer: number | undefined;
    let cancelled = false;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", publicActorId] });
      void queryClient.invalidateQueries({ queryKey: ["project-research", publicActorId, projectId, "screening-discussion", round.id] });
      void queryClient.invalidateQueries({ queryKey: ["project-research", publicActorId, projectId, "screening-history", round.id] });
      void queryClient.invalidateQueries({ queryKey: ["project-research", publicActorId, projectId, "screening-round", round.id] });
    };
    const connect = () => {
      if (cancelled) return;
      void screeningApi.streamEvents(projectId, round.id, {
        signal: controller.signal,
        onOpen: () => { if (!cancelled) { setLive(true); refresh(); } },
        onEvent: event => { if (!cancelled && (event.type === "comment" || event.type === "round_updated")) refresh(); },
      }).catch(() => {
        if (cancelled) return;
        setLive(false);
        reconnectTimer = window.setTimeout(connect, 5000);
      });
    };
    connect();
    return () => { cancelled = true; controller.abort(); setLive(false); if (reconnectTimer) window.clearTimeout(reconnectTimer); };
  }, [visible, round.active, round.finalDecision, round.id, projectId, publicActorId, queryClient]);

  const messages = useMemo(() => {
    const unique = new Map(query.data?.pages.flatMap(page => page.items).map(item => [item.id, item]));
    return [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [query.data]);
  const { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest } = useChatScroll(messages.at(-1)?.id);
  useReadScreeningDiscussion(round.id, messages.map(message => message.id), visible && atBottom && !round.hiddenReviews && !query.isLoading && !query.isError);
  // A kept-mounted tab has no layout while hidden. Reposition only followers on reveal.
  useLayoutEffect(() => { if (visible && atBottom) jumpToLatest(); }, [visible]);
  useLayoutEffect(() => {
    if (query.isFetchingNextPage || !olderAnchor.current || !containerRef.current) return;
    const anchor = olderAnchor.current;
    containerRef.current.scrollTop = anchor.top + containerRef.current.scrollHeight - anchor.height;
    olderAnchor.current = undefined;
  }, [query.isFetchingNextPage, messages, containerRef]);
  useUnsavedWorkspace(Boolean(draft) || command.isPending);
  const canCompose = !readOnly && round.active && !round.hiddenReviews && !round.finalDecision && !round.adjudicationCase &&
    (round.settings.reviewMode === "COLLABORATIVE" || Boolean(round.myAssignmentId && round.myReview));
  const submit = async () => {
    const comment = draft.trim();
    if (!canCompose || comment.length < 3 || command.isPending || query.isError || query.isLoading) return;
    jumpToLatest();
    const saved = await command.run({ roundId: round.id, comment }, clientKey => screeningApi.action(projectId, round.id, "comments", { comment, clientKey }));
    if (saved) setDraft("");
    textareaRef.current?.focus();
  };
  return <div className="screening-discussion project-chat-surface">
    <div className="screening-discussion-context">
      <h4>Trao đổi ({query.data?.pages[0]?.total ?? 0})</h4>
      <span role="status" className="screening-discussion-connection" data-live={live && !query.isError && !round.finalDecision}>
        <i aria-hidden="true" />{query.isError ? "Chưa cập nhật được" : round.finalDecision ? "Đã lưu trao đổi" : live ? "Trực tiếp" : "Cập nhật tự động"}
      </span>
    </div>
    <div className="project-chat-body">
      <div className="project-chat-feed-region">
        <div className="project-chat-feed" ref={containerRef} onScroll={onScroll} role="log" aria-label="Trao đổi về bài báo" aria-live="polite" aria-relevant="additions" aria-busy={query.isLoading} tabIndex={0}>
          {query.hasNextPage && <Button type="button" size="sm" variant="ghost" disabled={query.isFetching} onClick={() => {
            const feed = containerRef.current;
            if (feed) olderAnchor.current = { height: feed.scrollHeight, top: feed.scrollTop };
            void query.fetchNextPage();
          }}>{query.isFetchingNextPage ? "Đang tải..." : "Xem tin nhắn trước"}</Button>}
          {query.isLoading ? <div className="space-y-4 py-5" role="status" aria-label="Đang tải trao đổi"><Skeleton className="h-12 w-3/4" /><Skeleton className="ml-auto h-12 w-2/3" /></div> :
            query.isError && !query.data ? <ScreeningError error={query.error} retry={() => void query.refetch()} /> : messages.length === 0 ?
              <div className="project-chat-empty"><MessageSquare size={24} aria-hidden="true" /><h4>Chưa có trao đổi</h4><p>Đối chiếu tiêu chí hoặc chia sẻ đoạn nguồn giúp làm rõ đánh giá của bạn.</p></div> :
              messages.map((item, index) => {
                const own = item.actorId === actorId;
                const name = item.actorName ?? people.find(p => p.id === item.actorId)?.name ?? round.assignments.find(a => a.reviewerId === item.actorId)?.name ?? "Thành viên";
                const date = new Date(item.createdAt);
                const previous = messages[index - 1];
                const newDay = !previous || date.toDateString() !== new Date(previous.createdAt).toDateString();
                return <div key={item.id} data-message-id={item.id}>
                  {newDay && <div className="project-chat-date"><time dateTime={item.createdAt}>{date.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" })}</time></div>}
                  <ProjectChatMessage own={own} author={`${name}${own ? " (Bạn)" : ""}`} createdAt={item.createdAt} locale="vi-VN" content={typeof item.details?.comment === "string" ? item.details.comment : "Nội dung đang được ẩn theo quy tắc đánh giá độc lập."} />
                </div>;
              })}
        </div>
        {!atBottom && <button type="button" className="project-chat-jump" onClick={jumpToLatest}><ArrowDown size={15} aria-hidden="true" />{hasNewMessages ? "Có tin nhắn mới" : "Về tin mới nhất"}</button>}
      </div>
      {query.isError && query.data && <ScreeningError error={query.error} retry={() => void query.refetch()} />}
      <ScreeningError error={command.error} />
      {canCompose ? <ProjectChatComposer value={draft} onChange={value => { setDraft(value); if (command.isError) command.reset(); }} onSend={() => void submit()} textareaRef={textareaRef} minLength={3}
        disabled={query.isError || query.isLoading} pending={command.isPending} label="Tin nhắn trao đổi về bài báo" placeholder="Nhập trao đổi hoặc căn cứ…" sendLabel="Gửi" keyboardHint="Enter để gửi · Shift+Enter để xuống dòng" mobileHint="Trao đổi về bài báo" /> :
        <p className="screening-discussion-readonly">{round.finalDecision ? "Vòng đánh giá đã kết thúc. Bạn có thể xem lại cuộc trao đổi giữa hai reviewer." : round.adjudicationCase ? "Hồ sơ phân xử đã mở. Mỗi Reviewer bổ sung ý kiến riêng trong hồ sơ." : round.hiddenReviews ? "Trao đổi mở sau khi công bố phiếu đánh giá." : "Bạn đang xem lịch sử trao đổi."}</p>}
    </div>
  </div>;
}
