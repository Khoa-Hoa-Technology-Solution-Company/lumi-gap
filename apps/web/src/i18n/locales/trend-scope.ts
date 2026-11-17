// Information Technology scope of the trends page: no domain or field filter, only subfield and topic.
// English is the key; Vietnamese is the translation.
export const trendScopeViStrings = {
  "This page covers the Information Technology scope. Choose a subfield or a topic to narrow the list.":
    "Trang này nằm trong phạm vi Công nghệ thông tin. Hãy chọn một lĩnh vực con hoặc một chủ đề để thu hẹp danh sách.",
  "All subfields": "Tất cả lĩnh vực con",
  "All topics": "Tất cả chủ đề",
  "No subfield or topic is selected, so the lists show the whole Information Technology scope.":
    "Chưa chọn lĩnh vực con hay chủ đề nào, nên các danh sách hiển thị toàn bộ phạm vi Công nghệ thông tin.",
  "Subfield and topic names follow the OpenAlex taxonomy.":
    "Tên lĩnh vực con và chủ đề theo phân loại của OpenAlex.",
  "Scope: Information Technology scope": "Phạm vi: phạm vi Công nghệ thông tin",
  "Start with top scoped topics, or search all topic candidates inside the current Data Scope. Search checks topic names and subfield names.":
    "Bắt đầu với các chủ đề hàng đầu trong phạm vi, hoặc tìm trong mọi chủ đề ứng viên của Phạm vi dữ liệu hiện tại. Tìm kiếm khớp với tên chủ đề và tên lĩnh vực con.",
} as const;

export const trendScopeStrings = Object.fromEntries(Object.keys(trendScopeViStrings).map((key) => [key, key])) as Record<keyof typeof trendScopeViStrings, string>;
