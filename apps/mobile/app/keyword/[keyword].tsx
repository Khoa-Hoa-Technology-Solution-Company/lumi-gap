import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { usePapers } from "@/features/papers";

export default function KeywordPapersScreen() {
  const { keyword } = useLocalSearchParams<{ keyword: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const decodedKeyword = decodeURIComponent(keyword ?? "");
  const papersQuery = usePapers({ q: decodedKeyword, page: 1, pageSize: 20 });
  const papers = papersQuery.data?.papers ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Keyword</Text>
        <View className="w-8" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC]">{decodedKeyword}</Text>
        <Text className="mt-1 mb-5 text-sm text-muted-foreground dark:text-[#94A3B8]">Papers connected to this rising keyword.</Text>

        {papersQuery.isLoading ? (
          <View className="py-24"><ActivityIndicator color="#06B6D4" /></View>
        ) : papersQuery.isError ? (
          <View className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <Text className="text-center text-sm font-semibold text-red-500">Could not load papers.</Text>
          </View>
        ) : papers.length ? (
          papers.map((paper) => (
            <TouchableOpacity
              key={paper.id}
              className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4"
              activeOpacity={0.86}
              onPress={() => router.push(`/paper/${paper.id}` as any)}
            >
              <Text className="font-bold text-foreground dark:text-[#F8FAFC] leading-5" numberOfLines={2}>{paper.title}</Text>
              <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]" numberOfLines={1}>
                {paper.authors?.map((author) => author.displayName).join(", ") || "Unknown authors"}
              </Text>
              <View className="mt-3 flex-row items-center">
                <Ionicons name="calendar-outline" size={13} color="#06B6D4" />
                <Text className="ml-1 text-xs font-bold text-[#06B6D4]">{paper.publicationYear ?? "Unknown year"}</Text>
                <Text className="ml-2 text-xs text-muted-foreground dark:text-[#94A3B8]">{paper.citationCount ?? 0} citations</Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8">
            <Text className="text-center text-sm text-muted-foreground dark:text-[#94A3B8]">No papers found for this keyword.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
