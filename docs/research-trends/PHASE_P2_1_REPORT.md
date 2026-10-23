# PHASE P2.1 — OpenAlex Worker & Precomputed Trend Analytics (Checkpoint 2)

> Ngày: 2026-10-23. Nhánh `feat/research-trends-p0`.
> Nền: `5c3788c`, gồm commit `bd88032` (P0 + P1 + P2.0) và commit cổng P2.0 (5 file báo cáo/bằng chứng, đã commit ở bước 0).
> Thay đổi P2.1 **chưa commit**.
> Phạm vi: chỉ P2.1 của `05_IMPLEMENTATION_PLAN.md` (Checkpoint 1.5, hiệu chỉnh 2026-10-22). Không làm P2.2. Không thu thập OpenAlex thật.

## 0. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Lưu trữ | 6 bảng mới + 1 migration viết tay. Chỉ áp dụng lên DB thử cô lập `lumigap_p1_test` |
| Thu thập | `group_by` theo năm × {topic, domain, field, subfield} + danh mục topic, đủ mọi trang cursor; giữ nhóm `unknown` |
| Ngân sách | Đọc usage thật của key (`/rate-limit`) và header từng trang; trần 30%/ngày cho mọi lần chạy; giữ dự trữ 20% của client; phân biệt 429 quota và 429 tốc độ |
| Checkpoint | Mỗi trang = 1 transaction (dữ liệu + log trang + cursor), có lease và `checkpoint_version` |
| Kích hoạt | Validate bắt buộc → analytics P1 → kích hoạt trong 1 transaction; DB chặn 2 snapshot active cùng scope |
| Test bắt buộc (5 nhóm) + test bổ sung | **21/21 PASS** trên PostgreSQL + Redis thật, OpenAlex là mock server HTTP |
| Hồi quy backend | 1.521 pass / 0 fail / 399 skip (P1: 1.491 / 0 / 399, +30 test mới); integration theo cờ 152 / 1 skip (= P1) |
| Credit OpenAlex dùng trong P2.1 | **0** |
| Mobile | Không đổi (235 file trùng từng byte) |
| Quyết định | **CONDITIONAL** cho P2.2 (§12) |

## 1. Files changed

**Mới:**
- `apps/backend/prisma/trend-snapshots.prisma`: 6 model.
- `apps/backend/prisma/migrations/20261023000100_trend_snapshots/migration.sql`: viết tay theo `docs/prisma-migrations.md`.
- `apps/backend/src/modules/trends/trend.snapshot-collector.ts`: thu thập, lease, checkpoint, quy tắc độ tươi, tạm dừng/lỗi.
- `.../trend.snapshot-budget.ts`: ngân sách credit (thuần).
- `.../trend.snapshot-validation.ts`: 8 kiểm tra bắt buộc (đính chính 2026-10-23: bản đầu ghi nhầm là 9).
- `.../trend.snapshot-analytics.ts`: analytics từ các hàm P1 (thuần).
- `.../trend.snapshot.service.ts`: điều phối job, kích hoạt nguyên tử, hàm đọc snapshot active.
- `apps/backend/src/workers/trends.worker.ts`: BullMQ worker; script `worker:trends`.
- Test:
  - `__tests__/trend.snapshot.integration.test.ts` (21 test);
  - `__tests__/trend.snapshot-budget.test.ts` (3);
  - `__tests__/trend.snapshot-analytics.test.ts` (6);
  - `__tests__/helpers/mock-openalex-server.ts`.

**Sửa:**
- `trend.openalex-client.ts`:
  - `fetchJson` trả thêm header;
  - thêm `openAlexGetLive` (không cache, trả header rate-limit) và `openAlexRateLimitStatus` (`/rate-limit`, 0 credit);
  - thêm `resetOpenAlexBudgetLockForTests`.
  - `openAlexGet` hoạt động như cũ; 11/11 test client cũ PASS.
- `config/env.ts`: `TRENDS_COLLECTION_BUDGET_FRACTION` (mặc định 0,3, **tối đa 0,3**), `TRENDS_COLLECTION_LEASE_SECONDS` (300), `TRENDS_COLLECTION_PAGE_DELAY_MS` (100, tối thiểu 35), `TRENDS_COLLECTION_CRON` (tùy chọn, **không mặc định**).
- `infrastructure/queue.ts`: queue `trends-snapshot`.
- `worker-heartbeat.ts`, `pipeline.service.ts`: thêm tên worker/queue vào kiểu.
  - Không thêm vào `EXPECTED_WORKERS`, giống `worker:manuscript-compile`: worker tùy chọn, không báo "thiếu worker" ở nơi không chạy nó.
- `apps/backend/package.json`: script `worker:trends`.
- `docs/environment-variables.md`: 4 biến mới.

**Không đổi:**
- Công thức P1 (`trend.ggt.ts`, `trend.verdict.ts`, `trend.statistics.ts`, `trend.series.ts`);
- web, shared-types, mobile;
- API hiện có: chưa có endpoint mới; P2.2 sẽ dùng `getActiveSnapshotResults`.

## 2. Kiến trúc và schema

| Bảng | Vai trò | Ràng buộc chính |
|---|---|---|
| `trend_snapshots` | Danh tính và trạng thái snapshot: scope (`scope_filter`, `work_types`, `corpus`, `scope_hash`), cửa sổ (`year_from`, `last_complete_year`), `collection_day`, phiên bản thu thập/analytics, lease, `requests`, `credits_used`, `first/last_fetched_at`, `validation` (JSON), mốc thời gian | `snapshot_key` unique; CHECK trạng thái; CHECK "active ⇒ status active + đã validate + có analytics"; **unique một phần `(scope_hash) WHERE is_active`** |
| `trend_snapshot_units` | 41 đơn vị thu thập: `catalogue` + 10 năm × 4 cấp. Giữ cursor, số trang, `meta_count`, `checkpoint_version` | unique `(snapshot, level, year)`; CHECK complete ⇔ cursor null |
| `trend_snapshot_pages` | Log từng trang đã commit: cursor vào/ra, số nhóm, khóa đầu/cuối, `meta_count`, hash nội dung, credit, `Remaining`, `fetched_at` | unique `(unit, page_index)` |
| `trend_snapshot_counts` | Số công trình theo năm cho mỗi đơn vị của mỗi cấp; `unit_key = 'unknown'` là phần chưa phân loại | **PK `(snapshot, level, unit_key, year)`**: nhóm xuất hiện 2 lần là lỗi, không ghi đè |
| `trend_snapshot_topics` | Danh mục topic (subfield/field/domain) lúc thu thập | PK `(snapshot, topic)` |
| `trend_snapshot_results` | Analytics tính sẵn cho mỗi topic × baseline | PK `(snapshot, baseline, topic)`; CHECK verdict; CHECK nhóm Nelis ⇒ đủ điều kiện |

**Trạng thái:**
- `collecting` → (`paused_budget` ↔ `collecting`)* → `validated` → `active` → `superseded`.
- Thất bại: `failed` (lỗi dữ liệu khi thu thập) hoặc `validation_failed`.
- Ứng dụng chỉ đọc snapshot `is_active` (`getActiveTrendSnapshot`, `getActiveSnapshotResults`).

**Migration:**
- Chỉ áp dụng lên `lumigap_p1_test` (container cô lập `lumigap-p1-verify-pg`, cổng 55434): 94/94 migration.
- Đã xác nhận `prisma7.config.ts` dùng `DATABASE_URL` của môi trường (dotenv không ghi đè biến đã có).
- **Không** áp dụng lên DB dev hay production.

## 3. Chiến lược thu thập

- Thiết kế đã đo ở P2.0 (310 credit cho 10 năm × 4 cấp + 23 trang danh mục ≈ 333 credit ≈ 3,3% quota ngày của free key). **Không** gọi theo từng topic, vì 4.516 request ≈ 45% quota.
- Lọc theo scope mặc định của app (`DEFAULT_WORK_TYPES_CLAUSE`), `corpus=core`, cửa sổ `resolveTrendWindow` (năm 2026 → 2016–2025).
- Mỗi đơn vị chạy cursor tới khi `next_cursor = null`, gồm cả trang rỗng cuối. `group_by=…:include_unknown`, khóa chuẩn hóa bằng `shortId`.
- Không giả định thứ tự trang theo count. Không dừng ở trang đầu hay 200 nhóm đầu.
- **Các quy tắc [QUY ƯỚC] khi tiếp tục lại** (lý do: count OpenAlex thay đổi hàng trăm bài mỗi ngày, P2.0 §14):
  - Cursor cũ hơn 1 giờ → lấy lại đơn vị đó.
  - Một năm đã thu một phần mà cũ hơn 6 giờ → lấy lại cả năm, để 4 cấp của năm đó khớp chính xác với nhau.
  - Snapshot dở dang cũ hơn 72 giờ → bỏ (`failed: STALE_UNFINISHED`), tạo snapshot mới.
- **Chống lỗi dữ liệu khi thu thập:**
  - Cursor không tiến → `CURSOR_DID_NOT_ADVANCE`.
  - Nhóm trùng giữa các trang → `DUPLICATE_GROUP`, nhờ PK.
  - Quá 200 trang một đơn vị → `TOO_MANY_PAGES`.

## 4. Bảo vệ ngân sách

- **Trước khi chạy:** đọc `/rate-limit` (0 credit), lấy `credits_limit`, `credits_used` và `credits_remaining` thật. Phần các tiến trình khác dùng chung key đã tiêu cũng được tính vào. Không dùng số liệu của báo cáo hôm trước.
  - Không đọc được → tạm dừng (`RATE_LIMIT_STATUS_UNAVAILABLE`), không thu thập "mù".
- **Trước mỗi trang**, `allowed = min(trần thu thập, dự trữ key)`:
  - **Trần thu thập:** `⌊0,3 × limit⌋` − credit trend collection đã tiêu trong ngày UTC, tính từ `trend_snapshot_pages`, qua mọi lần chạy và mọi snapshot. Env không cho đặt quá 0,3.
  - **Dự trữ key:** `Remaining` thật (header của trang trước) − `⌈0,2 × limit⌉`, đúng ngưỡng `BUDGET_RESERVE_FRACTION` của client.
  - Client đã khóa key (`isOpenAlexBudgetAvailable() = false`) → tạm dừng.
- **429:**
  - Hết ngân sách ngày (`Remaining < 1`) → client không retry, khóa tới reset → worker `paused_budget` (`QUOTA_429`).
  - 429 tốc độ (còn credit) → client retry theo `Retry-After`.
  - 5xx và lỗi mạng → client retry 2 lần, sau đó job retry theo backoff BullMQ (bắt đầu 30 s), tiếp tục từ checkpoint.
- **Credit ghi nhận thật:** `x-ratelimit-credits-used` của từng trang vào `trend_snapshot_pages.credits_used` và cộng dồn vào `trend_snapshots.credits_used`.
- **Key không bao giờ bị log:** chỉ gửi qua header `Authorization`, không có trong URL, log hay DB. Test đặt `OPENALEX_API_KEY` giả nên key thật không gửi tới đâu.
- **Tạm dừng:** ghi `paused_reason` và `resume_after` (reset của key, hoặc 00:00 UTC kế tiếp khi chạm trần), nhả lease. Worker tự đặt lại job có delay tới sau thời điểm đó.

## 5. Checkpoint, tiếp tục lại và idempotency

- **Một trang = một transaction:**
  1. Kiểm lease (`lease_owner_id`) và gia hạn.
  2. Tiến cursor của đơn vị, với điều kiện đúng `checkpoint_version` và cursor cũ.
  3. Ghi log trang.
  4. Ghi các dòng count/topic.
  Sai một bước → không ghi gì. Crash giữa lúc lấy và lúc commit chỉ mất trang đang bay (lấy lại, 1 credit); không bao giờ ghi một trang hai lần.
- **Một người ghi:**
  - Snapshot được nhận bằng `UPDATE … WHERE lease hết hạn / trống`.
  - Hai worker cùng tạo snapshot → `P2002` → bên thua đọc bản của bên thắng → chỉ một bên nhận được lease.
  - Validate và kích hoạt chạy dưới cùng lease đó.
- **Idempotent:**
  - Cùng scope, cửa sổ, phiên bản và ngày UTC → cùng `snapshot_key`.
  - Snapshot đã active → `already_active`, 0 request.
  - Snapshot `validated` nhưng chưa kích hoạt → kích hoạt lại, không lấy lại dữ liệu.
  - Analytics ghi lại bằng `deleteMany` + `createMany` trong cùng transaction.
- **Giới hạn:** OpenAlex là API sống. Một snapshot tiếp tục qua nhiều lần chạy là ghép của các thời điểm thu thập khác nhau (`first_fetched_at` … `last_fetched_at`, `fetched_at` từng trang), **không** phải snapshot lịch sử nguyên tử. Chỉ trong cùng một năm, 4 cấp được bảo đảm cùng một khoảng thời gian ≤ 6 giờ.

## 6. Bảo đảm nhất quán snapshot và giới hạn

Kiểm tra bắt buộc trước khi kích hoạt (`trend.snapshot-validation.ts`). Kết quả mọi kiểm tra, kể cả khi đạt, được ghi vào `trend_snapshots.validation`:

| Kiểm tra | Bắt được |
|---|---|
| `all_years_and_levels_present` | Thiếu năm hoặc cấp |
| `cursor_pages_complete` | Đơn vị chưa xong; khoảng trống `page_index`; chuỗi cursor đứt; trang cuối còn cursor; trang trùng nội dung |
| `groups_reconcile_with_meta_count` | **Mất trang**: Σ nhóm (kể cả unknown) ≠ `meta.count`; danh mục thiếu topic |
| `classified_unclassified_reconcile` | Σ đã phân loại và `unknown` khác nhau giữa 4 cấp |
| `topics_in_catalogue` | Topic có trong `/works` nhưng không có trong `/topics` |
| `taxonomy_levels_reconcile` | Tổng topic theo cây danh mục ≠ count domain/field/subfield, từng đơn vị, cả hai chiều |
| `no_duplicate_unit_year_rows` | Dòng trùng (PK đã chặn; ghi nhận lại) |
| `baseline_data_present` | Năm không có công trình đã phân loại |

- Một kiểm tra sai → `validation_failed`. Bằng chứng giữ lại: dữ liệu, log trang, chi tiết lỗi. Snapshot active trước đó **vẫn active**.
- **Kích hoạt nguyên tử:** một transaction gồm ghi kết quả, chuyển snapshot active cũ sang `superseded`, đặt snapshot mới `active`. Lỗi giữa chừng → rollback toàn bộ (test §8).
- Index unique một phần ở DB chặn trường hợp có 2 snapshot active cùng scope.

## 7. Analytics tính sẵn

- Dùng nguyên các hàm P1: `buildShareRows`, `shareTrendStatistics` (MK chính xác khi n ≤ 10, Sen + CI95), `benjaminiHochberg`, `classifyTrend`, `computeGgt`. **Không viết lại công thức.**
- **Baseline:** `global` (N_t = Σ topic đã phân loại = `primary_topic.id:!null`, đã đối soát), `domain`, `field`, `subfield`.
- **Họ BH [QUY ƯỚC, kế hoạch §P2.1]:**
  - Mọi topic có p trong **cùng đơn vị baseline**, tính một lần trên toàn snapshot (global: mọi topic). Không tính theo trang hay theo danh sách hiển thị.
  - Ghi `q_family_key` và `q_family_size`.
- **Mỗi dòng:**
  - share series, MK (s, z, τ, p, cách tính p), Sen, CI95, thay đổi tương đối, p, q, verdict, confidence, reasons;
  - GGT đầy đủ (từng năm + lý do null), mean, SEM, số năm;
  - `ggt_conditions_met` (mọi GGT năm < 100% và ≥ 50 bài mỗi năm);
  - `nelis_threshold_group` (chỉ khi đủ điều kiện, CHECK ở DB);
  - `stability_checked = false`.
- **Tách rõ** verdict thống kê (MK/BH) / GGT mô tả / nhóm ngưỡng Nelis **chưa xác minh**.
  - Tên cột không dùng chữ "consistent". Tên giá trị lấy từ P1 (`consistent_growth`…) chỉ là mã nội bộ; không có nhãn người dùng mới nào được tạo.
  - GGT lớn từ nền nhỏ không bao giờ có nhóm Nelis (test §8).
- **Provenance:** `collection_version` (`p2.1-collect-v1`), `analytics_version` (`p2.1-analytics-v1`), scope, cửa sổ, `corpus`, `first/last_fetched_at` trên snapshot; `fetched_at` trên từng trang.

## 8. Kết quả test thực tế

**Môi trường:**
- PostgreSQL 16 + pgvector (`lumigap-p1-verify-pg`, DB `lumigap_p1_test`), Redis (`lumigap-p1-verify-redis`).
- OpenAlex là mock server HTTP chạy trong tiến trình test (`127.0.0.1`, cổng ngẫu nhiên). Hành vi lấy từ P2.0: sắp theo key, `unknown` đầu, trang rỗng cuối, `meta.count`, header credit, `/rate-limit`.
- Dữ liệu mock: 8 topic, 4 subfield, 3 field, 2 domain, 10 năm, 3 nhóm/trang ⇒ **124 trang** một snapshot.

**Worker integration test (`trend.snapshot.integration.test.ts`): 21/21 PASS (48 s)**

| Nhóm | Test | Kiểm chứng chính |
|---|---|---|
| Cơ bản | Thu thập → validate → analytics → active | 124 request = 124 credit; mọi count và `unknown` đúng như mock; 32 dòng kết quả |
| Cơ bản | Họ BH đầy đủ | q = BH độc lập trên từng họ; họ field = {11: 4, 12: 2, 22: 2} topic, không theo trang; kết quả = `computeSnapshotAnalytics` trên dữ liệu gốc |
| **1. Quota thấp** | Dừng ở dự trữ key, giữ checkpoint, chạy tiếp hôm sau | Dừng đúng sau 45 trang (`KEY_RESERVE`), lease nhả, không active; năm 2019 dở dang (topic xong, domain đang ở cursor ≠ `*`). Hôm sau: lấy lại cả năm 2019, giữ 2016–2018: tổng 45 + 84 request, không thừa |
| 1. Quota thấp | Trần 30% | Dừng ở 50 credit (`COLLECTION_CAP`); chạy lại trong ngày → 0 request |
| **2. 429** | 429 tốc độ | 2 lần 429 → retry, 126 request, không mất trang, vẫn active |
| 2. 429 | 429 hết quota | Đúng 1 request bị 429, **không retry**; `paused_budget` (`QUOTA_429`), client khóa; 11 trang đã commit được giữ |
| **3. Ngắt giữa chừng** | Crash sau trang 17 | `collecting`, không active, lease nhả; snapshot hôm trước vẫn active |
| 3. Ngắt giữa chừng | Lỗi mạng kéo dài hơn số lần retry | Không xuất bản; 8 trang đã commit, tiếp tục được |
| **4. Tiếp tục lại** | Từ cursor đã lưu | Crash sau 23 trang, worker khác tiếp tục: tổng **đúng 124** request; nội dung lưu **giống hệt** một lần chạy liền mạch |
| 4. Tiếp tục lại | Crash giữa một năm | Nội dung giống hệt lần chạy liền mạch |
| 4. Tiếp tục lại | Cursor quá hạn (2 giờ) | Chỉ lấy lại 2 trang của đơn vị đó (126 request) |
| **5. Idempotency** | Chạy lại sau khi active | `already_active`, 0 request, 1 snapshot, nội dung không đổi |
| Đồng thời | 2 job cùng lúc | Một `activated`, một `locked`; 1 snapshot, 124 request, 1 active |
| Đối soát | Topic không có trong danh mục | `validation_failed` (`topics_in_catalogue`); snapshot cũ vẫn active, 0 kết quả mới |
| Đối soát | `unknown` khác giữa các cấp | `validation_failed` (`classified_unclassified_reconcile`) |
| Đối soát | Taxonomy lệch 1 bài | `validation_failed` (`taxonomy_levels_reconcile`) |
| Đối soát | Mất một trang cursor | `validation_failed` (`groups_reconcile_with_meta_count`) |
| Đối soát | Trang cursor bị lặp | `failed` (`DUPLICATE_GROUP`), không ghi đè |
| Đối soát | Cursor không tiến | `failed` (`CURSOR_DID_NOT_ADVANCE`) |
| Kích hoạt nguyên tử | Lỗi trong transaction kích hoạt | Không xuất bản gì (`validated`, 0 kết quả, snapshot cũ active); chạy lại → kích hoạt **không lấy lại dữ liệu**; cũ → `superseded` |
| Kích hoạt nguyên tử | DB chặn 2 active | `UPDATE` thứ hai bị index unique một phần từ chối |

Sau suite: `trend_snapshots` = 0 dòng.

**Unit test mới:**
- `trend.snapshot-budget.test.ts`: 3/3.
- `trend.snapshot-analytics.test.ts`: 6/6. Kết quả = pipeline P1 cho từng topic; họ BH global/đơn vị; topic không có bài bị loại; nền nhỏ không có nhóm Nelis; thiếu đơn vị cha → lỗi rõ.

**Cổng chất lượng:**

| Gate | Kết quả |
|---|---|
| Typecheck backend (`tsc --noEmit`) | PASS |
| Lint backend (`eslint src`) | 0 error, 5 warning, **đều có từ trước** (cùng 5 warning như báo cáo P1, trong file P2.1 không sửa); file P2.1: 0 problem |
| Build backend (`tsc -p tsconfig.build.json`, thư mục tạm) | PASS (có `workers/trends.worker.js`) |
| Prisma generate | PASS (Prisma 7.10.0) |
| Backend vitest đầy đủ (DB cô lập, `TRENDS_INTEGRATION=1`) | **1.521 pass / 0 fail / 399 skip** (P1: 1.491 / 0 / 399; +30 = 21 + 3 + 6 test mới) |
| Integration theo cờ (7 file, `--maxWorkers=1`) | 152 pass / 1 skip (= P1) |
| Test client OpenAlex cũ | 11/11 + 4/4 khởi động PASS |
| Web | Không thay đổi file web, nên không chạy lại; số liệu P1: 893 / 11 lỗi có sẵn |

## 9. Credit OpenAlex đã dùng

**0.** P2.1 không gửi request nào tới `api.openalex.org`. Mọi test dùng mock server cục bộ với key giả. Không chạy worker thật.

## 10. Rủi ro còn lại

1. **Chưa có snapshot thật nào được thu thập.** Worker mới được kiểm chứng trên mock. Lần chạy thật đầu tiên (≈ 333 credit, 3,3% quota) chưa chạy, cần duyệt. Có thể lộ khác biệt nhỏ của API thật chưa được mock mô phỏng, ví dụ số trang hay độ trễ.
2. **Key dùng chung.** Trần và dự trữ dựa trên usage thật, nhưng nếu tiến trình khác tiêu nhanh trong lúc chạy, worker chỉ thấy điều đó qua header trang kế tiếp (chậm 1 trang).
3. **Snapshot ghép nhiều thời điểm** khi tiếp tục lại qua ngày (§5). P2.2 phải hiển thị ngày dữ liệu (`first/last_fetched_at`).
4. **Provenance theo từng dòng:** kế hoạch ghi "mỗi dòng có `fetchedAt`, `cacheVersion`, `corpus`". Hiện các trường này nằm trên snapshot và từng trang, không lặp lại trên mỗi dòng kết quả; `cacheVersion` không áp dụng vì snapshot không dùng cache, thay bằng `collection_version` và `analytics_version`. Đề xuất: API P2.2 trả provenance của snapshot kèm mọi kết quả. Cần duyệt.
5. **Verdict sát ngưỡng thay đổi qua ngày** (P2.0: 7/4.426). Snapshot lưu p, q và họ BH để giải thích, nhưng P2.2 phải hiển thị đúng.
6. **Baseline khác nhau cho kết luận khác nhau.** Lưu cả 4 baseline; P2.2 phải luôn ghi baseline và cửa sổ.
7. **Mã `consistent_*`** (giá trị `nelis_threshold_group`, từ P1) vẫn là mã nội bộ. Nhãn web "Consistent growth" vẫn chờ quyết định trước P2.2 (P2_0_FINAL_GATE §6.7).
8. **Giới hạn khoa học giữ nguyên:**
   - mean ± SEM chỉ tái tạo 4/12 giá trị Nelis;
   - quy tắc ổn định 50% chưa xác minh;
   - count lịch sử OpenAlex đổi hằng ngày;
   - GGT không thay MK/Sen/BH.
9. **Môi trường:** khi Docker Desktop khởi động lại, container dev `lumi-gap-postgres-1` và `lumi-gap-redis-1` tự chạy theo restart policy của chúng. Phiên này **không kết nối, không sửa** chúng.

## 11. Mobile

- Snapshot sha256 của 235 file `apps/mobile` + `apps/flutter_mobile` trước P2.1 (trùng snapshot trước P1) và sau P2.1: **trùng từng byte**.
- `git status` của 2 thư mục: rỗng.
- Không chạy Flutter/Dart. Không dùng lệnh git phá hủy.

## 12. Quyết định cổng: **CONDITIONAL** (cho P2.2)

Code, schema và toàn bộ test bắt buộc của P2.1 đều đạt: 5 nhóm acceptance chuyển từ P2.0 + 7 nhóm bổ sung, 0 hồi quy. Chưa đề xuất READY FOR P2.2 vì:
1. **Chưa có snapshot thật nào được kích hoạt.** P2.2 cần dữ liệu thật. Đề xuất: được duyệt một lần chạy thật của `worker:trends` (≈ 333 credit), sau preflight quota, rồi kiểm tra kết quả validation trước khi bắt đầu P2.2.
2. **Provenance theo từng dòng** (§10.4): cần chấp nhận cách "provenance ở snapshot + trang" hoặc yêu cầu thêm cột.
3. Quyết định về nhãn "consistent_*" trên web (đã có từ P2.0).

Migration vẫn **chỉ** chạy trên DB thử cô lập. Áp dụng lên DB dev/production cần duyệt riêng.

**Dừng ở P2.1. Không bắt đầu P2.2. Chưa commit thay đổi P2.1. Chờ review.**
