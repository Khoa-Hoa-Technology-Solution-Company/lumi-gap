# Spec: Admin Pipeline Hardening UI

## 1. Mục tiêu & Bối cảnh
- **Mục tiêu:** Xây dựng giao diện quản trị (Operational Dashboard) cho Admin giúp chẩn đoán sức khỏe của hệ thống pipeline dữ liệu & AI tại địa chỉ `/admin/pipeline`. Giao diện này sẽ hiển thị tình trạng Redis, BullMQ queues, danh sách các jobs thất bại gần đây, hiệu suất xử lý của các worker, trạng thái stale của reports/gaps, và tỷ lệ bao phủ của embeddings/AI analysis trên MongoDB.
- **Bối cảnh:** Khi scale hệ thống lên hàng ngàn bài báo, việc giám sát từng bước của pipeline (OpenAlex sync, Embeddings generation, AI analysis, Reports generation, Research gaps, Notifications) là cực kỳ quan trọng để phát hiện nghẽn, lỗi kết nối hoặc cạn kiệt tài nguyên (như Upstash quota limit).

## 2. Phạm vi yêu cầu (Scope)
- **Trong phạm vi:**
  - Tích hợp API endpoint: `GET /api/v1/admin/pipeline/status`.
  - Sidebar hiển thị menu `Pipeline` với Icon `Activity` hoặc `ActivitySquare` của Lucide.
  - Route `/admin/pipeline` hiển thị dashboard với các phần:
    - **Header:** Title, Description, Nút Refresh thủ công, và thời gian cập nhật cuối cùng.
    - **Summary Cards (Stats):** Redis Status (Healthy/Unavailable), Queue Backlog, Failed Jobs, Corpus Embeddings Coverage, Structured AI Analysis Coverage.
    - **Corpus Readiness Progress:** Tiến độ Embedding và AI Analysis dưới dạng thanh tiến trình (Progress Bar).
    - **Queue Table:** Bảng chi tiết BullMQ queues (Waiting, Active, Delayed, Failed, Completed, Health Badge).
    - **Stale Work Indicators:** Số lượng reports/gaps bị kẹt trong hàng đợi quá lâu.
    - **Recent Failed Jobs List:** Danh sách tối đa các jobs lỗi gần nhất kèm chi tiết lỗi và Tooltip.
    - **Action Recommendations:** Các gợi ý/cảnh báo dựa trên mức độ nghiêm trọng (critical, warning, info).
  - Tự động polling dữ liệu mỗi 10 giây khi tab đang hoạt động và người dùng ở trên trang.
  - Thêm link liên kết chéo từ `/admin/sync` sang `/admin/pipeline` (ví dụ: "View full pipeline health").
- **Ngoài phạm vi:**
  - Nút Retry / Delete cho các job bị lỗi (sẽ làm ở các PR sau).
  - Giao diện cấu hình thủ công các biến môi trường hoặc quotas.

## 3. Kiến trúc kỹ thuật & Cấu trúc dữ liệu
- **Frontend Framework:** React 18, Vite.
- **Routing:** React Router DOM v6.
- **State & Data Fetching:** TanStack React Query v5 + Axios client (`@/services/api-client`).
- **Styling:** Tailwind CSS + Radix UI.
- **API Endpoint:** `GET /admin/pipeline/status`.
- **API Response Type (Typescript):**
  ```ts
  export interface PipelineStatusResponse {
    generatedAt: string;
    redis: {
      ok: boolean;
      error: string | null;
    };
    queues: Array<{
      name: "api-sync" | "embedding" | "paper-analysis" | "report" | "gaps" | "notifications";
      label: string;
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      completed: number;
      paused?: number;
      isBacklogged: boolean;
      hasFailures: boolean;
    }>;
    recentFailedJobs: Array<{
      queue: string;
      jobId: string;
      name: string;
      failedReason: string;
      attemptsMade: number;
      timestamp?: string;
    }>;
    corpus: {
      totalPapers: number;
      activePapers: number;
      analyzablePapers: number;
      embeddedPapers: number;
      pendingEmbedding: number;
      aiAnalyzedPapers: number;
      pendingAiAnalysis: number;
      embeddingCoveragePct: number;
      aiAnalysisCoveragePct: number;
    };
    stale: {
      reportsQueuedTooLong: number;
      reportsGeneratingTooLong: number;
      gapsQueuedTooLong: number;
      gapsAnalyzingTooLong: number;
    };
    sync: {
      running: boolean;
      latestRun: null | {
        id: string;
        status: string;
        searchText?: string;
        startedAt?: string;
        finishedAt?: string;
        totalFetched?: number;
        totalInserted?: number;
        totalUpdated?: number;
        totalDuplicates?: number;
        totalRejected?: number;
      };
    };
    recommendations: Array<{
      severity: "info" | "warning" | "critical";
      title: string;
      description: string;
    }>;
  }
  ```

## 4. Giao diện người dùng (UI/UX)
- **Theme & Design Taste:** Đồng bộ với giao diện Admin hiện tại của LiemResearch (sử dụng font Inter, các bo góc `rounded-xl`, viền mờ `border-[#EAEAEA] dark:border-[#26334A]`, background `bg-card dark:bg-[#111B27]`).
- **Trạng thái Polling:** Hiển thị loader nhỏ dạng vòng xoay mờ khi đang fetching ngầm.
- **Trạng thái lỗi:** Sử dụng Alert banner màu đỏ nếu API bị lỗi.
- **Trạng thái trống:** Hiển thị SVG/Icon trống nếu không có jobs lỗi gần đây.
- **Tương thích Responsive:**
  - Thiết bị di động (Mobile/Tablet): Các Stats card hiển thị xếp chồng đứng (flex-col), bảng Queue hiển thị thanh cuộn ngang (horizontal scroll).
