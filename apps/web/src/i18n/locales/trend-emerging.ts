// Emerging signals tab (features/trends/components/emerging-tab.tsx).
// English is the key; Vietnamese is the translation.
export const trendEmergingViStrings = {
  "Emerging signals": "Tín hiệu mới nổi",
  "Early signal, not a forecast": "Tín hiệu sớm, không phải dự báo",
  "Emerging signals are keywords that are new and growing fast. They are counted on keywords and are separate from the six topic verdicts: they never change a verdict and do not predict what will happen next.":
    "Tín hiệu mới nổi là những từ khoá vừa xuất hiện và đang tăng nhanh. Chúng được đếm trên từ khoá, tách biệt với sáu kết luận về chủ đề: không bao giờ thay đổi một kết luận và không dự đoán điều sẽ xảy ra tiếp theo.",
  "Could not load the emerging signals. Please try again.": "Không tải được các tín hiệu mới nổi. Vui lòng thử lại.",
  "Retry": "Thử lại",
  "Counting keywords in OpenAlex. The first request can take about 15 seconds; later ones are faster.":
    "Đang đếm từ khoá trong OpenAlex. Lần yêu cầu đầu tiên có thể mất khoảng 15 giây; các lần sau nhanh hơn.",
  "Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.":
    "Tín hiệu mới nổi cần số đếm từ khoá của OpenAlex; kho dữ liệu cục bộ không tính được.",
  "No keyword meets every criterion in this scope. Try a wider scope.": "Không có từ khoá nào đáp ứng mọi tiêu chí trong phạm vi này. Hãy thử phạm vi rộng hơn.",
  "How a signal is chosen": "Cách chọn một tín hiệu",
  "Earlier period": "Giai đoạn trước",
  "Recent period": "Giai đoạn gần",
  "At least {{min}} papers in the recent period.": "Có ít nhất {{min}} bài trong giai đoạn gần.",
  "Novelty: at least {{share}} of the keyword's papers of the last {{years}} years fall in the recent period.":
    "Độ mới: ít nhất {{share}} số bài mang từ khoá trong {{years}} năm gần nhất nằm ở giai đoạn gần.",
  "Its share rises significantly from the earlier to the recent period (log odds ratio, z > 0 and Benjamini–Hochberg q < {{alpha}}).":
    "Thị phần của từ khoá tăng có ý nghĩa từ giai đoạn trước sang giai đoạn gần (log tỉ số chênh, z > 0 và q Benjamini–Hochberg < {{alpha}}).",
  "{{tested}} keywords tested, {{found}} signals found.": "Đã kiểm định {{tested}} từ khoá, tìm thấy {{found}} tín hiệu.",
  "Showing the {{shown}} with the largest rise.": "Hiển thị {{shown}} tín hiệu tăng mạnh nhất.",
  "Only the most frequent keywords of the recent period are tested, so a rare new keyword can be missed.":
    "Chỉ các từ khoá phổ biến nhất của giai đoạn gần được kiểm định, nên một từ khoá mới nhưng hiếm có thể bị bỏ sót.",
  "Emerging keywords": "Từ khoá mới nổi",
  "Ordered by the log odds ratio (size of the rise), not by z, so a keyword with many papers does not outrank a sharper rise. The lighter dashed last bar is {{year}}, which is still running.":
    "Sắp theo log tỉ số chênh (độ lớn của mức tăng), không theo z, để từ khoá có nhiều bài không lấn át từ khoá tăng sắc hơn. Cột cuối nhạt, nét đứt là năm {{year}}, năm chưa kết thúc.",
  "Papers, earlier → recent": "Số bài, trước → gần",
  "Novelty": "Độ mới",
  "Log odds ratio": "Log tỉ số chênh",
  "Papers per year": "Số bài mỗi năm",
  "Search papers for {{keyword}}": "Tìm bài báo về {{keyword}}",
  "incomplete": "chưa đủ năm",
} as const;

export const trendEmergingStrings = Object.fromEntries(Object.keys(trendEmergingViStrings).map((key) => [key, key])) as Record<keyof typeof trendEmergingViStrings, string>;
