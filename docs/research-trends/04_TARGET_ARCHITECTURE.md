# 04 — Target Architecture

> Checkpoint 1 · Ngày lập: 2026-10-21 · **Đồng bộ lại ở Checkpoint 2 / P0 (2026-10-21)** theo `CHECKPOINT_1_5_REVIEW.md` và `05_IMPLEMENTATION_PLAN.md` (bản 1.5). Khi có mâu thuẫn, 05 bản 1.5 được ưu tiên.
> Các mục đánh dấu **[ĐÃ LÀM ở P0]** đã có trong code; phần còn lại vẫn là **đề xuất, chưa triển khai**.
> Nguyên tắc: không viết lại; tận dụng `apps/backend/src/modules/trends/`; mỗi thành phần mới phải trả lời được "vì sao cần" bằng một phát hiện ở `02`/`03`; tránh breaking change ở API công khai (chỉ **thêm** trường).

## 1. Sơ đồ

```
                          ┌───────────────────────────── Web ─────────────────────────────┐
                          │ Mode A: Discover (home, /trends overview)   Mode B: Explore     │
                          │   đọc kết quả precompute                    (/trends/:topic,   │
                          │                                              compare, search)  │
                          │ Evidence & Explainability panel (dùng chung)                   │
                          └───────────────┬───────────────────────────────┬────────────────┘
                                          │ GET /trends?mode=discover     │ GET /trends/:unit?baseline=…
                                          ▼                               ▼
┌──────────────────────────── Backend: modules/trends ─────────────────────────────────────┐
│  trend.service.ts  (điều phối, giữ nguyên chữ ký endpoint, chỉ thêm trường)                │
│      │                                                                                    │
│      ├── Research Unit Resolver   (mở rộng trend.openalex-detail.ts: topic|subfield|field) │
│      ├── Series Provider          (MỚI, gộp code lặp: lấy n_t, N_t cho 1 unit + scope)    │
│      │      ├─ OpenAlex adapter   (trend.openalex-client.ts + scope.ts — giữ)            │
│      │      └─ Local adapter      (trend.postgres.ts — sửa is_primary)                    │
│      ├── Reference Baseline       (MỚI, nhỏ: global|domain|field|subfield → filter N_t)   │
│      └── Shared Analytics Engine  (thuần, không I/O)                                      │
│             ├─ trend.statistics.ts   MK, Sen, CI, BH, log OR      (giữ, thêm exact p)     │
│             ├─ trend.verdict.ts      classifyTrend, xếp hạng      (giữ)                   │
│             ├─ trend.ggt.ts          GGT năm, mean GGT, nhãn Nelis (MỚI)                  │
│             ├─ trend.burst.ts        Kleinberg B²_s batched        (MỚI, P4)              │
│             └─ trend.emergence.ts    EScore-style trên keywords   (MỚI, P4, thử nghiệm)   │
│      └── Evidence Builder         (mở rộng trend.evidence.ts: gắn nguồn, phiên bản, Rotolo)│
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                            │ đọc / ghi
┌──────────── workers/trends.worker.ts (MỚI, BullMQ) ───────┐      ┌──── PostgreSQL ────────────┐
│ Lịch: hằng tuần + khi OpenAlex công bố thay đổi dữ liệu    │ ───▶ │ trend_series_store         │
│ 1. cursor group_by toàn bộ topic theo năm (cần API key)    │      │ trend_results (precompute) │
│ 2. Series Provider → Analytics Engine                      │      │ (migration viết tay)       │
│ 3. BH theo family cố định (field × scope mặc định)          │      └────────────────────────────┘
│ 4. ghi chuỗi đã dùng + kết quả + dataProvenance            │
└────────────────────────────────────────────────────────────┘
```

## 2. Thành phần

### 2.1 OpenAlex Integration — **giữ, sửa nhỏ** — [ĐÃ LÀM ở P0]
- File: `trend.openalex-client.ts`, `trend.openalex-scope.ts`.
- **Đã làm (P0.1, P0.6):** ngưỡng ngân sách theo tỷ lệ `X-RateLimit-Remaining / X-RateLimit-Limit` (giữ lại 20%, quy ước); không retry 429 khi hết ngân sách ngày; không retry 4xx khác; bỏ `mailto`; key gửi qua `Authorization: Bearer`; `corpus=core` tường minh trên `/works`; cache lưu `fetchedAt` gốc cùng body; `OPENALEX_CACHE_VERSION = v3`.
- **Chưa làm (P2):** tách quota cho worker và cho request người dùng. Con số "worker 60%" của bản cũ bị thay bằng cổng P2.0: một lần chạy đầy đủ ≤ 30% quota ngày, đo thật.
- **Điều kiện tiên quyết của P2:** cursor qua trang 1 trả **401 khi không có API key** (kiểm tra 2026-10-21).
- Không gộp với client của api-sync (giữ quyết định hiện có trong chú thích file).

### 2.2 Research Unit Resolver — **mở rộng**
- File: `trend.openalex-detail.ts` (`resolveOpenAlexTopic`).
- Thêm cấp `subfield` và `field` (OpenAlex có endpoint `/subfields`, `/fields`, filter `primary_topic.subfield.id`, `primary_topic.field.id`).
- Kết quả: `{ level: "topic"|"subfield"|"field", id, name, parent… }`. Khớp tên chính xác như hiện tại; nếu nhiều cấp cùng tên, trả về danh sách để người dùng chọn.
- Lý do: Mode B ví dụ "Artificial Intelligence" là subfield (03 #24).

### 2.3 Series Provider — **mới, nhưng là gộp code đang lặp**
- Hiện có 3 bản logic "lấy chuỗi + chuẩn hóa scope": `trend.openalex-overview.ts:181-195`, `trend.evidence.ts:67-75,138-162`, `trend.postgres.ts:347-393`. Ba bản xử lý scope khác nhau → F2, F4.
- Giao diện đề xuất:
  ```ts
  interface SeriesRequest { unit: ResearchUnit; scope: TrendScopeFilters; baseline: BaselineLevel; yearFrom: number; yearTo: number }
  interface SeriesResult  { source: "openalex" | "local"; years: number[]; unitCounts: number[]; baselineCounts: number[];
                            baseline: { level; id; label }; dataProvenance: TrendDataProvenance }
  ```
- Một response chỉ dùng **một** `SeriesResult` → không trộn nguồn (sửa F2).
- Local adapter lọc `is_primary = true` (F4).

### 2.4 Reference Baseline Calculator — **mới, nhỏ**
- Ánh xạ `baseline` → mệnh đề filter cho `N_t`:
  - `global`: `nonTaxonomyFilter` + `primary_topic.id:!null` (works **có** topic cùng scope) **[ĐIỀU CHỈNH]** so với mặc định của Nelis (toàn cơ sở dữ liệu): tử số luôn có topic, còn tỷ lệ works không có topic thay đổi theo năm (1,73–3,14% cho 5 loại mặc định, đo 2026-10-21). Trả kèm `unclassifiedSharePct`;
  - `domain` / `field` / `subfield`: `primary_topic.{level}.id:<id của unit>`.
- Mặc định `field` → giữ nguyên số liệu hiện tại (không breaking).
- Ràng buộc: baseline phải **chứa** unit (không cho baseline `subfield` khi unit là `field`).
- Chuỗi baseline `global` của một scope dùng chung cho mọi unit → 1 request.

### 2.5 Shared Analytics Engine — **giữ lõi, thêm module thuần**
- Mọi hàm nhận mảng số, trả số; không I/O; unit test bằng ví dụ tính tay.
- `trend.statistics.ts` — **[ĐÃ LÀM ở P0.7]**: p chính xác cho MK khi `n ≤ 10` và không có ties, tính bằng **phân phối Mahonian** (quy hoạch động, cache theo n) — **không** liệt kê hoán vị; có ties hoặc n > 10 thì dùng xấp xỉ chuẩn, trường `pValueMethod` cho biết cách nào. Đối chiếu với liệt kê đầy đủ n! (G0).
- `trend.ggt.ts` (P1):
  ```
  annualGgt(unit[], baseline[]) → [{year, ggtPct | null}]        // Nelis Eq (i) [GỐC]; null khi mẫu số = 0
  meanGgt(annual)              → {mean, sem, n}                  // trung bình cộng [SUY LUẬN]
  ggtConditions(...)           → {belowHundred: GGT < 100%, minPapersEveryYear: ≥ 50 bài ở mọi năm}  // [GỐC] + [SUY LUẬN] "mọi năm"
  ggtYearToYearChanges(annual) → [{year, deltaPctPoints}]       // chỉ để hiển thị, KHÔNG là cổng
  ggtClass(mean)               → nhãn Nelis | "unclassified (−10…−5%)"                           // [GỐC] + khoảng trống ghi rõ
  ```
  Điều kiện "less than 50% year-to-year variation" **không được định nghĩa** trong bài (CHECKPOINT_1_5 §1.3): không triển khai thành cổng, không mặc định là 50 điểm %. Định nghĩa sẽ chọn ở P5 bằng dữ liệu S1/S2 của Nelis.
- `trend.burst.ts` (P4): Viterbi cho `B²_{s,γ}` với `(r_t, d_t)`, mặc định của Kleinberg γ = 1; trả `bursts: [{start, end, weight, ongoingThroughLastCompleteYear}]`. Tham số `s`, `γ` cấu hình, công bố trên trang phương pháp; xử lý `d_t` lớn bằng tính `ln C(d, r)` qua `lgamma` để tránh tràn số.
- `trend.emergence.ts` (P4, thử nghiệm): điều kiện lọc + thành phần xu hướng theo 01 §2.2, áp lên keyword; tên công khai "EScore-style (adapted)".
- `trend.verdict.ts`: giữ; verdict **chỉ** từ MK/BH. GGT, burst, emergence là **bằng chứng bổ sung**, không đổi verdict.

### 2.6 Trend Ranking — **giữ quy tắc, đổi family**
- Giữ `compareByTrend`.
- BH tính trên **family cố định** = toàn bộ topic của field trong scope mặc định, trong worker → q-value không phụ thuộc `limit` (03 #6).
- Các danh sách Mode A:
  | Danh sách | Quy tắc chọn | Xếp theo |
  |---|---|---|
  | Trending | verdict = rising | `relativeChangePct` (như hiện tại) |
  | Fastest Growing | rising **và** đạt 2 điều kiện rõ nghĩa của Nelis (GGT < 100%, ≥ 50 bài mọi năm) | mean GGT |
  | "Bùng phát gần đây (đến hết năm Y)" — **không** dùng tên "Hot Right Now" | burst còn kéo dài tới năm hoàn chỉnh cuối; chỉ bật sau cổng V-BURST | burst weight |
  | Từ khóa có tín hiệu nổi lên (thử nghiệm) — chỉ bật sau cổng V-EM | keyword qua điều kiện EScore-style | EScore |
  | By Field | như Trending, nhóm theo field | — |

### 2.7 Scheduled Trend Processing — **mới (bắt buộc cho Mode A)**
- `apps/backend/src/workers/trends.worker.ts`, BullMQ, retry theo quy ước repo (`attempts: 5`, backoff exponential).
- Vì sao cần: (a) ứng viên đầy đủ thay vì 30–200 topic lớn (F6); (b) family BH cố định; (c) trang chủ có dữ liệu OpenAlex (F3); (d) lưu chuỗi đã dùng kèm dataProvenance (F8); (e) giảm request khi người dùng mở trang.
- Chi phí: **chưa đo**. Cách dự kiến: `group_by=primary_topic.id:include_unknown` theo từng năm với cursor (4.516 topic + nhóm `unknown` ≈ 23 trang/năm, ~$0,0001/trang) — cần API key. Tổng của các nhóm topic phải bằng count của `primary_topic.id:!null`, **không** phải `meta.count` (gồm cả works không có topic). Mọi con số chi phí được đo ở cổng P2.0 (05) trước khi viết worker. Ước tính "~5.000 credit" và "rẻ hơn ~20 lần" của bản cũ đã bị bỏ vì chưa đo.
- Lịch: hằng tuần; chạy lại toàn bộ khi OpenAlex công bố thay đổi dữ liệu (đồng thời tăng `OPENALEX_CACHE_VERSION`). OpenAlex không có trường phiên bản trong API, nên không có cách tự phát hiện.

### 2.8 Lưu trữ — **mới, tối thiểu**
- `trend_series_store(unit_level, unit_id, baseline_level, baseline_id, scope_hash, year, unit_count, baseline_count, fetched_at, cache_version, corpus)` — tên **không** dùng "snapshot" để khỏi nhầm với snapshot S3 của OpenAlex.
- `trend_results(unit…, scope_hash, window, computed_at, data_provenance jsonb, classification jsonb, ggt jsonb, bursts jsonb, emergence jsonb)`.
- Migration viết tay theo `docs/prisma-migrations.md` (không dùng `migrate dev`).
- Metadata chỉ gồm điều **quan sát được** (giống `TrendDataProvenance` đã làm ở P0.6): `source`, `fetchedAt`, `cacheVersion`, `corpus`. **Không** lưu "phiên bản classifier": API không cung cấp, tài liệu không có ngày chuyển chính xác.

### 2.9 Interactive Research Explorer (Mode B)
- Tái dùng endpoint `GET /trends/:topic`, thêm query `unitLevel`, `baseline` (tùy chọn, mặc định giữ hành vi cũ).
- Mode B tính **on-demand** (một unit, ~5–15 request) bằng cùng Series Provider + Engine; nếu đã có precompute cho đúng scope/baseline thì đọc từ DB.
- Compare: trả thêm `shareSeries`, `classification`, `ggt` cho từng unit (thêm trường, không đổi trường cũ).

### 2.10 Explainability & Evidence Layer
- Mỗi con số trả về kèm: công thức (id của mục trên trang `/docs`), nguồn (`openalex`/`local`), baseline, cửa sổ năm, `dataProvenance` (**[ĐÃ LÀM ở P0.6]**), loại p (`p` hay `q`, kèm cỡ family BH `qFamilySize` — **[ĐÃ LÀM ở P0.2]**), cách tính p (`pValueMethod` — **[ĐÃ LÀM ở P0.7]**).
- Bảng **Rotolo**: với mỗi topic/keyword, liệt kê 5 thuộc tính → `có bằng chứng` (chỉ số nào), `bằng chứng yếu`, `không đo được`. Không cộng thành điểm.
- LLM explain: giữ cơ chế whitelist số; thêm các trường mới vào whitelist.

## 3. Không làm (và lý do)

| Không làm | Lý do |
|---|---|
| Viết lại module trends | Lõi đúng, test tốt; lỗi nằm ở dữ liệu đầu vào và hạ tầng |
| "Trend Score" tổng hợp có trọng số | Không có căn cứ (03 §7) |
| Tải bản ghi works hàng loạt cho xu hướng | `group_by` đủ; tải bản ghi tốn quota và lưu trữ |
| Dùng client api-sync cho trends | Giữ tách biệt như quyết định hiện có |
| Đổi kiểu trả về cũ | Chỉ thêm trường; trường deprecated giữ tới khi web/mobile/MCP không còn dùng |

## 4. Tương thích ngược

- `TrendingTopic`, `PublicationTrend`, `TrendCompareResponse`: chỉ thêm trường tùy chọn (`ggt?`, `bursts?`, `baseline?`; `dataProvenance?` đã thêm ở P0.6).
- `home` API: giữ shape `trends`, đổi nguồn sang precompute khi có; thêm `trends.dataSource`.
- Flutter mobile và MCP (`modules/mcp/mcp.executor.ts:60`) gọi `trendService.topic` → không đổi chữ ký.
