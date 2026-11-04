import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { personalizationApi } from "../api/personalization.api";

export const PERSONALIZATION_KEY = ["personalization"] as const;

export function useForYou(enabled: boolean) {
  return useQuery({
    queryKey: [...PERSONALIZATION_KEY, "for-you"],
    queryFn: ({ signal }) => personalizationApi.forYou(signal),
    enabled,
    staleTime: 60_000,
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
