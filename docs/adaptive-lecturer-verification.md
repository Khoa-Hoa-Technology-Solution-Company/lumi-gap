# Xác minh giảng viên thích ứng — báo cáo triển khai

> Cập nhật 08/10/2026: form đã chuyển sang danh sách minh chứng động, hỗ trợ PDF/ảnh và minh chứng “Khác”. Chính sách số lượng nguồn và validation tên miền đã được cập nhật trong [báo cáo form minh chứng](lecturer-evidence-form.md); các mô tả “bắt buộc hai nguồn” dưới đây ghi lại phiên bản ngày 07/10.

Ngày kiểm tra: 07/10/2026. Repository thực tế sử dụng React/Vite, Express và Prisma/PostgreSQL.

## 1. Kiến trúc trước đây

Request POSITION nằm trong `VerificationEvidence`, trạng thái vị trí/role nằm trong `AcademicProfile`. Form cũ chọn một PDF hoặc URL; Admin quyết định mà chưa có checklist hoặc đánh giá từng nguồn. `UserEmail`, OTP, registry trường, kho tài liệu riêng tư, audit, notification và hàng đợi xóa file đã có sẵn.

## 2. Các giả định cũ đã bỏ

Lecturer dùng form thích ứng thay cho bộ trường email/PDF/URL cố định. Form kiểm tra danh tính đã xác minh trước. Không coi lựa chọn role, ORCID, hồ sơ Scholar hoặc một URL công khai là bằng chứng đủ để xác minh giảng viên. Luồng POSITION của các role khác tiếp tục dùng infrastructure hiện có.

## 3. Registry tên miền

`InstitutionDomain` bổ sung EMAIL/WEBSITE/BOTH, `allowSubdomains`, `verifiedAt`. Email chỉ khớp đúng miền được duyệt; website chấp nhận subdomain khi registry cho phép. HTTPS bắt buộc; IP, địa chỉ local, credentials, custom port, fragment, miền giả dạng và website cá nhân bị từ chối. Không fetch/scrape URL người dùng.

Migration giữ mọi email domain cũ và đăng ký riêng `daihoc.fpt.edu.vn` là WEBSITE. Nguồn đối chiếu: [website chính thức Trường Đại học FPT](https://daihoc.fpt.edu.vn/). Không suy luận website authority từ email authority.

Operations có command chung cho các trường, sau khi kiểm tra quyền kiểm soát miền:

```text
pnpm --filter backend exec tsx scripts/approve-institution-domain.ts ADMIN_UUID INSTITUTION_UUID official.university.edu WEBSITE false
```

Command kiểm tra Admin ACTIVE, trường ACTIVE, không chuyển miền đang thuộc trường khác và ghi audit. `true` ở tham số cuối cho phép subdomain website; email vẫn khớp exact domain. Đây là công cụ vận hành dùng DB credentials, không phải endpoint cho user tự duyệt miền.

## 4. Dùng lại email đăng nhập

`User.emailVerifiedAt` cùng miền được duyệt của trường hiện tại đủ để dùng lại quyền sở hữu. Không gửi OTP lần nữa, không tạo UserEmail trùng và không yêu cầu nhập lại email. Tài khoản cũ thiếu UserEmail mirror cũng được hỗ trợ. Form hiển thị email và thông báo đã xác minh qua LumiGap.

## 5. Liên kết email trường bổ sung

Người dùng email cá nhân có thể gửi OTP cho email trường của institution đang chọn. OTP được hash, có thời hạn, số lần thử và guarded consume. Sau xác minh, `UserEmail` bổ sung thuộc cùng user; giữ nguyên login email và Profile. Purpose ACCOUNT của email sẵn có được giữ nguyên. Email đã thuộc user khác hoặc miền không thuộc trường đang chọn bị từ chối. Email ownership và affiliation vẫn là hai trạng thái riêng; Lecturer verification không tự được phê duyệt sau OTP.

## 6. Không có email trường / trang hồ sơ công khai

Chọn “Tôi không có email trường” mở manual path: nguồn chính thức của trường và một bằng chứng độc lập bổ sung. Có thể dùng URL chính thức kèm PDF do trường cấp, hai URL của trường với Admin xác nhận độc lập/identity binding, hoặc hai tài liệu của trường khi không có trang công khai. Hai file giống nhau hoặc cùng URL không được dùng như hai nguồn độc lập. Người đã có email trường cũng có thể chuyển manual path khi không có trang faculty/staff.

## 7. Identity binding và chống mạo danh

Personal email kèm một faculty page không đủ nộp manual request và không được auto-verify. Manual approval bắt buộc Admin xác nhận nguồn liên kết tài khoản với người khai báo, hai nguồn độc lập, tên, trường, vị trí hiện tại và không có xung đột. Server kiểm tra checklist cùng từng nguồn VALID. Standard approval kiểm tra lại ownership, registry và institution tại thời điểm quyết định. Thay đổi claim hoặc ownership làm quyết định cũ thất bại.

## 8. Request và provenance

Dùng lại `VerificationEvidence` làm request root, bổ sung `institutionId`, `verificationMethod`. Claim snapshot chứa tên, trường, role, vị trí và provenance email. Method được server suy ra, không nhận trạng thái VERIFIED từ client:

- `INSTITUTIONAL_EMAIL_AND_PROFILE`
- `MANUAL_INSTITUTIONAL_EVIDENCE`
- Schema dành chỗ cho `TRUSTED_INSTITUTION_SOURCE`; chưa triển khai tích hợp tự động.

## 9. Từng nguồn bằng chứng

`VerificationEvidenceSource` gắn với root hiện có. Slot 0 là email, 1 là nguồn chính, 2 là nguồn bổ sung. Lưu type, email identity ID nếu có, URL hoặc private storage key, trạng thái UNCHECKED/VALID/INVALID/INCONCLUSIVE, reviewer, timestamp và private note. Storage key không nằm trong DTO. Nguồn PDF không tạo public URL.

## 10. Admin review

Màn hình hiển thị claim, email account đã xác minh, provenance institutional identity, verification path, từng nguồn và checklist. Admin có thể đánh giá nguồn, tải PDF riêng tư, approve/reject/request more information. Manual có thêm identity binding và independent evidence. Nút approve được khóa khi thiếu check; server thực thi cùng chính sách. Decisions dùng applicant/Admin locks và update có điều kiện PENDING để chỉ một quyết định thành công. Lịch sử more-info được giữ khi nộp lại; có audit SUBMITTED/RESUBMITTED/MORE_INFO/APPROVED/REJECTED và thông báo trong app/email không chứa bằng chứng nhạy cảm.

## 11. Privacy và retention

Reuse kho PDF local/R2/Cloudinary authenticated. API download yêu cầu Admin ACTIVE và source thuộc đúng request. Response no-store. Public Profile không có evidence/request/staff ID/note. Internal Admin notes/checklist/source notes không trả trong owner DTO.

Sau final review, worker dùng `ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS` (mặc định 30) để xóa raw PDF, file metadata, applicant/private source notes; giữ method, claim tối thiểu, kết quả review và audit. Cả root file cũ và child files được xử lý. Queue xóa có retry, chịu được account disable/delete và DB cascade. OTP không được ghi vào log; cần SMTP để gửi mã.

## 12. Migration dữ liệu cũ

`20261007000500_adaptive_lecturer_verification` đã áp dụng local. Giữ root requests, URL, PDF và quyết định cũ; tạo source metadata cho POSITION cũ. Không tự nâng bằng chứng cũ thành nguồn verified. Request Lecturer cũ chưa đủ policy cần Admin yêu cầu bổ sung rồi user nộp lại bằng form mới. Existing approvals vẫn được giữ.

## 13. Phân quyền

Không đổi SystemRole hoặc AcademicRole khi approve/reject. Unverified/Pending/Rejected Lecturer vẫn có core research access. FPT affiliation không đồng nghĩa Lecturer verified. Generic Forum Moderator không có quyền xét duyệt. Verification không tạo ProjectMember, ReviewAssignment hay MentorRelationship. Formal review vẫn cần assignment/artifact/version phù hợp; mentoring vẫn cần đồng thuận và quyền theo project.

## 14. Kết quả kiểm tra

- 16 kiểm thử mới trên PostgreSQL riêng: A/B/C, impersonation, miền giả, hai PDF, quyền, privacy, legacy, retention, disable/delete, duplicate submission và concurrent decisions.
- 82 kiểm thử PostgreSQL hồi quy đạt: onboarding, account identity, affiliation, project workspace, review/mentorship authorization, profile và home.
- 21 unit tests backend đạt: lifecycle, policy và private storage.
- 38 kiểm thử UI đạt: Lecturer form/reminder, shared profile và affiliation.
- Backend/frontend typecheck đạt. ESLint các file/module thay đổi đạt; đây không phải full-repository lint.
- Production Docker build backend/frontend đạt. Migration deploy đạt; backend healthy, web và notification worker đang chạy.
- Trình duyệt local đã kiểm tra nhánh dùng lại email, nhánh liên kết email và manual; Admin checklist và nút approve khóa/mở đúng điều kiện. Dropdown tiếng Việt giữ payload trạng thái độc lập với bản dịch. Ảnh ở `artifacts/adaptive-lecturer/`. Tài khoản thử nghiệm được dọn sau kiểm tra; không phê duyệt Lecturer giả trên DB đang dùng.
- Không kiểm tra gửi email thật cho một giảng viên; OTP delivery được mock trong integration tests. Không triển khai scraping, HR, OCR, KYC hoặc auto approval.

## 15. Chính sách vận hành còn cần quản lý

Admin/operations cần duyệt email/website domains của các trường mới; chưa có dashboard domain approval. Trường chưa có website domain có thể dùng hai tài liệu do trường cấp. Admin cần đánh giá tính hiện hành và identity binding của nội dung; hệ thống không đọc nội dung website hoặc xác minh tính thật của PDF tự động. Retention có thể cấu hình 1–365 ngày theo chính sách. Trusted institution integration là extension tương lai.

## File và API chính

Backend: `prisma/identity.prisma`, migration mới, `lecturer-verification.service.ts`, `institutional-identity.service.ts`, `institutional-email-verification.service.ts`, `institution-domain.service.ts`, `academic-profile.service.ts`, schema/controller, upload middleware, retention, email delivery, affiliation service và operations command.

Frontend: `position-verification-panel.tsx`, component POSITION cũ dành cho role khác, API/hooks, `pages/admin/academic-verifications.tsx`, shared types và locale.

API được reuse/mở rộng:

- GET `/api/v1/academic-profiles/me/institutional-email/status`
- POST `/api/v1/academic-profiles/me/institutional-email/challenge` nhận optional email
- POST `/api/v1/academic-profiles/me/institutional-email/verify`
- POST `/api/v1/academic-profiles/me/verification-request` nhận path, source types, hai upload fields
- GET/PATCH `/api/v1/admin/academic-verifications/:requestId` trả sources/nhận structured checks
- GET `/api/v1/admin/academic-verifications/:requestId/evidence?sourceId=...`

Không tạo API/user identity/Lecturer request system song song.

## Kiểm tra lại sau triển khai

Đã tái hiện và sửa hai lỗi khi đổi luồng: loại bằng chứng PDF của manual path bị giữ lại sau khi chuyển sang email trường; ghi chú riêng của Admin bị bỏ qua khi yêu cầu bổ sung thông tin. Form hiện chuyển lại về nguồn faculty/staff phù hợp, và API lưu private note cho cả quyết định `more_info`. Đã bổ sung hai nhãn tiếng Việt cho trạng thái xác minh đơn vị công tác.

Kiểm tra lại trên DB thử nghiệm riêng: 16 integration tests đạt (bao gồm lưu private note và không trả note cho người gửi), 12 UI tests đạt (bao gồm đổi luồng và payload của Admin). Typecheck backend/frontend, ESLint các file sửa và `git diff --check` đạt. SMTP đang được cấu hình trong Docker; chưa gửi OTP thật trong lần kiểm tra này.

Docker backend/frontend đã build và khởi động lại thành công; backend healthy. Trình duyệt đã xác nhận form email cá nhân mở đúng trường khi chọn từng luồng, và email trường đã verified được dùng ngay, không hiện trường OTP. Nhãn trạng thái đơn vị công tác hiển thị tiếng Việt. Tài khoản và project kiểm thử local đã được dọn.

![Form dùng lại email trường sau kiểm tra](../artifacts/adaptive-lecturer/recheck-reuse-account-email.png)
