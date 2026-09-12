# Dung lượng, gói lưu trữ và giới hạn tác vụ

## Chính sách mặc định

| Cấu hình | Mặc định | Nơi thay đổi |
| --- | --- | --- |
| Dung lượng miễn phí mỗi tài khoản | 50 MB | Dung lượng & Drive |
| Kích thước tối đa mỗi PDF | 50 MB | Cùng màn hình, tối đa cho phép cấu hình 200 MB |
| Gói bổ sung | 100 MB, hiệu lực 30 ngày | Giá và bật/tắt bán gói do admin cấu hình |
| Giá một gói | 10 credit | Giá mặc định của ứng dụng, admin nên đặt theo chính sách dịch vụ |
| Nơi lưu file mới | Local server | Admin có thể chuyển sang Google Drive hệ thống |

Trong ứng dụng, **1 MB = 1.048.576 byte**. Hạn mức tài khoản và kích thước mỗi file là hai giới hạn độc lập: mua thêm dung lượng không tự nâng kích thước tối đa của một PDF.

Dung lượng đã dùng = tổng kích thước PDF + các file artifact review đã đăng ký, kể cả file local, Drive và thao tác xóa chưa hoàn tất. Bản local tạm giữ trong lúc chuyển lên Drive không bị tính hai lần. Reservation của upload đang chạy làm giảm dung lượng còn trống, ngăn hai upload cùng dùng một khoảng dung lượng.

Quota không tính byte vật lý của SQLite, template dùng chung, log, backup hoặc bản tải xuống tạm thời. Báo cáo/check trong database được xóa cùng bài, nhưng kích thước file SQLite có thể không giảm ngay: các trang được tái sử dụng. Không chạy VACUUM sau mỗi lần xóa. Admin cần quản lý dung lượng đĩa, backup và dung lượng Drive của hệ thống riêng với quota người dùng.

Một review đã được chấp nhận có thể sinh artifact làm tài khoản vượt hạn mức. Hệ thống giữ kết quả đã tạo; lần upload/review/check mới sẽ bị chặn nếu tài khoản đang vượt quota. Không bỏ kết quả hay tự xóa bài để ép quota sau khi AI chạy.

## Người dùng thao tác

1. Mở **Dung lượng** trong menu tài khoản để xem tổng đã dùng, dung lượng miễn phí, gói còn hạn, PDF và kết quả.
2. Danh sách bài sắp xếp theo dung lượng giảm dần. Chọn một hoặc nhiều bài rồi bấm **Xóa bài đã chọn**, hoặc xóa từng bài. Có xác nhận xóa vĩnh viễn.
3. Khi upload vượt quota, hộp thoại hỏi có muốn chọn bài cũ để xóa; cũng có nút mua thêm. File đang chọn không bị tự động upload lại sau khi dọn dẹp: mở Upload và gửi lại.
4. Trong **Mở rộng lưu trữ**, chọn số gói 100 MB, kiểm tra tổng credit rồi xác nhận. Credit được trừ từ ví hiện có; dùng **Nạp thêm credit** nếu thiếu.
5. **Gói dung lượng của bạn** hiển thị tổng dung lượng mua thêm, một ngày gia hạn chung và phí gia hạn toàn bộ. Bấm **Xem phí gia hạn toàn bộ** để xác nhận thanh toán. Phía dưới là lịch sử mua/gia hạn, không phải các gói gia hạn riêng lẻ.
6. Nếu hệ thống bật Drive, bài local có nút **Chuyển lên Drive**. Chuyển lỗi giữ bản local; bấm **Thử chuyển lại**. Trang tự cập nhật khi đang chuyển.

## Thời hạn và thanh toán nhiều lần

Mỗi tài khoản có **một số dư dung lượng mua thêm và một ngày gia hạn chung**:

- Một “tháng” của gói được định nghĩa rõ là **30 × 24 giờ**, không phụ thuộc số ngày của tháng lịch.
- Lần mua đầu có hiệu lực ngay và hết hạn sau 30 ngày. Lưu Unix timestamp UTC; giao diện hiển thị múi giờ thiết bị.
- Mỗi lần thêm từ 1 đến 100 đơn vị 100 MB, tổng tối đa 10.000 đơn vị/tài khoản.
- Mua thêm khi còn hạn: cộng số MB, **thu đủ đơn giá 30 ngày của phần thêm, giữ nguyên ngày hết hạn chung**. Không chia phí theo ngày còn lại; phần thêm có thể được sử dụng ít hơn 30 ngày trong kỳ đầu. Màn hình xác nhận ghi rõ số credit và ngày hết hạn.
- Gia hạn: thanh toán **tổng số đơn vị đang đăng ký × đơn giá hiện tại**. Còn hạn thì cộng 30 ngày vào ngày hết hạn; đã hết hạn thì tính 30 ngày từ lúc thanh toán. Chỉ cho trả trước tối đa 60 ngày tính từ hiện tại.
- Mua thêm khi đã hết hạn: thanh toán gia hạn cả dung lượng cũ và phần mới, bắt đầu kỳ chung 30 ngày từ lúc mua. Báo giá hiển thị toàn bộ phí trước khi xác nhận.
- Không tự trừ credit gia hạn. Admin đổi giá áp dụng cho giao dịch tiếp theo, kể cả gia hạn; lịch sử đã thanh toán không thay đổi. Tắt bán tạm chặn cả mua thêm/gia hạn, cần cân nhắc lịch hết hạn của user.
- Client lấy báo giá có hiệu lực tối đa 10 phút, gửi `quote_id` và UUID `request_id` để thanh toán. Retry cùng UUID/cùng báo giá trả giao dịch cũ; báo giá cũ, giá đổi hoặc gói đã thay đổi trả `409`, cần lấy báo giá mới. Hai xác nhận đồng thời trên cùng trạng thái gói chỉ một lần được trừ credit.
- Kiểm tra credit, trừ credit, cập nhật gói chung, tạo lịch sử mua và ghi ledger trong cùng transaction SQLite `BEGIN IMMEDIATE`.

Ví dụ đơn giá 10 credit/100 MB: mua 100 MB ngày 01/09/2026 lúc 10:00 trả 10 credit, hết hạn 01/10 lúc 10:00. Ngày 11/09 mua thêm 200 MB trả đủ 20 credit; tổng 300 MB mua thêm vẫn hết hạn 01/10. Gia hạn toàn bộ trả 30 credit, không tách 3 gói. Quota khi còn hạn là 350 MB gồm 50 MB miễn phí; nếu chưa gia hạn vào 01/10 thì còn 50 MB. Các mốc ví dụ cùng múi giờ, không đổi DST.

Hết hạn được kiểm tra trực tiếp khi truy vấn, không phụ thuộc worker có đang chạy hay không. **Gói hết hạn + đang dùng vượt dung lượng miễn phí → khóa xem toàn bộ thư viện**, gồm nội dung PDF, review, kết quả format và dashboard. API nội dung trả `423 storage_expired`. Trang Dung lượng vẫn hiển thị metadata cần chọn bài xóa, dung lượng, vị trí file, giá gia hạn và danh sách dự kiến tự xóa. Gia hạn hoặc xóa về trong mức miễn phí sẽ mở lại ngay. Nội dung đã tải xuống trước khi khóa không thể thu hồi từ thiết bị người dùng.

Vượt quota luôn chặn upload/review/check mới cho đến khi giải phóng hoặc mua thêm; job đã nhận tiếp tục hoàn tất. Nếu không có gói hết hạn, admin hạ mức miễn phí chỉ chặn tác vụ mới, không tự kích hoạt khóa xem/xóa.

## Hết hạn, tự dọn sau 7 ngày và email

`StorageMaintenance` kiểm tra mỗi 60 giây trong một thread của app, không cần cron/Jenkins riêng:

1. Gửi email nhắc từ 3 ngày trước hạn, khi hết hạn, trước hạn dọn tối đa 1 ngày và xác nhận sau khi dọn xong. Email ghi tổng MB mua thêm, phí gia hạn toàn bộ, số dư và credit còn thiếu, ngày hạn và link vào trang Dung lượng.
2. Chỉ tự dọn khi gói vẫn hết hạn, tài khoản vẫn vượt mức miễn phí và đã gửi thành công email nhắc/hết hạn. Hạn dọn là **mốc muộn hơn giữa ngày hết hạn + 7 ngày và email cảnh báo đầu tiên được SMTP chấp nhận + 7 ngày**. Nếu SMTP lỗi/chưa bật, chưa tự xóa; gửi muộn vẫn dành đủ 7 ngày cho user.
3. Xóa bài theo thời điểm upload cũ nhất (`uploaded_at`, rồi `id`), tính cả PDF + artifact. Kiểm tra lại dung lượng sau mỗi bài, dừng ngay khi về trong mức miễn phí. Không xóa bài mới hơn để bỏ qua bài cũ đang chạy job/chuyển file hoặc đang lỗi xóa.
4. Xóa cứng dùng chung quy trình local/Drive/DB bên dưới. Gia hạn đã thành công ngăn cleanup bắt đầu. Khi đang dọn hoặc còn bài bị xóa dở do hết hạn, thanh toán gia hạn bị chặn `409` trước khi trừ credit; phải hoàn tất xóa dở trước. Xóa thủ công và tự dọn cũng không chạy xen nhau trên cùng tài khoản.
5. Trạng thái email và tiến độ xóa lưu SQLite, tiếp tục khi app khởi động lại. SMTP lỗi thử lại sau 1 phút, tăng dần tối đa 1 giờ; lỗi xóa hết hạn thử lại ở chu kỳ sau. Các thông báo chưa gửi của kỳ cũ bị hủy khi gia hạn.

### Cấu hình SMTP

Đặt trong `.env` hoặc **Email thông báo**:

```dotenv
STORAGE_MAINTENANCE_ENABLED=true
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=research@example.com
SMTP_PASSWORD=replace-with-smtp-password
SMTP_FROM=research@example.com
SMTP_SECURITY=starttls
```

Thay host/tài khoản/mật khẩu bằng thông tin SMTP của đơn vị. `starttls` dùng nâng cấp TLS, thường cổng 587; `ssl` dùng TLS ngay khi kết nối, thường cổng 465; `none` dành cho relay nội bộ tin cậy. Kết nối TLS kiểm tra chứng chỉ. Dùng tài khoản có quyền gửi từ `SMTP_FROM`; cấu hình xác thực domain theo nhà cung cấp để thư đến đúng hộp thư. Xem [Python: SMTP, STARTTLS và SMTP_SSL](https://docs.python.org/3/library/smtplib.html).

Cấu hình đã lưu qua admin ưu tiên hơn ENV, áp dụng ngay. Mật khẩu lưu trong DB được mã hóa bằng Fernet, API chỉ trả cờ đã cấu hình; để trống trên form giữ mật khẩu cũ, chọn xóa mật khẩu để gỡ. Bấm **Lưu cấu hình email**, rồi **Gửi email thử tới tài khoản admin này**. Không có ô gửi tùy ý tới người khác. Màn hình admin có lần chạy gần nhất, số email chờ/đã gửi và số lỗi cần kiểm tra.

“Đã gửi” nghĩa là SMTP đã chấp nhận email, không bảo đảm đã vào inbox; theo dõi delivery/bounce và spam ở nhà cung cấp. Outbox và Message-ID ổn định hạn chế gửi lặp; nếu process chết sau SMTP chấp nhận nhưng trước khi ghi DB, retry vẫn có thể tạo email trùng. Không có bảo đảm exactly-once từ SMTP.

`STORAGE_MAINTENANCE_ENABLED=false` tắt thread gửi/dọn, dùng khi phục hồi backup hoặc kiểm thử. Khóa nội dung và quota vẫn áp dụng. Khi bật lại, worker kiểm tra ngày hạn và các thông báo đã gửi trong DB; không xóa cờ thông báo để thay thế quy trình backup.

## Xóa vĩnh viễn và khôi phục khi gặp lỗi

`DELETE /api/papers/{id}` chỉ dành cho chủ bài; admin không có quyền ngầm xóa bài của tài khoản khác.

1. Khóa thao tác trên bài và kiểm tra trong transaction: không có review/check đang queued/running, không đang chuyển file.
2. Ghi `papers.deletion_pending=1`; từ đây không nhận job mới hoặc tải PDF cho bài này.
3. Đăng ký các artifact cũ, kiểm tra đường dẫn thuộc thư mục quản lý và từ chối symlink.
4. Xóa từng file Drive vĩnh viễn (không đưa vào thùng rác) và file local; ghi tiến độ `stored_files.deleted`. File đã mất được xử lý idempotent.
5. Xóa thư mục output của review khi rỗng, rồi xóa `papers`. Foreign key cascade xóa `reviews`, `format_checks`, `stored_files`.

DB và filesystem/Drive không có transaction chung. Nếu một bước lỗi, trả `503`, giữ bản ghi cùng dung lượng đã tính và hiện **Thử xóa lại**. Retry tiếp tục theo manifest; không giải phóng quota trước khi hoàn tất. Xóa thủ công lỗi cần user thử lại; xóa do hết hạn được worker thử lại mỗi chu kỳ. Lịch sử thanh toán/ledger, nhật ký dọn và bộ đếm chống spam vẫn giữ lại, không chứa nội dung báo cáo đã xóa.

Đường dẫn được phép xóa/chuyển: PDF dưới `data/uploads/`, artifact dưới `outputs/`. Bài import cũ tham chiếu PDF còn tồn tại ngoài thư mục upload vẫn đọc được, nhưng thao tác xóa/chuyển sẽ bị chặn để tránh xóa file ngoài vùng quản lý. Khi bảo trì, admin cần sao chép PDF vào thư mục upload và cập nhật cả `papers.file_path` lẫn `stored_files.local_path` trước khi thao tác. Không tự chuyển/xóa manuscript gốc trong Git.

Một tải PDF đã bắt đầu có thể hoàn tất bằng bản snapshot tạm dù người dùng xóa bài sau đó; bản tạm được dọn khi response kết thúc. Backup bên ngoài hệ thống không bị thay đổi bởi thao tác này.

## Kết nối Google Drive hệ thống

Đây là danh tính lưu trữ do đơn vị vận hành cung cấp, độc lập với Google Login của người dùng. Không dùng Google ID token đăng nhập để truy cập Drive.

### Cách A: service account và Shared Drive

1. Bật **Google Drive API** trong Google Cloud project, tạo service account riêng cho lưu trữ.
2. Tạo Shared Drive/thư mục hệ thống và cấp service account quyền thêm, đọc và xóa vĩnh viễn file. Dùng vai trò phù hợp có `canAddChildren` và `canDeleteChildren`, ví dụ Manager cho Shared Drive dành riêng ứng dụng.
3. Tải credentials JSON của service account, đặt ngoài repository, ví dụ `/secure/liem-research/drive-credentials.json`. Chỉ tài khoản vận hành và process ứng dụng được đọc.

Service account không có quota cá nhân và không thể sở hữu file My Drive. Dùng Shared Drive cho phương án này; file thuộc tổ chức. Xem [Google: shared drives](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

### Cách B: My Drive của tài khoản hệ thống

Nếu đơn vị không có Shared Drive, dùng tài khoản Google riêng của hệ thống và credentials OAuth `authorized_user` có refresh token. Không dùng API key thuần hoặc JSON OAuth client secret chưa được cấp quyền.

Có thể tạo credentials bằng Google Cloud CLI trên máy vận hành: tạo OAuth client riêng, tải file client, rồi đăng nhập đúng tài khoản lưu trữ với scope Drive. Lệnh dưới thay thông tin ADC đang lưu trên máy vận hành; dùng môi trường cấu hình CLI riêng nếu máy có workload khác.

```bash
gcloud auth application-default login \
  --client-id-file=/secure/liem-research/oauth-client.json \
  --scopes=https://www.googleapis.com/auth/drive
```

Sao chép file ADC `application_default_credentials.json` được tạo vào vị trí bảo mật của dịch vụ và cấu hình đường dẫn bên dưới. Đảm bảo vòng đời consent/refresh token phù hợp khi triển khai dài hạn; token bị thu hồi cần cấp lại. Hướng dẫn CLI và scope ngoài Cloud: [Google Cloud: application-default login](https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/login).

### Khai báo ENV và bật trên web

Chạy Python trực tiếp:

```dotenv
SYSTEM_DRIVE_CREDENTIALS_FILE=/secure/liem-research/drive-credentials.json
```

Với Docker, thêm vào `.env`:

```dotenv
SYSTEM_DRIVE_CREDENTIALS_HOST_PATH=/secure/liem-research/drive-credentials.json
```

Chạy cùng overlay mount chỉ đọc; credentials trong container là `/run/secrets/system-drive.json`:

```bash
docker compose -f docker-compose.yml -f docker-compose.drive.yml up -d --build --wait
```

File trên host phải đọc được bởi UID/GID `10001:10001` trong container. Dùng owner/group và quyền hạn chế phù hợp; không bake credentials vào image. Các lệnh Compose sau đó dùng cùng hai `-f` để giữ mount.

Trong **Dung lượng & Drive**, nhập ID thư mục lấy từ URL Drive, bấm **Kiểm tra kết nối Drive**, chọn **Google Drive hệ thống** và lưu. Với My Drive, chọn thư mục do tài khoản hệ thống sở hữu; `canDeleteChildren` chỉ được Google trả cho Shared Drive, nên ứng dụng kiểm tra quyền sở hữu khi dùng My Drive. Xem [Google: khả năng và quyền sở hữu file](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

Kiểm tra kết nối đọc metadata/quyền thư mục; việc upload, download, xóa thực tế cần kiểm tra bằng một bài thử của chính admin. Google Drive của bạn phải còn dung lượng vật lý; mua quota ứng dụng không mua thêm dung lượng từ Google.

### Cách lưu và truy xuất

`stored_files` ghi từng PDF/artifact: `paper_id`, `review_id`, `kind`, `local_path`, `backend`, `drive_id`, `drive_folder_id`, `size`, `sha256`, `deleted`.

- PDF được kiểm tra và ghi local trước. Nếu bật Drive, lưu remote ID vào DB **trước** upload, dùng resumable upload và xác minh kích thước/SHA-256 trước khi đổi backend rồi xóa bản local. Retry sử dụng cùng ID để tránh nhân bản khi timeout. Xem [Google: upload files](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds) và [file checksums](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
- Artifact được tạo local, đăng ký dung lượng rồi chuyển tương tự. Drive lỗi không làm mất review đã hoàn thành; file chưa chuyển ở local, có thông báo trạng thái.
- PDF ở Drive được tải qua API có xác thực vào thư mục tạm, kiểm tra size/checksum rồi dùng cho review/format/tải file. Không phát URL Drive công khai cho user. Xem [Google: download files](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
- Xóa dùng Drive `files.delete` với `supportsAllDrives=true`. Quyền xóa vĩnh viễn khác với chỉ đưa file vào thùng rác. Xem [Google: delete files](https://developers.google.com/workspace/drive/api/guides/delete).
- Đổi backend/folder chỉ ảnh hưởng file mới chưa có đích. ID/folder cũ giữ nguyên; danh tính hệ thống phải tiếp tục có quyền với file cũ. Chưa có nút di chuyển toàn bộ Drive về local hoặc chuyển hàng loạt sang tài khoản Drive khác.
- Nếu chọn **Local server**, PDF/artifact nằm ở local, không upload Drive. Nếu chọn Drive, local là vùng lưu tạm bền vững cho đến khi upload được xác minh. Khởi động lại đăng ký file cũ, dọn upload dang dở có reservation và gỡ cờ chuyển đang dở; chuyển lỗi thử lại từ giao diện. Xóa hết hạn theo worker ở phần trên.

## Giới hạn request và AI

| Lớp | Mặc định | Có thể chỉnh |
| --- | --- | --- |
| API / tài khoản / phút | 180 | Admin |
| API / IP / phút | 5 × giới hạn tài khoản | Theo cấu hình API |
| Upload / tài khoản / phút | 10 | Admin |
| Upload đang xử lý | 2 / tài khoản, 8 toàn hệ thống | Giới hạn cứng |
| Nhận review AI / phút / tài khoản | 6 | Admin |
| Nhận review AI / ngày UTC / tài khoản | 50 | Admin |
| Review AI đang queued/running | 2 / tài khoản, 8 toàn hệ thống | Admin |
| Format / tài khoản | 6 request/phút, 100 job/ngày UTC, 2 job đồng thời | Admin chỉnh mức ngày |
| Format đồng thời toàn hệ thống | 4 | Admin |
| Mua gói / tài khoản | 6 request/phút | Giới hạn endpoint |
| Xóa bài / tài khoản | 30 request/phút | Giới hạn endpoint |
| Tải PDF / tài khoản | 20 request/phút | Giới hạn endpoint |

Các giới hạn áp dụng cả admin và key Gemini cá nhân/hệ thống. Rate limit request là cửa sổ 60 giây bắt đầu từ request đầu; budget AI/format dùng phút/ngày UTC cố định. Phản hồi `429` có `Retry-After`; frontend hiển thị số giây cần chờ. Healthcheck được miễn giới hạn API tổng.

`usage_budgets` lưu độc lập với bài/review nên xóa bài, đăng xuất hoặc khởi động lại không đặt lại quota AI. Job lỗi/hoàn credit vẫn tính lượt chống spam. Request bị từ chối trước khi nhận job không trừ credit hay budget; retry UUID job cũ không tính job mới (nhưng vẫn là một HTTP request). Kiểm tra quota/concurrency/budget, trừ credit và tạo review nằm trong một transaction.

Theo dõi đĩa/RAM và điều chỉnh concurrency theo workload. Compose dành tối đa 1 GB `/tmp` và giới hạn container 2 GB RAM mặc định; file Drive cần vùng tạm khi đọc, multipart cũng có thể spool ra đĩa. Những con số này cần tăng/giảm cùng nhau khi nâng giới hạn file. Reverse proxy nên có giới hạn body ít nhất `upload_max_mb + 1 MB`, timeout phù hợp và rate limit kết nối/IP ở biên; chỉ tin forwarded headers từ proxy được kiểm soát. Bộ giới hạn trong app bảo vệ tác vụ và tài khoản, không thay thế chống DDoS ở hạ tầng.

## API chính và vận hành

| Endpoint | Công dụng |
| --- | --- |
| `GET /api/storage` | Quota, bài, vị trí, giá, gói, giới hạn của tài khoản |
| `POST /api/storage/quotes` | JSON `action: "add"` và `units`, hoặc `action: "renew"`; trả báo giá, phí, tổng MB và ngày hạn |
| `POST /api/storage/purchases` | JSON UUID `quote_id`, UUID `request_id`; giao dịch nguyên tử/idempotent |
| `DELETE /api/papers/{id}` | Xóa cứng và retry xóa |
| `POST /api/papers/{id}/storage/drive` | Chuyển hoặc thử chuyển lại file của bài |
| `GET/PUT /api/admin/storage/settings` | Xem/lưu cấu hình có validation và audit |
| `POST /api/admin/storage/drive/test` | JSON `folder_id`, kiểm tra kết nối/quyền |
| `PUT /api/admin/storage/email` | Lưu SMTP; `smtp_password` bỏ qua để giữ nguyên, chuỗi rỗng để xóa |
| `POST /api/admin/storage/email/test` | Gửi email thử đến chính admin đang đăng nhập, giới hạn 3 lần/phút |

Nâng cấp: backup DB + `data/uploads` + `outputs` + khóa mã hóa trước khi thay phiên bản, sau đó khởi động **một worker**. Schema bổ sung tự tạo; giá trị mặc định áp dụng khi chưa có setting. Không tự mua gói hoặc chuyển bài cũ sang Drive. Dữ liệu ngoài local cần kế hoạch backup Drive và khôi phục database cùng các ID đã lưu.

Migration `storage_shared_plan_v1` chạy một lần: gộp dung lượng các khoản mua cũ còn hạn, chọn ngày hết hạn muộn nhất để không rút ngắn thời gian đã trả. Nếu tất cả đã hết hạn, lấy nhóm khoản mua có ngày hết hạn gần nhất làm số dư để gia hạn. Không trừ credit, không sửa lịch sử cũ. Tài khoản đã hết hạn/vượt mức sẽ bị khóa sau nâng cấp, nhưng tự dọn vẫn phải chờ email mới và đủ 7 ngày. Các bảng mới: `storage_subscriptions`, `storage_quotes`, `storage_email_outbox`, `storage_cleanup_log`.

Kiểm thử offline dùng `tests/test_storage.py` và `tests/test_storage_subscription.py`: quota/concurrency, thanh toán gộp/expiry/idempotency, khóa toàn bộ API nội dung, 7 ngày giữ dữ liệu, SMTP outage/retry, tranh chấp gia hạn/xóa, migration, ownership, hard-delete/cascade, symlink, lỗi xóa/chuyển, staging, rate limit và budget AI. Browser test tùy chọn dùng `PAPERSCOPE_BROWSER_TEST=1`; kiểm tra mua thêm/gia hạn/mở khóa và responsive. Không gửi SMTP hay truy cập Drive thật trong test.
