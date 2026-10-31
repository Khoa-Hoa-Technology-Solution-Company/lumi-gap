# Triển khai kế hoạch mời Mentor — 31/10/2026

## 1. Khảo sát và phạm vi bàn giao

Đã hoàn thành P0: hai vai trò, tối đa bốn ứng viên trong kế hoạch hiện hành, một lời mời giữ chỗ mỗi vai trò, hàng đợi dự phòng xác nhận thủ công, mời song song có chủ đích, phân quyền và bảo toàn lịch sử. Bổ sung P1: hạn 14 ngày cho lời mời mới, snapshot nội dung và cải thiện bản nháp.

Luồng trước đây cho phép ba lời mời mỗi vai trò, chỉ mở Mentor phụ sau khi có Mentor chính được xác minh, đóng lời mời cạnh tranh khi một người nhận và đọc phần giới thiệu từ dữ liệu dự án hiện tại. Không tìm thấy một quy trình phê duyệt cấp trường riêng cần giữ điều kiện Mentor chính trước; việc xác minh danh tính giảng viên vẫn được giữ.

## 2. Thiết kế

- Tái sử dụng `MentorshipRequest`, `MentorRelationship`, quyền mentor theo tài nguyên, tệp riêng tư và outbox thông báo hiện có.
- Bổ sung `MentorInvitationPlan` và `MentorCandidate`. Kế hoạch là nội bộ, không phải lời mời. Chỉ chủ dự án được xem/sửa kế hoạch; thành viên tiếp tục đề xuất giảng viên qua luồng gợi ý hiện có.
- Mỗi vai trò có thứ tự riêng. Chỉ ứng viên đầu hàng đợi chưa gửi được mời khi vị trí trống và chế độ tuyển cho phép. Người tiếp theo không tự nhận thông báo khi người trước từ chối/hết hạn.
- Mặc định mời chính trước. Bật mời song song để mời phụ khi chưa có chính. Lời mời phụ đã được gửi hợp lệ vẫn có thể nhận khi chế độ song song bị tắt hoặc Mentor chính rời đi.
- Gửi trực tiếp từ hồ sơ giảng viên vẫn qua cùng service, tự ghi ứng viên vào kế hoạch và tuân thủ mọi giới hạn/thứ tự.
- Sau khi kết thúc hướng dẫn, vai trò tương ứng dừng tuyển. Chủ dự án mở đợt mới để tuyển lại; kế hoạch trước, đóng góp và Mentor còn lại được giữ.

Chi tiết: [Đặc tả quyết định](../../mentor-recruitment-plan.md).

## 3. Giao diện

| Thành phần | Thay đổi |
|---|---|
| `mentor-recruitment-plan.tsx` | Hai khu vực Mentor chính/phụ; người đang hướng dẫn/lời mời hiện tại độc lập với phân trang lịch sử; ứng viên sẵn sàng/dự phòng; đổi thứ tự, bỏ ứng viên, bật song song, xác nhận mở đợt mới |
| `academic-support.tsx` | Tìm giảng viên → thêm vào kế hoạch; mở xem trước/gửi theo đúng ứng viên và vai trò; giải thích lời mời cũ cần rà soát và tóm tắt chưa đủ nội dung |
| `mentorship-invitation-content.tsx` | Lời nhắn/tệp cá nhân bắt đầu trống với người nhận mới; chỉ khôi phục bản nháp theo lựa chọn rõ ràng; không tự thay vai trò đang soạn khi vị trí thay đổi |
| `academic-support.api.ts`, shared types | API kế hoạch, phiên bản, định danh ứng viên và trạng thái giao diện |

Đã xem và thao tác trên fixture cô lập, chặn toàn bộ `/api/`, không gửi lời mời thật. Desktop và mobile không tràn ngang; ở viewport mobile, chiều rộng nội dung bằng chiều rộng trang (375 px). Đã mở hộp thoại Mentor phụ và xác nhận đúng vai trò, lời nhắn trống và nút gửi chưa cho phép khi thiếu nội dung.

![Desktop](2026-10-31-mentor-plan-desktop.png)

[Ảnh mobile](2026-10-31-mentor-plan-mobile.png). Fixture tái hiện: `apps/web/scripts/mentor-plan-preview.mjs`.

## 4. API và dịch vụ

- `GET /projects/:id/mentor-plan`: kế hoạch hiện hành, trạng thái vai trò, người đã nhận và lời mời đang chờ. Chỉ chủ dự án, `private, no-store`.
- `POST /projects/:id/mentor-plan`: lệnh `add`, `move`, `remove`, `configure`, `restart`; schema chặt, yêu cầu `expectedVersion`, dùng limiter hiện có.
- `mentor-plan.service.ts`: kiểm tra người quản lý, tài khoản, trạng thái dự án, điều kiện giảng viên, bốn ứng viên, thứ tự và chiến dịch hiện hành.
- `project-mentorship.service.ts`: gửi/nhận/từ chối/thu hồi/kết thúc qua các khóa hiện có; snapshot giới thiệu/người gửi; kiểm tra phiên bản kế hoạch và giữ đúng vai trò.
- `mentorship-positions.ts`: tối đa hai mentor, hai lời mời chờ, một lời mời mỗi vai trò, hạn mới 14 ngày.
- `mentorship-discovery.service.ts`: cơ hội và vai trò phù hợp với slot và chế độ tuyển; không còn coi xác minh Mentor chính là điều kiện bắt buộc để nhận Mentor phụ.
- `mentorship-content.service.ts`: quyền tệp kiểm tra trạng thái lời mời/quan hệ và quyền còn hiệu lực; tác giả/chủ dự án giữ lịch sử đã được chia sẻ.
- `mentorship-mail.service.ts`: bỏ qua email lời mời đã bị thu hồi/hết hạn/đã xử lý trước lúc delivery job kiểm tra.
- `mentorship-notifications.ts`: hạn hết hiệu lực thông báo cả chủ dự án và giảng viên, chống trùng qua event key.

## 5. Database và migration

1. `20261031220000_mentor_recruitment_plan`: hai bảng mới, snapshot, candidate reference, cờ giới hạn mới; unique current plan, unique candidate, giới hạn bốn ứng viên bằng trigger; unique pending role cho dữ liệu mới và trigger kiểm tra cả dữ liệu cũ; giữ kiểm tra consent đúng vai trò và unique active role hiện có.
2. `20261031221000_mentor_candidate_invitation_scope`: trigger kiểm tra ứng viên phải thuộc đúng dự án/kế hoạch/giảng viên/vai trò.

Không thay đổi nội dung, trạng thái, hạn hết hiệu lực hoặc vai trò cũ. Không tự tạo thứ hạng lịch sử. Các lời mời cũ không có snapshot được ghi rõ đang xem giới thiệu hiện tại, không giả lập đó là bản đã gửi. Nếu còn nhiều lời mời cũ cùng vai trò, chặn nhận/gửi mới để chủ dự án thu hồi/từ chối có chủ đích, giữ audit và thông báo.

Migration đã được kiểm tra bằng schema PostgreSQL cô lập có lời mời cũ cạnh tranh và quan hệ phụ đã nhận. Kiểm tra local trước/sau migration xác nhận hash của **9 lời mời và 2 quan hệ** giữ nguyên, không có xung đột vai trò cũ: [kết quả](2026-10-31-mentor-plan-migration-integrity.json).

## 6. Chuyển trạng thái

| Sự kiện | Kết quả |
|---|---|
| Thêm ứng viên | PLANNED; chưa mời, chưa chia sẻ |
| Slot trống, đứng đầu và quy tắc cho phép | UI hiển thị READY, không tự gửi |
| Chủ dự án xác nhận gửi | Candidate INVITED; request PENDING giữ slot của đúng vai trò |
| Chấp nhận hợp lệ | Request ACCEPTED; tạo một quan hệ ACTIVE và kích hoạt quyền đã đề xuất |
| Từ chối/hết hạn/thu hồi | Request giữ kết quả cuối; giải phóng slot, ứng viên cùng vai trò kế tiếp có thể sẵn sàng |
| Kết thúc quan hệ | Relationship ENDED; thu hồi quyền; dừng tuyển vai trò đó |
| Mở đợt mới | Đóng kế hoạch cũ, bắt đầu kế hoạch trống; không chuyển/nhắn lại ứng viên cũ |

## 7. Quyền và riêng tư

- Ứng viên chưa mời không thấy kế hoạch, lời nhắn, tệp hoặc thư viện riêng của dự án.
- Gửi lời mời yêu cầu trường tóm tắt được phép chia sẻ có ít nhất 30 ký tự/5 từ; không lấy mô tả nội bộ thay thế. Đây là ngưỡng dữ liệu tối thiểu, không phải đánh giá chất lượng nội dung tự động.
- Snapshot bất biến cùng message/vai trò đã gửi. Thay tóm tắt dự án không thay nội dung lời mời đã gửi hay làm mất quyền nhận lời mời hợp lệ.
- Trước nhận: chỉ nội dung lời mời được chia sẻ và tệp còn quyền; sau nhận: tiếp tục cần quyền theo tài nguyên được chia sẻ. Không thêm ProjectMember, quyền quản lý, LaTeX, GitHub, dataset hoặc export mặc định.
- Tệp giữ các giới hạn cũ: PDF/DOCX/JPG/PNG/WebP, 5 MB/tệp, 20 MB tổng, tối đa năm tệp; backend kiểm tra ownership, MIME/bytes và phạm vi.
- Thu hồi/hết hạn/kết thúc quan hệ chặn tải tệp từ phía người nhận bằng kiểm tra server; bản ghi lịch sử vẫn giữ.

## 8. Đồng thời và tác vụ nền

Gửi và phản hồi khóa tài khoản theo thứ tự rồi khóa dự án; tác vụ hết hạn khóa cùng dự án. Database bảo vệ giới hạn và consent kể cả khi bypass service. Các giao dịch gửi/phản hồi/kế hoạch có thời gian chờ tối đa hữu hạn (maxWait 10 giây, timeout 15 giây).

Idempotency key bảo vệ tạo lời mời và đối chiếu nội dung/quyền. Nhận lại lời mời đã nhận trả cùng kết quả. Event key và transactional notification store bảo vệ thông báo; không gửi SMTP trước commit. Worker hiện có tiếp tục hết hạn và phục hồi outbox. Không có scheduler tự liên hệ ứng viên dự phòng.

Email đã được SMTP nhận không thể thu hồi; kiểm tra delayed job loại bỏ lời mời không còn hợp lệ trước khi gửi, cơ chế hiện có không tự gửi lại khi kết quả SMTP không chắc chắn.

## 9. Kiểm thử thực tế

| Kiểm tra | Kết quả và bằng chứng |
|---|---|
| Toàn bộ nhóm PostgreSQL liên quan | 112/112 ca: 90 hồi quy + 22 ca kế hoạch tại thời điểm chạy chung — [log](2026-10-31-mentor-plan-verification.log) |
| Nhóm kế hoạch sau rà soát cuối | 23/23 ca, gồm thêm chặn chuẩn bị ứng viên cho vai trò đã nhận/đã dừng tuyển và kiểm tra cross-project candidate — [log](2026-10-31-mentor-plan-final-integration.log) |
| Giao diện: kế hoạch, bản nháp, hỗ trợ học thuật | 57/57 ca — [log](2026-10-31-mentor-plan-frontend.log) |
| Thành phần kế hoạch cuối | 9/9 ca, thêm chọn vai trò còn mở tuyển (tổng 58 ca giao diện khác nhau) — [log](2026-10-31-mentor-plan-final-ui.log) |
| Backend typecheck, web typecheck, lint các component thay đổi | Qua; logs `mentor-plan-final-typecheck`, `mentor-plan-web-typecheck`, `mentor-plan-lint` |
| Backend build và PostgreSQL runtime audit | Qua; runtime audit 4/4; chạy lại TypeScript production build sau thay đổi cuối |
| Web production build và bundle budget | Qua — [log](2026-10-31-mentor-plan-web-build.log) |
| Local sau cập nhật | Backend `/ready` 200; web 200; API kế hoạch chưa đăng nhập 401 — [health](2026-10-31-mentor-plan-health.json) |

Các ca bao gồm gửi/nhận đồng thời, accept/expire, idempotency, hai vai trò độc lập, tính riêng tư của ứng viên/tệp/draft, sai dự án/người nhận, hàng đợi, quyền đã thu hồi, dữ liệu cũ và email đến muộn. Không khẳng định đã chạy toàn bộ 52 tình huống đề xuất trong yêu cầu.

Trong quá trình kiểm tra đã gặp timeout ở ca hồi quy gộp ba fixture; tách thành ba ca giữ nguyên assertion. Lỗi đóng gói module khi cập nhật local đã được sửa, backend đã phục hồi healthy trước bàn giao.

## 10. Phần chưa triển khai

P1 còn lại: nhắc một lần ngày thứ 7; gia hạn có kiểm soát; luồng “Trao đổi thêm” gắn riêng lời mời; tự gửi dự phòng sau phê duyệt. API/UI hiện không cho bật tự gửi. Không triển khai P2 matching/đánh giá mentor/quản lý cấp trường.

Không thử gửi/nhận lời mời hoặc thay đổi vai trò trên dự án thật. Kiểm thử ghi dữ liệu dùng database riêng; kiểm tra trình duyệt dùng fixture. Bản local đã cập nhật, chưa commit hoặc push.
