import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { useCreateProject, useProjects } from "@/features/projects";

export default function ProjectsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 1 || cleanTitle.length > 100) {
      Alert.alert("Check project title", "Project title must be 1-100 characters.");
      return;
    }
    createProject.mutate(
      { title: cleanTitle, description: description.trim() || undefined },
      {
        onSuccess: (project) => {
          setTitle("");
          setDescription("");
          router.push(`/project/${project._id}` as any);
        },
        onError: (error: any) => Alert.alert("Create failed", error?.response?.data?.error?.message ?? "Please try again."),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Projects</Text>
        <View className="w-8" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4 mb-5">
          <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC] mb-3">New project</Text>
          <TextInput
            className="h-12 rounded-xl border border-border dark:border-[#26334A] px-4 text-foreground dark:text-[#F8FAFC]"
            value={title}
            onChangeText={setTitle}
            placeholder="Project title"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
          />
          <TextInput
            className="mt-3 min-h-[84px] rounded-xl border border-border dark:border-[#26334A] px-4 py-3 text-foreground dark:text-[#F8FAFC]"
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            className={`mt-3 rounded-xl py-3 items-center ${createProject.isPending ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`}
            onPress={submit}
            disabled={createProject.isPending}
          >
            {createProject.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white font-bold">Create project</Text>}
          </TouchableOpacity>
        </View>

        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC] mb-3">Your projects</Text>
        {projectsQuery.isLoading ? (
          <View className="py-24"><ActivityIndicator color="#06B6D4" /></View>
        ) : projectsQuery.isError ? (
          <View className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <Text className="text-center text-sm font-semibold text-red-500">Could not load projects.</Text>
          </View>
        ) : projectsQuery.data?.length ? (
          projectsQuery.data.map((project) => (
            <TouchableOpacity
              key={project._id}
              className="mb-3 rounded-2xl border border-border dark:border-[#26334A] bg-card dark:bg-[#1A2332] p-4"
              activeOpacity={0.86}
              onPress={() => router.push(`/project/${project._id}` as any)}
            >
              <View className="flex-row items-start">
                <View className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-[#083344] items-center justify-center mr-3">
                  <Feather name="folder" size={18} color="#06B6D4" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-foreground dark:text-[#F8FAFC]" numberOfLines={2}>{project.title}</Text>
                  <Text className="mt-1 text-xs text-muted-foreground dark:text-[#94A3B8]" numberOfLines={2}>
                    {project.description || "No description"}
                  </Text>
                  <Text className="mt-2 text-[11px] font-semibold text-[#06B6D4]">
                    {project.papers.length} papers · {project.members.length} members
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={isDark ? "#64748B" : "#94A3B8"} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View className="rounded-2xl border border-dashed border-border dark:border-[#26334A] p-8">
            <Text className="text-center text-sm text-muted-foreground dark:text-[#94A3B8]">No projects yet.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
