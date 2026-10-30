# Đo phần viết bản thảo và gợi ý Contribution

Triển khai ngày 28/10/2026. Chức năng bổ sung dữ liệu tự động cho [đánh giá đóng góp V1](project-contribution-evaluation-v1-spec.md).

## Luồng sử dụng

1. Trong bản thảo, mở menu thao tác hoặc bộ chọn bảng thông tin, chọn **Đóng góp viết**.
2. Chọn **Lưu phiên bản và tính phần viết**. Các thay đổi được đồng bộ trước khi tạo snapshot; phép tính chạy trên worker `ai-jobs` bằng BullMQ, không gọi LLM.
3. Xem phần văn bản còn lại theo từng tài khoản, mức độ xác định nguồn và phần chưa rõ người thêm. Báo cáo gắn với snapshot, không đổi khi tiếp tục sửa; giao diện báo khi đã có phiên bản mới.
4. Nếu cần dùng làm minh chứng, chọn **Tạo bản nháp đóng góp từ báo cáo**. Thao tác chỉ tạo DRAFT kèm tham chiếu snapshot, không gửi xác nhận hay cộng điểm. Gọi lại trả cùng bản nháp của tài khoản đó.
5. Kiểm tra hồ sơ và người tham gia, gửi xác nhận theo quy trình hiện tại. Khi lập đánh giá kết quả, mở **Gợi ý phần tham gia từ bản thảo**, xem mức bao phủ rồi chủ động chọn điền gợi ý. Có thể sửa tỷ lệ hoặc bỏ tham chiếu.
6. Chủ dự án xác nhận trọng số; từng người xác nhận dữ liệu đánh giá. Công việc còn phản đối/chưa đủ xác nhận không được cộng điểm.

## Công thức

Thuật toán `RETAINED_WRITING_V1` đo phần văn bản còn lại trong một phiên bản, không cộng dồn số phím gõ hay số lượt sửa.

Với mỗi từ, số ký tự chữ/số/dấu kết hợp thuộc tài khoản nào quyết định phần của tài khoản đó. Ví dụ A viết `cats`, B đổi `c` thành `b`: từ `bats` phân cho A 0,75 và B 0,25 từ quy đổi. B không nhận toàn bộ từ hoặc đoạn văn.

```text
wordCredit(i, word) = attributedCharacters(i, word) / countedCharacters(word)
retainedWords(i) = Σ wordCredit(i, word)

overallShare(i) = retainedWords(i) / totalProseWords
suggestedWritingParticipation(i) = retainedWords(i) / Σ retainedWords(known accounts)
```

Mỗi từ có 1000 đơn vị nguyên. Phân phần lẻ trong từ và quy đổi sang basis points bằng phương pháp phần dư lớn nhất, xử lý hòa theo ID tăng dần. Tổng đơn vị của người xác định được và phần chưa xác định bằng tổng từ × 1000. Tổng gợi ý trên tập xác định được bằng 10000 khi có dữ liệu; không có dữ liệu thì không tạo gợi ý.

Ví dụ 10 từ, A có 4, B có 2, chưa rõ người thêm 4: giao diện báo A 40%, B 20% trên toàn văn bản và mức bao phủ 60%. Gợi ý tham gia trong phần xác định được là A 66,67%, B 33,33%. Phần chưa rõ không được tự gán cho ai. Các tỷ lệ này chỉ áp dụng cho kết quả viết đang đánh giá.

Sau khi nhóm xác nhận, Contribution tiếp tục dùng `Σ trọng số kết quả × phần tham gia đã xác nhận`. Số từ không tự quyết định trọng số, chất lượng hoặc tỷ lệ đóng góp toàn nghiên cứu.

## Nguồn gốc và chống tính nhầm

- Backend ghi các khoảng ID/ký tự mới thực sự được tích hợp vào Yjs, gắn tài khoản đã xác thực. Gửi lại update hoặc gửi full state không nhận lại chữ cũ.
- Giữ nguồn của phần trùng trong thao tác thay thế bằng so khớp đầu/cuối và LCS token có giới hạn 200.000 ô. Chỉ chuyển nguồn của ký tự thực sự bị thay thế; chèn thêm cụm giống một cụm vẫn còn trong bài được ghi cho người chèn. Không chạy LCS bậc hai trên tài liệu lớn; phần giữa không xác định được khi vượt giới hạn được để chưa rõ nguồn.
- Đề xuất được duyệt ghi phần thêm mới cho người đề xuất; người bấm duyệt không nhận phần viết đó. Nội dung giữ nguyên trong đề xuất vẫn dẫn về nguồn cũ.
- Giữ bộ đệm nguồn của các đoạn vừa xóa, tối đa 500.000 ký tự mỗi file, để thao tác khôi phục/undo không chuyển phần viết sang người khôi phục. Mỗi đoạn trong bộ đệm chỉ được khôi phục nguồn một lần, tránh dùng lại nguồn của đoạn đã khôi phục cho các bản sao mới. Nếu lịch sử không đủ hoặc chuỗi dẫn nguồn quá sâu, để chưa rõ thay vì đoán.
- Nội dung cũ trước khi triển khai, nội dung import/tạo sẵn và template không được suy diễn tác giả từ người tải lên hoặc người tạo file. Khôi phục snapshot mới giữ nguồn gốc đã lưu; xuất bản/source bundle không kèm lịch sử riêng của nhóm.
- Chỉ theo file chính và các liên kết `\input{...}` / `\include{...}` dạng đường dẫn cố định, mỗi file một lần. Không theo liên kết nằm trong ví dụ verbatim, comment, công thức, preamble hoặc sau `\end{document}`. File nháp không được đưa vào bản thảo không cộng điểm. Chỉ đếm `.tex`/`.txt`; bỏ `.bib`, preamble, nội dung sau `\end{document}`, chú thích mã, công thức và các cấu trúc LaTeX phổ biến đã nhận diện.
- Báo cáo hoàn tất bất biến tại database. Snapshot lưu trạng thái Yjs và các khoảng nguồn riêng; khi lịch sử bình luận vượt giới hạn sao lưu toàn bộ, dùng bản lưu phần viết riêng, không cắt đầu vào tính toán.
- Cùng một bản thảo chỉ gắn vào một kết quả viết trong lớp đánh giá, kể cả qua nhiều snapshot. Muốn cập nhật phải sửa kết quả đó; không cộng nhiều snapshot tích lũy như các công việc khác nhau.
- Báo cáo giữ khoảng thời gian hệ thống ghi nhận phần viết còn lại. Kỳ đánh giá không bao quát khoảng này bị loại `SOURCE_OUTSIDE_PERIOD`; không lấy toàn bộ báo cáo tích lũy làm công sức mới trong một kỳ ngắn. Thời gian ghi nhận không chứng minh thời gian nghiên cứu thực tế.

## Quyền và giới hạn

- Endpoint dùng xác thực, quyền nghiên cứu và quyền project hiện có; kiểm tra snapshot đúng project/bản thảo. Người ngoài hoặc đã rời nhóm không đọc báo cáo riêng. Quyền review contribution giới hạn không trở thành quyền đọc toàn bộ bản thảo.
- DTO strict không nhận tài khoản/tỷ lệ tác giả do client tự gửi. Tài khoản được lấy từ phiên đăng nhập; trạng thái nguồn và nguồn gốc được lưu cùng transaction theo khóa account → project.
- Đây là thống kê tài khoản thêm nội dung, không phải xác minh tác giả trí tuệ. Văn bản dán hoặc AI chèn vào có thể được ghi nhận như thao tác của tài khoản. Không tự phát hiện đạo văn, AI hoặc chất lượng nghiên cứu.
- Bộ lọc LaTeX là ước lượng văn bản với cú pháp phổ biến, không chạy TeX. Macro tùy chỉnh, điều kiện, đường dẫn động và một số môi trường phức tạp cần nhóm xem lại. Tách từ Unicode nhất quán; tiếng Việt được đếm theo các đơn vị chữ ngăn cách, không phải mô hình ngôn ngữ học.
- Chưa phát hiện trùng ý nghĩa giữa hai bản thảo khác nhau hoặc công việc ngoài hệ thống. Không dùng chỉ số này để kết luận công bằng toàn dự án.

## Migration và chạy

Hai migration mới:

- `20261028100000_manuscript_retained_writing`: nguồn chỉnh sửa, baseline khôi phục và bảng báo cáo.
- `20261028101000_manuscript_writing_snapshot_fallback`: nguồn phần viết riêng khi không lưu được toàn bộ lịch sử cộng tác.

```powershell
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:generate
```

Backend, web và worker `ai-jobs` cần chạy mã mới. Worker khôi phục báo cáo QUEUED lúc khởi động; lỗi cuối đánh dấu FAILED, người dùng có thể thử lại cùng snapshot. Báo cáo đã hoàn tất không tính lại hay thay thế khi retry.

Khi khôi phục yêu cầu QUEUED, job cũ đã completed/failed được xóa trước khi enqueue để không bị BullMQ bỏ qua vì trùng ID. Khi một thành viên đang có quyền thử lại báo cáo FAILED, worker dùng tài khoản của người thử lại; không phụ thuộc quyền của người yêu cầu trước đã rời nhóm. Giao diện giữ báo cáo đang chọn trong lúc tạo bản nháp và xóa trạng thái thao tác cũ khi chuyển trang/báo cáo.

Đã áp migration và kiểm thử trên PostgreSQL/Redis riêng; chưa áp vào database ứng dụng hoặc rebuild Docker cổng 8080.

## Kiểm chứng

- 13 kiểm thử bộ tính: 60/40, phần chưa rõ, từ có nhiều người sửa, thay cả đoạn, replay, xóa/undo, Unicode/LaTeX, chỉnh sửa đồng thời, cụm lặp, sao chép sau khôi phục, file không dùng và giới hạn LCS.
- 6 kiểm thử service về retry: thay job đã completed/failed, giữ job active/waiting/delayed và cập nhật người yêu cầu hợp lệ khi thử lại.
- 6 kiểm thử persistence PostgreSQL: quyền truy cập, retry, bất biến, snapshot/restore, người đề xuất, khôi phục chữ của người khác, lịch sử hơn 200 bình luận, tạo nháp, tham chiếu đánh giá, kỳ ngoài thời gian ghi nhận và chống đếm lại bản thảo.
- Bộ hồi quy đánh giá đóng góp: 12 bài persistence đạt.
- Frontend: 6 bài mới, 7 bài đánh giá, 40 bài workspace bản thảo, 12 bài locale/static text đạt (65 bài).
- Trình duyệt Chromium với API/PostgreSQL/Redis/BullMQ worker thật: lưu snapshot, tính, hiển thị hai người, tạo đúng một DRAFT; desktop và mobile 390px không lỗi JavaScript hoặc tràn trang.
- Ảnh: [desktop](audits/2026-10-28-manuscript-writing/desktop.png), [mobile](audits/2026-10-28-manuscript-writing/mobile.png).

Lượt rà soát bổ sung: 31 kiểm thử backend thuần (bộ tính phần viết, retry và bộ tính/quy tắc đánh giá) cùng 14 kiểm thử giao diện phần viết/đánh giá đều qua. Các kiểm thử retry dùng queue/database mock, không thay thế kiểm thử persistence. Typecheck backend/web và lint các file liên quan đều qua. Kịch bản trình duyệt đã đạt các assertion và tạo ảnh ở lượt trước; các lượt chạy lại sau đó bị gián đoạn do PostgreSQL/Redis test bị dừng. Automatic approval review chặn lệnh khởi động lại hạ tầng kèm chạy test (`blocked by policy`), nên chưa xác nhận được một lượt chạy lại hoàn tất sạch sau cùng; chưa chạy lại persistence/browser cho các bản sửa trong lượt rà soát bổ sung.

Chạy persistence bằng database có tên kết thúc `_test`, `MANUSCRIPT_WRITING_INTEGRATION=1`, `NODE_ENV=test`, Redis test riêng và email tắt. Không bật worker chung khi chạy các kịch bản service. Browser test bật `MANUSCRIPT_WRITING_BROWSER=1`, dùng Redis test DB1 cổng 16390 và Vite cổng 13100 proxy tới API test cổng 14040.
