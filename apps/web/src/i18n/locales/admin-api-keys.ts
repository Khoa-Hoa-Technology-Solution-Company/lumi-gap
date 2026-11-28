/**
 * Admin → API Keys: the Gemini and OpenAlex key pool with automatic rotation.
 * Vietnamese is translated; every other locale falls back to the English source text
 * (they all spread `en` first), so only `en` and `vi` import this file.
 */
export const adminApiKeysVi = {
  "API Keys": "API Keys",
  "Platform Gemini and OpenAlex keys. Calls rotate to the next key automatically when one is rejected.": "Key Gemini và OpenAlex của nền tảng. Khi một key bị từ chối, hệ thống tự chuyển sang key tiếp theo.",
  "How key rotation works": "Cách xoay vòng key",
  "Calls use the ready key with the lowest priority number. The env key (.env) is the last fallback.": "Mỗi lệnh gọi dùng key sẵn sàng có số ưu tiên nhỏ nhất. Key trong .env là phương án dự phòng cuối cùng.",
  "When the provider rejects a key (invalid, billing, daily quota), the call is repeated with the next key at once and the rejected key rests: 1 hour for Gemini, until the next UTC day for an OpenAlex daily budget.": "Khi nhà cung cấp từ chối một key (sai key, lỗi thanh toán, hết quota ngày), lệnh gọi được thử lại ngay với key kế tiếp và key bị từ chối được cho nghỉ: 1 giờ với Gemini, tới ngày UTC kế tiếp nếu OpenAlex hết hạn mức ngày.",
  "A rejected key stays out until you test it again or replace it. Keys are stored encrypted and never shown again.": "Key bị đánh dấu sai sẽ không được dùng cho tới khi bạn kiểm tra lại hoặc thay key mới. Key được mã hoá khi lưu và không bao giờ hiển thị lại.",
  "Use extra keys as backups for outages, not to multiply free quota: spreading one workload over many free projects can break the provider's terms.": "Hãy dùng key phụ để dự phòng khi có sự cố, không phải để nhân quota miễn phí: chia một khối lượng công việc cho nhiều project miễn phí có thể vi phạm điều khoản của nhà cung cấp.",
  "Gemini (Google AI Studio)": "Gemini (Google AI Studio)",
  "Embeddings, paper analysis, reports, research gaps and chat for users without a personal AI connection.": "Embedding, phân tích bài báo, báo cáo, khoảng trống nghiên cứu và chat cho người dùng chưa có kết nối AI cá nhân.",
  "Paper sync, million-scale ingest campaigns, taxonomy sync and trend lookups.": "Đồng bộ bài báo, chiến dịch thu thập quy mô lớn, đồng bộ phân loại và tra cứu xu hướng.",
  "{{count}} keys in the pool": "{{count}} key trong danh sách",
  "Env key set (last fallback)": "Đã có key .env (dự phòng cuối)",
  "No env key": "Chưa có key .env",
  "Calls use the env key now": "Đang dùng key .env",
  "No usable key": "Không có key dùng được",
  "Add key": "Thêm key",
  "Save and test": "Lưu và kiểm tra",
  "e.g. Project lumiGAP": "VD: Project lumiGAP",
  "New API key (optional)": "API key mới (không bắt buộc)",
  "Paste the key": "Dán key vào đây",
  "Leave empty to keep the current key": "Để trống nếu giữ key hiện tại",
  "In use": "Đang dùng",
  "Cooling down": "Đang tạm nghỉ",
  "Disabled": "Đã tắt",
  "Retried after {{time}}": "Thử lại sau {{time}}",
  "{{ok}} ok · {{failed}} rejected": "{{ok}} thành công · {{failed}} bị từ chối",
  "Last used: {{time}}": "Dùng lần cuối: {{time}}",
  "never": "chưa bao giờ",
  "No errors": "Không có lỗi",
  "Test": "Kiểm tra",
  "Call the provider with this key": "Gọi thử nhà cung cấp bằng key này",
  "Disable": "Tắt",
  "Enable": "Bật",
  "Key saved. The provider accepted it.": "Đã lưu key. Nhà cung cấp chấp nhận key này.",
  "Key saved, but the test failed: {{message}}": "Đã lưu key nhưng kiểm tra thất bại: {{message}}",
  "“{{name}}” works and is in rotation.": "“{{name}}” hoạt động và đã vào vòng xoay.",
  "“{{name}}” failed: {{message}}": "“{{name}}” thất bại: {{message}}",
  "Saved. Every worker uses the change within 30 seconds.": "Đã lưu. Mọi worker áp dụng thay đổi trong vòng 30 giây.",
  "Key deleted.": "Đã xoá key.",
  "No pool keys yet. Calls use the env key; add keys here to fail over automatically.": "Chưa có key nào. Hệ thống đang dùng key .env; thêm key ở đây để tự chuyển khi có lỗi.",
  "No keys yet. Add a key to enable this provider.": "Chưa có key nào. Thêm key để dùng nhà cung cấp này.",
  "Could not complete this request. Please try again.": "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
} as const;

export const adminApiKeysEn = Object.fromEntries(
  Object.keys(adminApiKeysVi).map((key) => [key, key]),
) as Record<keyof typeof adminApiKeysVi, string>;
