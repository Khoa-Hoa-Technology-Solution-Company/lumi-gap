import { useQuery } from "@tanstack/react-query";
import { compareApi } from "../api/compare.api";

export function useComparePapers(paperIds: string[]) {
  // Sắp xếp các IDs để đảm bảo queryKey là duy nhất bất kể thứ tự chọn
  const sortedIds = [...paperIds].sort();

  return useQuery({
    // queryKey dùng sortedIds để dedupe theo TẬP (thứ tự chọn không đổi cache).
    queryKey: ["compare", sortedIds],
    // Nhưng GỬI theo thứ tự gốc (bài hiện tại đứng đầu) để cột "(Hiện tại)" đúng —
    // BE tự sort id khi tạo cache key nên vẫn trúng cache. (xem compare.prompt.ts)
    queryFn: () => compareApi.compare(paperIds),
    enabled: sortedIds.length >= 2 && sortedIds.length <= 4,
    staleTime: 5 * 60 * 1000, // Cache dữ liệu trong 5 phút
  });
}
