import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { useCommunity, useCommunityPosts, useJoinCommunity, useLeaveCommunity } from "@/features/communities";

function requestError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

export default function CommunityDetailScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const communityQuery = useCommunity(slug);
  const community = communityQuery.data;
  const canReadPosts = Boolean(community && !community.contentRestricted && community.status === "ACTIVE");
  const posts = useCommunityPosts(community?.id, canReadPosts);
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();

  const membership = community?.viewerMembership;
  const busy = join.isPending || leave.isPending;

  const onJoin = () => {
    if (!community) return;
    join.mutate(community.id, { onError: (error) => Alert.alert("Could not join", requestError(error, "Please try again.")) });
  };
  const onLeave = () => {
    if (!community) return;
    leave.mutate(community.id, { onError: (error) => Alert.alert("Could not leave", requestError(error, "Please try again.")) });
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2" accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Community</Text>
        <View className="w-8" />
      </View>

      {communityQuery.isLoading ? (
        <View className="py-24"><ActivityIndicator color="#06B6D4" /></View>
      ) : communityQuery.isError || !community ? (
        <View className="m-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <Text className="text-center text-sm font-semibold text-red-500">This community is unavailable.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC]">{community.name}</Text>
          {community.researchField ? <Text className="mt-1 text-sm font-semibold text-[#1D4ED8]">{community.researchField}</Text> : null}
          <Text className="mt-3 text-sm leading-6 text-muted-foreground dark:text-[#94A3B8]">{community.description}</Text>
          <Text className="mt-3 text-xs text-muted-foreground dark:text-[#94A3B8]">
            {community.memberCount} members · {community.threadCount} discussions · {community.visibility === "private" ? "Private" : "Public"}
          </Text>

          {community.status !== "ACTIVE" ? (
            <View className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <Text className="text-sm text-amber-600">
                {community.status === "PENDING_APPROVAL" ? "Awaiting administrator approval." : community.status === "REJECTED" ? "This proposal was rejected." : "This community is archived."}
              </Text>
            </View>
          ) : membership?.status === "active" ? (
            <TouchableOpacity className="mt-4 items-center rounded-xl border border-border dark:border-[#26334A] py-3" style={{ minHeight: 48 }} disabled={busy} onPress={onLeave}>
              <Text className="font-bold text-foreground dark:text-[#F8FAFC]">{busy ? "Working…" : "Joined · Leave"}</Text>
            </TouchableOpacity>
          ) : membership?.status === "pending" ? (
            <TouchableOpacity className="mt-4 items-center rounded-xl border border-border dark:border-[#26334A] py-3" style={{ minHeight: 48 }} disabled={busy} onPress={onLeave}>
              <Text className="font-bold text-foreground dark:text-[#F8FAFC]">{busy ? "Working…" : "Request pending · Cancel"}</Text>
            </TouchableOpacity>
          ) : membership?.status === "banned" ? null : (
            <TouchableOpacity className={`mt-4 items-center rounded-xl py-3 ${busy ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`} style={{ minHeight: 48 }} disabled={busy} onPress={onJoin}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">{community.visibility === "private" ? "Request to join" : "Join community"}</Text>}
            </TouchableOpacity>
          )}

          {community.rules.length ? (
            <View className="mt-6">
              <Text className="mb-2 text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">Rules</Text>
              {community.rules.map((rule, index) => (
                <Text key={`${index}-${rule}`} className="mb-1 text-sm text-foreground dark:text-[#F8FAFC]">{index + 1}. {rule}</Text>
              ))}
            </View>
          ) : null}

          <View className="mt-6">
            <Text className="mb-2 text-xs font-bold uppercase text-muted-foreground dark:text-[#94A3B8]">Discussions</Text>
            {community.contentRestricted ? (
              <Text className="text-sm text-muted-foreground dark:text-[#94A3B8]">Join this private community to read its discussions.</Text>
            ) : posts.isLoading ? (
              <ActivityIndicator color="#06B6D4" />
            ) : posts.isError ? (
              <Text className="text-sm text-red-500">Could not load discussions.</Text>
            ) : posts.data?.length ? (
              posts.data.map((post) => (
                <View key={post.id} className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
                  <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC]">{post.title}</Text>
                  <Text className="mt-1 text-sm text-muted-foreground dark:text-[#94A3B8]" numberOfLines={3}>{post.content}</Text>
                  <Text className="mt-2 text-xs text-muted-foreground dark:text-[#94A3B8]">
                    {post.authorName ? `${post.authorName} · ` : ""}{post.commentCount} responses
                  </Text>
                </View>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground dark:text-[#94A3B8]">No discussions yet.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
