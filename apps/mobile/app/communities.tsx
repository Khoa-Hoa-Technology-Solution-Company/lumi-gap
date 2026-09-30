import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import type { Community } from "@trend/shared-types";

import { useCommunityList } from "@/features/communities";

type Scope = "all" | "mine";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const debouncedQuery = useDebounced(query.trim(), 300);

  const list = useCommunityList({ q: debouncedQuery || undefined, scope });
  const communities = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2" accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Communities</Text>
        <View className="w-8" />
      </View>

      <View className="px-4 pt-4">
        <TextInput
          className="h-12 rounded-xl border border-border dark:border-[#26334A] px-4 text-foreground dark:text-[#F8FAFC]"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, field, or topic"
          placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
          returnKeyType="search"
        />
        <View className="mt-3 flex-row gap-2">
          {(["all", "mine"] as const).map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setScope(value)}
              className={`rounded-full px-4 py-2 ${scope === value ? "bg-[#1D4ED8]" : "border border-border dark:border-[#26334A]"}`}
            >
              <Text className={`text-sm font-semibold ${scope === value ? "text-white" : "text-muted-foreground dark:text-[#94A3B8]"}`}>
                {value === "all" ? "All" : "Joined"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {list.isLoading ? (
        <View className="py-24"><ActivityIndicator color="#06B6D4" /></View>
      ) : list.isError ? (
        <View className="m-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <Text className="text-center text-sm font-semibold text-red-500">Could not load communities.</Text>
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => <CommunityCard community={item} onPress={() => router.push(`/community/${item.slug}` as any)} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListEmptyComponent={
            <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8">
              <Text className="text-center text-sm text-muted-foreground dark:text-[#94A3B8]">
                {scope === "mine" && !debouncedQuery ? "You have not joined any communities yet." : "No communities found."}
              </Text>
            </View>
          }
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-4" color="#06B6D4" /> : null}
        />
      )}
    </SafeAreaView>
  );
}

function CommunityCard({ community, onPress }: { community: Community; onPress: () => void }) {
  const joined = community.viewerMembership?.status === "active";
  return (
    <TouchableOpacity
      className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4"
      activeOpacity={0.86}
      onPress={onPress}
      style={{ minHeight: 48 }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={1}>{community.name}</Text>
        {joined ? <Feather name="check-circle" size={16} color="#22C55E" /> : null}
        {community.visibility === "private" ? <Feather name="lock" size={14} color="#94A3B8" /> : null}
      </View>
      {community.researchField ? <Text className="mt-1 text-xs font-semibold text-[#1D4ED8]">{community.researchField}</Text> : null}
      <Text className="mt-2 text-sm text-muted-foreground dark:text-[#94A3B8]" numberOfLines={2}>
        {community.description || "A focused space for researchers working in this field."}
      </Text>
      <Text className="mt-3 text-xs text-muted-foreground dark:text-[#94A3B8]">
        {community.memberCount} members · {community.threadCount} discussions
      </Text>
    </TouchableOpacity>
  );
}
