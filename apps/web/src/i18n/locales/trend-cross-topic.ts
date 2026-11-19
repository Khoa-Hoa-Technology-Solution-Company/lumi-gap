// Topics compared with each other (features/trends/components/cross-topic-section.tsx, size-band-filter.tsx).
// English is the key; Vietnamese is the translation.
export const trendCrossTopicViStrings = {
  "Topics compared with each other": "Các chủ đề so sánh với nhau",
  "This compares the {{count}} topics of the whole Information Technology scope, whatever the filters above. It is descriptive: it never changes a topic's verdict.":
    "Phần này so sánh {{count}} chủ đề của toàn bộ phạm vi Công nghệ thông tin, bất kể các bộ lọc phía trên. Đây chỉ là mô tả: nó không bao giờ thay đổi kết luận của một chủ đề.",
  "r is the relative change of a topic's share per year. Topics are grouped by size (tertiles of total papers); a topic is anomalous when its r lies outside the Tukey fences of its group, and clear when it is rising above the upper fence or declining below the lower fence.":
    "r là thay đổi tương đối mỗi năm của thị phần một chủ đề. Các chủ đề được chia theo nhóm quy mô (tam phân vị của tổng số bài); một chủ đề là bất thường khi r nằm ngoài cận Tukey của nhóm, và rõ ràng khi đang tăng vượt cận trên hoặc đang giảm dưới cận dưới.",
  "{{anomalous}} anomalous topics, {{clear}} clear.": "{{anomalous}} chủ đề bất thường, {{clear}} chủ đề rõ ràng.",
  "Descriptive statistics of r": "Thống kê mô tả của r",
  "Percent per year. Fences: Q1 − 1.5·IQR and Q3 + 1.5·IQR within each size group (Tukey 1977).":
    "Phần trăm mỗi năm. Cận: Q1 − 1,5·IQR và Q3 + 1,5·IQR trong từng nhóm quy mô (Tukey 1977).",
  "Distribution of r": "Phân bố của r",
  "Bars are coloured by verdict. The range is clipped at the 2nd and 98th percentile; the end bars count everything beyond.":
    "Các cột tô màu theo kết luận. Khoảng giá trị được cắt ở bách phân vị thứ 2 và 98; hai cột ở đầu mút đếm mọi giá trị nằm ngoài.",
  "r by size group": "r theo nhóm quy mô",
  "Box: Q1, median, Q3. Whiskers: last value inside the fences. Dots: anomalous topics. Log-like axis, so one extreme topic does not flatten the rest.":
    "Hộp: Q1, trung vị, Q3. Râu: giá trị xa nhất còn nằm trong cận. Chấm: chủ đề bất thường. Trục dạng log, để một chủ đề cực đoan không làm phẳng phần còn lại.",
  "Size against change": "Quy mô so với mức thay đổi",
  "x: total papers in the window (log scale). y: r on a symmetric log axis, so one extreme topic does not flatten the rest. Ringed dots are clear topics; dashed lines are the size group cutoffs.":
    "x: tổng số bài trong khoảng thời gian (thang log). y: r trên trục log đối xứng, để một chủ đề cực đoan không làm phẳng phần còn lại. Chấm có vòng là chủ đề rõ ràng; đường nét đứt là ngưỡng giữa các nhóm quy mô.",
  "Clear topics: rising": "Chủ đề rõ ràng: đang tăng",
  "Clear topics: declining": "Chủ đề rõ ràng: đang giảm",
  "Topics (n)": "Số chủ đề (n)",
  "Tukey fences": "Cận Tukey",
  "Small topics": "Chủ đề nhỏ",
  "Medium topics": "Chủ đề vừa",
  "Large topics": "Chủ đề lớn",
  "Small: ≤ {{max}} papers in the window": "Nhỏ: ≤ {{max}} bài trong khoảng thời gian",
  "Medium: {{min}} to {{max}} papers in the window": "Vừa: từ {{min}} đến {{max}} bài trong khoảng thời gian",
  "Large: > {{min}} papers in the window": "Lớn: > {{min}} bài trong khoảng thời gian",
  "r in {{range}} % per year": "r trong khoảng {{range}} % mỗi năm",
  "Box plots of r per size group": "Biểu đồ hộp của r theo nhóm quy mô",
  "per year": "mỗi năm",
  "Size group": "Nhóm quy mô",
  "Clear change": "Rõ ràng",
  "Application topic": "Chủ đề ứng dụng",
  "Layer 3 of the IT scope: an application topic from another field, chosen by the project team":
    "Lớp 3 của phạm vi CNTT: chủ đề ứng dụng thuộc lĩnh vực khác, do nhóm dự án chọn",
  "Anomalous": "Bất thường",
  "Filter topics by size group": "Lọc chủ đề theo nhóm quy mô",
  "Size group: tertiles of the topics' total papers in the window, over the whole scope.":
    "Nhóm quy mô: tam phân vị của tổng số bài của các chủ đề trong khoảng thời gian, trên toàn phạm vi.",
  "Its change is anomalous for topics of its size (Tukey fences)": "Mức thay đổi của chủ đề này bất thường so với các chủ đề cùng quy mô (cận Tukey)",
} as const;

export const trendCrossTopicStrings = Object.fromEntries(Object.keys(trendCrossTopicViStrings).map((key) => [key, key])) as Record<keyof typeof trendCrossTopicViStrings, string>;
