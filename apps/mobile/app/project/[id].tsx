import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { useProject, useProjectChat, useSendProjectChat, type ProjectMemberView, type ProjectPaperView } from "@/features/projects";

function paperIdOf(paper: ProjectPaperView) {
  return typeof paper.targetId === "string" ? paper.targetId : paper.targetId._id ?? paper.targetId.id ?? "";
}

function paperTitleOf(paper: ProjectPaperView) {
  return typeof paper.targetId === "string" ? "Paper" : paper.targetId.title ?? "Paper";
}

function memberNameOf(member: ProjectMemberView) {
  return typeof member.targetId === "string" ? member.targetId : member.targetId.fullName ?? member.targetId.email ?? "Member";
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const projectQuery = useProject(id);
  const chatQuery = useProjectChat(id);
  const sendChat = useSendProjectChat();
  const [message, setMessage] = useState("");

  const project = projectQuery.data;

  const submitMessage = () => {
    const clean = message.trim();
    if (!id || clean.length === 0) return;
    sendChat.mutate(
      { projectId: id, message: clean },
      {
        onSuccess: () => setMessage(""),
        onError: (error: any) => Alert.alert("Chat failed", error?.response?.data?.error?.message ?? "Please try again."),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Project</Text>
        <View className="w-8" />
      </View>

      {projectQuery.isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#06B6D4" /></View>
      ) : !project ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-foreground dark:text-[#F8FAFC]">Project not found</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text className="text-2xl font-bold text-foreground dark:text-[#F8FAFC]">{project.title}</Text>
          <Text className="mt-2 text-sm text-muted-foreground dark:text-[#94A3B8] leading-5">{project.description || "No description"}</Text>

          <View className="my-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3">
              <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Papers</Text>
              <Text className="mt-1 text-xl font-bold text-foreground dark:text-[#F8FAFC]">{project.papers.length}</Text>
            </View>
            <View className="flex-1 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3">
              <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">Members</Text>
              <Text className="mt-1 text-xl font-bold text-foreground dark:text-[#F8FAFC]">{project.members.length}</Text>
            </View>
          </View>

          <Text className="mb-3 text-lg font-bold text-foreground dark:text-[#F8FAFC]">Papers</Text>
          {project.papers.length ? (
            project.papers.map((paper) => {
              const paperId = paperIdOf(paper);
              return (
                <TouchableOpacity
                  key={paperId || paperTitleOf(paper)}
                  className="mb-3 rounded-xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-3"
                  onPress={() => paperId && router.push(`/paper/${paperId}` as any)}
                  activeOpacity={0.86}
                >
                  <Text className="font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{paperTitleOf(paper)}</Text>
                  {typeof paper.targetId !== "string" && (
                    <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]">
                      {paper.targetId.publicationYear ?? "Unknown year"}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text className="mb-5 text-sm text-muted-foreground dark:text-[#94A3B8]">No papers in this project yet.</Text>
          )}

          <Text className="mb-3 text-lg font-bold text-foreground dark:text-[#F8FAFC]">Members</Text>
          <View className="mb-5 flex-row flex-wrap gap-2">
            {project.members.map((member, index) => (
              <View key={`${member.role}-${index}`} className="rounded-full border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] px-3 py-2">
                <Text className="text-xs font-semibold text-foreground dark:text-[#F8FAFC]">{memberNameOf(member)} · {member.role}</Text>
              </View>
            ))}
          </View>

          <View className="rounded-2xl border border-[#06B6D4] bg-cyan-50 dark:bg-[#082F49] p-4">
            <View className="flex-row items-center mb-3">
              <Ionicons name="sparkles" size={18} color="#06B6D4" />
              <Text className="ml-2 text-base font-bold text-foreground dark:text-[#F8FAFC]">Project AI chat</Text>
            </View>
            {chatQuery.isLoading ? (
              <ActivityIndicator color="#06B6D4" />
            ) : (
              <View className="gap-2">
                {(chatQuery.data ?? []).slice(-6).map((item) => (
                  <View key={item.id} className={`rounded-xl p-3 ${item.role === "user" ? "bg-[#1D4ED8]" : "bg-card dark:bg-[#1A2332]"}`}>
                    <Text className={`text-xs font-bold mb-1 ${item.role === "user" ? "text-blue-100" : "text-[#06B6D4]"}`}>
                      {item.role === "user" ? "You" : "AI"}
                    </Text>
                    <Text className={`${item.role === "user" ? "text-white" : "text-foreground dark:text-[#F8FAFC]"} text-sm leading-5`}>
                      {item.content}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View className="mt-3 flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-xl border border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D] px-3 py-2 text-foreground dark:text-[#F8FAFC]"
                value={message}
                onChangeText={setMessage}
                placeholder="Ask about this project..."
                placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              />
              <TouchableOpacity
                className={`h-11 w-11 rounded-xl items-center justify-center ${sendChat.isPending ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`}
                onPress={submitMessage}
                disabled={sendChat.isPending}
              >
                {sendChat.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="send" color="#FFFFFF" size={16} />}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
