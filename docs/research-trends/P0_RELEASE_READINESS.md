# P0 Release Readiness — Checkpoint 2 gate

> Ngày: 2026-10-21 · Nhánh `feat/research-trends-p0` @ `5a9d228` + thay đổi P0 (**chưa commit, chưa push, chưa merge**).
> Chi tiết bằng chứng: `PHASE_P0_REPORT.md` §2–§4 và §7. Tiêu chí nghiệm thu giữ nguyên như đã duyệt trong `05_IMPLEMENTATION_PLAN.md` (bản 1.5); các đề xuất điều chỉnh tiêu chí nằm riêng ở mục 3.

## 1. Bảng nghiệm thu

| Criterion | Status | Evidence | Remaining Risk |
|---|---|---|---|
| Đang ở `feat/research-trends-p0`, không mất thay đổi, không có thay đổi ngoài phạm vi | PASS | `git status`: 37 file sửa + 13 mục untracked, đều thuộc trends, home, shared-types, i18n trends/home, docs; mobile không đổi; đã so khớp diff trước/sau khi chuyển nhánh | Thay đổi chưa commit |
| P0.0 Golden G0 có trước khi sửa thuật toán, có nguồn và ngày | PASS | `__tests__/fixtures/` (README + 3 JSON); G0 pass 8/8 trên code chưa sửa | Bảng p dùng liệt kê n! thay vì bảng in (đề xuất 3.1) |
| P0.1 Ngân sách theo tỷ lệ; 429 hết ngân sách không retry; bỏ `mailto` | PASS | `trend.openalex-client.test.ts` 11/11 với header thật; trên code gốc 10/11 fail | Test "no mailto" yếu (cũng pass trên gốc) |
| P0.1 Cảnh báo production thiếu `OPENALEX_API_KEY` | PASS | `trend.openalex-client-startup.test.ts` 4/4; trên gốc 2/4 fail | Chưa biết production có key hay không |
| P0.2 Overview = Detail (OpenAlex, cùng Data Scope) | PASS | Unit test (cùng chuỗi filter); **dữ liệu OpenAlex thật**, 8 topic (đầu và cuối danh sách): S, p, Sen, số năm, số bài giống hệt | — |
| P0.2 Một response một nguồn | PASS | `trend.consistency.test.ts`; test tích hợp local: `dataSource = statistics.source = local` | — |
| P0.2 UI ghi rõ p (một giả thuyết) / q (BH, n topic) | PASS | `trend-provenance-ui.test.tsx` (render jsdom), trên gốc fail | — |
| Overview và Detail dùng cùng phạm vi ở **local path** | PARTIAL | n_t giống nhau (test DB); N_t khác nhau — đã có từ trước khi không lọc, P0.4 làm lệch thêm khi lọc theo field (bảng thăm dò ở report §7.2); giữ hiển thị bằng `it.fails` | Chỉ ảnh hưởng con số mô tả của dữ liệu local (verdict luôn "insufficient"); xử lý ở P1.1 |
| P0.3 Trang chủ không gọi kho local là xu hướng | PASS | `home.postgres.trends.test.ts`, `research-home.test.tsx` | Web/mobile không hiển thị danh sách topic của trang chủ (đính chính F3) |
| P0.4 Đếm theo primary topic; tổng thị phần ≤ 100% | PASS | `trend.local.integration.test.ts` trên PostgreSQL thật; trên gốc 2 test đếm fail | — |
| P0.4 `topicId` khớp chính xác; cửa sổ 10 năm hoàn chỉnh không lệch một năm | PASS | `trend.consistency.test.ts`, `trend.window.test.ts`, `trend.postgres.test.ts` | — |
| P0.5 Không còn nhãn dựa trên `growthRatePct` — **web** | PASS | grep; `trends.insights.test.ts`, `trend-helpers.test.ts`, `trend.keyword-rank.test.ts` | — |
| P0.5 Không còn nhãn dựa trên số thô — **mobile** | FAIL | `apps/flutter_mobile/lib/features/home/presentation/home_screen.dart:258-270, 426` ("growing rapidly", màu theo `momentum`); có từ trước, ngoài danh sách file của P0.5 | Người dùng mobile thấy kết luận không có căn cứ. Không kiểm chứng được bản sửa (Flutter cần Dart ≥ 3.12) |
| P0.5 Keyword xếp theo effect size | PASS | `trend.keyword-rank.test.ts` (trường hợp z ngược thứ tự), local cùng kiểm định | — |
| P0.6 Provenance chỉ gồm dữ liệu quan sát, `fetchedAt` gốc | PASS | Unit test đồng hồ giả; **dữ liệu thật**: lần đọc cache trả đúng `fetchedAt` của lần lấy đầu; UI test | — |
| P0.6 `corpus=core` không đổi số đếm | PASS | 2 request thật, 10 năm, giống hệt (G0) | — |
| P0.7 p chính xác khớp phân phối n! (n = 3…10, mọi S), không liệt kê hoán vị | PASS | `trend.mann-kendall-exact.test.ts`; benchmark 100 000 kiểm định ≈ 173–313 ms (liệt kê 10!: 506 ms mỗi topic) | — |
| P0.7 Chỉ dùng khi n ≤ 10 và không ties | PASS | Code + test (n = 12 → normal; có ties → normal) | — |
| P0.7 Số topic đổi verdict trước/sau | PASS | Dữ liệu thật, family BH đầy đủ 150 topic: 0 thay đổi (kể cả mức tin cậy) | Chỉ đo trên một field, một cửa sổ |
| GGT chưa được triển khai hay dùng để kết luận | PASS | `grep -i ggt` (trừ code Prisma sinh tự động): không có | — |
| Không tạo migration, không chạm DB production hay dev | PASS | Chỉ áp migration có sẵn vào DB `*_test` dùng một lần; mọi lệnh truyền `DATABASE_URL` tường minh; container đã xoá | — |
| Dependencies đồng bộ theo lockfile | PASS | `pnpm install --frozen-lockfile`: up to date, lockfile không đổi | — |
| Typecheck (shared-types, backend, web) | PASS | `tsc` exit 0 cả ba | Không chạy qua `pnpm typecheck` (S2) |
| Build (backend, web) | PASS | exit 0 cả hai | Build backend xuất ra thư mục tạm; bước copy mail assets không chạy |
| Lint (file đã sửa) | PASS | 0 lỗi; 11 cảnh báo đều có sẵn từ trước | — |
| Backend test với DB thật | PASS | 1 456 pass, 0 fail, 399 skip (tự bỏ qua theo flag); integration theo flag 148/148 | 23 file tự bỏ qua theo flag riêng chưa chạy (không liên quan trends) |
| Web test | PARTIAL | 890 pass, 10 fail; 10 lỗi có sẵn y hệt trên `5a9d228` (i18n locales 2, project navigation 8); 1 lỗi không ổn định (onboarding) | Bộ test web chưa xanh vì lỗi có sẵn |
| Không có regression do P0 | PASS | So sánh từng file với `5a9d228` trong cùng môi trường (report §4.3): không file nào fail trên P0 mà pass trên gốc | Mobile và e2e chưa kiểm chứng |
| Mobile build/test | BLOCKED | `flutter analyze/test`: cần SDK ^3.12.0, máy có Dart 3.11.5 | P0 không sửa mobile, nhưng mục P0.5 mobile ở trên chưa được xử lý |

## 2. Quyết định

**CONDITIONAL.**

Các kiểm thử trọng yếu của P0 đều đạt và có bằng chứng:
- Tính toán: G0, p chính xác, đối chiếu dữ liệu thật.
- Dữ liệu: primary topic trên PostgreSQL thật, cùng phạm vi trên dữ liệu OpenAlex thật.
- Ngân sách và provenance.

So với `5a9d228` không có regression mới. Chưa thể ghi **READY FOR P1** vì còn ba vấn đề, đều có từ trước P0 hoặc nằm ngoài danh sách file đã duyệt, cần anh/chị xem và chấp nhận rõ ràng:

| # | Điều kiện | Vì sao không phải NOT READY | Cần anh/chị quyết định |
|---|---|---|---|
| C1 | **Mobile còn nhãn kết luận từ số thô** (FAIL ở trên) | Có từ trước P0. Danh sách file của P0.5 chỉ có web. Không phải lỗi tính toán; là nhãn hiển thị. Không kiểm chứng được bản sửa ở máy này | Chọn một: (a) cung cấp Flutter SDK ≥ 3.12 để tôi sửa và kiểm chứng trong P0; (b) cho phép sửa không kèm kiểm chứng biên dịch (không khuyến nghị); (c) chấp nhận chuyển thành việc đầu tiên của P1 |
| C2 | **Mẫu số N_t ở local path lệch giữa overview và chi tiết** (PARTIAL) | Đã có từ trước khi không lọc theo field; chỉ ảnh hưởng con số mô tả vì verdict local luôn "insufficient". Path OpenAlex (nguồn dùng để kết luận) đã nhất quán trên dữ liệu thật | Chấp nhận để P1.1 xử lý, hoặc yêu cầu sửa ngay trong P0 |
| C3 | **Bộ test web chưa xanh** (10 lỗi có sẵn trên `5a9d228`) | Không do P0 gây ra (cùng lỗi, cùng số lượng) | Chấp nhận như hiện trạng của `main` |

Nếu chấp nhận C1–C3 (hoặc đã xử lý xong C1), tôi đề nghị coi P0 là **READY FOR P1**.

## 3. Đề xuất điều chỉnh tiêu chí (cần người phụ trách duyệt; chưa áp dụng)

1. **P0.0 — nguồn bảng p chính xác.** Tiêu chí ghi "bảng in sẵn (Kendall 1975 / Helsel 2020)". Đã dùng liệt kê đầy đủ n! (định nghĩa của phân phối chính xác). Đề xuất ghi nhận liệt kê n! là nguồn hợp lệ, hoặc bổ sung đối chiếu với bảng in khi có tài liệu.
2. **P0.4 (4) — công thức cửa sổ.** Tiêu chí ghi "local mặc định `yearTo − 10`". Theo yêu cầu bổ sung số 1 của anh/chị, đã dùng `lastCompleteYear − 9` (10 năm hoàn chỉnh). Đề xuất sửa câu chữ tiêu chí cho khớp.
3. **Phạm vi P0.5.** Đề xuất ghi rõ P0.5 có áp dụng cho mobile hay không. Nếu có, C1 trở thành điều kiện bắt buộc.

## 4. Việc tôi **không** làm

- Không commit, push hay merge; không chuyển nhánh.
- Không tạo migration; không kết nối DB production hay dev.
- Không sửa code mobile (không kiểm chứng được).
- Không bắt đầu P1–P5.
