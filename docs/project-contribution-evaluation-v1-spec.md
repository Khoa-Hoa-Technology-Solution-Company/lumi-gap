# Đặc tả đề xuất: gợi ý tỷ lệ đóng góp V1

Ngày: 28/10/2026. Trạng thái: **đã triển khai và kiểm thử trên môi trường cô lập**. Xem [báo cáo triển khai](project-contribution-evaluation-v1-implementation.md) để biết phạm vi kiểm chứng và cách chạy migration.

Cơ sở: `project-contributions-implementation.md`, `project-contributions-audit.md`, các service `allocation`, `work-contributions` và shared types hiện tại. Các quyết định dưới đây mô tả V1 đã triển khai.

## 1. Mục tiêu và quy tắc tính điểm

Bổ sung lớp đánh giá có giải thích giữa hồ sơ công việc và phân bổ đồng thuận. Backend hiện tại là Express + TypeScript + Prisma/PostgreSQL.

- Đầu vào là kết quả công việc có trọng số và phần tham gia đã được các bên xác nhận.
- Hoạt động, số lần sửa, số tin nhắn và vai trò CRediT chỉ hỗ trợ giải thích; không tự sinh điểm.
- Kết quả chỉ là tỷ lệ gợi ý trong một phạm vi và khoảng thời gian xác định. Việc chốt phân bổ tiếp tục dùng quy trình đồng thuận hiện tại.

Với thành viên `i` và kết quả công việc đủ điều kiện `j`:

```text
S_i = Σ W_j × P_ij
suggestedPercentage_i = 100 × S_i / Σ S_k
```

`W_j` là trọng số nguyên dương; `P_ij` là phần tham gia trong [0, 1]. V1 không có hệ số chất lượng Q hoặc trọng số giai đoạn.

Để tính chính xác, lưu phần tham gia bằng số nguyên `participationBasisPoints`:

```text
rawScore_i = Σ weight_j × participationBasisPoints_ij
totalRawScore = Σ rawScore_i
exactSuggestedBasisPoints_i = 10000 × rawScore_i / totalRawScore
```

Dùng số nguyên chính xác trong bộ tính (ví dụ BigInt); snapshot JSON lưu các số nguyên lớn dưới dạng chuỗi thập phân. Không dùng số thực để phân bổ phần dư.

Làm tròn bằng phương pháp phần dư lớn nhất:

1. Lấy phần nguyên của từng `10000 × rawScore_i / totalRawScore`.
2. Phân phối số basis points còn thiếu theo phần dư giảm dần, mỗi người tối đa một điểm.
3. Khi bằng phần dư, sắp UUID chuẩn hóa tăng dần để kết quả không phụ thuộc thứ tự đầu vào.
4. Thành viên điểm 0 giữ 0; tổng kết quả khi có dữ liệu luôn bằng 10000.

Ví dụ: một công việc trọng số 10, A/B tham gia 60%/40% tạo điểm 6/4 và tỷ lệ 6000/4000 basis points. Ba người điểm bằng nhau nhận 3334/3333/3333 theo quy tắc xử lý hòa.

## 2. Dữ liệu hợp lệ và chống tính trùng

Một đơn vị tính điểm là **kết quả công việc**, có `outcomeId` duy nhất trong project. Hồ sơ contribution và các task, artifact, phiên bản bản thảo được liên kết làm minh chứng.

- Trong một lần tính, một `outcomeId` chỉ có một phiên bản đánh giá được chọn. Nhiều hồ sơ mô tả cùng kết quả phải được gộp hoặc giải quyết trước khi đủ điều kiện.
- Sửa bản thảo, hoàn thành task và duyệt cùng kết quả không tạo ba đơn vị điểm.
- Định danh và liên kết không tự phát hiện được mọi khai báo trùng ngữ nghĩa; cần cho thành viên báo trùng và giải quyết có lịch sử.
- Một kết quả có danh sách người tham gia duy nhất, mỗi người 0–10000 basis points, tổng đúng 10000. Người được ghi 0 vẫn cần xác nhận.
- Trọng số, tỷ lệ, minh chứng, project và phiên bản phải hợp lệ. Người tham gia phải có căn cứ thành viên theo lịch sử project; không tự thêm mentor hoặc reviewer vào danh sách.
- Minh chứng phải có mô tả cụ thể và được các bên xác nhận là đủ. Công việc ngoài hệ thống có thể dùng mô tả/minh chứng thủ công; không bắt buộc tạo hoạt động giả hoặc tải tài liệu mật lên.
- Không đồng nhất trạng thái hồ sơ `ACCEPTED` với việc đã xác nhận trọng số hoặc tỷ lệ. Cần xác nhận riêng cho dữ liệu đánh giá.
- Hồ sơ `NEEDS_CHANGES`, đang tranh chấp hoặc sửa thành bản nháp chưa được xác nhận lại chưa đủ điều kiện tính.
- Hồ sơ `SELF_RECORDED` chỉ đủ điều kiện khi mọi người được ghi tên xác nhận rõ dữ liệu đánh giá. Gắn nhãn `TEAM_CONFIRMED`; trường hợp một người là `SOLO_SELF_CONFIRMED`. Giữ thông tin có/không có người kiểm tra độc lập, không suy ra chất lượng khoa học.

Phạm vi tính dùng period và danh sách đủ điều kiện từ chính sách thành viên hiện tại; có thể cho người điểm 0 xuất hiện trong bảng. V1 không cộng các period chồng lấn để tạo tỷ lệ toàn dự án.

Nếu các hồ sơ của một kết quả trải ra ngoài kỳ đang chọn, kết quả đó được loại với lý do `SOURCE_OUTSIDE_PERIOD`. Cần chọn/tạo kỳ bao quát toàn bộ kết quả; không cộng toàn bộ phần việc ngoài kỳ chỉ vì có một hồ sơ nằm trong kỳ.

## 3. Trọng số, quyền xác nhận và phản đối

### Trọng số và phiên bản quy tắc

- Chủ dự án tạo và công bố phiên bản quy tắc; thành viên được xem toàn bộ nội dung áp dụng.
- Mặc định đề xuất: mỗi kết quả trọng số 1; cho phép số nguyên 1–100 với lý do. Đây là giới hạn sản phẩm V1, chưa phải thang đo được kiểm chứng về độ công bằng.
- Trọng số của một công việc do chủ dự án hoặc người tham gia đề xuất trong giới hạn quy tắc; chủ dự án xác nhận trọng số bằng quyết định riêng. Các bên có thể phản hồi cùng phiên bản ngay sau khi đề xuất được gửi; chỉ đủ điều kiện tính khi có cả xác nhận trọng số và mọi xác nhận tham gia.
- Mọi người được ghi tên, kể cả người lập hồ sơ và chủ dự án nếu tham gia, phải xác nhận cùng payload: quy tắc, trọng số, tỷ lệ, phiên bản công việc và minh chứng. Tạo/gửi hồ sơ không tự tính là đồng ý.
- Công việc phát sinh có thể được xác định trọng số sau khi hoàn thành; ghi lý do, thời điểm và cờ `retrospectiveWeight`, rồi áp dụng cùng cơ chế xác nhận.
- Quy tắc đã công bố là bất biến. Thay đổi tạo `ruleVersion` mới; tính theo quy tắc mới cần xác nhận lại, không tự mang quyết định cũ sang.

### Xác nhận và tranh chấp

- Lấy danh tính từ phiên đăng nhập; người dùng chỉ xác nhận hoặc phản đối bằng tài khoản của mình.
- Quyết định gắn với hash payload và phiên bản cụ thể. Sửa tỷ lệ, trọng số, người tham gia, minh chứng hoặc phiên bản nguồn tạo đề xuất mới, giữ quyết định cũ trong lịch sử.
- Một phản đối hợp lệ có lý do đưa đề xuất sang `DISPUTED` và loại khỏi tập tính hiện tại.
- Phản đối được giữ qua các phiên bản sửa cho đến khi chính người phản đối xác nhận giải quyết trên một phiên bản mới hơn, bằng quyết định `RESOLUTION` và lý do tối thiểu 10 ký tự. Xác nhận trọng số/tham gia thông thường không giải quyết phản đối; chủ dự án không thể giải quyết thay. Mọi người phản đối phải xác nhận riêng. Phản đối mới trên cùng phiên bản vẫn chặn tính, kể cả đã có quyết định giải quyết trên phiên bản đó.
- Người trong phạm vi đánh giá có thể báo thiếu người, thiếu công việc hoặc trùng kết quả. Khiếu nại chưa giải quyết được hiển thị và làm kết quả tạm tính; không sửa snapshot cũ.
- Người rời nhóm được xác nhận/phản đối hồ sơ có ghi tên mình qua quyền truy cập giới hạn. Không vì vậy cấp quyền đọc toàn bộ project hoặc tài liệu riêng.
- Người từng phản đối được giữ quyền xem tóm tắt và giải quyết phản đối của mình sau khi rời nhóm, kể cả không phải người tham gia kết quả. Nguồn hoặc quy tắc thay đổi phải có đề xuất mới trước khi xác nhận hay giải quyết; vẫn có thể gửi phản đối trên phiên bản hiện hành.
- Im lặng hoặc tài khoản không khả dụng giữ trạng thái chờ. Chủ dự án, admin và mentor không được xác nhận thay. Project vẫn tiếp tục làm việc khi đánh giá chưa thống nhất.

## 4. Dữ liệu thiếu và các trường hợp đặc biệt

Mỗi kết quả đã đăng ký trong phạm vi thuộc đúng một nhóm, theo thứ tự kiểm tra:

| Nhóm | Điều kiện | Dùng tính điểm |
| --- | --- | --- |
| `DISPUTED` | Có phản đối chưa giải quyết về kết quả/dữ liệu đánh giá | Không |
| `EXCLUDED` | Trùng chưa giải quyết, nguồn cần sửa, dữ liệu không hợp lệ hoặc minh chứng thiếu | Không |
| `PENDING` | Dữ liệu hợp lệ nhưng chưa đủ xác nhận | Không |
| `ELIGIBLE` | Đủ điều kiện và đủ xác nhận cùng phiên bản | Có |

- Thống kê trên toàn bộ kết quả đã đăng ký trong phạm vi, gồm cả kết quả đang sửa; không chỉ đếm trang đang mở. Công việc chưa từng được đăng ký không thể được hệ thống tự biết hoặc tính vào mẫu số.
- Ví dụ 12 đủ điều kiện, 5 chờ, 3 tranh chấp: hiển thị **“Tạm tính — 12/20 kết quả đã đủ xác nhận; 5 chờ, 3 tranh chấp”**. Nếu có hồ sơ loại trừ, hiển thị thêm số lượng và lý do.
- Ghi rõ độ bao phủ theo số kết quả, không diễn giải 12/20 là đã đánh giá 60% tổng công sức. Trọng số các việc có thể khác nhau.
- Nếu tổng điểm bằng 0: trạng thái `INSUFFICIENT_DATA`, tỷ lệ là `null`; không chia đều hoặc hiển thị mọi người 0%.
- Có dữ liệu hợp lệ thì hiển thị `PROVISIONAL` và lý do chưa đầy đủ. Ngay cả khi mọi kết quả đã xác nhận, tỷ lệ vẫn mang nhãn gợi ý và không thành phân bổ đã đồng thuận.
- Nhóm một người có thể nhận gợi ý 100% sau xác nhận rõ; hiển thị tự xác nhận, không có kiểm tra độc lập.
- Thay đổi dữ liệu sau lần tính tạo cảnh báo kết quả đã cũ. Tính lại tạo snapshot mới; không viết lại quá khứ hoặc tự thay tỷ lệ trong bản phân bổ.
- Không dùng giới hạn 500 của `evidenceSummary` làm đầu vào. Đọc hết dữ liệu bằng phân trang ổn định; không xuất bản kết quả tính từ dữ liệu bị cắt. Lỗi tải dữ liệu không được hiểu là không có đóng góp.

## 5. Snapshot, tích hợp và kiểm thử

### Snapshot bất biến

Mỗi lần tính lưu tối thiểu:

- `id`, `projectId`, `periodId`, phạm vi/ngày, roster tại thời điểm tính, `calculatedAt`, `calculatedBy`.
- `algorithmVersion`, toàn bộ nội dung quy tắc và `ruleVersion`, quy tắc làm tròn/xử lý hòa, `inputHash`.
- `outcomeId`, contribution ID/phiên bản và evaluation ID/phiên bản; trọng số, lý do, cờ xác định sau khi làm xong; tỷ lệ tham gia.
- Minh chứng đã dùng đủ để giải thích và xác nhận gắn đúng payload, người xác nhận, quyết định, thời điểm và chế độ xác nhận.
- Toàn bộ đầu vào đủ điều kiện để tái tính; các kết quả chưa dùng kèm phiên bản, trạng thái và lý do; thống kê độ bao phủ và khiếu nại.
- Điểm nguyên chính xác từng người, tổng điểm, basis points sau làm tròn và trạng thái/giới hạn của kết quả.

Hash dùng kiểm tra tính nhất quán của đầu vào; quyền ghi và ràng buộc bất biến phải do backend/database bảo vệ. Hash không thay thế kiểm soát truy cập. Việc lưu giữ/xóa dữ liệu cá nhân vẫn tuân theo chính sách ứng dụng.

Đọc dữ liệu và lưu snapshot với ảnh chụp dữ liệu nhất quán trong transaction, theo cơ chế khóa account/project hiện tại. Thay đổi nguồn đồng thời không được tạo snapshot trộn nhiều phiên bản. Khối lượng lớn chạy qua BullMQ; lỗi công việc không xuất bản snapshot một phần.

Snapshot chứa minh chứng riêng chỉ cho người có quyền xem tương ứng. Lịch sử phân bổ dành cho người đã rời nhóm chỉ chia sẻ bản tóm tắt được phép; snapshot không trở thành đường vòng đọc tài liệu riêng.

### Tích hợp theo ba bước

1. Bộ tính thuần, kiểm thử, dữ liệu xác nhận và snapshot; chưa ghi vào allocation.
2. UI đặt tỷ lệ gợi ý cạnh tỷ lệ đề xuất của chủ dự án; hiển thị công thức, nguồn điểm, dữ liệu chưa tính và cảnh báo đã cũ. Không tự điền hoặc ghi đè tỷ lệ.
3. Khi chủ dự án gửi bản phân bổ có tham chiếu snapshot, lưu snapshot ID, độ chênh từng người và lý do điều chỉnh; dùng nguyên cơ chế đồng thuận hiện tại. Thu thập phản hồi tự nguyện để đánh giá mô hình.

### Kiểm thử bắt buộc khi triển khai

- Tính ví dụ 60/40; nhiều đầu việc; phần tham gia 0; tổng điểm 0; trọng số/ID/tỷ lệ không hợp lệ; đầy đủ roster.
- Bảo toàn tổng 10000, không có phần âm; xử lý hòa ổn định khi đảo thứ tự dữ liệu; tính bằng số nguyên với tập dữ liệu lớn.
- Nguồn hiện tại hoặc tỷ lệ thay đổi không làm biến đổi snapshot cũ; tái hiện cùng đầu vào/quy tắc cho cùng điểm và tỷ lệ.
- Một kết quả nhiều hồ sơ/phiên bản không được cộng lặp; cùng ID nội dung retry không tạo xác nhận hoặc điểm trùng.
- Retry đề xuất trả đủ quyết định và phản đối hiện tại, khóa thao tác trên bản đã bị thay thế; retry lần tính đã hoàn tất trả đúng snapshot cũ kể cả quy tắc đã đổi. Cùng khóa nhưng khác nội dung vẫn bị từ chối.
- Sửa phiên bản không xóa phản đối; xác nhận tham gia không giải quyết thay; từng người phản đối tự giải quyết trên bản mới, bao gồm người đã rời nhóm. Snapshot trước đó giữ nguyên.
- Chưa đủ xác nhận, phản đối, thiếu minh chứng, sửa hồ sơ hoặc đổi quy tắc phải bị loại/chờ và báo đúng nguyên nhân.
- Kiểm thử phân quyền thật, người rời nhóm, tài khoản không khả dụng, danh tính giả, request chéo project và cạnh tranh ghi dữ liệu.
- Kiểm thử hơn 500 hồ sơ, ranh giới phân trang và thay đổi đồng thời; lỗi giữa chừng không lưu kết quả thiếu.
- UI hiển thị đúng 12/20, trường hợp không có dữ liệu, tự xác nhận, snapshot cũ, tỷ lệ gợi ý và tỷ lệ đồng thuận; có bản dịch và khả năng truy cập bàn phím.

Đánh giá thực nghiệm sau triển khai: độ chênh basis points so với phân bổ đồng thuận; phản hồi về minh bạch/hợp lý; thời gian đạt đồng thuận; tỷ lệ tái hiện snapshot thành công. Ghi nhận đánh giá độc lập trước khi nhóm xem gợi ý nếu cần đo ảnh hưởng của gợi ý. Tương đồng với thỏa thuận không tự chứng minh tính công bằng.
