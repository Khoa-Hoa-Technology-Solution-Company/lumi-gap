# API Integration Guide — cho Dev Web & Mobile

> Hướng dẫn để Dev Web (React) và Dev Mobile (Expo) **nối UI vào API backend**. Đọc file này là biết gọi endpoint nào, nhận về shape gì, auth ra sao.
>
> Backend Phase A đã chạy thật — DB có **200 paper thật** về "LLM in education". Bạn nối UI vào là có data hiển thị ngay.

---

## 1. Base URL — Cấu Hình Ở Đâu

| App | File env | Biến | Giá trị dev |
|---|---|---|---|
| **Web** | `apps/web/.env` | `VITE_API_BASE` | `http://localhost:4000/api/v1` (hoặc để trống → dùng Vite proxy `/api`) |
| **Mobile** | `apps/mobile/.env` | `EXPO_PUBLIC_API_BASE` | `http://10.0.2.2:4000/api/v1` (Android emulator → host); thiết bị thật dùng LAN IP `http://192.168.x.x:4000/api/v1` |

> ⚠️ **Mobile Android emulator:** `localhost` = chính emulator, KHÔNG phải máy bạn. Phải dùng `10.0.2.2` (alias đặc biệt trỏ về host). `api-client.ts` của mobile đã auto-detect dev host nên thường không cần chỉnh.

Backend phải đang chạy: `pnpm dev:backend` → http://localhost:4000.

---

## 2. Response Envelope — MỌI Endpoint Đều Theo Format Này

**Thành công:**
```json
{ "success": true, "data": <T>, "meta"?: { "page": 1, "pageSize": 20, "total": 200, "totalPages": 10 } }
```

**Thất bại:**
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Paper not found", "details"?: {...} } }
```

→ Luôn check `res.data.success`. Data thật nằm trong `res.data.data`. Pagination nằm trong `res.data.meta`.

---

## 3. Auth — ĐÃ Wire Sẵn, Bạn Chỉ Dùng Hook

**Không cần tự viết axios/token logic.** `api-client.ts` đã có sẵn:
- Tự gắn `Authorization: Bearer <accessToken>` vào mọi request
- Tự refresh token khi gặp 401 (gọi `/auth/refresh` 1 lần, retry request)
- Token lưu: web → localStorage, mobile → expo-secure-store

### Hook có sẵn (web + mobile giống nhau)
```ts
import { useLogin, useRegister, useLogout, useCurrentUser } from "@/features/auth";

const login = useLogin();
login.mutate({ email, password });   // onSuccess tự lưu token + set user

const { data } = useCurrentUser();   // data.user = { id, email, fullName, role }
const logout = useLogout();          // xóa token
```

### Auth endpoints (tham khảo — bạn dùng hook, không gọi trực tiếp)
| Method | Path | Body | Trả về |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, fullName, role? }` | `{ user, tokens }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, tokens }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken, accessTokenExpiresAt }` |
| POST | `/auth/logout` | `{ refreshToken }` | `{ ok: true }` |
| GET | `/auth/me` | — (cần Bearer) | `{ user }` |

> ⚠️ Backend yêu cầu **email hợp lệ** (`z.string().email()`). Ô login phải nhập email thật, không phải username.

---

## 4. Papers — Endpoint Chính Để Hiển Thị (CÓ DATA THẬT)

### `GET /papers` — Search + danh sách (paginated)

Query params:
| Param | Mặc định | Ý nghĩa |
|---|---|---|
| `q` | (none) | Keyword search trên title + abstract. Bỏ trống = list tất cả |
| `page` | 1 | Trang |
| `pageSize` | 20 | Số/trang (max 50) |

Ví dụ: `GET /papers?q=LLM%20education&page=1&pageSize=10`

Trả về:
```json
{
  "success": true,
  "data": [ /* Paper[] */ ],
  "meta": { "page": 1, "pageSize": 10, "total": 200, "totalPages": 20 }
}
```

### `GET /papers/:id` — Chi tiết 1 paper
```json
{ "success": true, "data": { /* Paper */ } }
```
404 nếu không tìm thấy.

### Hook có sẵn (web — `@/features/papers`)
```ts
import { usePapers, usePaper } from "@/features/papers";

// List page
const { data, isLoading } = usePapers({ q: "LLM education", page: 1, pageSize: 20 });
// data.papers = Paper[], data.meta = { total, totalPages, ... }

// Detail page
const { data: paper } = usePaper(id);   // Paper | undefined
```

Mobile dùng pattern y hệt từ `@/features/papers` (mobile đã có file tương đương).

---

## 5. Paper Object — Shape Bạn Render

Type chuẩn: `import type { Paper } from "@trend/shared-types"`. Các field FE thường dùng:

```ts
interface Paper {
  id: string;
  title: string;
  abstractText?: string;                 // abstract đầy đủ (có thể dài 300+ chữ)
  authors: { displayName: string; position: number; isCorresponding?: boolean }[];
  journalName?: string;                  // "Learning and Individual Differences"
  publicationYear: number;               // 2023
  citationCount: number;                 // 4826
  topics: { topicName: string; confidence?: number }[];
  keywords: { keywordName: string; confidence?: number }[];
  externalIds: { doi?: string; openalexId?: string };
  openAccessStatus?: "gold" | "green" | "hybrid" | "bronze" | "closed" | "unknown";
  openAccessUrl?: string;                // link đọc free nếu có
  dataQualityScore: number;              // 0..1 — độ đầy đủ metadata
  isAiAnalyzable: boolean;
  dataStatus: "draft" | "active" | "low-quality" | "archived";
  primaryProvider: "openalex" | ...;
  // aiScore?  — Phase B (relevance, semantic, ...). CHƯA có ở Phase A.
  createdAt: string; updatedAt: string;  // ISO date string
}
```

### Ví dụ data thật (1 paper trong DB)
```json
{
  "id": "6a1a6e79b89cd7e3196fdc98",
  "title": "ChatGPT for good? On opportunities and challenges of large language models for education",
  "authors": [{ "displayName": "Enkelejda Kasneci", "position": 0, "isCorresponding": true }, ...23 authors],
  "journalName": "Learning and Individual Differences",
  "publicationYear": 2023,
  "citationCount": 4826,
  "externalIds": { "doi": "10.1016/j.lindif.2023.102274" },
  "topics": [{ "topicName": "Artificial Intelligence in Healthcare and Education" }, ...],
  "dataQualityScore": 0.857,
  "isAiAnalyzable": true,
  "primaryProvider": "openalex"
}
```

### Gợi ý render PaperCard
- **Title** (bold, 2 dòng max) → click vào `/papers/:id`
- **Authors**: `authors.map(a => a.displayName).join(", ")`, cắt còn 3 + "+N more"
- **Metadata row**: `journalName · publicationYear · ${citationCount} citations`
- **OA badge**: nếu `openAccessUrl` → chip "Open Access" xanh
- **Abstract**: `abstractText` line-clamp 2 dòng
- **Quality**: `dataQualityScore` → badge màu (xem DESIGN_LANGUAGE.md §2.4)

---

## 6. Admin Sync — Hướng Dẫn Tự Build Trang Admin (Web)

> Trang `pages/admin/sync.tsx` **đã scaffold sẵn** (role gate + nút "Trigger new sync") nhưng body còn là TODO. Phần này chỉ cho bạn **tự nối API** vào nó. Backend Phase A đã xong 2 endpoint này.

### 6.1 Hai endpoint

**`POST /admin/sync`** — kích hoạt 1 lần sync (đẩy job vào queue, trả NGAY):
```jsonc
// Request body (Zod validate):
{
  "searchText": "large language model education",  // bắt buộc, >=1 ký tự
  "yearFrom": 2022,                                  // optional, default 2022 (1900-2100)
  "maxPages": 1                                       // optional, default 1, max 50
}
// Response 202 Accepted:
{ "success": true, "data": { "jobId": "12", "status": "queued", "searchText": "...", "yearFrom": 2022, "maxPages": 1 } }
```
> ⚠️ Trả **202** (không phải 200) = "đã nhận, đang xử lý nền". Sync chạy ở worker riêng, KHÔNG xong ngay. Sau khi trigger, **đợi vài giây rồi refetch danh sách runs** để thấy kết quả.

**`GET /admin/sync/runs`** — lịch sử 20 lần sync gần nhất:
```jsonc
{
  "success": true,
  "data": [ /* ApiSyncRun[] */ ],
  "meta": { "total": 20 }   // ⚠️ chỉ là SỐ phần tử trả về (max 20), không phải tổng trong DB
}
```

### 6.2 Shape `ApiSyncRun` (render bảng lịch sử)

> ⚠️ Endpoint này trả **raw Mongo doc** (qua `.lean()`), KHÔNG qua DTO mapper → field là **`_id`** (không phải `id`), date là ISO string.

```ts
interface ApiSyncRun {
  _id: string;
  runStatus: "running" | "succeeded" | "failed" | "cancelled";
  searchText?: string;
  startedAt: string;          // ISO
  finishedAt?: string;        // ISO (chưa có khi đang running)
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  totalDuplicates: number;
  errorMessage?: string;      // chỉ có khi runStatus="failed"
  createdAt: string; updatedAt: string;
}
```

### 6.3 Bước 1 — Thêm route admin vào `constants/api.ts`
Hiện `API_ROUTES` **chưa có** nhóm admin. Thêm:
```ts
// apps/web/src/constants/api.ts
export const API_ROUTES = {
  // ...auth, papers, search, trends, reports đã có...
  admin: {
    sync: "/admin/sync",
    syncRuns: "/admin/sync/runs",
  },
} as const;
```

### 6.4 Bước 2 — Tạo `features/admin/api/admin.api.ts`
Theo đúng pattern `papersApi` (dùng `api` client — đã tự gắn Bearer + refresh):
```ts
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export interface TriggerSyncInput {
  searchText: string;
  yearFrom?: number;
  maxPages?: number;
}

export const adminApi = {
  async triggerSync(input: TriggerSyncInput) {
    const res = await api.post(API_ROUTES.admin.sync, input);
    return res.data.data as { jobId: string; status: string };
  },
  async listRuns() {
    const res = await api.get(API_ROUTES.admin.syncRuns);
    return res.data.data as ApiSyncRun[];
  },
};
```

### 6.5 Bước 3 — Tạo hook `features/admin/hooks/use-admin-sync.ts`
Theo pattern `usePapers`, thêm mutation cho trigger + invalidate để bảng tự refresh:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type TriggerSyncInput } from "../api/admin.api";

export function useSyncRuns() {
  return useQuery({ queryKey: ["admin", "sync-runs"], queryFn: adminApi.listRuns });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerSyncInput) => adminApi.triggerSync(input),
    onSuccess: () => {
      // đợi worker chạy chút rồi refetch (202 = async)
      setTimeout(() => qc.invalidateQueries({ queryKey: ["admin", "sync-runs"] }), 2000);
    },
  });
}
```

### 6.6 Bước 4 — Lắp vào `pages/admin/sync.tsx` (đã có sẵn role gate)
Trang đã check `role === "admin"` rồi. Bạn chỉ thay khối `<div>TODO...</div>` bằng UI thật:
- **Nút "Trigger new sync"** (đã có) → mở dialog form (`searchText`, `yearFrom`, `maxPages`) → gọi `useTriggerSync().mutate(...)`.
- **Bảng Run History** → `const { data: runs } = useSyncRuns()` → render bảng cột: `searchText · runStatus (badge màu) · fetched/inserted/updated/duplicates · startedAt · finishedAt`.
- **Status badge**: `running`=vàng, `succeeded`=xanh, `failed`=đỏ (+ tooltip `errorMessage`).
- Sau khi trigger → toast "Sync queued" + bảng tự refresh sau 2s.

### 6.7 ⚠️ Trước khi test thật: cần 1 user admin
Public register **không cho** tạo admin (`role?: Exclude<UserRole,"admin">`). Hai cách:
- **Tạm (dev):** đặt `SYNC_ADMIN_BYPASS=true` trong `apps/backend/.env` → endpoint bỏ qua auth, test UI được ngay. (Nhớ tắt khi xong.)
- **Đúng:** cần 1 script promote 1 user thành admin trong Mongo (chưa có — nói Lead làm `scripts/promote-admin.ts`, hoặc dùng MongoDB MCP "set role của user X thành admin").

> Mobile admin: **CÓ build** (xem `UI_BUILD_PLAN.md` Đợt 1 + mockup `STITCH_PROMPTS.md` Mobile 6). Endpoint/shape giống hệt web (§6.1, §6.2), nhưng mobile dùng route Expo `app/admin/sync.tsx`, mobile api-client, NativeWind + bottom sheet (không phải table/dialog). Code mẫu ở trên là cho **web**.

---

## 7. Error Handling — Pattern Chuẩn

```ts
login.mutate(values, {
  onError: (err) => {
    const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
    const msg = axiosErr?.response?.data?.error?.message ?? "Có lỗi xảy ra";
    toast.error(msg);   // web: sonner; mobile: Alert.alert
  },
});
```

Mã lỗi backend: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400, có `details`).

---

## 8. Mock → Real Data (Quan Trọng Cho Phase A)

Trong Phase A, Dev 1 build UI với **mock data** trước (Lead đang làm backend). Khi backend xong (giờ đã xong!), chỉ cần swap:

```ts
// TRƯỚC (mock):
const papers = mockPapers;

// SAU (real — backend đã có 200 paper thật):
const { data } = usePapers({ q, page, pageSize });
const papers = data?.papers ?? [];
```

→ Vì đã thiết kế theo `Paper` type chung, swap không phải sửa UI.

---

## 9. Dùng MCP Để Debug Data (Cho Cả Team)

Team có MongoDB MCP + Upstash MCP — dùng để soi data khi debug, không cần viết query:

**MongoDB MCP** (soi paper trong DB):
- Đếm: "đếm research_papers" → 200
- Tìm: "tìm paper citation cao nhất", "tìm paper năm 2024 về LLM"
- Xem shape: list collection, xem 1 document mẫu

**Upstash MCP** (soi BullMQ queue):
- Xem key `bull:api-sync:*` để biết job sync đang chạy/chờ
- Xem queue depth, job đã xử lý

→ Khi UI hiển thị sai, hỏi Claude "soi giúp paper id X trong Mongo" thay vì tự viết script.

---

## 10. Checklist Khi Nối API

- [ ] Backend đang chạy (`pnpm dev:backend` → http://localhost:4000/health trả `{success:true}`)
- [ ] `.env` của app có `VITE_API_BASE` / `EXPO_PUBLIC_API_BASE` đúng
- [ ] Mobile Android: dùng `10.0.2.2` không phải `localhost`
- [ ] Dùng hook có sẵn (`usePapers`, `usePaper`, `useLogin`...) — không tự viết axios
- [ ] Check `res.data.success` trước khi đọc `res.data.data`
- [ ] Render theo `Paper` type từ `@trend/shared-types`
- [ ] Error → toast (web) / Alert (mobile)

---

## 11. Sắp Có (Phase B) — Thiết Kế UI Để Sẵn Sàng

- `GET /search/semantic?q=` — semantic search (hiểu nghĩa, không chỉ keyword)
- Paper sẽ có thêm `aiScore` (relevance, semantic similarity...) → thiết kế chỗ hiện AI score badge
- `POST /reports/generate` — tạo AI report (Phase C)

→ Khi build PaperCard/SearchPage giờ, chừa chỗ cho **AI score badge** + **semantic toggle** để Phase B lắp vào.

---

## Tham Khảo

- [DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md) — màu, typography, PaperCard pattern
- [STITCH_PROMPTS.md](STITCH_PROMPTS.md) — mockup từng screen
- [CLAUDE.md](../CLAUDE.md) §6 — API envelope + conventions
- Backend code: `apps/backend/src/modules/papers/` (paper.routes, paper.service)
