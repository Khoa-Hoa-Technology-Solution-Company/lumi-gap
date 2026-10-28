# 06 — Checklist chụp màn hình cho Report 3

> Liên quan: [04 B-08](04_MY_DOCUMENTATION_TASKS.md) · [03 AU-16](03_DOCUMENTATION_AUDIT.md)
> Nguồn: dòng "Screen layout" của từng FR trong Report 3 §3.2–3.9 (48 FR ghi "Visual mock-up to be attached … (TBD)") và bảng màn hình R3 §3.1.2.
> **Ảnh dán vào đâu:** trong Report 3, ở mục của từng FR, thay câu "Visual mock-up to be attached from the build at commit ca8fe4d (TBD)." bằng hình. Giữ nguyên phần "Textual layout". Ảnh của 5 workflow sau này dùng lại cho Report 6 (User Guide).

## Tình trạng (28/10/2026)

Đã chèn **35 ảnh (Figure 15–49) cho 33 FR** vào `LumiGap_Report3_v2.docx`. Ảnh chụp từ bản local của main, commit af46d5d, bằng tài khoản seed. Bản sao lưu trước khi sửa: `Reports_Output/_backup_before_screenshots/LumiGap_Report3_v2_2810.docx`.
- **Đã có ảnh:** FR-01, 02, 05, 07, 08, 11, 12, 13, 14, 15, 17, 20, 21, 22, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40 (2 ảnh), 41 (2 ảnh), 42, 43, 45, 47, 48, 51, 53.
- **Còn TBD (15 FR), cần dữ liệu demo:** FR-04, 06, 09, 10, 18, 19, 23, 24, 25, 26, 27, 46, 49, 50, 52.
- **Ảnh trạng thái trống, cần chụp lại khi có dữ liệu:** FR-12, 20, 22, 34, 42, 45.

## Quy tắc chung

1. **Chụp sau khi chốt baseline** (A-01). Production lumigap.uk có thể đang chạy code mới hơn tag, nên giao diện có thể khác tài liệu. Hỏi Hòa xem production đang ở commit nào; nếu khác tag thì chụp trên staging hoặc local đúng commit đó.
2. **Giao diện tiếng Anh** (tài liệu viết bằng tiếng Anh). Web có 11 ngôn ngữ, chọn English trong Settings hoặc ô chọn ngôn ngữ.
3. **Dùng tài khoản demo** do dev cấp (C-12). Không để lộ email thật, số dư thật, mã đơn PayOS thật, token, API key, mật khẩu. Che đi nếu có.
4. Cửa sổ trình duyệt rộng 1440 px, zoom 100%, chụp vùng nội dung (bỏ thanh bookmark và tab của trình duyệt).
5. Đặt tên file: `R3_FR-xx_<ten-ngan>.png`, ví dụ `R3_FR-15_reports-list.png`. Lưu chung trong `Reports_Output/screenshots/`.
6. Caption trong Word: `Figure n. Screen: <tên màn hình> (<route>) – FR-xx`.
7. Cột "Tài khoản / trạng thái cần có" cho biết phải chuẩn bị gì trước khi chụp.

---

## Ưu tiên 1 — 15 tính năng bắt buộc (F-01…F-15), chụp trước

| ☐ | FR (F) | R3 mục | Màn hình / route | Cần chụp gì | Tài khoản / trạng thái cần có |
|---|---|---|---|---|---|
| ☐ | FR-14 (F-01) | §3.4.1 | Reports `/reports` → hộp thoại Generate Report | Ô câu hỏi, khoảng năm, filter, danh sách bằng chứng xem trước (và một ảnh có cảnh báo "No active evidence papers…" nếu được) | User đã xác minh email |
| ☐ | FR-15 (F-02) | §3.4.2 | `/reports` và `/reports/:id` | (a) form tạo report với 3 chế độ fast/standard/deep và danh sách có badge trạng thái `queued`/`generating`/`ready`; (b) trang đọc report (markdown và bằng chứng) | User có credit; corpus có bài |
| ☐ | FR-16 (F-03) | §3.4.3 (no screen) | `/reports` | Một report trạng thái **failed** kèm thông báo lỗi (tùy chọn, minh họa ngoại lệ) | Report thất bại (truy vấn vô nghĩa, DS-01b) |
| ☐ | FR-17 (F-04) | §3.4.4 | `/research-gaps` hoặc `/research-gap/discover` | Ô chủ đề và phạm vi, bằng chứng xem trước, vùng trạng thái, danh sách gap ứng viên | User có ≥30 credit |
| ☐ | FR-18 (F-05) | §3.4.5 | `/research-gaps` | Thẻ phân tích **failed** có nút **Retry** | Một phân tích thất bại (nhờ dev tạo) |
| ☐ | FR-20 (F-06) | §3.4.7 | `/research-gaps/validation` | Hàng đợi thẩm định và form bỏ phiếu (hành động, bình luận, đề xuất sửa) | Tài khoản có GAP_VALIDATION (lecturer trong seed) |
| ☐ | FR-48 (F-07) | §3.9.9 | `/submissions/new`, `/submissions/:id` | (a) form nộp và upload PDF; (b) trang chi tiết có danh sách revision và panel AI pre-review | Thành viên một project; AI Reviewer đang chạy |
| ☐ | FR-49 (F-08) | §3.9.10 | Chi tiết submission → Request review; `/review-requests/:requestId` | (a) chọn reviewer, template, hạn, lời nhắn; (b) trang yêu cầu phía reviewer với nút Accept/Decline | Author và lecturer đã xác minh |
| ☐ | FR-50 (F-09) | §3.9.11 | `/reviews/:assignmentId` | Danh sách tiêu chí (đánh giá, bình luận), đánh giá tổng thể, mục yêu cầu sửa | Reviewer đã accept |
| ☐ | FR-43 (F-10) | §3.9.4 | `/settings/verification/lecturer` | Form minh chứng (1–6 mục), upload, dòng thời gian trạng thái | Tài khoản lecturer chưa xác minh |
| ☐ | FR-45 (F-11) | §3.9.6 | `/admin/academic-verifications` | Danh sách yêu cầu, xem minh chứng, form quyết định có checklist | Admin |
| ☐ | FR-44 (F-12) | §3.9.5 (no screen) | — | Không cần ảnh (chức năng nền) | — |
| ☐ | FR-32 (F-13) | §3.7.2 | Settings > Credits (`/settings/credits` hoặc `/profile?tab=credits`) | Ô nhập số tiền và xem trước số credit; (tùy chọn) trang checkout PayOS **chế độ test**, che mã đơn | User; PayOS test key |
| ☐ | FR-33 (F-14) | §3.7.3 (no screen) | — | Không cần ảnh; có thể minh họa bằng lịch sử đơn chuyển `paid` (dùng chung ảnh FR-31) | — |
| ☐ | FR-31 (F-15) | §3.7.1 | Settings > Credits | Thẻ số dư, tổng hợp, bảng giao dịch, bảng đơn nạp | User đã có vài giao dịch |

## Ưu tiên 2 — Các FR có màn hình còn lại

| ☐ | FR | R3 mục | Route | Cần chụp gì | Tài khoản / ghi chú |
|---|---|---|---|---|---|
| ☐ | FR-01 | §3.2.1 | `/register` | Form đăng ký (một ảnh có lỗi validation) | Khách |
| ☐ | FR-02 | §3.2.2 | `/login` | Form đăng nhập, nút Sign in with Google | Khách |
| ☐ | FR-04 | §3.2.4 | `/auth/oauth-callback` | Màn hình loading khi đổi mã (chụp nhanh, hoặc bỏ qua và ghi "transient screen") | Khách |
| ☐ | FR-05 | §3.2.5 | `/verify-email`, `/forgot-password`, `/reset-password` | Ba form một ô | Khách |
| ☐ | FR-06 | §3.2.6 | `/onboarding/academic-profile`, `/settings/:section` | Form onboarding nhiều bước; trang Settings | Tài khoản mới |
| ☐ | FR-07 | §3.3.1 | `/literature` | Ô tìm kiếm, panel filter, sắp xếp, nút AI re-rank, kết quả | Khách hoặc user |
| ☐ | FR-08 | §3.3.2 | `/papers/:id` | Tiêu đề, tác giả, abstract, references, related, các nút hành động | — |
| ☐ | FR-09 | §3.3.3 | `/papers/:id` | Ô chọn ngôn ngữ và đoạn đã dịch | Cần bật provider dịch |
| ☐ | FR-10 | §3.3.4 | Chọn 2–4 bài → Compare | Bộ chọn bài và kết quả so sánh | User |
| ☐ | FR-11 | §3.3.5 | `/trends`, `/trends/:topic` | Bảng xếp hạng chủ đề, chip verdict, tab "By month / quarter", biểu đồ, panel giải thích | ⚠ Trends đã đổi nhiều sau ca8fe4d: chụp đúng bản được tag |
| ☐ | FR-12 | §3.3.6 | `/bookmarks` | Danh sách đã lưu và ghi chú | User |
| ☐ | FR-13 | §3.3.7 | `/settings/submit-paper`, `/settings/my-papers` | Form yêu cầu thêm bài, danh sách yêu cầu kèm trạng thái | User (không phải admin) |
| ☐ | FR-19 | §3.4.6 | `/research-gaps` (gap đã chọn) | Panel Directions và nút generate | User có gap |
| ☐ | FR-21 | §3.4.8 | `/gap-closure` | Danh sách check, hồ sơ, sàng lọc tài liệu, form quyết định | ⚠ Đã đổi sau ca8fe4d |
| ☐ | FR-22 | §3.5.1 | `/projects`, `/projects/:id` | Danh sách project và form tạo; trang tổng quan project | User |
| ☐ | FR-23 | §3.5.2 | Project → Papers | Bảng bài và nút sàng lọc/đọc | Member |
| ☐ | FR-24 | §3.5.3 | Project → Team; `/invitations/:token` | Bảng thành viên, hộp thoại mời, trang lời mời | Owner và invitee |
| ☐ | FR-25 | §3.5.4 | Project → AI chat | Khung hội thoại, tin đã ghim | Member, project có bài |
| ☐ | FR-26 | §3.5.5 | Project → Team chat | Danh sách tin và ô soạn | Member |
| ☐ | FR-27 | §3.5.6 | `/projects/:projectId/manuscripts/:id` | Cây file, editor, khung preview/compile | Member; compiler đang chạy |
| ☐ | FR-29 | §3.6.1 | `/papers/review` | Upload PDF, mức độ nghiêm, chi phí credit, kết quả, lịch sử | AI Reviewer đang chạy |
| ☐ | FR-30 | §3.6.2 | `/papers/format-check` | Upload, chọn preset, bảng đo, lịch sử | AI Reviewer đang chạy |
| ☐ | FR-34 | §3.7.4 | `/notifications` | Danh sách thông báo, nút mark all read | User có thông báo |
| ☐ | FR-35 | §3.7.5 | `/rankings` | Bảng xếp hạng và "Your position" | User |
| ☐ | FR-36 | §3.8.1 | `/admin/users` | Bảng user có filter và hộp thoại hành động | Admin |
| ☐ | FR-37 | §3.8.2 | `/admin/papers` | Bảng bài có filter trạng thái | Admin |
| ☐ | FR-38 | §3.8.3 | `/admin/sync` | Danh sách lần chạy, kế hoạch campaign, nút điều khiển | Admin |
| ☐ | FR-39 | §3.8.4 | `/admin/pipeline`, `/admin/workers`, `/admin/evaluation` | Thẻ hàng đợi, bảng worker, bảng đánh giá | Admin |
| ☐ | FR-40 | §3.9.1 | `/forum`, `/forum/:id`, `/forum/new` | Danh sách thread, trang thread, form đăng bài | User |
| ☐ | FR-41 | §3.9.2 | `/communities`, `/communities/:slug`, `/manage` | Danh mục community, trang chi tiết, trang quản lý | ⚠ Đã đổi sau ca8fe4d (PR #63/#64) |
| ☐ | FR-42 | §3.9.3 | `/forum/moderation`, `/admin/trust-safety` | Hàng đợi kiểm duyệt, chi tiết báo cáo, hộp thoại xử lý | Moderator hoặc admin |
| ☐ | FR-46 | §3.9.7 | Settings > Academic, `/profile` | Trình sửa hồ sơ, form lịch nhận review | User hoặc lecturer |
| ☐ | FR-47 | §3.9.8 | `/academic-support` | Form mời/đề nghị mentor, hộp thư accept/decline | Owner và lecturer đã xác minh |
| ☐ | FR-51 | §3.9.12 | `/review-templates`, `/review-templates/new` | Trình tạo template có tiêu chí và mức đánh giá | User hoặc lecturer |
| ☐ | FR-52 | §3.9.13 | `/profile/:handle/contributions` | Danh sách đóng góp (gõ URL trực tiếp, không có link trong app) | User có contribution |
| ☐ | FR-53 | §3.9.14 | `/lecturers`, `/u/:handle` | Thẻ giảng viên có filter, trang hồ sơ công khai | Khách |

## Không cần chụp

| FR | Lý do (theo R3) |
|---|---|
| FR-03, FR-16, FR-33, FR-44 | "No screen: API / background function" (FR-16 có thể chụp minh họa trạng thái failed như trên) |
| FR-28 | "No web screen found (no web code references /openings); API only" |

## Tổng số

| Nhóm | Số FR | Số ảnh dự kiến |
|---|---|---|
| Ưu tiên 1 (bắt buộc) | 12 FR có màn hình | ~17 ảnh |
| Ưu tiên 2 | 36 FR | ~45 ảnh |
| Không cần chụp | 5 FR | 0 |

## Sau khi chụp

- Dán vào Report 3 đúng mục, rồi cập nhật mục lục và danh sách hình.
- Thêm một dòng Record of Changes R3: "Added screen captures for FR-xx…FR-yy (build <commit>)".
- Ghi lại commit hoặc phiên bản production lúc chụp để trả lời được câu hỏi "ảnh này của bản nào".
