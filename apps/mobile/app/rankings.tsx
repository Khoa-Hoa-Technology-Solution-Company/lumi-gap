import { useMemo, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { useMyRanking, useRankings, type RankingUser, LEVEL_IMAGES, getLevel, getProgress } from "@/features/rankings";
import { useAuthStore } from "@/stores/auth-store";


function RankCard({ user, place }: { user: RankingUser; place: 1 | 2 | 3 }) {
  const level = getLevel(user.points);
  const colors = {
    1: "border-yellow-400 bg-yellow-950/30",
    2: "border-slate-400 bg-slate-900/40",
    3: "border-orange-400 bg-orange-950/30",
  }[place];

  return (
    <View className={`flex-1 rounded-2xl border ${colors} p-3 items-center min-h-[174px]`}>
      <View className="rounded-full bg-card dark:bg-[#111C2E] px-2 py-1 mb-2">
        <Text className="text-foreground dark:text-[#F8FAFC] text-xs font-black">#{place}</Text>
      </View>
      <Image source={LEVEL_IMAGES[level]} className="w-16 h-16" resizeMode="contain" />
      <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-xs text-center mt-2" numberOfLines={2}>
        {user.name}
      </Text>
      <Text className="text-muted-foreground dark:text-[#94A3B8] text-[10px] mt-1">Lv.{level}</Text>
      <Text className="text-[#06B6D4] font-black text-sm mt-1">{user.points.toLocaleString()} pts</Text>
    </View>
  );
}

function RankingRow({ user, isMe }: { user: RankingUser; isMe: boolean }) {
  const level = getLevel(user.points);
  return (
    <View className={`flex-row items-center rounded-2xl border p-3 mb-3 ${isMe ? "border-[#06B6D4] bg-[#083344]" : "border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"}`}>
      <Text className="w-10 text-center text-muted-foreground dark:text-[#94A3B8] font-black">#{user.rank}</Text>
      <View className="w-11 h-11 rounded-xl bg-background dark:bg-[#0F1B2D] items-center justify-center mx-3">
        <Image source={LEVEL_IMAGES[level]} className="w-10 h-10" resizeMode="contain" />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-sm flex-1" numberOfLines={1}>
            {user.name}
          </Text>
          {isMe ? <Text className="text-[9px] font-black text-white bg-[#1D4ED8] rounded px-1.5 py-0.5">YOU</Text> : null}
        </View>
        <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs mt-1" numberOfLines={1}>
          Lv.{level} · {user.role} · {user.university || "N/A"}
        </Text>
      </View>
      <Text className="text-[#06B6D4] font-black text-sm ml-2">{user.points.toLocaleString()}</Text>
    </View>
  );
}

export default function RankingsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const user = useAuthStore((state) => state.user);
  const [page, setPage] = useState(1);
  const rankingsQuery = useRankings({ page, limit: 20 });
  const myRankingQuery = useMyRanking(Boolean(user));

  const rankings = rankingsQuery.data?.rankings ?? [];
  const meta = rankingsQuery.data?.meta;
  const top3 = page === 1 ? rankings.slice(0, 3) : [];
  const rows = page === 1 ? rankings.slice(3) : rankings;
  const myStats = myRankingQuery.data?.stats;
  const myLevel = getLevel(myStats?.points ?? user?.points ?? 0);
  const myProgress = getProgress(myStats?.points ?? user?.points ?? 0, myLevel);

  const refreshing = rankingsQuery.isRefetching || myRankingQuery.isRefetching;
  const refresh = () => {
    void rankingsQuery.refetch();
    void myRankingQuery.refetch();
  };

  const pointGuide = useMemo(
    () => [
      { label: "Approved PDF uploads", value: "+30 to +150 pts" },
      { label: "Rate paper quality", value: "+5 pts each" },
      { label: "Invalid PDF penalty", value: "Reserved" },
    ],
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Rankings</Text>
        <TouchableOpacity onPress={refresh} className="p-2 -mr-2">
          <Feather name="refresh-cw" size={18} color="#06B6D4" />
        </TouchableOpacity>
      </View>

      {rankingsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#06B6D4" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#06B6D4" />}
        >
          {myRankingQuery.data ? (
            <View className="rounded-2xl bg-[#1D4ED8] p-4 mb-5 overflow-hidden">
              <View className="flex-row items-center">
                <Image source={LEVEL_IMAGES[myLevel]} className="w-16 h-16" resizeMode="contain" />
                <View className="flex-1 ml-3">
                  <Text className="text-blue-100 text-xs font-bold uppercase">Your position</Text>
                  <Text className="text-white text-3xl font-black mt-1">#{myRankingQuery.data.rank}</Text>
                  <Text className="text-blue-100 text-xs mt-1">
                    Level {myLevel} · {myRankingQuery.data.stats.points.toLocaleString()} pts
                  </Text>
                </View>
              </View>
              <View className="h-2.5 rounded-full bg-white/20 overflow-hidden mt-4">
                <View className="h-full rounded-full bg-cyan-300" style={{ width: `${myProgress}%` }} />
              </View>
              <View className="flex-row gap-2 mt-4">
                <View className="flex-1 rounded-xl bg-white/10 p-2 items-center">
                  <Text className="text-white font-black">{myRankingQuery.data.stats.uploadedPdfs}</Text>
                  <Text className="text-blue-100 text-[10px] font-bold">Uploads</Text>
                </View>
                <View className="flex-1 rounded-xl bg-white/10 p-2 items-center">
                  <Text className="text-white font-black">{myRankingQuery.data.stats.ratingsGiven}</Text>
                  <Text className="text-blue-100 text-[10px] font-bold">Ratings</Text>
                </View>
                <View className="flex-1 rounded-xl bg-white/10 p-2 items-center">
                  <Text className="text-white font-black">{myRankingQuery.data.stats.requestedPapers}</Text>
                  <Text className="text-blue-100 text-[10px] font-bold">Papers</Text>
                </View>
              </View>
            </View>
          ) : null}

          {top3.length > 0 && (
            <View className="mb-6">
              <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC] mb-3">Top contributors</Text>
              <View className="flex-row gap-2">
                {top3.map((item, index) => (
                  <RankCard key={item.id} user={item} place={(index + 1) as 1 | 2 | 3} />
                ))}
              </View>
            </View>
          )}

          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Leaderboard</Text>
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs">{meta?.total ?? rankings.length} users</Text>
            </View>
            {rows.length === 0 ? (
              <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8 items-center">
                <Feather name="award" size={34} color={isDark ? "#475569" : "#94A3B8"} />
                <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm mt-3">No users on this page.</Text>
              </View>
            ) : (
              rows.map((item) => <RankingRow key={item.id} user={item} isMe={item.id === user?.id} />)
            )}
          </View>

          <View className="flex-row items-center justify-between mb-6">
            <TouchableOpacity
              className="px-4 py-2 rounded-xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
              disabled={page <= 1}
              onPress={() => setPage((value) => Math.max(1, value - 1))}
            >
              <Text className={`font-bold text-sm ${page <= 1 ? "text-muted-foreground dark:text-[#475569]" : "text-foreground dark:text-[#F8FAFC]"}`}>Previous</Text>
            </TouchableOpacity>
            <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs">
              Page {meta?.page ?? page} of {meta?.totalPages ?? 1}
            </Text>
            <TouchableOpacity
              className="px-4 py-2 rounded-xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332]"
              disabled={Boolean(meta && page >= meta.totalPages)}
              onPress={() => setPage((value) => value + 1)}
            >
              <Text className={`font-bold text-sm ${meta && page >= meta.totalPages ? "text-muted-foreground dark:text-[#475569]" : "text-foreground dark:text-[#F8FAFC]"}`}>Next</Text>
            </TouchableOpacity>
          </View>

          <View className="rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4">
            <Text className="text-foreground dark:text-[#F8FAFC] font-bold mb-3">How points are earned</Text>
            {pointGuide.map((item) => (
              <View key={item.label} className="flex-row items-center justify-between py-2 border-b border-border dark:border-[#26334A] last:border-b-0">
                <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm">{item.label}</Text>
                <Text className="text-[#06B6D4] text-sm font-bold">{item.value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
