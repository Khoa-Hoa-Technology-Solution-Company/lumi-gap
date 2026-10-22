# 05 — Implementation Plan

> Checkpoint 1 · Ngày lập: 2026-10-21 · **Bản hiệu chỉnh Checkpoint 1.5 (2026-10-21)** — thay toàn bộ bản Checkpoint 1. Lý do thay đổi: `CHECKPOINT_1_5_REVIEW.md`.
> **Kế hoạch, chưa triển khai.** Mã `F…` xem `02` §6; `#…` xem `03` §1; thành phần xem `04`.
> **Hiệu chỉnh 2026-10-22 (P2.0 final gate, được duyệt trong chat):** tiêu chí "worker dừng sạch / ghi tiến độ / chạy tiếp" chuyển từ P2.0 sang acceptance bắt buộc của P2.1; P2.0 giữ phần bảo vệ ngân sách của client. Chi tiết: `P2_0_FINAL_GATE.md` §5.

## 0. Quy tắc áp dụng cho mọi giai đoạn

1. **Dừng để review sau mỗi giai đoạn.** Mỗi giai đoạn kết thúc bằng một báo cáo ngắn (`docs/research-trends/PHASE_Px_REPORT.md`: đã làm gì, test nào, số liệu trước/sau, rủi ro còn lại). Không bắt đầu giai đoạn sau khi chưa được duyệt bằng lời trong chat.
2. **Acceptance criteria độc lập.** Mỗi giai đoạn có "Exit criteria" riêng, kiểm tra được mà không cần giai đoạn sau. Không có tiêu chí kiểu "sẽ đúng sau khi P2 xong".
3. **Golden dataset và fixtures bắt đầu từ P0.** Mỗi giai đoạn thêm phần golden của mình (G0…G4) trước khi viết code tính toán của giai đoạn đó.
4. **Cổng phát hành nhãn.** Không hiển thị nhãn "Bùng phát gần đây" (thay cho "Hot") hoặc "Emerging" trên UI khi cổng validation tương ứng (V-BURST, V-EM ở P4) chưa đạt. Code có thể tồn tại sau cờ tắt mặc định.
5. **Cổng P2.** Không làm P2 khi cổng P2.0 chưa đạt (đủ topic + kiểm soát ngân sách, có bằng chứng số).
6. Hàm tính toán là hàm thuần, có test với ví dụ tính tay. Không đổi/xóa trường API hiện có, chỉ thêm. Mọi ngưỡng: hằng số export một chỗ, hiển thị trên `/docs`, ghi rõ [GỐC] / [ĐIỀU CHỈNH] / [QUY ƯỚC] / [SUY LUẬN].
7. Thay đổi DB chỉ từ P2, migration viết tay, chỉ chạy khi được duyệt riêng.
8. `pnpm typecheck` và `pnpm test` xanh là điều kiện tối thiểu của mọi giai đoạn.

```
P0 ─[review]─▶ P1 ─[review]─▶ P2.0 gate ─▶ P2 ─[review]─▶ P3 ─[review]─▶ P4 (code sau cờ) ─▶ V-BURST / V-EM ─[review]─▶ P5 ─[review]
 G0             G1              (cần API key)   G2            G3             G4
```

---

## P0 — Sửa lỗi khoa học, thống kê và dữ liệu

**Mục tiêu giai đoạn:** số liệu hiện có trở nên đúng và nhất quán, không thêm phương pháp mới, không đổi DB.

### P0.0 Golden dataset G0 và fixtures (làm đầu tiên)
- **Nội dung:**
  - `__tests__/fixtures/openalex/`: phản hồi OpenAlex **ghi lại** (group_by năm, group_by topic, header rate-limit) kèm ngày ghi. Header thật đã quan sát 2026-10-21: không key `X-RateLimit-Limit: 1000`, `X-RateLimit-Remaining: 999…987`, có `X-RateLimit-Remaining-USD`, `X-RateLimit-Cost-USD: 0.0001`; cursor trang 2 không key → `401 {"error":"API key required for cursor paging"}`.
  - Bảng tham chiếu Mann–Kendall p chính xác cho n = 4…10 (không ties), lấy từ bảng in sẵn (Kendall 1975 / Helsel et al. 2020) — mỗi giá trị ghi nguồn trang.
  - Ví dụ tính tay: thị phần, MK, Sen, CI95, BH, log OR trên chuỗi 5–10 năm.
  - Fixture nhất quán: một topic + một scope cho cả overview và chi tiết.
- **Acceptance:** fixtures có README ghi nguồn và ngày; mọi test P0 dùng fixtures này, không gọi mạng.

### P0.1 Ngân sách và khóa OpenAlex (F1, #20)
- **File:** `trend.openalex-client.ts`; `config/env.ts`; `docs/environment-variables.md`.
- **Nội dung:** ngưỡng theo tỷ lệ `Remaining / Limit` (ví dụ giữ lại 20%, hằng số [QUY ƯỚC]); khi 429 và `Remaining` ≈ 0 thì không retry, đặt khóa tới `X-RateLimit-Reset`; cảnh báo khởi động khi `NODE_ENV=production` mà thiếu `OPENALEX_API_KEY`; bỏ `mailto`.
- **Rủi ro:** dùng chung quota với sync/ingest — giữ phần dự trữ theo tỷ lệ.
- **Acceptance:** (1) fixture `Limit=1000, Remaining=999` → vẫn dùng OpenAlex; (2) `Remaining < 20% Limit` → khóa tới reset; (3) 429 hết ngân sách → 0 retry; 429 tốc độ (còn ngân sách) → retry có backoff; (4) không còn tham số `mailto` trong URL.

### P0.2 Nhất quán verdict trang chi tiết (F2, #8)
- **File:** `trend.service.ts:50-57`; `trend.evidence.ts:45-65,138-162`; `trend.openalex-detail.ts`.
- **Nội dung:** thống kê nhận cùng scope filter với biểu đồ; một response một nguồn (`openalex` hoặc `local`, không trộn); UI ghi rõ "p (một giả thuyết)" ở chi tiết và "q (BH trên n topic)" ở overview.
- **Acceptance:** (1) với fixture nhất quán, `shareSeries` của overview và chi tiết **giống hệt**; (2) scope `paperKinds=article,languages=en` xuất hiện trong filter của **cả** chuỗi topic và chuỗi population; (3) khi chi tiết lấy từ local thì `statistics.source = "local"` (test bằng mock OpenAlex lỗi).

### P0.3 Trang chủ không gọi kho local là xu hướng (F3, #22)
- **File:** `modules/home/home.postgres.ts:14`; `apps/web/src/features/home/components/home-discovery.tsx`.
- **Acceptance:** khi `dataSource = local`, khối topic có dòng "Kho dữ liệu nội bộ, không phải xu hướng khoa học", sắp theo số bài, không có badge verdict (test component).

### P0.4 Định nghĩa đơn vị và cửa sổ thống nhất (F4, F12, F13, #2, #25)
- **File:** `trend.postgres.ts:67-87,103-106,262-270`; `trend.service.ts:22`; `trend.evidence.ts:242-258`; hằng số cửa sổ dùng chung.
- **Nội dung:** đếm xu hướng local chỉ với `is_primary = TRUE` (bộ lọc Data Scope giữ nguyên); `topicId` khớp chính xác; cửa sổ mặc định 10 năm cho cả hai nguồn.
- **Acceptance:** (1) SQL builder có `is_primary = TRUE` ở truy vấn đếm; (2) tổng thị phần các topic trong một field ≤ 100% trên fixture; (3) "T1002" không khớp "T10028"; (4) overview local mặc định `yearTo − 10`.

### P0.5 Bỏ nhãn vô căn cứ, sửa hiển thị và xếp hạng keyword (F5, F7, #11–#13)
- **File:** `apps/web/src/pages/trends.tsx:279-290`; `apps/web/src/features/trends/components/topics-tab.tsx:180-230`; `trend.openalex-overview.ts:277-280`; `trend.evidence.ts:129-130`.
- **Nội dung:** bỏ "Hot", "Hot Signal", "Rising Signal", "Exploratory"; YoY hiển thị đúng dấu kèm chú thích "mô tả, chưa khử lạm phát"; keyword xếp theo `logOddsRatio` trong các keyword có `q < 0.05` và đạt ngưỡng hỗ trợ tối thiểu [QUY ƯỚC]; tiêu đề "Supplementary keyword shift".
- **Acceptance:** (1) không còn nhánh UI nào gắn nhãn theo `growthRatePct`; (2) không còn chuỗi "+-"; (3) fixture: keyword nhỏ có log OR lớn xếp trên keyword lớn có log OR nhỏ.

### P0.6 Metadata dữ liệu — chỉ những gì quan sát được (F8, #21)
- **File:** `trend.openalex-client.ts` (bọc giá trị cache: `{ fetchedAt, body }`); `packages/shared-types/src/trend.ts` (`dataProvenance?`); các `trend.openalex-*.ts`.
- **Định nghĩa (phân biệt rõ):**

  | Trường | Nghĩa | Nguồn |
  |---|---|---|
  | `fetchedAt` | Thời điểm **gọi API OpenAlex** tạo ra số liệu (cũ nhất trong các chuỗi của response) | Đồng hồ server lúc fetch, **lưu trong cache** để response từ cache vẫn trả đúng thời điểm gốc |
  | `cacheVersion` | Hằng số nội bộ, tăng khi đổi logic truy vấn hoặc khi OpenAlex công bố thay đổi dữ liệu | Code |
  | `corpus` | Giá trị tham số `corpus` đã gửi (`core`) | Request |
  | `source` | `openalex` / `local` | Code |
  | ~~`classifierVersion`~~ | **Không triển khai**: API không trả trường này, tài liệu không nêu ngày chuyển chính xác | — |
  | "snapshot" | **Không dùng từ này** cho cache API. Snapshot là bản dump S3 của OpenAlex; hệ thống không dùng | — |

- **Nội dung thêm:** tăng `CACHE_VERSION` `v2 → v3` (lý do có nguồn: OpenAlex Topics docs nêu đổi classifier "in October 2026", keyword đổi 2026-10-05); gửi `corpus=core` tường minh.
- **Acceptance:** (1) response có `dataProvenance` với đúng 4 trường trên, không có `classifierVersion`; (2) đọc lại từ cache trả `fetchedAt` gốc, không phải thời điểm đọc; (3) với fixture, count có `corpus=core` bằng count không có tham số; (4) UI hiển thị "Dữ liệu OpenAlex lấy lúc …".

### P0.7 Mann–Kendall p chính xác khi n ≤ 10 (F9, #4)
- **File:** `trend.statistics.ts`; trang `/docs`.
- **Acceptance:** (1) khớp bảng G0 cho n = 4…10 không ties; (2) có ties: dùng phân phối hoán vị chính xác (n ≤ 10 → ≤ 3.628.800 hoán vị, chấp nhận được) hoặc ghi rõ dùng xấp xỉ; (3) báo cáo số topic đổi verdict trên fixture trước/sau.

### P0 — Exit criteria (độc lập)
- [ ] Tất cả acceptance P0.0–P0.7 đạt; `pnpm typecheck`, `pnpm test` xanh.
- [ ] Không thêm bảng DB, không thêm phương pháp mới, không đổi/xóa trường API cũ.
- [ ] `PHASE_P0_REPORT.md` có: danh sách thay đổi, kết quả test, ví dụ trước/sau cho F1, F2, F4, F5.
- [ ] **Dừng, chờ duyệt P1.**

---

## P1 — GGT và Reference Baseline

### P1.0 Golden dataset G1
- Ví dụ tính tay GGT (năm, mean, SEM).
- **Tái tạo số liệu Nelis:** bài ghi "raw data and yearly GGTs … are specified in the S1 and S2 Files". Tải S1/S2 (PLOS ONE, mở), chọn ≥ 1 lĩnh vực (ví dụ microplastics: "average GGT (2012–2018) = 51% ± 4%") làm golden. *Chưa mở S1/S2 trong Checkpoint 1.5 → nội dung chưa xác minh.*
- **Acceptance:** golden có nguồn (file S1/S2, bảng, dòng).

### P1.1 Series Provider + Baseline (#9)
- **File:** mới `trend.series.ts`, `trend.baseline.ts`; refactor từ `trend.openalex-overview.ts`, `trend.evidence.ts`, `trend.postgres.ts`; `dto/trends.schema.ts` thêm `baseline` (mặc định `field`).
- **Nội dung:** `global` = works có primary topic (`primary_topic.id:!null`) cùng scope **[ĐIỀU CHỈNH]**; trả thêm `unclassifiedSharePct` của scope (đo được 1,7–3,1%/năm 2016–2025 với 5 loại mặc định).
- **Acceptance:** (1) `baseline=field` cho số liệu **giống hệt** P0 trên toàn bộ fixtures (snapshot test hồi quy); (2) `global` dùng 1 request cho mọi topic; (3) baseline không chứa unit → 400.

### P1.2 GGT engine (#10)
- **File:** mới `trend.ggt.ts`.
- **Nội dung:**
  - `annualGgt` = Nelis Eq (i) **[GỐC]**; mẫu số 0 → `null`.
  - `meanGgt` = trung bình cộng + SEM **[SUY LUẬN]** (bài báo cáo "mean ± SEM" nhưng không viết công thức).
  - Điều kiện **áp dụng cứng**: `GGT < 100%` và `số bài ≥ 50 ở mọi năm dùng` (**[SUY LUẬN]** thận trọng: bài không nói "mọi năm" hay "trung bình").
  - Điều kiện "less than 50% year-to-year variation": **không làm cổng**. Trả về chuỗi `ΔGGT_y = GGT_y − GGT_{y−1}` (điểm %) để hiển thị, ghi rõ "tác giả không định nghĩa cách đo". Chọn định nghĩa ở P5 bằng golden S1/S2.
  - `ggtClass` = bảng Nelis; khoảng −10…−5% → "unclassified (khoảng trống trong bài gốc)".
- **Acceptance:** (1) khớp golden G1 (sai số làm tròn ≤ 0,1 điểm %); (2) test thuộc tính `GGT = r × (1 + g_O)`; (3) không có hằng số "50 điểm %" trong code; (4) nhãn Nelis luôn đi kèm chú thích điều kiện ổn định chưa kiểm tra.

### P1.3 Đưa GGT vào API, thay chỉ số thô ở nơi ra quyết định (#11, F16)
- **File:** `trend.openalex-overview.ts`, `trend.openalex-detail.ts`, `trend.evidence.ts`; `modules/gaps/gap-evidence.ts:118-120`.
- **Acceptance:** (1) API trả `ggt` (thêm trường); (2) grep backend + web: không còn quyết định/nhãn dựa trên `growthRatePct`, `cagr3yPct`, `momentum`; (3) test Gaps cập nhật và xanh.

### P1 — Exit criteria
- [ ] P1.0–P1.3 đạt; snapshot hồi quy `baseline=field` không đổi so với P0.
- [ ] Verdict vẫn chỉ từ MK/BH (test: thay GGT không đổi verdict).
- [ ] `PHASE_P1_REPORT.md`. **Dừng, chờ duyệt.**

---

## P2 — Discover Trends và precomputed ranking

### P2.0 Cổng kiểm chứng (bắt buộc trước mọi code P2)
Chạy bằng script **đọc-only** (không ghi DB), có API key, báo cáo số liệu thật:

| Kiểm tra | Cách đo | Đạt khi |
|---|---|---|
| API key hoạt động | cursor trang 2 trả 200 | Không có 401 |
| **Đủ topic** | Với mỗi năm: cursor `group_by=primary_topic.id:include_unknown` tới hết | Số nhóm khác `unknown` = số topic có works năm đó (≤ 4.516); **Σ count các nhóm topic = count của `primary_topic.id:!null`** cùng filter; nhóm `unknown` = count của `primary_topic.id:null` (đã xác nhận ở trang 1 năm 2024: 196.364 = 196.364) |
| **Không dùng `meta.count` làm tổng đã phân loại** | so `meta.count` với Σ nhóm topic | Chênh lệch = đúng nhóm `unknown`; code dùng `!null` cho mẫu số |
| Thứ tự trang | trang cursor sắp theo key (đã quan sát: `unknown`, T10001, …) | Không giả định trang cursor sắp theo count |
| Ngân sách | đếm request và `X-RateLimit-Cost-USD` thực tế cho 1 lần chạy đầy đủ | ≤ 30% quota ngày của key (ước tính: ~23 trang × 10 năm × số scope; 1 trang = $0,0001) |
| Bảo vệ ngân sách của OpenAlex client **[HIỆU CHỈNH 2026-10-22]** | header `X-RateLimit-*` thật (đơn vị credit) + test client giả lập `Remaining` thấp và 429 | Header thật dùng được cho tỷ lệ `Remaining / Limit`; client khóa tới reset khi `Remaining < 20% Limit`; 429 hết ngân sách → 0 retry; 429 tốc độ → retry có backoff |
| Ổn định | chạy 2 lần cách nhau ≥ 1 ngày | Khác biệt count được báo cáo (OpenAlex cập nhật hằng ngày) |

Nếu một dòng không đạt → báo cáo và dừng, không làm P2.1+.

### P2.1 Worker + lưu trữ (04 §2.7–2.8; F6, F8, #6, #14)
- **File:** `workers/trends.worker.ts`, queue, script `worker:trends`; Prisma `trend_series_snapshots`, `trend_results` + migration viết tay (**chỉ chạy khi được duyệt riêng**).
- **Acceptance:** chạy 2 lần trên cùng dữ liệu cache → kết quả giống hệt; BH family = toàn bộ topic của field; mỗi dòng có `fetchedAt`, `cacheVersion`, `corpus`.
- **Acceptance bắt buộc chuyển từ P2.0 [HIỆU CHỈNH 2026-10-22]** — integration test của worker, chạy trên DB/Redis cô lập với OpenAlex giả lập, **trước** mọi lần worker gọi OpenAlex thật:
  1. **Quota thấp:** `Remaining` xuống dưới ngưỡng dự trữ giữa chừng → worker dừng sạch (không ghi dở dòng nào), lưu checkpoint tiến độ, trạng thái job rõ ràng.
  2. **429:** 429 hết ngân sách → dừng tới `X-RateLimit-Reset`, không retry; 429 tốc độ → retry có backoff, không mất trang.
  3. **Job bị ngắt:** process bị dừng giữa một năm/cấp (giữa các trang cursor) → không có snapshot nửa vời được coi là hoàn chỉnh.
  4. **Khôi phục checkpoint:** lần chạy sau (giả lập "hôm sau", quota mới) tiếp tục từ checkpoint, không lấy lại phần đã xong, kết quả cuối giống hệt một lần chạy liền mạch.
  5. **Idempotency:** chạy lại cùng job/cùng ngày không tạo dòng trùng và không đổi kết quả.
  - Lý do chuyển: tiêu chí kiểm tra một worker mà chỉ P2.1 mới được tạo, nên không thể kiểm ở P2.0 (vi phạm quy tắc §0.2 "Acceptance criteria độc lập"). P2.0 chỉ kiểm chứng API, quota, cursor, chi phí và cơ chế bảo vệ ngân sách của client. Ghi nhận: `P2_0_FINAL_GATE.md`.

### P2.2 API & UI Discover
- Danh sách phát hành ở P2: **Trending** (verdict rising), **Fastest Growing** (mean GGT trong rising, đạt điều kiện cứng của Nelis), **Trending by Field**. Không có "Bùng phát gần đây", "Emerging".
- **Acceptance:** trang chủ dùng precompute OpenAlex khi có; đổi `limit` không đổi verdict (test).

### P2 — Exit criteria
- [ ] Báo cáo P2.0 đạt mọi dòng; P2.1–P2.2 đạt; `PHASE_P2_REPORT.md`. **Dừng, chờ duyệt.**

---

## P3 — Explore by Topic và phân tích thời gian

- **P3.0 Golden G3:** danh sách tên → đơn vị mong đợi (ví dụ "Artificial Intelligence" → subfield 1702; "Topic Modeling" → T10028), lấy trực tiếp từ OpenAlex và ghi ngày.
- **P3.1 Resolver đa cấp (#24).** Acceptance: khớp golden G3 100%; khớp tên chính xác vẫn bắt buộc; trùng tên nhiều cấp → trả danh sách lựa chọn.
- **P3.2 Cửa sổ thời gian (F10, #19).** Acceptance: cửa sổ < 5 năm hoàn chỉnh → cảnh báo thay vì verdict im lặng; tham số `indexLagYears` mặc định 1 (giữ hành vi); cảnh báo khi năm cuối có `N_t` thấp bất thường (quy tắc [QUY ƯỚC], ghi rõ).
- **P3.3 Compare theo thị phần (F17, #23).** Acceptance: mỗi unit có `shareSeries`, `classification`, `ggt` riêng; không còn mượn verdict theo tên; bỏ câu "Focus on this direction".
- **Exit:** P3.0–P3.3 đạt; `PHASE_P3_REPORT.md`. **Dừng, chờ duyệt.**

---

## P4 — Burst Detection và Emerging Detection (code sau cờ tắt)

### P4.0 Golden G4
- Ví dụ tính tay `B²_{s,γ}` nhỏ (3–5 lô); chuỗi giả lập (phẳng, bậc thang ×2, xung 1 năm); với Kleinberg dùng mặc định [GỐC] `γ = 1`, `s = 2` như ví dụ SIGMOD/VLDB.
- Bộ keyword mẫu cho EScore-style với điều kiện tính tay.

### P4.1 Burst (#16)
- **Nhãn công khai:** "Bùng phát gần đây (đến hết năm {lastCompleteYear})" / "Recent burst (through {Y})". **Không** dùng "Hot Right Now". Diễn giải đi kèm: "Tỷ lệ bài của chủ đề trong {baseline} cao bất thường trong giai đoạn {start}–{Y}. Dữ liệu năm, không phản ánh các tháng gần đây."
- **Acceptance (code):** khớp G4; `lgamma` cho `d_t` ~10⁷ không tràn số; trả `weight` đúng công thức §4 Kleinberg.

### P4.2 EScore-style (#15)
- **Nhãn công khai (sau cổng):** "Từ khóa có tín hiệu nổi lên — EScore-style (adapted from Porter et al. 2019)".
- **Acceptance (code):** mỗi keyword trả về điều kiện nào đạt/không đạt; chạy một field mẫu trong quota.

### Cổng V-BURST (bắt buộc trước khi bật nhãn burst)
| Kiểm tra | Đạt khi |
|---|---|
| Độ nhạy theo `d_t` lớn | Trên dữ liệu thật của ≥ 1 field: tỷ lệ topic có burst không vượt ngưỡng [QUY ƯỚC đặt trước khi chạy, ví dụ 20%]; nếu vượt → hiệu chỉnh `s`/`γ`, ghi rõ là [ĐIỀU CHỈNH] |
| Ổn định năm cuối | Backtest: tính đến Y−1, rồi thêm năm Y; tỷ lệ burst "còn kéo dài tới Y−1" vẫn được giữ nguyên khi có Y ≥ ngưỡng [QUY ƯỚC đặt trước] |
| Ổn định theo classifier | Số burst trước/sau đổi classifier OpenAlex 10/2026 được báo cáo (dùng dữ liệu v2.0.0 release nếu khả thi) |

### Cổng V-EM (bắt buộc trước khi bật nhãn Emerging)
| Kiểm tra | Đạt khi |
|---|---|
| Backtest | Keyword đạt EScore-style ở cửa sổ kết thúc Y−3 có thị phần năm Y cao hơn nhóm đối chứng (keyword không đạt, cùng cỡ base) — báo cáo hiệu số và khoảng tin cậy |
| Đối chiếu ngoài | So với ≥ 1 danh sách độc lập (ví dụ keyword mới được OpenAlex thêm vào vocabulary) — báo cáo mức trùng, không đặt ngưỡng trước khi xem dữ liệu là không hợp lệ |
| Ổn định vocabulary | Tỷ lệ keyword ID bị gộp/tách giữa hai lần chạy cách nhau ≥ 1 tuần |

- **Exit P4:** code + G4 đạt; báo cáo V-BURST, V-EM (đạt hoặc không đạt đều phải báo cáo). Nhãn chỉ bật cho cổng **đạt**. `PHASE_P4_REPORT.md`. **Dừng, chờ duyệt.**

---

## P5 — Visualization, Explainability và Scientific Validation

- **P5.1 Validation tổng hợp** (`06_VALIDATION.md`): backtest verdict rising/stable; chọn định nghĩa "ổn định" của GGT bằng golden S1/S2 của Nelis (so hai cách hiểu, xem cách nào tái tạo được nhận định của tác giả); so sánh trước/sau classifier (dùng `/text/topics?version=1` **trước 13/01/2027** hoặc dữ liệu v2.0.0 release).
- **P5.2 Lớp Rotolo** (#17): bảng 5 thuộc tính, không điểm tổng.
- **P5.3 Hiển thị:** cờ 2 năm gần nhất cho PP(top10%); biểu đồ thị phần + GGT + vùng burst (nếu cổng đạt); hiển thị `dataProvenance`.
- **P5.4 Dọn dẹp** (F14, F15).
- **Exit:** `06_VALIDATION.md` có số liệu cho từng câu hỏi, kể cả kết quả âm tính; `PHASE_P5_REPORT.md`. **Dừng.**

> Lưu ý thời hạn: việc so sánh trước/sau classifier phụ thuộc endpoint cũ chỉ còn tới **13/01/2027**. Nếu P5 chưa tới trước ngày đó, nên tách riêng bước thu thập dữ liệu so sánh (đọc-only) và làm sớm hơn — cần anh/chị quyết định.

---

## Tổng hợp exit criteria

| Giai đoạn | Exit (độc lập) |
|---|---|
| **P0** | Ngân sách đúng mô hình credit; overview = chi tiết trên fixture; trang chủ ghi rõ local; đơn vị local = primary; không nhãn YoY; `dataProvenance` chỉ chứa dữ liệu quan sát; MK exact p; G0 có nguồn |
| **P1** | `baseline=field` không đổi số; GGT khớp golden Nelis; chỉ 2 điều kiện cứng; không quyết định nào dùng chỉ số thô |
| **P2** | Báo cáo P2.0 đạt mọi dòng; worker idempotent; `limit` không đổi verdict |
| **P3** | Resolver khớp G3; cảnh báo cửa sổ; compare có verdict riêng |
| **P4** | Code khớp G4; V-BURST/V-EM có báo cáo; nhãn chỉ bật khi cổng đạt |
| **P5** | `06_VALIDATION.md` đầy đủ; lớp Rotolo; dọn dẹp |
