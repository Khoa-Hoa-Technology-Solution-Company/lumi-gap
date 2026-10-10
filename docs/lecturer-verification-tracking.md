# Lecturer Verification Status & Tracking — 08/10/2026

## 1. Kiến trúc đã audit — IMPLEMENTED

Repository thực tế dùng React/Vite, React Router, TanStack Query và Express/Prisma/PostgreSQL. Tái sử dụng AcademicProfile, Affiliation, VerificationEvidence/VerificationEvidenceSource, form xác minh, staging upload riêng tư, Admin review, Notification outbox và BullMQ worker. Không tạo model hoặc hệ thống xác minh song song. Các domain invariants và authorization Mentorship/Formal Review được giữ nguyên.

Các khoảng thiếu đã xử lý: trang receipt chưa có đầy đủ trạng thái; applicant chưa có secure evidence view; chưa có lịch sử/timeline tổng hợp; bổ sung chưa có lineage rõ ràng; sửa profile ghi đè quyết định đã hoàn tất; deep link chưa thống nhất.

## 2. Route canonical — IMPLEMENTED

`/settings/verification/lecturer`, có ProtectedRoute. `requestId` chọn một yêu cầu thuộc chính chủ, `page` phân trang lịch sử. `/settings/academic?requestId=...` chuyển tới route canonical. Component receipt cũ trở thành compatibility alias của trang mới.

## 3. Status UI — IMPLEMENTED

Một trang hiển thị UNVERIFIED (giữ enum hiện có NOT_SUBMITTED), PENDING, NEEDS_MORE_INFORMATION, VERIFIED, REJECTED, INVALIDATED và EXPIRED. Backend quyết định status và allowedActions. Skeleton/loading error được tách khỏi trạng thái domain. Layout max-width 896px, một cột trên mobile, icon và màu trạng thái tiết chế. Copy mới dùng i18n tiếng Việt/Anh.

## 4. PENDING — IMPLEMENTED

Hiển thị xác nhận đã ghi nhận, thông tin yêu cầu, thời điểm gửi, minh chứng, timeline, CTA xem chi tiết và về profile. Không có tiến độ giả hoặc deadline tự đặt. Không cho tạo yêu cầu active thứ hai hoặc sửa yêu cầu đang được review. Core research access không bị khóa.

## 5. NEEDS_MORE_INFORMATION / bổ sung — IMPLEMENTED

Hiện applicant-visible feedback và mở form đang có ở chế độ supplement. Prefill nguồn URL/tài liệu; có thể thêm, thay thế hoặc tải lại tài liệu. Tài liệu retained chỉ dùng được nếu source thuộc owner và đúng yêu cầu gốc, vẫn có storage và cùng loại.

Bổ sung tạo **phiên bản request mới liên kết cùng hồ sơ xác minh**: previousRequestId, revision tăng, source có previousSourceId. Request trước giữ nguyên quyết định, reviewedAt/reviewer, feedback và evidence metadata; đánh dấu supersededAt. Phiên bản mới trở về PENDING. Không ghi đè quyết định cũ hoặc tạo request không liên quan. Mọi assessment của source mới reset để Admin xét duyệt lại.

Payload mang supplementsRequestId, expectedReviewedAt và submissionKey. Dưới user lock, server kiểm tra owner, trạng thái, quyết định/timestamp, claim đơn vị/vị trí và chưa supersede/invalidate. Đã approve/reject hoặc stale update trả conflict. Yêu cầu legacy có institutionId trong metadata được nhận diện; file legacy chưa có source record phải tải lại thay vì dùng request ID làm source ID.

## 6. VERIFIED — IMPLEMENTED

Hiển thị đơn vị/vị trí, phương thức, ngày quyết định và lịch sử. CTA tới `/academic-support#mentoring-settings` và Lecturer Workspace hiện có. Xác minh chỉ tạo eligibility: không tự bật nhận mentoring, không tạo MentorRelationship/ReviewAssignment, không tự vào nhóm hoặc cấp Project access. Mentorship vẫn cần đồng thuận hai bên; Formal Review cần accepted assignment cho artifact cụ thể.

## 7. REJECTED / lịch sử — IMPLEMENTED

Hiện lý do applicant-visible, ngày quyết định và minh chứng đã gửi. Chỉ cho gửi yêu cầu mới khi backend cho phép. Retry tạo request mới liên kết request bị từ chối, revision bắt đầu lại từ 1. Request REJECTED cũ bất biến. Không đổi SystemRole, AcademicRole hay chặn core research.

Đổi role/đơn vị/vị trí reset trust của claim hiện tại. Request VERIFIED lịch sử giữ VERIFIED, reviewedAt/reviewedBy và thêm invalidatedAt; UI nói rõ quyết định này không xác minh claim hiện tại. Request đang mở có thể chuyển INVALIDATED nhưng feedback/review timestamp trước đó vẫn được giữ.

## 8. Evidence và timeline — IMPLEMENTED

DTO whitelist chỉ trả metadata cần cho applicant. Owner có thể preview PDF bằng canvas hoặc ảnh JPEG/PNG, và tải bản private. Blob URL được thu hồi khi đóng preview. Nguồn URL là minh chứng đã gửi, không bị gắn nhãn đã xác minh chỉ vì tồn tại.

Evidence cho biết thời điểm gửi, loại/tên, replaced và availability. Retention xóa file không đổi quyết định; trang hiển thị “Tài liệu không còn được lưu trữ.” Legacy raw document/URL vẫn có entry metadata và owner access thích hợp. File được retained bởi phiên bản mới không bị xóa cùng phiên bản cũ.

Timeline dùng submittedAt/reviewedAt/invalidatedAt của lineage, hỗ trợ nhiều vòng MORE_INFO → SUPPLEMENTED. Một audit decision được đọc nội bộ để khôi phục event MORE_INFO trước khi request mở bị invalidated; không trả audit notes cho client. Lịch sử phân trang 10 request; lineage timeline tối đa 100 phiên bản.

## 9. DTO / API — IMPLEMENTED

Tái sử dụng GET `/api/v1/academic-profiles/me/verification-status`, thêm requestId/page và projection lecturer gồm trạng thái, allowedActions, selectedRequest, history, timeline. Submission-key reconciliation hiện có vẫn được giữ.

Thêm GET `/api/v1/academic-profiles/me/verification-requests/:requestId/evidence?sourceId=...` cho owner. Admin giữ endpoint review/evidence hiện có. Submit/supplement dùng POST `/api/v1/academic-profiles/me/verification-request` hiện có; không tạo endpoint approval ở frontend.

Shared types bổ sung LecturerTrackingRequest/LecturerVerificationTracking và supplement/retained source fields; Zod validate ID, query, source modes và concurrency token.

## 10. Submission bất đồng bộ — IMPLEMENTED

Request và notification outbox được persist trong transaction trước khi ACK. FE chỉ navigate sau accepted + requestId. Không đợi SMTP, push hoặc review. Double-click protection, idempotency key/hash, server lock/constraints và timeout reconciliation hiện có được tái sử dụng. Email thất bại không revert submission.

## 11. Email / notification — IMPLEMENTED; delivery bên ngoài PARTIAL

SUBMITTED, MORE_INFO, APPROVED, REJECTED dùng outbox/worker/retry hiện có và deep link canonical có requestId trong email. Bổ sung tạo notification review cho Admin bằng event key của phiên bản mới; retry cùng key không tạo thông báo trùng. Email có CTA theo kết quả và không chứa tài liệu/private analysis. Destination của notification Admin chỉ hiện cho Admin.

Test worker thật chạy với SMTP disabled. Không gửi email thật trong task này; vận hành SMTP thực tế còn phụ thuộc cấu hình provider/preference. Semantics UNCERTAIN sau SMTP timeout của flow hardening trước vẫn giữ nguyên.

## 12. Profile / Lecturer Workspace — IMPLEMENTED

Profile giữ summary backend và link canonical; nút xác minh không còn mở flow riêng ngoài trang tracking. Profile change invalidates claim theo server. Mentoring preferences dẫn về cùng trang xác minh. Hook refresh khi mount/focus và mỗi 60s; không thêm WebSocket. Workspace và quyền theo object vẫn do API hiện có kiểm soát.

## 13. Security / privacy — IMPLEMENTED

- Owner-only query cho detail/history; ID request của người khác trả 404.
- Evidence association được kiểm tra độc lập; owner 200, khác owner 404, unauthenticated 401, source giả 404 được kiểm thử HTTP thật.
- DTO không chứa storageKey, reviewerNote, internal assessment/checklist hoặc adminNote.
- Proxy private trả `Cache-Control: private, no-store`, `nosniff`, attachment; signed/storage URL không trả về browser.
- Role self-declared và affiliation không cấp Lecturer verification. Client không thể đặt trusted status hoặc allowedActions.
- User lock và stale token ngăn supplement sau final decision, duplicate tabs và lost-response replay tạo request thứ hai. Concurrent Admin decisions dùng điều kiện transaction hiện có.
- Audit access/mutations không sao chép nội dung tài liệu vào general audit log.

## 14. Database / migration — IMPLEMENTED, đã deploy local

Migration `20261008000300_lecturer_tracking`: previous_request_id nullable tự tham chiếu, revision mặc định 1 với constraint >0, invalidated_at nullable; previous_source_id nullable tự tham chiếu và indexes. FK ON DELETE SET NULL. Không reset/drop dữ liệu, không backfill VERIFIED/trust. Local PostgreSQL đã áp tổng 59 migrations; compatibility harness giữ request IDs, content/decision metadata và lịch sử liên quan.

## 15. Kết quả kiểm tra — IMPLEMENTED

- 40 PostgreSQL/Redis integration tests đạt trên database `_test` riêng: real HTTP upload/submit/private owner access, mọi trạng thái, multi-round supplement, concurrent idempotency, stale/finalized rejection, lineage, legacy compatibility, retention và notification worker recovery. Không gửi email thật.
- 20 backend unit tests đạt: lifecycle, schema và delivery. 74 frontend tests đạt: status/form/supplement, retained/legacy evidence, API reconciliation, Admin, PDF preview và notification destination.
- 4 Playwright tests đạt trên bundle production Docker với API fixture: năm trạng thái tiếng Việt ở 1440px/320px, form bổ sung giữ context → ACK → PENDING → reload, và fetch failure không thành UNVERIFIED. Không tràn ngang. Screenshots desktop/mobile được xem trực tiếp; đây là UI verification bằng fixture, quyền/state transitions được kiểm tra riêng trên PostgreSQL thật.
- Backend/web typecheck và scoped ESLint đạt. `git diff --check` đạt; chỉ cảnh báo LF/CRLF của file đã có.
- Production Docker build backend/web đạt. PostgreSQL runtime gate 4 tests đạt; initial JS graph 931.6 KiB dưới budget 950 KiB. PDF renderer được lazy-load.
- Migration tracking đã deploy local, tổng 59 migrations. Không reset dữ liệu. Backend healthy; backend/web/worker-notifications chạy đúng image cuối. `nginx -t` đạt. `/health` và route canonical trả 200; status/evidence API chưa đăng nhập trả 401.
- Một lần integration chạy đồng thời Docker build bị worker startup timeout; chạy lại sau build đạt đầy đủ 40 tests. Fixture mới ban đầu thiếu evidenceType/nhầm endpoint singular đã được sửa trước lần kiểm tra cuối.

## 16. Hạng mục còn lại / policy

- PARTIAL: kiểm chứng SMTP provider bên ngoài chưa thực hiện; mọi integration test dùng database/Redis test riêng, không gửi email thật.
- NOT IMPLEMENTED (ngoài scope): antivirus/OCR/AI authenticity, HR integration, automatic approval, withdrawal khi domain hiện có chưa hỗ trợ. Không hiển thị processing/cancel giả.
- Giới hạn timeline: tối đa 100 ancestor versions; history vẫn phân trang server. Không đặt SLA review tự động.
- Không có business rule mới cho Mentorship/Formal Review. Không commit/push/merge trong task này.

## File chính

Backend: `lecturer-verification-tracking.service.ts`, `lecturer-verification.service.ts`, `academic-profile.service.ts/controller.ts/routes.ts`, `dto/academic-profile.schema.ts`, `verification-evidence-retention.service.ts`, `lecturer-verification-delivery.service.ts`, `identity.prisma` và migration tracking.

Frontend: `lecturer-verification-status.tsx`, `position-verification-panel.tsx`, `lecturer-evidence-entry.tsx`, `private-evidence-pdf-preview.tsx`, receipt alias, AcademicProfile section, API/hooks, app-routes, mentoring preferences, academic-support, notification destination và academic-support locale.

Tests: backend adaptive persistence/lifecycle/delivery/schema; frontend status/support/evidence/API/Admin/PDF/notification; `tests/e2e/lecturer-verification-tracking.spec.ts`. Screenshots: `artifacts/lecturer-tracking/`.
