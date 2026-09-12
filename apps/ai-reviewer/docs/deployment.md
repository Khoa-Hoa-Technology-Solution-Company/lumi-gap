# Cài đặt và triển khai Liêm Research Paper

## Chạy trực tiếp trên Linux/macOS

Dùng Python 3.10+; Dockerfile sử dụng Python 3.12. Chạy trong thư mục project:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
# Chỉ tạo .env nếu chưa tồn tại.
[ -f .env ] || cp .env.example .env
chmod 600 .env
```

Điền `.env` theo bảng dưới, sau đó:

```bash
.venv/bin/python run.py
```

Mở `http://localhost:8000`. Dùng đúng hostname trong `APP_BASE_URL`. Trên Windows, thay `.venv/bin/python` bằng `.venv/Scripts/python.exe`. Lỗi thiếu `payos`, `pdfplumber` hoặc thư viện khác: cài lại `-r requirements.txt` bằng **chính Python của `.venv` đang chạy**.

`run.py` đọc `.env` trước khi khởi tạo Uvicorn, nên `REVIEW_APP_HOST`, `REVIEW_APP_PORT` và `REVIEW_APP_RELOAD` có hiệu lực khi chạy trực tiếp.

## Biến môi trường

Không ghi đè `.env` đang dùng khi nâng cấp. Chỉ bổ sung các biến thiếu từ `.env.example`.

| Biến | Local | Production / ý nghĩa |
| --- | --- | --- |
| `APP_BASE_URL` | `http://localhost:8000` | Origin công khai, ví dụ `https://paperscope.example.com`; không thêm đường dẫn con |
| `APP_ENV` | `development` | `production` bắt buộc HTTPS và khóa mã hóa |
| `APP_ENCRYPTION_KEY` | Để trống sẽ tạo `data/.encryption-key` | Khóa Fernet ổn định, giữ cùng backup database |
| `GOOGLE_CLIENT_ID` | OAuth client loại Web | Bắt buộc để đăng nhập; Authorized JavaScript origins phải khớp `APP_BASE_URL` |
| `ADMIN_EMAILS` | Email admin, phân cách dấu phẩy | Chỉ cấp quyền khi tài khoản Google đó đăng nhập lần đầu |
| `ADMIN_GOOGLE_SUBS` | Có thể để trống | Google subject ID tin cậy để bootstrap admin khi cần |
| `GEMINI_API_KEY` | Có thể để trống | Key hệ thống cho review nội dung; không cần cho kiểm tra định dạng |
| `GEMINI_MODEL` | Giữ model đang hoạt động | Tên model Gemini Interactions khả dụng với tài khoản của bạn |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Có thể để trống | Cần đủ để nạp credit; không cần để kiểm tra định dạng |
| `CAPTCHA_ENABLED` | `false` | Bật `true` khi đã cấu hình cả hai key Turnstile |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Có thể để trống | Cấu hình đúng domain và các action hiện có |
| `REVIEW_APP_HOST` | `127.0.0.1` | Compose luôn ghi đè thành `0.0.0.0` bên trong container |
| `REVIEW_APP_PORT` | `8000` | Compose luôn dùng `8000` bên trong container |
| `REVIEW_APP_RELOAD` | `false` | Giữ `false` khi vận hành |
| `REVIEW_DB_PATH` | Mặc định `data/review_agent.db` | Compose cố định `/app/data/review_agent.db` |
| `PAPERSCOPE_BIND_IP` | `127.0.0.1` | IP publish cổng Docker trên host; giữ loopback nếu reverse proxy ở host |
| `PAPERSCOPE_PORT` | `8000` | Cổng Docker publish trên host, độc lập với cổng trong container |
| `PAPERSCOPE_IMAGE` | `paperscope:local` | Image/tag Compose sẽ chạy |
| `SYSTEM_DRIVE_CREDENTIALS_FILE` | Trống | Đường dẫn JSON credentials hệ thống, tùy chọn; folder/backend cấu hình trong Admin |
| `SYSTEM_DRIVE_CREDENTIALS_HOST_PATH` | Trống | Đường dẫn host cho overlay `docker-compose.drive.yml` |

Các secret và cấu hình đã lưu trong trang **Quản trị** ưu tiên hơn `.env`, kể cả giá trị đã xóa. Vì vậy nếu đổi key/model trong `.env` mà ứng dụng chưa đổi, kiểm tra cấu hình đã lưu trong database. Origin, môi trường, khóa mã hóa và biến máy chủ quản lý qua môi trường.

**Cài mới production**, tạo khóa rồi tự dán vào `APP_ENCRYPTION_KEY`:

```bash
.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

**Nâng cấp dữ liệu có sẵn**, dùng đúng khóa cũ để tiếp tục giải mã. Không tạo khóa thay thế. `.env` và `.env.*` đã bị loại khỏi Git; `.env.example` là ngoại lệ. Docker build chỉ nhận các file trong allowlist `.dockerignore`.

## Docker Compose: cài mới

Cần Docker Engine đang chạy và Docker Compose. Khởi tạo `.env` như trên, cấu hình Google Login trước khi sử dụng giao diện. Với local có thể để trống Gemini, PayOS và Turnstile.

```bash
docker compose build
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 app
```

Mở `http://localhost:8000`. Compose truyền `.env` vào container bằng `env_file`, còn mục `environment` ghi đè host/port/database để nhất quán bên trong container. Xem [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Container chạy UID/GID `10001:10001`, một worker, filesystem gốc chỉ đọc; `/tmp` tạm thời. Hai named volumes giữ dữ liệu:

| Volume mặc định | Mount trong container | Nội dung |
| --- | --- | --- |
| `paperscope_paperscope-data` | `/app/data` | SQLite, template nhập, PDF upload, khóa local |
| `paperscope_paperscope-outputs` | `/app/outputs` | Artifact review nội dung |

Named volumes được Docker tạo với quyền thư mục từ image. Compose cài mới dùng database mới, **không tự lấy `data/` hoặc `outputs/` trên máy host**. Không dùng nhiều replica/worker chung database. Tăng giới hạn 2 GB RAM/2 CPU trong Compose theo workload nếu cần.

Quota mặc định 50 MB/tài khoản, giới hạn mỗi PDF 50 MB, giá gói 100 MB/30 ngày quản lý trong **Dung lượng & Drive**; rate limit ở **Giới hạn & chống spam**. Các menu và chỉ số quản trị được giải thích trong [hướng dẫn quản trị](admin-guide.md). Compose dành tối đa 1 GB cho `/tmp`; điều chỉnh cùng RAM/concurrency khi tăng kích thước file. Google Drive là tùy chọn, xem [cấu hình credentials, Shared Drive/My Drive và overlay Docker](storage-and-limits.md#kết-nối-google-drive-hệ-thống).

Gói dung lượng được cộng dồn theo một ngày gia hạn chung. Hết hạn + vượt mức miễn phí khóa toàn bộ thư viện; thread bảo trì mỗi 60 giây nhắc gia hạn và dọn bài cũ vượt mức sau 7 ngày. **Cần cấu hình SMTP** qua admin hoặc các biến `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURITY` trong `.env.example`. Sau khi lưu, gửi email thử đến chính admin và kiểm tra trạng thái email/lần chạy bảo trì. Chưa gửi được cảnh báo thì không tự xóa; email gửi muộn bắt đầu lại đủ 7 ngày giữ dữ liệu. Xem [chính sách và cấu hình email](storage-and-limits.md#hết-hạn-tự-dọn-sau-7-ngày-và-email).

`STORAGE_MAINTENANCE_ENABLED=true` bật sẵn trong vận hành; không cần container cron hay Jenkins job riêng. Khi kiểm thử bản backup, đặt `false` trước khởi động để tránh gửi mail/xóa file của bản sao. Đảm bảo kết nối outbound tới SMTP được phép. Khóa mã hóa phải giữ nguyên để đọc mật khẩu SMTP đã lưu. Cấu hình admin trong DB ưu tiên ENV, nên sửa ENV không ghi đè giá trị đã lưu qua web.

Healthcheck gọi `/api/health` ở bên trong container. Trạng thái healthy xác nhận API hoạt động; không kiểm tra key Google, Gemini hay PayOS thực tế. Cơ chế này dùng [Docker HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck).

Đổi `.env` khi đang chạy:

```bash
docker compose up -d --force-recreate --wait
```

Chỉ `restart` sẽ không nạp lại environment của container. Khi cần build bản code mới:

```bash
docker compose build
docker compose up -d --wait
```

Kiểm tra cú pháp Compose bằng env mẫu, không in secret:

```bash
python3 scripts/check_compose.py
```

## Production và reverse proxy

Đặt `APP_ENV=production`, `APP_BASE_URL=https://paperscope.example.com`, khóa mã hóa hợp lệ và OAuth origin đúng domain. Reverse proxy HTTPS trên host chuyển đến `127.0.0.1:8000`. Cấu hình tối thiểu trong location Nginx đã có TLS:

```nginx
location / {
    client_max_body_size 51m;
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 180s;
}
```

Google OAuth authorized origin là domain HTTPS, PayOS webhook là `https://paperscope.example.com/api/payments/payos/webhook`. `APP_BASE_URL` quyết định secure cookie. Không tự tin cậy mọi forwarded header: khi cần lấy đúng IP thật để rate limit, đặt `FORWARDED_ALLOW_IPS` trong `.env` bằng IP proxy mà Uvicorn nhìn thấy (với Docker bridge có thể là gateway bridge), không dùng `*` cho server truy cập được trực tiếp.

Nếu reverse proxy chạy container khác, kết nối hai service qua mạng Docker riêng và dùng upstream `app:8000`, thay cho localhost của container proxy. Giữ private key/cert ở reverse proxy.

## Sao lưu và chuyển dữ liệu hiện có

Dừng server trước khi sao lưu nhất quán database, PDF, outputs và khóa mã hóa. `docker compose down` giữ named volumes; **không thêm `-v` khi muốn giữ dữ liệu**.

Lưu ý khi chuyển từ chạy Python trên host sang Docker: database lưu đường dẫn tuyệt đối trong `papers.file_path`, `reviews.output_dir`, `stored_files.local_path` và reservation upload dang dở `upload_reservations.local_path` (hai bảng sau chỉ có sau nâng cấp chức năng dung lượng). Sao chép volume đơn thuần chưa đủ; cần đổi prefix cũ thành `/app` (ví dụ `/home/user/project/data/uploads/a.pdf` → `/app/data/uploads/a.pdf`) trên **bản sao database**, đồng thời chép PDF/artifact tương ứng. Giữ nguyên Drive ID/folder/checksum. Các file ngoài thư mục project phải có kế hoạch chuyển riêng. Template định dạng nằm trong SQLite nên không có đường dẫn ngoài cần đổi.

Quy trình chuyển: dừng server → sao lưu toàn bộ → tạo bản sao → đổi đường dẫn trên bản sao → chép dữ liệu vào hai volume → giữ khóa mã hóa cũ → bảo đảm UID 10001 có quyền ghi → khởi động một container → kiểm tra đăng nhập, mở PDF và tải báo cáo cũ. Không xóa bản gốc trước khi xác minh dữ liệu. Nếu muốn vận hành bằng bind mount, tạo Compose override gắn đúng thư mục và quyền UID/GID thay vì các named volumes; vẫn cần xử lý đường dẫn tuyệt đối.

Cập nhật schema có thể làm bản cũ không tương thích để rollback. Giữ backup trước nâng cấp; rollback cả image và dữ liệu khi cần. Restart sẽ đánh dấu job định dạng đang dở thất bại và hoàn credit cho AI review bị gián đoạn theo cơ chế hiện tại.

## Jenkins

Repo có `Jenkinsfile` Declarative Pipeline. Tạo Pipeline from SCM hoặc Multibranch Pipeline, script path `Jenkinsfile`.

Agent Linux gắn label **docker** cần:

- Docker CLI và quyền truy cập Docker Engine đang chạy, Docker Compose;
- Node.js 22+ để kiểm tra cú pháp JavaScript;
- Python 3 để chạy các script CI nhỏ (test ứng dụng chạy trong image Python 3.12);
- plugin Pipeline, Git và JUnit của Jenkins.

Pipeline theo [cú pháp Jenkins Declarative](https://www.jenkins.io/doc/book/pipeline/syntax/) thực hiện:

1. Checkout mã nguồn; tạo tên container/image riêng theo job/build.
2. Kiểm tra cú pháp bốn file JavaScript và Compose với `.env.example` tạm.
3. Build Docker stage `test`, chạy pytest và thu `test-results.xml` vào JUnit.
4. Build stage `runtime`.
5. Khởi động container thử với dữ liệu tmpfs mới và chờ healthy; không truyền secret, không publish cổng host.
6. Dọn container thử và image test; giữ image runtime `paperscope:<jenkins-build-tag>` trên agent khi build xong.

Pipeline không yêu cầu credential production, không tự push registry hoặc triển khai. Để triển khai image đã kiểm thử trên cùng máy Docker, đặt `PAPERSCOPE_IMAGE` bằng tag Jenkins đã báo, sau đó:

```bash
docker compose up -d --no-build --wait
```

Nếu deploy sang máy khác, đẩy image vào registry riêng bằng quy trình credential của tổ chức, đặt tag đó ở `PAPERSCOPE_IMAGE`, chạy `docker compose pull app`, rồi `up --no-build`. Tránh build lại nếu muốn giữ chính xác image đã kiểm thử. Jenkins cần chính sách dọn image runtime cũ định kỳ theo nhu cầu lưu phiên bản.

Không chạy pipeline từ nhánh không tin cậy trên Docker agent chứa dữ liệu/credential production. Không dùng `docker system prune` trong pipeline dùng chung.

## Kiểm thử trước vận hành

```bash
.venv/bin/python -m pytest -q
node --check app/static/app.js
node --check app/static/accounts.js
node --check app/static/review-types.js
node --check app/static/formats.js
python3 scripts/check_compose.py
```

Kiểm thử giao diện (desktop/tablet/mobile, backend tạm và tích hợp ngoài giả lập):

```bash
.venv/bin/python -m pip install playwright
.venv/bin/python -m playwright install chromium
PAPERSCOPE_BROWSER_TEST=1 .venv/bin/python -m pytest -q
```

Trong container:

```bash
docker build --target test -t paperscope:test .
docker run --rm paperscope:test
```

Google Login, Gemini tính phí, PayOS và HTTPS cần kiểm tra với cấu hình triển khai thực tế. Kiểm tra định dạng chạy local và có thể dùng khi các tích hợp AI/thanh toán chưa cấu hình, sau khi đăng nhập Google.
