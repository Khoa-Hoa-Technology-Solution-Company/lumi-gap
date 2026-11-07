import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useJoinCommunity } from "@/features/forum/hooks/use-forum";
import { useI18n } from "@/i18n";
import { personalizationApi } from "../api/personalization.api";

export const PERSONALIZATION_KEY = ["personalization"] as const;

/** The forum "For you" feed shows at most this many discussions, ranked once per request, without paging. */
export const FOR_YOU_FEED_LIMIT = 20;

/**
 * The list must not reshuffle under the reader: no refetch on window focus or reconnect, and a five-minute stale time.
 * It refreshes when the tab is entered again (remount) and after join / follow / mute (invalidation of the prefix).
 * The key carries `limit`, so two sizes never share a cache entry.
 */
export function useForYou({ limit, enabled = true }: { limit: number; enabled?: boolean }) {
  return useQuery({
    queryKey: [...PERSONALIZATION_KEY, "for-you", limit],
    queryFn: ({ signal }) => personalizationApi.forYou(limit, signal),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
  });
}

export function useForYouCommunities(enabled: boolean) {
  return useQuery({
    queryKey: [...PERSONALIZATION_KEY, "communities"],
    queryFn: ({ signal }) => personalizationApi.communities(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useInterests(enabled = true) {
  return useQuery({
    queryKey: [...PERSONALIZATION_KEY, "interests"],
    queryFn: ({ signal }) => personalizationApi.interests(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useInterestVocabulary(q: string, enabled = true) {
  return useQuery({
    queryKey: [...PERSONALIZATION_KEY, "vocabulary", q],
    queryFn: ({ signal }) => personalizationApi.vocabulary(q, signal),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * One mutation hook for the four actions. Every change refreshes the interests, the "For you" feed and the forum
 * lists (a muted topic disappears from them immediately).
 */
export function useInterestActions() {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PERSONALIZATION_KEY }),
      queryClient.invalidateQueries({ queryKey: ["forum", "posts"] }),
    ]);
  };
  return {
    follow: useMutation({ mutationFn: (topic: string) => personalizationApi.follow(topic), onSuccess: refresh }),
    unfollow: useMutation({ mutationFn: (key: string) => personalizationApi.unfollow(key), onSuccess: refresh }),
    mute: useMutation({ mutationFn: (topic: string) => personalizationApi.mute(topic), onSuccess: refresh }),
    unmute: useMutation({ mutationFn: (key: string) => personalizationApi.unmute(key), onSuccess: refresh }),
  };
}

/** True only after `loading` has lasted `delayMs`, so a fast response never flashes a skeleton. */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) { setElapsed(false); return; }
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);
  return active && elapsed;
}

/**
 * Join from a suggestion card, shared by the forum feed and the communities page: one error toast, and only the cards
 * being joined are disabled (a second join on another card does not re-enable the first one).
 */
export function useJoinSuggestion() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const join = useJoinCommunity();
  const [joiningIds, setJoiningIds] = useState<readonly string[]>([]);
  // A ref answers a double click before React has re-rendered the disabled button.
  const inFlight = useRef(new Set<string>());

  // mutateAsync, not mutate(id, callbacks): the observer keeps the callbacks of the LAST mutate call only, so with two
  // joins in flight the first one's success/error/cleanup would never run. Each id gets its own try/catch/finally.
  const joinCommunity = async (community: { id: string }): Promise<void> => {
    if (inFlight.current.has(community.id)) return;
    inFlight.current.add(community.id);
    setJoiningIds((ids) => [...ids, community.id]);
    try {
      await join.mutateAsync(community.id);
      // Both pages stay consistent: the suggestions, the feed and the community directory are all refreshed.
      void queryClient.invalidateQueries({ queryKey: PERSONALIZATION_KEY });
      void queryClient.invalidateQueries({ queryKey: ["communities"] });
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } } | undefined)?.response?.data?.error?.message;
      toast.error(message ?? t("Something went wrong. Please try again."));
    } finally {
      inFlight.current.delete(community.id);
      setJoiningIds((ids) => ids.filter((id) => id !== community.id));
    }
  };
  return { joinCommunity, isJoining: (id: string) => joiningIds.includes(id) };
}
