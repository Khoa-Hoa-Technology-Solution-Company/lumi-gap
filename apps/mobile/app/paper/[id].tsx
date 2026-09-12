import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";

import { useBookmarkStatus, useCreateBookmark, useDeleteBookmark } from "@/features/bookmarks";
import { usePaper, usePaperReferences } from "@/features/papers";
import { useAddPaperToProject, useProjects } from "@/features/projects";
import { useDeleteQualityRating, useEvaluateQuality, useQualityView, useRateQuality } from "@/features/quality";
import { useAuthStore } from "@/stores/auth-store";

export default function PaperDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [activeTab, setActiveTab] = useState<"abstract" | "topics" | "references">("abstract");
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const paperQuery = usePaper(id);
  const referencesQuery = usePaperReferences(id, activeTab === "references");
  const statusQuery = useBookmarkStatus("paper", id);
  const projectsQuery = useProjects();
  const addPaperToProject = useAddPaperToProject();
  const qualityQuery = useQualityView("paper", id);
  const evaluateQuality = useEvaluateQuality();
  const rateQuality = useRateQuality();
  const deleteQualityRating = useDeleteQualityRating("paper", id);
  const currentUser = useAuthStore((s) => s.user);
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const paper = paperQuery.data;
  const isBookmarked = statusQuery.data?.bookmarked;

  useEffect(() => {
    if (!qualityQuery.data?.myRating) return;
    setRating(qualityQuery.data.myRating.stars);
    setReviewComment(qualityQuery.data.myRating.comment ?? "");
  }, [qualityQuery.data?.myRating]);

  const toggleBookmark = () => {
    if (!id) return;
    if (isBookmarked && statusQuery.data?.bookmarkId) {
      deleteBookmark.mutate(statusQuery.data.bookmarkId);
      return;
    }

    createBookmark.mutate(
      { targetKind: "paper", targetId: id },
      {
        onError: (error: any) => {
          if (error?.response?.status !== 409) Alert.alert("Bookmark failed", error?.response?.data?.error?.message ?? "Please try again.");
        },
      },
    );
  };

  const openFullText = () => {
    if (paper?.openAccessUrl) Linking.openURL(paper.openAccessUrl);
  };

  const addToProject = (projectId: string) => {
    if (!id) return;
    addPaperToProject.mutate(
      { projectId, paperId: id },
      {
        onSuccess: () => {
          setProjectPickerOpen(false);
          Alert.alert("Added", "Paper added to project.");
        },
        onError: (error: any) => Alert.alert("Add failed", error?.response?.data?.error?.message ?? "Please try again."),
      },
    );
  };

  const submitRating = () => {
    if (!id || rating < 1) {
      Alert.alert("Choose a rating", "Please select 1-5 stars before submitting.");
      return;
    }
    rateQuality.mutate(
      { targetKind: "paper", targetId: id, stars: rating, comment: reviewComment.trim() || undefined },
      {
        onError: (error: any) => Alert.alert("Rating failed", error?.response?.data?.error?.message ?? "Please try again."),
      },
    );
  };

  const runAiEvaluation = () => {
    if (!id) return;
    evaluateQuality.mutate(
      { targetKind: "paper", targetId: id },
      {
        onError: (error: any) => Alert.alert("AI evaluation failed", error?.response?.data?.error?.message ?? "Please try again later."),
      },
    );
  };

  const deleteReview = (ratingId: string) => {
    Alert.alert("Delete review", "Remove your review for this paper?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteQualityRating.mutate(ratingId, {
            onSuccess: () => {
              setRating(0);
              setReviewComment("");
            },
            onError: (error: any) => Alert.alert("Delete failed", error?.response?.data?.error?.message ?? "Please try again."),
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-[#0F1B2D]" edges={["top", "bottom"]}>
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-border dark:border-[#26334A]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Feather name="chevron-left" size={24} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Paper Detail</Text>
        <TouchableOpacity className="p-2 -mr-2">
          <Feather name="share" size={19} color={isDark ? "#94A3B8" : "#64748B"} />
        </TouchableOpacity>
      </View>

      {paperQuery.isLoading ? (
        <View className="flex-1 justify-center items-center"><ActivityIndicator color="#06B6D4" /></View>
      ) : !paper ? (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-center text-foreground dark:text-[#F8FAFC]">Paper not found</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: paper.openAccessUrl ? 92 : 24 }}>
          <Text className="text-xl font-bold text-foreground dark:text-[#F8FAFC] leading-6">{paper.title}</Text>

          <View className="flex-row flex-wrap mt-4 gap-2">
            {paper.authors?.slice(0, 3).map((author, index) => (
              <View key={`${author.displayName}-${index}`} className="bg-card dark:bg-[#111C2E] border border-border dark:border-[#26334A] flex-row items-center px-3 py-1.5 rounded-full">
                <Feather name="user" size={12} color="#06B6D4" />
                <Text className="text-foreground dark:text-[#F8FAFC] font-semibold text-xs ml-1.5">{author.displayName}</Text>
              </View>
            ))}
          </View>

          <Text className="text-[#06B6D4] text-xs font-bold mt-4">
            {paper.journalName ? `${paper.journalName} · ` : ""}{paper.publicationYear}
          </Text>

          <View className="flex-row flex-wrap mt-4 mb-5 gap-2">
            <View className="bg-[#1E1B4B] px-2 py-1 rounded-md">
              <Text className="text-[#A5B4FC] text-[10px] font-bold">{paper.citationCount || 0} Citations</Text>
            </View>
            {paper.isAiAnalyzable && (
              <View className="bg-[#064E3B] flex-row items-center px-2 py-1 rounded-md">
                <Ionicons name="sparkles" size={10} color="#34D399" />
                <Text className="text-[#34D399] text-[10px] font-bold ml-1">AI Analyzable</Text>
              </View>
            )}
            {paper.openAccessUrl && (
              <View className="bg-[#451A03] flex-row items-center px-2 py-1 rounded-md">
                <Feather name="unlock" size={10} color="#FBBF24" />
                <Text className="text-[#FBBF24] text-[10px] font-bold ml-1">Open Access</Text>
              </View>
            )}
          </View>

          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl flex-row justify-around py-4 mb-5">
            <TouchableOpacity className="items-center" onPress={toggleBookmark} disabled={createBookmark.isPending || deleteBookmark.isPending}>
              <Feather name="bookmark" size={19} color={isBookmarked ? "#06B6D4" : isDark ? "#94A3B8" : "#64748B"} />
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs font-semibold mt-1.5">{isBookmarked ? "Saved" : "Save"}</Text>
            </TouchableOpacity>
            <TouchableOpacity className="items-center">
              <Feather name="user-plus" size={19} color={isDark ? "#94A3B8" : "#64748B"} />
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs font-semibold mt-1.5">Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity className="items-center" onPress={() => setProjectPickerOpen(true)}>
              <Feather name="plus-square" size={19} color={isDark ? "#94A3B8" : "#64748B"} />
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs font-semibold mt-1.5">Add</Text>
            </TouchableOpacity>
            <TouchableOpacity className="items-center" onPress={openFullText} disabled={!paper.openAccessUrl}>
              <Feather name="file-text" size={19} color={paper.openAccessUrl ? "#94A3B8" : "#475569"} />
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs font-semibold mt-1.5">PDF</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-[#082F49] border border-[#06B6D4] rounded-2xl p-4 mb-5 flex-row">
            <View className="bg-[#0E7490] w-10 h-10 rounded-xl items-center justify-center mr-3">
              <Ionicons name="sparkles" size={20} color="#A5F3FC" />
            </View>
            <View className="flex-1">
              <Text className="text-[#F8FAFC] font-bold mb-1">AI Analysis: {(paper.dataQualityScore || 0).toFixed(2)}</Text>
              <Text className="text-[#CFFAFE] text-xs leading-5">
                Strong metadata quality and citation context make this paper suitable for semantic search, trend analysis, and report grounding.
              </Text>
            </View>
          </View>

          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl p-4 mb-5">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Ionicons name="sparkles" size={18} color="#06B6D4" />
                <Text className="ml-2 text-base font-bold text-foreground dark:text-[#F8FAFC]">AI quality review</Text>
              </View>
              <TouchableOpacity
                className={`rounded-full px-3 py-1.5 ${evaluateQuality.isPending ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`}
                onPress={runAiEvaluation}
                disabled={evaluateQuality.isPending}
              >
                <Text className="text-xs font-bold text-white">{qualityQuery.data?.evaluation ? "Refresh" : "Evaluate"}</Text>
              </TouchableOpacity>
            </View>

            {qualityQuery.isLoading ? (
              <ActivityIndicator color="#06B6D4" />
            ) : qualityQuery.data?.evaluation ? (
              <View>
                <View className="flex-row gap-2 mb-3">
                  {[
                    ["Overall", qualityQuery.data.evaluation.overall],
                    ["Relevant", qualityQuery.data.evaluation.relevance],
                    ["Grounded", qualityQuery.data.evaluation.groundedness],
                  ].map(([label, value]) => (
                    <View key={String(label)} className="flex-1 rounded-xl bg-cyan-50 dark:bg-[#083344] p-2">
                      <Text className="text-[10px] font-bold text-[#0891B2] dark:text-[#67E8F9]">{label}</Text>
                      <Text className="mt-1 text-lg font-black text-foreground dark:text-[#F8FAFC]">{Number(value).toFixed(1)}</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-sm leading-5 text-muted-foreground dark:text-[#CBD5E1]">{qualityQuery.data.evaluation.rationale}</Text>
              </View>
            ) : (
              <Text className="text-sm leading-5 text-muted-foreground dark:text-[#94A3B8]">
                Run AI evaluation to score relevance, groundedness, and completeness from this paper's metadata.
              </Text>
            )}
          </View>

          <View className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-2xl p-4 mb-5">
            <Text className="text-base font-bold text-foreground dark:text-[#F8FAFC] mb-1">Community rating</Text>
            <Text className="text-xs text-muted-foreground dark:text-[#94A3B8] mb-3">
              {qualityQuery.data?.ratingSummary.count ?? 0} ratings · average {(qualityQuery.data?.ratingSummary.avg ?? 0).toFixed(1)}
            </Text>

            <View className="flex-row mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} className="mr-2 p-1" onPress={() => setRating(star)}>
                  <Ionicons name={star <= rating ? "star" : "star-outline"} size={26} color="#F59E0B" />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="min-h-[88px] rounded-xl border border-border dark:border-[#26334A] px-3 py-3 text-foreground dark:text-[#F8FAFC]"
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Write a short review..."
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              className={`mt-3 rounded-xl py-3 items-center ${rateQuality.isPending ? "bg-[#1D4ED8]/60" : "bg-[#1D4ED8]"}`}
              onPress={submitRating}
              disabled={rateQuality.isPending}
            >
              {rateQuality.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Submit review</Text>}
            </TouchableOpacity>

            <View className="mt-4 gap-3">
              {(qualityQuery.data?.allRatings ?? []).map((item) => {
                const isMine = item.user?.id === currentUser?.id;
                return (
                  <View key={item.id} className="border-t border-border dark:border-[#26334A] pt-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-foreground dark:text-[#F8FAFC]">{item.user?.fullName ?? "Anonymous"}</Text>
                      <View className="flex-row items-center">
                        <Ionicons name="star" size={13} color="#F59E0B" />
                        <Text className="ml-1 text-xs font-bold text-muted-foreground dark:text-[#94A3B8]">{item.stars}</Text>
                        {isMine && (
                          <TouchableOpacity className="ml-3" onPress={() => deleteReview(item.id)} disabled={deleteQualityRating.isPending}>
                            <Feather name="trash-2" size={15} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {!!item.comment && (
                      <Text className="mt-1 text-sm leading-5 text-muted-foreground dark:text-[#CBD5E1]">{item.comment}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="flex-row border-b border-border dark:border-[#26334A] mb-4">
            {(["abstract", "topics", "references"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                className={`pb-2 px-2 mr-4 ${activeTab === tab ? "border-b-2 border-[#06B6D4]" : ""}`}
                onPress={() => setActiveTab(tab)}
              >
                <Text className={`text-sm capitalize ${activeTab === tab ? "text-[#06B6D4] font-bold" : "text-muted-foreground dark:text-[#94A3B8]"}`}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "abstract" ? (
            <Text className="text-foreground/80 dark:text-[#CBD5E1] text-sm leading-6">{paper.abstractText || "No abstract available for this paper."}</Text>
          ) : activeTab === "topics" ? (
            <View className="flex-row flex-wrap gap-2">
              {paper.topics?.length ? (
                paper.topics.map((topic, index) => (
                  <View key={`${topic.topicName}-${index}`} className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] px-3 py-1.5 rounded-full">
                    <Text className="text-foreground dark:text-[#F8FAFC] text-xs">{topic.topicName}</Text>
                  </View>
                ))
              ) : (
                <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm italic">No topics available.</Text>
              )}
            </View>
          ) : referencesQuery.isLoading ? (
            <View className="py-6 items-center">
              <ActivityIndicator color="#06B6D4" />
            </View>
          ) : referencesQuery.data?.references.length ? (
            <View className="gap-3">
              <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs">
                Showing {referencesQuery.data.inCorpus} of {referencesQuery.data.totalReferenced} cited works found in this library.
              </Text>
              {referencesQuery.data.references.map((reference) => {
                const authors = reference.authors?.map((author) => author.displayName).filter(Boolean).slice(0, 3).join(", ");
                return (
                  <TouchableOpacity
                    key={reference.id}
                    className="bg-card dark:bg-[#1A2332] border border-border dark:border-[#26334A] rounded-xl p-3"
                    onPress={() => router.push(`/paper/${reference.id}` as any)}
                  >
                    <Text className="text-foreground dark:text-[#F8FAFC] font-bold text-sm leading-5" numberOfLines={2}>
                      {reference.title}
                    </Text>
                    {!!authors && (
                      <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs mt-1" numberOfLines={1}>
                        {authors}
                      </Text>
                    )}
                    <View className="flex-row items-center mt-2">
                      <Text className="text-[#06B6D4] text-xs font-bold">{reference.publicationYear || "Unknown year"}</Text>
                      {!!reference.doi && (
                        <Text className="text-muted-foreground dark:text-[#94A3B8] text-xs ml-2" numberOfLines={1}>
                          DOI: {reference.doi}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text className="text-muted-foreground dark:text-[#94A3B8] text-sm">
              No in-library references found yet. {referencesQuery.data?.totalReferenced ? `${referencesQuery.data.totalReferenced} cited works exist, but none are in this library.` : "Citation graph data is not available for this paper."}
            </Text>
          )}
        </ScrollView>
      )}

      {paper?.openAccessUrl && (
        <View className="absolute bottom-0 left-0 right-0 p-4 border-t border-border dark:border-[#26334A] bg-background dark:bg-[#0F1B2D]">
          <TouchableOpacity className="bg-[#06B6D4] rounded-xl py-3 flex-row justify-center items-center" onPress={openFullText}>
            <Feather name="external-link" size={16} color="#0F1B2D" />
            <Text className="text-[#0F1B2D] font-bold ml-2">Open full text</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={projectPickerOpen} transparent animationType="fade" onRequestClose={() => setProjectPickerOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setProjectPickerOpen(false)}>
          <View className="rounded-t-3xl bg-background dark:bg-[#0F1B2D] border-t border-border dark:border-[#26334A] p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground dark:text-[#F8FAFC]">Add to project</Text>
              <TouchableOpacity className="p-2" onPress={() => setProjectPickerOpen(false)}>
                <Feather name="x" size={20} color={isDark ? "#94A3B8" : "#64748B"} />
              </TouchableOpacity>
            </View>
            {projectsQuery.isLoading ? (
              <View className="py-8"><ActivityIndicator color="#06B6D4" /></View>
            ) : projectsQuery.data?.length ? (
              projectsQuery.data.map((project) => (
                <TouchableOpacity
                  key={project._id}
                  className="flex-row items-center py-4 border-b border-border dark:border-[#26334A]"
                  onPress={() => addToProject(project._id)}
                  disabled={addPaperToProject.isPending}
                >
                  <View className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-[#083344] items-center justify-center mr-3">
                    <Feather name="folder" size={17} color="#06B6D4" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-foreground dark:text-[#F8FAFC]" numberOfLines={1}>{project.title}</Text>
                    <Text className="text-xs text-muted-foreground dark:text-[#94A3B8]">{project.papers.length} papers</Text>
                  </View>
                  <Feather name="plus" size={18} color="#06B6D4" />
                </TouchableOpacity>
              ))
            ) : (
              <TouchableOpacity
                className="rounded-xl border border-dashed border-border dark:border-[#26334A] p-5 items-center"
                onPress={() => {
                  setProjectPickerOpen(false);
                  router.push("/projects" as any);
                }}
              >
                <Text className="text-sm font-semibold text-foreground dark:text-[#F8FAFC]">Create your first project</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
