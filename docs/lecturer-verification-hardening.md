# Lecturer Verification Hardening & Asynchronous UX — 08/10/2026

## 1. Audit và lỗi trước đó — IMPLEMENTED

Repo thực tế là React/Vite + Express + Prisma/PostgreSQL. Reuse AcademicProfile, User/UserEmail, VerificationEvidence/VerificationEvidenceSource, private storage, Notification outbox, BullMQ/Redis và worker notifications. Luồng trước đã reuse email, có hai identity paths và dynamic evidence, nhưng endpoint vẫn chờ email/notification sau commit; không có staging/acknowledgement/idempotency riêng. Resend chưa có cooldown database. Constraint nguồn cũ chỉ cho slot 0–2 mặc dù UI cho 6 mục; loại hồ sơ nhân sự do trường cấp chưa có. Domain guidance hiển thị cả cho document.

## 2. Email identity/source of truth — IMPLEMENTED

Ownership đọc từ User.emailVerifiedAt cho login email và UserEmail.verifiedAt cho email linked; profile institutionalEmail/verifiedAt là projection, không dùng làm authority. Verified institutional login reuse trực tiếp, không OTP và không tạo mirror mới. Secondary email ở cùng User, không đổi login email. Challenge gắn authenticated User và normalized exact email; UI mới gửi cả email khi check code. Existing unique ownership và revalidation trong transaction chống nhận email của người khác. Send response không tiết lộ tài khoản khác: cùng masked acknowledgement, không gửi mã/link email đang thuộc người khác.

## 3. Domain trust — IMPLEMENTED

Chỉ trusted ACTIVE institution registry đúng institution được dùng cho ownership recognition; email domain exact, không suy luận theo `.edu`. Website subdomain policy tách biệt. Unknown institution/email domain vẫn có manual path. URL HTTPS/public hostname phải qua registry/safety rules; unknown website được giữ PENDING_ADMIN_VALIDATION để Admin xác nhận. Không scrape URL. FPT và non-FPT dùng cùng service.

## 4. UI evidence — IMPLEMENTED

Faculty page/staff directory/department directory → URL. Institution-issued faculty/staff profile, employment confirmation, appointment letter và staff ID → private PDF/JPEG/PNG, 10 MiB. OTHER yêu cầu tên và URL/document; không nâng trust. Chỉ hiện input đúng format, giữ draft, có 1–6 entries; website guidance chỉ hiện nếu có URL evidence. Header/OTP expiry/cooldown và lỗi được localize. Sửa thông tin giữ edit flow hiện có; thay institution/position reset verification claim theo policy trước.

## 5. Manual verification — IMPLEMENTED

Account email verified và credible current-position evidence là bắt buộc. No-institutional-email không bị chặn và không tự bị coi là fraud. Một faculty URL không tự verify Gmail account. Mọi manual request tạo mới, kể cả legacy client contract, có server-written identityBindingPolicy=2; approval cần checklist, nguồn VALID, note ít nhất 20 ký tự, phương thức INSTITUTION_CONTACT hoặc TRUSTED_INSTITUTION_RECORD và provenance ít nhất 10 ký tự. Admin phải thiết lập channel/record độc lập với applicant. Độ dài là validation giới hạn, không phải bằng chứng assurance. Nguồn chưa đủ → NEEDS_MORE_INFORMATION. Existing historical approval/requests không bị đổi trạng thái hàng loạt.

## 6. Durable submission API — IMPLEMENTED

- POST `/api/v1/academic-profiles/me/verification-evidence`: authenticated multipart `institutionId` + `evidence`; validate/re-encode rồi lưu private storage và staging record; 201 `{uploadId,status:UPLOADED,expiresAt}`. Không trả storage key. Upload hết hạn sau 50 phút; storage deletion intent tồn tại trước upload, xử lý sau 60 phút.
- POST `/api/v1/academic-profiles/me/verification-request`: JSON `type:POSITION`, `evidenceType:DOCUMENT`, `path`, `institutionId`, UUID `submissionKey`, bounded `sources`; document dùng uploadId. Source ownership, claim, readiness/expiry và single consumption kiểm tra lại dưới user lock. Không nhận client review/trust status.
- Sau transaction commit, 201 `{requestId,status,submittedAt,submissionKey,accepted:true}`. Request, evidence references, audit và outbox cùng transaction. Success không chờ SMTP, Redis dispatch hoặc Admin.
- Unique `(userId,submissionKey)` và payload hash: retry/concurrency trả cùng request; khác nội dung cùng key bị 409. Khác key khi có pending cũng bị 409.
- GET existing `/me/verification-status?submissionKey=…` trả authoritative acknowledgement chỉ cho owner; key của người khác không tìm thấy.
- Old multipart contracts và non-Lecturer/AFFILIATION callers vẫn nhận profile response cũ; staging chỉ dành cho Lecturer. Approval position vẫn là source of truth hiện có.

## 7. Background delivery — IMPLEMENTED

Reuse Notification làm transactional outbox. Submitted/approved/rejected/more-info có eventKey unique và minimal email payload `{event,requestId}`. Applicant notification và Admin queue alert được ghi durable. Existing notification worker scan outbox khi startup và mỗi 60 giây, dispatch BullMQ, recover failed/completed jobs và gửi branded en/vi mail. Không detached Promise quan trọng trong HTTP handler. SMTP failure không đổi verification state. Atomic email claim chống double worker delivery; definite rejection retry, ambiguous timeout/crash → UNCERTAIN và log code/notification ID. Security-status emails dùng product rule hiện có, không reuse mentorship preference cho loại mail khác. Disabled SMTP → SKIPPED, không gửi mail hoặc log token.

## 8. Success/error/retry UX — IMPLEMENTED

Upload và request acknowledgement có state/progress riêng. Chỉ khi upload API trả UPLOADED mới submit JSON. Ref ngăn double clicks. Timeout/5xx đối chiếu authoritative key trước khi success; chưa xác nhận giữ payload/key/draft để retry cùng request. Required upload lỗi không gọi request endpoint. 400/409/401 được xử lý bằng lỗi có hướng dẫn; stale claim/pending conflict refresh canonical profile. Không success từ URL param hoặc progress=100.

Sau acknowledgement navigate existing `/settings/academic?requestId=…&submitted=1`; status view fetch own requests, hiển thị mã/thời gian/trạng thái và hướng dẫn, hai actions xem trạng thái/về profile. Không tự hiển thị Lecturer VERIFIED. Modal không đóng bằng Cancel/Escape/overlay trong lúc gửi hoặc outcome chưa xác định; sau acceptance đã ra khỏi draft form. Không thêm withdrawal giả hoặc parallel status store.

## 9. Admin — IMPLEMENTED

Giữ queue/review routes hiện có, Admin ACTIVE, không self-approve hoặc cấp authority cho Forum Moderator. Admin thấy claim, email ownership/provenance, domain trust, từng source, private preview, assessments, path/checklist. New manual policy thêm independent method/provenance và private rationale. Conflicting final decisions vẫn dưới locks/conditional update. Decision outbox nằm cùng transaction; reviewer/time/method và provenance được ghi trong record/audit. Private binding details không trả cho owner/public; user chỉ đọc reason/action cần thiết. Không tạo MentorRelationship, ProjectMember hoặc ReviewAssignment từ verification.

## 10. Privacy/security — IMPLEMENTED

Giữ byte validation PDF, sharp decode/re-encode ảnh, private local/R2/authenticated Cloudinary, bounded metadata, Admin authorization/source association, temporary backend-proxied access và canvas PDF viewer. Staging có cap 12 unconsumed live files/user và upload rate limit 20/giờ. Expired staging metadata được cleanup; durable file deletion queue retry storage outages. Disable clears staged metadata/private binding provenance; account delete cascades metadata nhưng deletion queue giữ lại task. Evidence không xuất hiện trong public Profile/Forum/Project/search. Retention cả document/URL private explanation/provenance. OTP secure random, HMAC, max attempts, expiry, atomic one-use, supersession, DB cooldown, route send/check limits; TTL/attempts/cooldown config trong `.env.example`. SMTP timeouts được giới hạn.

## 11. Migration — IMPLEMENTED

`20261008000200_lecturer_submission_hardening`: nullable submission key/hash trên existing request, staging table, challenge.sentAt, mở rộng evidence type/slot checks và account-disable cleanup. Không drop pending submissions, không backfill trust hoặc VERIFIED, không đổi lịch sử mentor/review. Đã deploy vào DB local; 58 migrations. Historical pending requests giữ review policy gốc; mọi request tạo mới có identity-binding policy do server đặt. Existing OTP rows được backfill sentAt hiện tại, có thể chịu cooldown resend đầu tiên tối đa cấu hình hiện có.

## 12. Tests/build — IMPLEMENTED (kết quả kiểm tra cuối ghi bên dưới)

- 31 PostgreSQL/Redis integration tests đạt: real HTTP stage/submit/private file, same-key concurrency, mismatched payload, outbox rollback, owner lookup, stolen/expired/stale uploads, six entries, identity binding, OTP cooldown/expiry/attempt cap/replay, claim changes, permission/state transitions/retention và real worker recovery với SMTP disabled.
- 24 backend unit tests đạt: delivery claims/retries/UNCERTAIN/disabled, four templates, schema and content/storage security.
- 65 frontend tests đạt: dynamic form, stage-before-submit payload, double-click lock, same-key retry, timeout reconciliation/no false success, authoritative receipt, Admin, notification destination.
- Backend/frontend typecheck đạt. Scoped ESLint và git diff --check đạt; chỉ warnings LF/CRLF có trước.
- Migration compatibility harness giữ source filename/assessment, pending request IDs và legacy mentorship history.
- Production Docker builds backend và web đạt; lần rebuild web cuối đã được triển khai. Initial JavaScript graph 931.2 KiB, dưới budget 950 KiB; PostgreSQL runtime audit trong build đạt 4 tests.
- Deployment local: backend healthy, worker-notifications running; web chạy đúng image đã build. Nginx config test đạt. `/health` (4000), `/profile` và `/settings/academic` (8080) trả HTTP 200; upload evidence khi chưa đăng nhập trả 401.

## 13. Giới hạn và policy — PARTIAL / NOT IMPLEMENTED theo hạng mục

- PARTIAL: SMTP không bảo đảm exactly-once khi timeout sau DATA. Đánh dấu UNCERTAIN để operator kiểm tra; không tự gửi lại trong tình huống mơ hồ.
- NOT IMPLEMENTED: antivirus/OCR/document authenticity automation vì repo không có hạ tầng scanning. Không tạo processing stage giả; Admin chịu trách nhiệm kiểm tra thật và independent identity binding.
- PARTIAL (verification of external service): test không gửi email thật. SMTP vận hành cần cấu hình provider; delivery logic/retry được mock và worker thật được chạy với SMTP disabled.
- Không còn blocker implementation; production checks local đã đạt. Không merge/push hoặc thay đổi semantics Mentorship/Formal Review trong task này.

## File chính

- Backend: `lecturer-verification.service.ts`, `lecturer-verification-delivery.service.ts`, `verification-evidence-upload.service.ts`, `institutional-email-verification.service.ts`, `academic-email.service.ts`, `academic-profile.service.ts/controller.ts/routes.ts`, `dto/academic-profile.schema.ts`, `verification-evidence-retention.service.ts`, upload middleware, env, auth mail và notification worker.
- Web: `position-verification-panel.tsx`, `lecturer-evidence-entry.tsx`, `verification-submission-status.tsx`, `academic-profile-section.tsx`, hooks/API/error utility, Admin review, locales và notification destination.
- Model/shared: `identity.prisma`, migration trên, `packages/shared-types/src/academic-profile.ts`, `.env.example`; focused tests trên.

## Rà soát logic lần hai — 08/10/2026

Đã tìm và sửa các lỗi sau:

1. Cooldown resend dừng khi đổi email sau khi gửi OTP, gây khóa nút gửi mã. Timer giờ tiếp tục theo cooldown; nút verify cũng bị khóa khi mã hết hạn.
2. Unknown submission outcome vẫn cho đổi identity path/thêm evidence trong khi retry dùng payload cũ. Toàn bộ draft giờ bị khóa, còn retry giữ chính xác payload/key và không phụ thuộc validation của draft đã gửi.
3. Retry trả 429 có thể làm client bỏ idempotency key dù request trước đã commit. API đối chiếu server bằng key cả khi bị throttle; chưa xác nhận thì giữ key. Lỗi chắc chắn làm xóa cache staging để upload hết hạn được tải lại.
4. Replay sau khi đổi academic role bị chặn trước khi tra request cũ. Submission-key requests giờ đi qua cùng service replay; trả trạng thái thực tế, không khôi phục trust hoặc tạo request mới.
5. OTP hết hạn trong lúc chờ user lock vẫn có thể được chấp nhận bởi timestamp cũ. Kiểm tra hạn tại thời điểm atomic consumption; tạo challenge mới cũng supersede mã cũ ngay cả khi email mới đang thuộc account khác.
6. Retention bỏ sót metadata ghi chú của URL-only evidence và bản sao verificationNote trên AcademicProfile. Cleanup bao gồm các private notes; chỉ xóa projection khi request được cleanup là request POSITION mới nhất. Decision không có note xóa projection cũ.

Regression được chạy lại: 35 PostgreSQL/Redis integration tests, 38 frontend tests và 17 backend unit tests đạt. Backend/web typecheck, scoped ESLint và git diff --check đạt. Integration dùng DB/Redis riêng và SMTP disabled; không gửi email thật. Không có schema migration mới trong lần sửa này.

Production Docker build backend/web đạt sau lần sửa; backend, web và worker-notifications đã chạy đúng image mới. Backend healthy, `/health`, `/profile`, `/settings/academic` trả 200, upload evidence chưa đăng nhập trả 401. Các giới hạn SMTP/antivirus ở mục 13 vẫn áp dụng.
