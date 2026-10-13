import { useQuery } from "@tanstack/react-query";
import { papersApi } from "@/features/papers/api/papers.api";

export function useHomeFeaturedPapers() {
  const year = new Date().getFullYear();
  return useQuery({
    queryKey: ["home", "featured-papers", year],
    queryFn: ({ signal }) => papersApi.list({ pageSize: 24, yearFrom: year - 1, sort: "citations" }, signal),
    // Some imports contain a journal record in place of an article title.
    select: (data) => ({ ...data, papers: data.papers.filter((paper) => paper.title.trim().toLocaleLowerCase() !== paper.journalName?.trim().toLocaleLowerCase()).slice(0, 12) }),
    staleTime: 300_000,
  });
}
