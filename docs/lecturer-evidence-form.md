# Refactor form minh chứng giảng viên — 08/10/2026

## 1. Form và model hiện có

Repo thực tế dùng React/Vite, TypeScript, Express, Prisma/PostgreSQL. Request hiện có là `VerificationEvidence`; từng nguồn là `VerificationEvidenceSource`. Luồng cũ nhận nguồn chính/bổ sung bằng URL hoặc PDF và dùng kho local/R2/Cloudinary authenticated, retention, hàng đợi xóa tệp và Admin review. Phiên bản mới mở rộng các cấu trúc này.

## 2. File/component chính

- Web: `position-verification-panel.tsx`, component lặp `lecturer-evidence-entry.tsx`, viewer lazy `private-evidence-pdf-preview.tsx`, API `academic-profile.api.ts`, utility lỗi, locale `academic-support.ts`, Admin `academic-verifications.tsx`. Thêm `pdfjs-dist` 6.4.299 trong package/lockfile cho viewer canvas.
- Backend: `lecturer-verification.service.ts`, `verification-evidence-file.ts`, storage/retention, schema/controller/service academic profile, upload middleware và `institution-domain.service.ts`.
- Shared: `packages/shared-types/src/academic-profile.ts`.
- Deploy: Nginx hỗ trợ MIME `.mjs` cho worker local và body multipart 61 MiB để phù hợp tối đa 6 tệp × 10 MiB; API vẫn giới hạn type/count/size cho từng route.
- Prisma: `identity.prisma`, migration `20261008000100_lecturer_evidence_entries`.

## 3. Mapping động

| Loại | Field hiển thị |
|---|---|
| Faculty/staff profile, staff directory, department directory | URL HTTPS |
| Employment confirmation, appointment letter | Upload riêng tư |
| Staff/Lecturer ID card | PDF/JPEG/PNG riêng tư |
| Khác | Tên bắt buộc → chọn URL hoặc tài liệu → field tương ứng |

Tệp của mọi loại document được giới hạn PDF/JPEG/PNG, 10 MB/tệp. Một yêu cầu có 1–6 mục; có thêm/xóa và thay tệp. URL/tệp đã nhập được giữ trong draft khi đổi loại, nhưng chỉ hình thức đang chọn được gửi. Giải thích riêng từng mục được thu gọn mặc định; có loading/progress thực từ Axios và lỗi tiếng Việt.

## 4. Minh chứng Khác

`OTHER_INSTITUTION_SOURCE` giữ nguyên loại generic; `customEvidenceName` là thông tin người dùng khai báo, không được chuyển thành loại tin cậy khác. Backend yêu cầu tên 2–200 ký tự, hình thức hợp lệ, nội dung đúng hình thức và explanation tối đa 1.000 ký tự. Trạng thái mới là `UNCHECKED`.

## 5. Contract/validation backend

Reuse POST `/api/v1/academic-profiles/me/verification-request`: multipart `sources` (JSON), `evidenceFiles` (tệp), `path`, `institutionId`. Mỗi document entry có `documentIndex` ứng với chính tệp gửi trong request; không nhận private document ID/key do client cung cấp. Mỗi tệp phải thuộc đúng một mục; chặn thiếu/thừa/trùng tệp, URL trùng và content document trùng. Schema strict chặn client gửi review status, storage key hay trạng thái trusted.

Client cũ dùng `primarySourceType`, `additionalSourceType`, `evidence`, `additionalEvidence` vẫn được nhận cho các kiểu cũ; không cho trộn hai định dạng. Các chức năng AFFILIATION và POSITION của role khác giữ contract cũ và không nhận sources của Lecturer.

## 6. Bảo mật tài liệu và URL

- PDF kiểm tra signature/version và marker kết thúc; ảnh được sharp decode, kiểm tra format thực, pixel limit rồi encode lại, loại metadata. MIME khai báo không đủ để qua validation.
- Reuse private storage, authenticated Cloudinary raw/R2/local; key do server tạo. Download/preview qua Admin API hiện có, kiểm tra Admin ACTIVE và source thuộc request. URL cloud ký 60 giây được backend proxy; client không nhận storage key hoặc public URL. Response `private, no-store`, MIME đúng và `nosniff`.
- PDF chỉ vẽ pixels lên canvas bằng worker PDF.js local, theo [API canvas của Mozilla](https://mozilla.github.io/pdf.js/examples/). Không dùng iframe, scripting manager, annotation links hoặc form layer; XFA và worker resource fetching bị tắt. Chỉ tải thư viện khi mở preview; đóng preview hủy worker và giải phóng blob URL. Dùng build có polyfill để tương thích browser hiện tại.
- HTTPS, hostname công khai hợp lệ; chặn IP, local/private-network names, credentials, port, fragment, scheme lạ và miền giả dạng registry. Không fetch/scrape URL người dùng.
- Nếu trường đã có website domain được duyệt, URL phải khớp registry và policy subdomain. Nếu chưa có, URL an toàn chỉ được ghi `PENDING_ADMIN_VALIDATION`; Admin phải độc lập xác nhận trường kiểm soát miền và đánh giá nguồn `VALID` trước approval. Domain đang thuộc trường khác hoặc đã vô hiệu hóa không được dùng để vượt validation.
- Retention hiện có xóa raw documents, file metadata, explanation và private reviewer notes. Disable/delete vẫn dùng queue bền vững. Public profile loại bỏ toàn bộ verification requests; không thêm evidence vào Project/Forum API.

## 7. Xét duyệt và identity binding

Admin xem từng loại, tên tự khai báo, URL/preview tài liệu riêng tư, explanation và assessment. Giữ approve/request more information/reject, checklist, audit và locks hiện có. Mọi approval Lecturer cần xác nhận tên, institution, vị trí hiện tại, nguồn do trường kiểm soát, không xung đột và liên kết tài khoản với người khai báo; tất cả nguồn phải `VALID`.

- STANDARD: reuse verified email đăng nhập hoặc linked email của cùng user. Một nguồn vị trí đủ mạnh có thể là URL hoặc document; không bắt buộc thêm PDF.
- MANUAL: cho nộp một nguồn mạnh hoặc nhiều nguồn cần thiết. Một nguồn không tự đủ để xác minh: nếu Admin duyệt, phải xác nhận identity binding và ghi cơ sở xác minh riêng (ít nhất 20 ký tự). Nhiều nguồn cần xác nhận chúng độc lập đối chiếu claim. Nếu chưa đủ assurance, yêu cầu bổ sung thay vì duyệt theo số tệp.

Chọn role/FPT affiliation/URL/OTHER không tự verify. Approval không đổi system role, không tạo MentorRelationship hay ReviewAssignment; quyền mentoring/formal review vẫn theo luồng hiện có.

## 8. Migration/tương thích

Chỉ bổ sung field vào `verification_evidence_sources`: `source_kind`, `custom_evidence_name`, `additional_explanation`, `mime_type`, `url_trust_status`, `updated_at`. Giữ `reference`, `storage_key`, review status và request ID làm canonical fields. Backfill source kind/MIME PDF cho dữ liệu cũ; không đổi review status hoặc nâng độ tin cậy. Root request cũ tiếp tục đọc được. Legacy Lecturer requests thiếu provenance/policy vẫn cần bổ sung theo quy tắc trước.

## 9. Kết quả kiểm tra

- 22 integration tests PostgreSQL đạt: reused/linked email, single document STANDARD, multipart custom URL + ảnh, private download MIME, chặn user thường, review từng nguồn, manual identity binding, unregistered domain, spoofing, thiếu/trùng/thừa upload, concurrency/state transitions, retention, legacy requests.
- 16 unit tests backend đạt: schema hiện có, entry theo sourceKind, custom descriptions, strict review fields, nội dung ảnh/PDF và signed private storage.
- 24 UI tests đạt: 18 Lecturer form/consent tests, 3 dynamic entry tests, 2 Admin tests, 1 viewer PDF test. Có kiểm tra payload không chứa URL ẩn, thêm/xóa nguồn, giữ draft, mapping upload/URL, lỗi email và domain, identity binding, Admin xác nhận domain và hủy worker.
- Browser smoke của component PDF.js với tài liệu mẫu hai trang đạt: worker thật vẽ được nội dung, chuyển trang và unmount. Script ở `artifacts/lecturer-evidence/check-pdf-preview.mjs`, ảnh kết quả `pdf-preview-page-2.png`. Đây là test viewer độc lập; quyền/API private được kiểm tra riêng trong integration suite.
- Migration test seed một source cũ trước upgrade: giữ filename, trạng thái INCONCLUSIVE, backfill DOCUMENT/PDF; migration history/request IDs và dữ liệu mentoring vẫn giữ nguyên.
- Typecheck backend/frontend, ESLint các file thay đổi và `git diff --check` đạt (lint theo phạm vi, không phải toàn repo).
- Production Docker build backend/web đạt; initial JS graph 931,2 KiB, dưới budget 950 KiB.
- Migration `20261008000100_lecturer_evidence_entries` đã deploy local. Backend/web/notification worker khởi động bằng image mới; health API và `/profile` HTTP 200. Nginx config test đạt; worker PDF production trả HTTP 200 với `application/javascript`, worker không tồn tại trả 404. Không reset DB/volume hoặc gửi email thật trong test.

## 10. Giới hạn

Hệ thống không tự chứng thực nội dung tài liệu, OCR, tính thật của chức vụ hay quyền kiểm soát website. Các bước này vẫn thuộc trách nhiệm Admin. PDF được kiểm tra định dạng đầu/cuối, không phải hệ thống antivirus hoặc bộ kiểm tra chữ ký số. OTP/email delivery được mock hoặc tắt trong integration tests; không gửi email thật khi chạy test.
