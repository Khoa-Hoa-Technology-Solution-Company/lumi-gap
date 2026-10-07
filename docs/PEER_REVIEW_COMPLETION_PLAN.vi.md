# LumiGap — Hiện trạng và đặc tả hoàn thiện peer-review

Ngày khảo sát: 03/10/2026.

**Cập nhật triển khai:** Backend/web đã được thay đổi sau bản khảo sát này. Xem [kết quả triển khai và kiểm tra](PEER_REVIEW_IMPLEMENTATION_2026-10-03.vi.md). Các mô tả “hiện tại” bên dưới là snapshot lúc khảo sát, trước khi triển khai.

## 1. Phạm vi và kết luận

Tài liệu này tổng hợp hành vi từ mã nguồn backend, shared types, giao diện web và các unit test về quy tắc review. Chưa chạy kiểm thử tích hợp, kiểm tra dữ liệu production, giao diện trong trình duyệt hoặc ứng dụng mobile. Các mục “đề xuất” chưa được triển khai bởi tài liệu này.

LumiGap đã có nền tảng review theo tiêu chí, lời mời, assignment, lưu nháp, phiên bản tài liệu và phản hồi yêu cầu sửa. Vấn đề chính là quyền tham gia còn hẹp và các đường vào chưa dùng chung một vòng đời.

Định hướng đã chốt với người dùng: LECTURER và RESEARCHER được thực hiện peer-review ở cả INTERNAL và EXTERNAL; STUDENT không được thực hiện peer-review ở bất kỳ phạm vi nào. Reviewer được ghi nhận đóng góp gắn với chính bài nghiên cứu đã review. Đây là đặc tả mục tiêu; mã nguồn hiện tại chưa được thay đổi bởi tài liệu này.

Yêu cầu bổ sung đã chốt: quản lý nhiều phiên bản nghiên cứu, truy cập các phiên bản cũ và quan sát điểm review trước/sau khi sửa. Mọi điểm, nhận xét, phản hồi và đóng góp phải truy được tới đúng phiên bản đã được review.

## 2. Những gì đã có

| Thành phần | Hành vi hiện tại |
|---|---|
| Tài liệu | Submission gắn với dự án; nhận PDF hoặc chuyển Research Artifact Markdown thành submission |
| Phiên bản | SubmissionRevision lưu bản PDF hoặc content snapshot, số phiên bản và checksum |
| Lời mời | ReviewRequest gắn tài liệu, phiên bản mẫu, phiên bản tài liệu, người gửi và hạn review |
| Phân công | ReviewerAssignment xác định reviewer, trạng thái và mã ẩn danh |
| Cơ hội review | Reviewer tự nhận bài phù hợp; có thiết lập khả năng nhận bài và giới hạn tải |
| Review | HumanReview gắn assignment, revision và roundNumber; DRAFT hoặc SUBMITTED |
| Mẫu | Mẫu SYSTEM, PERSONAL, PROJECT; có phiên bản và ba reviewMode |
| Nội dung | Điểm mạnh, vấn đề chính, đánh giá tổng thể, nhận xét theo tiêu chí và căn cứ |
| Sửa bài | ReviewRevisionItem và ReviewRevisionResponse; yêu cầu trả lời từng mục còn mở trước khi gửi lại |
| AI | Pre-review hỗ trợ dựa trên thông tin nghiên cứu có cấu trúc |
| Theo dõi | Có audit log, thông báo và ghi nhận đóng góp review |

Ba reviewMode hiện tại:

- GUIDED_FEEDBACK: trả lời câu hỏi hướng dẫn.
- STRUCTURED_REVIEW: nhận xét và mức đánh giá theo từng tiêu chí.
- RUBRIC_ASSESSMENT: mức đạt và điểm có trọng số.

Ba chế độ này mô tả cách điền biểu mẫu. Chúng không đủ để xác định quyền chuyên môn của reviewer.

## 3. Chính sách tham gia hiện tại

Các bước chọn reviewer, nhận lời mời, nhận cơ hội review, xem workspace và viết review kiểm tra STRUCTURED_REVIEW.

Policy tự động hiện chỉ cấp quyền này cho LECTURER có academic role VERIFIED:

- INTERNAL: cần vị trí hiện tại tại đơn vị chủ quản được xác minh.
- EXTERNAL: được quyền review, nhưng chỉ nhận lời mời cụ thể.
- STUDENT và RESEARCHER: chưa được policy tự động cấp quyền này.
- ADMIN: không tự động có quyền review vì là quản trị viên.

Backend kiểm tra capability đang ACTIVE và chưa hết hạn. Vì vậy, một sinh viên có capability STRUCTURED_REVIEW trong dữ liệu vẫn có thể vượt qua bước kiểm tra quyền. Không nên diễn giải code thành lệnh cấm tuyệt đối theo academicRole.

Cơ hội review mở hiện cho phép participantScope INTERNAL và PENDING; EXTERNAL bị loại. Điều kiện này cần sửa theo hướng đã chốt: INTERNAL/EXTERNAL không quyết định quyền làm reviewer. Quyền nhìn thấy từng tài liệu vẫn phải theo phạm vi truy cập của tài liệu đó.

Nguồn: [policyCapabilities](D:/capstone_26/lumi-gap/apps/backend/src/modules/identity/identity-foundation.rules.ts:38), [reviewerContext](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review.service.ts:44).

## 4. Các điểm cần hoàn thiện

### P0 — Quyền và tính đúng của luồng

1. **Policy chưa đúng hướng đã chốt.** Cần cấp quyền peer-review cho cả LECTURER và RESEARCHER, áp dụng giống nhau với INTERNAL/EXTERNAL. STUDENT phải bị chặn ở backend ngay cả khi dữ liệu cũ còn chứa capability review.
2. **Bản nháp có thể được trả cho người gửi.** API detail lấy tất cả HumanReview theo assignment, không lọc DRAFT theo người xem; giao diện lịch sử cũng duyệt tất cả review. Phải lọc tại backend và cả DTO tóm tắt, không chỉ ẩn trên UI.
3. **Cơ hội review chưa nối với Review Center.** Tự nhận bài tạo assignment không có reviewRequestId, trong khi listCenter chỉ lấy assignment có request. Luồng resubmit theo từng mục lại yêu cầu requestId.
4. **Có thể yêu cầu sửa nhưng không có việc cụ thể.** Backend cho phép MINOR_REVISION hoặc MAJOR_REVISION với danh sách sửa rỗng. UI chỉ mở form gửi lại khi có ít nhất một mục OPEN/REOPENED. Đề xuất yêu cầu ít nhất một mục sửa khi chọn hai kết luận này.
5. **Trạng thái submission bị cập nhật bởi từng reviewer.** saveReview cập nhật trực tiếp trạng thái chung sau mỗi review; chưa tổng hợp các assignment đang hoạt động. Cần tách trạng thái review riêng và trạng thái của toàn bộ đợt review.
6. **Kiểm tra xung đột và tải công việc khác nhau giữa các đường vào.** Tự nhận cơ hội kiểm tra tác giả, người có xung đột đã khai báo, thành viên dự án và tải; lời mời trực tiếp chưa dùng chung các kiểm tra này. Luồng quản lý phân công còn có quy tắc cùng đơn vị riêng.

Nguồn: [request detail](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review-request.service.ts:316), [Review Center](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review-request.service.ts:305), [form gửi lại](D:/capstone_26/lumi-gap/apps/web/src/pages/reviews/review-request-detail.tsx:34), [saveReview](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review.service.ts:181).

### P1 — Khép kín trải nghiệm sửa bài

- Phản hồi của tác giả được lưu, nhưng DTO detail/workspace hiện chưa đưa lịch sử ReviewRevisionResponse vào bảng đối chiếu để reviewer kiểm tra từng việc đã sửa.
- Cần thao tác xác nhận ACCEPTED hoặc mở lại REOPENED cho từng mục; hiện resubmit mới đánh dấu ADDRESSED.
- Workspace khi mở lại sau resubmit vẫn có thể trả review SUBMITTED vòng trước; cần xác định rõ vòng mới, khởi tạo draft mới và bảo đảm autosave hoạt động.
- Người gửi trong tab Sent có thể nhận nút Start Review trỏ vào workspace của reviewer; cần nút Xem yêu cầu/Phản hồi riêng theo người xem.
- Workspace hiện hiển thị snapshot Markdown; cần nút xem/tải PDF được phân quyền và luôn gắn đúng revision của đợt review.
- Backend resubmit với revisionId cần kiểm tra số phiên bản thực sự mới hơn; với reportId cần kiểm tra đúng nguồn tài liệu, thay vì chỉ cùng dự án.
- Với rubric, performanceLevelId phải thuộc đúng criterionKey, không chỉ thuộc một tiêu chí bất kỳ của cùng mẫu.
- Bổ sung trang quản lý phiên bản và bảng so sánh điểm trước/sau khi sửa; phân biệt phiên bản tài liệu, vòng review và bản mới nhất đã được review.

### P1 — Danh tính, kết quả và chia sẻ

- Cơ hội review có nhãn DOUBLE_BLIND, nhưng lời mời trực tiếp và chi tiết hiển thị tên người gửi/reviewer. Không quảng bá toàn bộ tính năng là double-blind.
- Không dùng PUBLIC mặc định cho đóng góp review của tài liệu cần bảo mật: bản ghi đóng góp hiện chứa tên tài liệu và liên kết submission/project.
- NOT_READY với 0 yêu cầu sửa trở thành COMPLETED là hành vi có unit test, không nên tự đổi thành REJECTED. Cần hiển thị “Review đã hoàn tất — đánh giá: Chưa sẵn sàng”.

### P2 — Chất lượng và AI

- Gợi ý reviewer hiện dùng so khớp lĩnh vực/từ khóa/loại bài; chưa có semantic matching.
- AI pre-review gửi metadata nghiên cứu và related_evidence rỗng; chưa đủ để tuyên bố đã đánh giá toàn văn PDF trong luồng này.
- Nâng AI theo hướng vị trí nguồn, bằng chứng và danh sách giới hạn; AI không tự tạo review thay người dùng hoặc kết luận chuyên môn cuối cùng.

## 5. Thiết kế đích đề xuất

### 5.1. Ma trận quyền đã chốt

| Academic role | INTERNAL | EXTERNAL | Ghi nhận đóng góp review |
|---|---|---|---|
| LECTURER | Được review | Được review | Có, khi gửi review chính thức |
| RESEARCHER | Được review | Được review | Có, khi gửi review chính thức |
| STUDENT | Không được review | Không được review | Không có đóng góp dưới vai trò reviewer |

Sinh viên vẫn là tác giả, người gửi yêu cầu review và người phản hồi/sửa nghiên cứu của mình theo quyền tác giả hiện có. Đóng góp nghiên cứu khác của sinh viên không bị thay đổi bởi chính sách reviewer này.

Giữ ba reviewMode hiện có. Đây là cách đánh giá dành cho reviewer đủ quyền, không tạo một luồng review riêng dành cho sinh viên. Loại bỏ đề xuất COMMUNITY_REVIEW và COMMUNITY_FEEDBACK trong bản trước.

Đánh giá peer-review trong LumiGap không tự động trở thành quyết định chấp nhận công bố của tạp chí.

### 5.2. Quyền đề xuất

- Dùng STRUCTURED_REVIEW cho peer-review, với điều kiện bắt buộc academicRole thuộc LECTURER hoặc RESEARCHER. STUDENT luôn bị chặn, không chỉ dựa vào sự vắng mặt của capability.
- Áp dụng cùng chính sách review với INTERNAL/EXTERNAL; không yêu cầu vị trí tại đơn vị chủ quản chỉ để cấp quyền review cho người nội bộ.
- Điều kiện kỹ thuật đề xuất: tài khoản ACTIVE, role học thuật đã được xác minh và capability còn hiệu lực. Việc yêu cầu xác minh role là đề xuất triển khai, không phải yêu cầu bổ sung đã được người dùng chốt trong thông điệp này.
- Bỏ quy tắc loại EXTERNAL khỏi cơ hội review chỉ vì participantScope. Lọc danh sách theo quyền truy cập từng submission, quan hệ lời mời, chuyên môn, tải công việc và xung đột lợi ích; không mở toàn bộ bài riêng tư cho mọi reviewer.
- ADMIN, chủ cộng đồng và moderator không có quyền review chỉ vì chức vụ quản trị. ADMIN mang academicRole STUDENT cũng không được peer-review; ADMIN có academicRole LECTURER/RESEARCHER tuân theo cùng điều kiện reviewer.
- Kiểm tra quyền theo người thực hiện ở từng endpoint. STUDENT vẫn được tạo yêu cầu review, đọc phản hồi và gửi bản sửa khi là tác giả/người gửi hợp lệ; STUDENT không được chọn làm reviewer, nhận bài hoặc viết/gửi review. Quyền xem lịch sử đã hoàn tất và quyền tạo hoạt động mới cần có quy tắc riêng khi quyền bị thu hồi.
- Chủ cộng đồng và moderator không tự động có quyền kết luận chuyên môn hay sửa review của người khác.

### 5.3. Một vòng đời chung

Mời trực tiếp, mời bên ngoài và tự nhận cơ hội đều phải tạo hoặc liên kết một phiên review chung. Có thể tận dụng ReviewRequest hiện tại và thêm origin = DIRECT_INVITATION / OPEN_OPPORTUNITY / EXTERNAL_INVITATION.

Lưu rõ reviewer, request/assignment, templateVersionId và artifactRevisionId. Đường tự nhận có thể bắt đầu ở ACCEPTED, không cần giả lập một lời mời chưa tồn tại.

Review Center liệt kê toàn bộ assignment hợp lệ, gồm đang chờ nhận, đang viết, đang chờ tác giả sửa, chờ review lại và đã hoàn tất.

Nếu dữ liệu cũ thiếu người gửi/templateVersion, cần quy tắc migration được ghi lại; không tự bịa người đã gửi lời mời.

### 5.4. Phân biệt ba loại trạng thái

1. Trạng thái assignment/request: chờ nhận, đang review, chờ sửa, gửi lại, hoàn tất.
2. Đánh giá của reviewer: STRONG, MINOR_REVISION, MAJOR_REVISION, NOT_READY.
3. Tiến trình chung của submission: có bao nhiêu reviewer đã gửi, còn bao nhiêu vòng/mục sửa mở.

Một reviewer hoàn tất không được đóng toàn bộ submission khi reviewer khác còn hoạt động. Không dùng trung bình điểm để tự quyết định bài được chấp nhận. Việc đóng đợt review phải theo quy tắc đã công bố và giữ nguyên từng kết luận độc lập.

### 5.5. Sửa bài theo từng vấn đề

Mỗi yêu cầu sửa giữ id ổn định, người tạo, vòng review và revision nguồn. Tác giả chọn Đã sửa / Giải thích giữ nguyên / Cần trao đổi, kèm vị trí thay đổi và phản hồi.

Reviewer xem bảng: yêu cầu ban đầu → phản hồi tác giả → bản sửa → quyết định xác nhận/mở lại. ADDRESSED là tác giả đã phản hồi; ACCEPTED là reviewer đã xác nhận. Không biến ADDRESSED thành xác nhận tự động.

Khi mở vòng mới, giữ các review đã gửi, phản hồi và bản tài liệu cũ. Không xóa rồi tạo lại các mục đã có lịch sử phản hồi.

### 5.6. Quyền xem và danh tính

- Bản nháp chỉ reviewer được xem; tác giả chỉ thấy review SUBMITTED.
- Review theo lời mời mặc định hiển thị danh tính giữa các bên, phù hợp hành vi hiện tại. Danh tính rõ ràng không có nghĩa tài liệu công khai cho cả diễn đàn.
- Nếu bổ sung chế độ ẩn danh, phải xử lý nhất quán trên API, thông báo, file, nội dung tài liệu và hồ sơ đóng góp. Không chỉ thay tên reviewer bằng mã.
- Tài liệu/review chỉ được chia sẻ rộng hơn khi chủ thể có quyền đồng ý; ghi nhận đóng góp bảo mật không công bố tiêu đề hoặc liên kết tài liệu.

### 5.7. Ghi nhận reviewer trong bài nghiên cứu

Hiện saveReview đã upsert ResearchContribution khi reviewer gửi review chính thức, với contributionType REVIEW, contributorId, submissionId, projectId và sourceReviewAssignmentId. Bản ghi hiện có tính duy nhất theo assignment, nhưng update đang rỗng. listContributions hiện truy vấn theo contributorId để phục vụ hồ sơ người đóng góp.

Nguồn: [ghi nhận đóng góp khi submit](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review.service.ts:245), [đọc đóng góp theo reviewer](D:/capstone_26/lumi-gap/apps/backend/src/modules/reviews/review.service.ts:282).

Đích cần hoàn thiện là ghi nhận có thể xem từ chính bài nghiên cứu, đồng thời giữ liên kết về hồ sơ reviewer:

- Hiển thị mục “Người phản biện và đóng góp” trên trang bài nghiên cứu; truy vấn theo submissionId và kiểm tra quyền xem bài.
- Mỗi reviewer có một bản ghi đóng góp REVIEW tổng hợp cho một bài nghiên cứu; giữ liên kết tới các assignment, review và phiên bản đã xử lý.
- Nội dung gồm người review, vai trò học thuật tại thời điểm review, lĩnh vực góp ý, thời điểm gửi đầu tiên/cuối, các vòng và trạng thái xử lý. Phần mô tả được reviewer xác nhận hoặc tạo từ dữ liệu review có thể kiểm chứng.
- Ghi nhận từ lần gửi SUBMITTED hợp lệ đầu tiên. Nhận lời mời, lưu DRAFT, từ chối hoặc hủy trước khi gửi review không tạo đóng góp REVIEW.
- Review yêu cầu sửa vẫn là một đóng góp đã gửi; tiến trình thể hiện “đang theo dõi bản sửa”. Khi kết thúc phiên, cập nhật “đã hoàn tất”. Đánh giá NOT_READY không làm mất đóng góp review.
- Gửi lại request hoặc review thêm vòng không tạo các bản ghi đóng góp trùng. Cập nhật các vòng/thời điểm và giữ lịch sử; chống double submit bằng ràng buộc dữ liệu và transaction.
- Thu hồi quyền reviewer không xóa đóng góp lịch sử hợp lệ. Xử lý đóng góp bị xác định sai bằng trạng thái và audit, không xóa dấu vết.
- Ghi nhận vai trò “Reviewer / Phản biện”; không tự thêm reviewer vào danh sách tác giả. Nếu reviewer có thêm đóng góp khác, ghi thành vai trò riêng theo quy trình đóng góp của dự án.
- Mức hiển thị theo quyền của bài nghiên cứu; xuất sang hồ sơ công khai hoặc phần cảm ơn của tài liệu là hành động riêng theo quyền chia sẻ. Không mặc định mọi đóng góp thành PUBLIC.

### 5.8. Quản lý phiên bản nghiên cứu và so sánh trước/sau

#### A. Phân biệt phiên bản tài liệu và vòng review

| Đối tượng | Ý nghĩa | Ví dụ minh họa |
|---|---|---|
| Bài nghiên cứu | Hồ sơ ổn định trong suốt quá trình phát triển | Nghiên cứu A |
| Phiên bản tài liệu | Một bản nội dung được lưu chính thức, có id riêng | V1, V2, V3 |
| Vòng review | Một lần reviewer đánh giá một phiên bản cụ thể | Reviewer X, vòng 1, V1 |
| Phiên bản mẫu đánh giá | Tiêu chí, thang điểm, mức đạt và trọng số dùng ở lần đánh giá đó | Rubric R, phiên bản 1 |

Một phiên bản có thể được nhiều reviewer đánh giá. Số phiên bản tài liệu không được dùng thay số vòng review: reviewer X và Y có lịch sử vòng riêng; hai người có thể đánh giá các phiên bản khác nhau tại cùng thời điểm.

#### B. Lưu và quản lý lịch sử

- Lưu V1, V2, V3 theo số tăng dần trong cùng bài; không ghi đè hoặc tái sử dụng số của phiên bản đã tạo.
- Mỗi phiên bản lưu id, số phiên bản, phiên bản nguồn, người tạo, thời điểm, tóm tắt thay đổi, file/snapshot, loại nội dung và checksum.
- Phân biệt bản nháp đang soạn với phiên bản chính thức. Autosave bản nháp không tạo hàng loạt phiên bản chính thức; người dùng tạo phiên bản mới khi lưu mốc hoặc gửi bản sửa.
- Bản đã gửi review được khóa nội dung. Mọi chỉnh sửa tiếp theo tạo phiên bản mới; review, rubric và điểm đã gửi vẫn giữ nguyên.
- Cho phép xem/tải bản cũ theo quyền truy cập bài; không xóa bản đã được dùng làm bằng chứng review hoặc đóng góp bằng thao tác quản lý phiên bản thông thường.
- Khôi phục V1 bằng cách sao chép nội dung thành phiên bản mới, ví dụ V4 có nguồn V1. Giữ nguyên V1–V3; không chuyển điểm V1 thành điểm V4.
- Upload/gửi lại đồng thời phải có transaction và ràng buộc duy nhất số phiên bản. Khi xung đột, trả thông báo để người dùng tải trạng thái mới.
- Với dữ liệu cũ, chỉ liên kết điểm khi có revisionId/bằng chứng xác định. Dữ liệu chưa xác định ghi “Chưa xác định phiên bản”; không gán toàn bộ review cũ cho bản mới nhất.

#### C. Gắn điểm với đúng bản nghiên cứu

Mỗi review SUBMITTED phải xác định reviewer, assignment, roundNumber, revisionId, templateVersionId và thời điểm gửi. Lưu điểm từng tiêu chí, mức rubric đã chọn, trọng số/thang điểm của phiên bản mẫu, điểm tổng và nhận xét tại thời điểm review.

Khi tác giả tạo V2, điểm V1 không bị cập nhật. V2 hiển thị “Chưa được review” cho đến khi có kết quả gửi chính thức trên V2. Không dùng điểm 0 để biểu diễn thiếu review.

Giữ riêng:

- “Phiên bản mới nhất”: có thể chưa được review.
- “Phiên bản mới nhất đã có review”: có điểm/nhận xét hợp lệ.
- “Phiên bản đang được reviewer đánh giá”: cố định theo assignment/vòng review, không đổi theo currentRevisionId.

GUIDED_FEEDBACK và STRUCTURED_REVIEW hiện có thể chỉ có nhận xét/mức đánh giá. Chỉ hiển thị điểm số khi rubric có dữ liệu điểm; không tự biến STRONG/NOT_READY thành số. Nếu cần chấm điểm tất cả review, phải chọn RUBRIC_ASSESSMENT hoặc đặc tả thêm rubric trước khi review bắt đầu.

#### D. Giao diện “Phiên bản và tiến trình”

Đặt một tab trên trang bài nghiên cứu gồm:

1. **Danh sách phiên bản:** V1/V2/V3, thời điểm, người tạo, tóm tắt thay đổi, trạng thái review và số reviewer đã gửi.
2. **Chi tiết phiên bản:** nội dung/PDF, điểm, nhận xét, yêu cầu sửa, phản hồi tác giả và reviewer đã đóng góp riêng cho bản đó.
3. **So sánh hai phiên bản bất kỳ:** chọn bản trước và bản sau; mặc định cặp phiên bản có review gần nhất và dùng chung reviewer/rubric nếu có.
4. **Bảng điểm theo tiêu chí:** điểm cũ, điểm mới, chênh lệch và nhận xét ở cả hai bản.
5. **Đối chiếu nội dung:** diff cho Markdown/text; với PDF cung cấp hai khung xem và vị trí thay đổi. Chỉ tuyên bố có diff PDF khi công cụ thực sự hỗ trợ và đã kiểm tra.
6. **Dòng thời gian:** tạo phiên bản → reviewer gửi đánh giá → yêu cầu sửa → tác giả phản hồi → gửi bản mới → reviewer xác nhận/mở lại.
7. **Hành động của tác giả:** tạo bản mới, xem/tải bản cũ, ghi tóm tắt thay đổi, gửi lại đúng phiên bản hoặc sao chép bản cũ thành bản mới.

Ví dụ minh họa, không phải điểm thật của hệ thống; cùng reviewer và rubric thang 0–5:

| Tiêu chí | V1 | V2 sau sửa | Chênh lệch |
|---|---|---|---|
| Phương pháp | 3 | 4 | +1 |
| Bằng chứng | 2 | 4 | +2 |
| Trình bày | 3 | 4 | +1 |

Hiển thị giảm/tăng/không đổi và trường hợp chưa có điểm; không giả định mọi bản sửa đều tăng điểm. Khi so sánh các reviewer khác nhau, hiện từng đánh giá cạnh nhau và nhãn khác reviewer, không gắn toàn bộ chênh lệch với tác động của việc sửa bài.

#### E. Điều kiện so sánh điểm

- Delta trực tiếp = điểm sau − điểm trước, chỉ dùng khi cùng tiêu chí, cùng thang điểm và cùng quy tắc tổng hợp. Mặc định so sánh cùng reviewer và cùng templateVersionId.
- Với thay đổi tiêu chí/thang điểm/trọng số giữa hai mẫu, hiển thị “Khác rubric”; không tự tính delta tổng. Có thể đối chiếu nhận xét và tiêu chí trùng, nhưng cần chỉ rõ khác biệt.
- N/A hoặc tiêu chí chưa có điểm không được thay bằng 0. Điểm tổng phải theo quy tắc trọng số của mẫu được lưu tại lần review.
- Nhiều reviewer được trình bày riêng. Nếu có số tổng hợp cho một phiên bản, công bố cách tính, số reviewer, những rubric nào được đưa vào và các trường hợp bị loại. So sánh tổng hợp giữa hai bản cần cùng tập reviewer và cùng điều kiện chấm; nếu khác, chỉ hiển thị hai tổng hợp với nhãn không tương đương.
- Giữ trường overallAssessment riêng khỏi điểm tổng; không tự kết luận chấp nhận bài từ delta hoặc số trung bình.

#### F. Quan hệ với đóng góp reviewer

Hồ sơ đóng góp REVIEW tổng hợp theo bài vẫn duy nhất cho từng reviewer. Bên trong giữ các reviewId/revisionId để thể hiện reviewer đã góp ý V1, đánh giá lại V2 và xác nhận mục nào. Đọc bản cũ không tạo đóng góp mới; khôi phục nội dung không tự sao chép đóng góp sang phiên bản mới chưa được review.

## 6. Thứ tự triển khai

| Đợt | Công việc | Kết quả cần đạt |
|---|---|---|
| 1 | Policy LECTURER/RESEARCHER ở INTERNAL/EXTERNAL, chặn STUDENT, ẩn draft, kiểm tra xung đột/tải chung | Ma trận quyền đúng với hướng đã chốt; bản nháp riêng tư |
| 2 | Hợp nhất ba đường nhận bài, sửa Review Center và nút theo người xem | Mọi assignment đều tìm được và mở đúng luồng |
| 3 | Phản hồi từng mục, xác nhận/mở lại, vòng mới, PDF, lịch sử phiên bản, so sánh điểm/nội dung | Vòng review → sửa → review lại chạy hoàn chỉnh; xem được bản cũ và điểm trước/sau |
| 4 | Tổng hợp trạng thái nhiều reviewer; mục đóng góp ngay trong bài; cập nhật lịch sử review | Không đóng nhầm đợt; người review được ghi nhận đúng bài và không trùng |
| 5 | Nhắc hạn, đổi reviewer, tín hiệu chất lượng, AI có căn cứ | Tăng tỷ lệ hoàn thành và tính hữu ích |

Chưa ước lượng lịch theo tuần vì chưa xác định số người và thời lượng làm việc. Các đợt là thứ tự phụ thuộc để lập backlog.

## 7. Tiêu chí nghiệm thu bắt buộc

1. LECTURER và RESEARCHER được review ở cả INTERNAL/EXTERNAL khi đáp ứng điều kiện tài khoản; STUDENT bị chặn ở cả hai phạm vi, kể cả khi dữ liệu cũ hoặc cấp nhầm còn capability review.
2. Các lời mời hiện tại vẫn chạy đúng sau migration; STUDENT bị chặn khi được chọn làm reviewer, nhận bài hoặc viết/gửi review, nhưng vẫn tạo yêu cầu và gửi bản sửa của mình; ADMIN không có ngoại lệ review chỉ vì quyền quản trị.
3. Tác giả hoặc thành viên dự án bị chặn review chính tài liệu đó ở tất cả đường vào.
4. Reviewer đã khai báo xung đột hoặc hết khả năng nhận bài bị chặn nhất quán; hai yêu cầu đồng thời không vượt giới hạn tải.
5. Tác giả và người ngoài không lấy được DRAFT qua detail, center hoặc API khác.
6. Tự nhận cơ hội xuất hiện trong Review Center, có lịch sử và vòng sửa như lời mời trực tiếp.
7. MINOR_REVISION/MAJOR_REVISION không tạo luồng gửi lại bị kẹt khi thiếu yêu cầu sửa.
8. Reviewer đọc được phản hồi tác giả, xác nhận/mở lại từng mục, và autosave hoạt động trong vòng mới.
9. Bản cũ không bị thay đổi; review đang xử lý luôn gắn đúng revision. Không gửi lại bằng bản cũ hoặc tài liệu khác.
10. Reviewer A hoàn tất không đóng bài khi reviewer B còn review; kết luận của A và B được giữ riêng.
11. NOT_READY hiển thị rõ dù phiên review hoàn tất; không xuất hiện thông điệp ngụ ý chấp nhận nghiên cứu.
12. Rubric không chấp nhận performanceLevelId của tiêu chí khác.
13. Người gửi mở trang phản hồi; reviewer mở workspace; cả hai xem được bản PDF/Markdown đã được phép.
14. Double submit, accept đồng thời, resubmit đồng thời và thu hồi quyền không làm tạo vòng trùng hoặc ghi đè kết quả.
15. Tài liệu riêng tư không lộ qua đóng góp PUBLIC, thông báo hoặc danh sách gợi ý.
16. Review SUBMITTED tạo đóng góp REVIEW gắn đúng bài, reviewer và bằng chứng; DRAFT/nhận lời mời/từ chối không tạo đóng góp.
17. Đóng góp hiện trên trang bài cho người được phép xem và có liên kết về hồ sơ reviewer; không tự thay đổi danh sách tác giả.
18. Nhiều vòng, nhiều request của cùng reviewer trên cùng bài và double submit không tạo đóng góp trùng; lịch sử được giữ và tiến trình được cập nhật.
19. INTERNAL/EXTERNAL có cùng quyền reviewer; không sử dụng participantScope để bỏ qua kiểm tra xung đột hoặc quyền truy cập bài.
20. Khi role đổi thành STUDENT hoặc tài khoản bị đình chỉ, hoạt động review mới bị chặn; review/đóng góp đã gửi hợp lệ được bảo toàn theo quyền xem lịch sử.
21. Tạo V2/V3 không làm thay đổi nội dung, điểm, nhận xét hoặc rubric đã dùng của V1; V1 vẫn xem/tải được theo quyền của bài.
22. Điểm từng tiêu chí và điểm tổng truy về đúng review, reviewer, vòng, revisionId và templateVersionId.
23. V2 chưa được review hiển thị “Chưa được review”; không mượn điểm V1 hoặc hiển thị 0.
24. So sánh V1/V2 hoặc V1/V3 cùng reviewer/rubric cho delta đúng theo từng tiêu chí; N/A/thiếu điểm không biến thành 0.
25. Khác reviewer/rubric/thang điểm/trọng số được gắn nhãn và không trình bày chênh lệch tổng như một phép so sánh tương đương.
26. Reviewer đang review V1 không bị đổi sang V2 khi tác giả upload bản mới; gửi review vẫn gắn V1.
27. Sao chép V1 thành V4 giữ toàn bộ V1–V3 và chỉ rõ nguồn khôi phục; V4 chưa có điểm/đóng góp cho tới khi được review.
28. Review nhiều vòng hiển thị dòng thời gian, phản hồi và đóng góp của đúng phiên bản; hai reviewer chấm cùng một bản được trình bày riêng.
29. Phân quyền xem bản cũ, tải file, so sánh và khôi phục được kiểm tra ở backend; chặn xóa bản đang được tham chiếu bởi review hợp lệ.
30. Dữ liệu review cũ thiếu revisionId được đánh dấu chưa xác định, không tự gán sang bản mới nhất trong migration.

Các tiêu chí cần kiểm thử policy, API với cơ sở dữ liệu và hành trình web. Kiểm tra desktop/mobile khi thay UI. Unit test thuần về trạng thái hiện có chưa đủ chứng minh hành trình này.

## 8. Điểm sửa trong mã nguồn

| Khu vực | File chính |
|---|---|
| Kiểu và capability | packages/shared-types/src/user.ts; packages/shared-types/src/research-review.ts |
| Policy quyền | apps/backend/src/modules/identity/identity-foundation.rules.ts; apps/backend/src/modules/authorization/capability.service.ts |
| Lời mời và phiên review | apps/backend/src/modules/reviews/review-request.service.ts |
| Nhận bài và gửi review | apps/backend/src/modules/reviews/review.service.ts |
| Quy tắc vòng đời | apps/backend/src/modules/reviews/academic-review.rules.ts; review.rules.ts |
| Submission và phiên bản | apps/backend/src/modules/submissions/submission.service.ts |
| Lịch sử và so sánh phiên bản | Mở rộng API/DTO submission và review; thêm tab Phiên bản và tiến trình trên trang bài nghiên cứu, ưu tiên dùng SubmissionRevision/HumanReview hiện có |
| API và DTO | apps/backend/src/modules/reviews/review.routes.ts; apps/web/src/features/reviews/api/reviews.api.ts |
| Giao diện | apps/web/src/pages/reviews/review-dashboard.tsx; review-request-detail.tsx; review-workspace.tsx; review-opportunities.tsx |
| Migration | Schema Prisma và migration tương ứng sau khi chốt trường mới; kiểm tra dữ liệu assignment cũ trước khi chuyển đổi |

## 9. Tham khảo

OpenReview có bước sửa review sau phản hồi của tác giả, với trường kết luận cuối và lý do thay đổi. Điều này hỗ trợ hướng giữ lịch sử và lý do cập nhật, thay vì ghi đè nhận xét đã gửi: [Review Revision Stage](https://docs.openreview.net/how-to-guides/workflow/how-to-enable-the-review-revision-stage).

Định hướng LumiGap từ kế hoạch trước là diễn đàn nghiên cứu cho sinh viên, với AI hỗ trợ và con người giữ quyền phản biện. Hiện trạng kỹ thuật trong tài liệu này dựa trên mã nguồn đã đọc ở phiên khảo sát, không lấy kế hoạch cũ làm bằng chứng tính năng đã chạy.
