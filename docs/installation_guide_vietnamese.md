# Hướng dẫn cài đặt và khởi chạy LumiGap

Thực hiện các lệnh trong thư mục `lumi-gap/`, nơi có `docker-compose.yml`.
Chỉ chỉnh một file `.env` ở đây cho môi trường local.

## 1. Chạy toàn bộ bằng Docker

Cài Docker Desktop và bật Linux containers. Không cần cài PostgreSQL, Redis,
pgvector, Node hay pnpm trên máy để chạy theo cách này.

```powershell
Copy-Item .env.example .env
# Điền GEMINI_API_KEY trong .env; đổi mật khẩu mẫu nếu chia sẻ bản demo.
docker compose config -q
docker compose up -d --build
```

Trên bash, dùng `cp .env.example .env`. Docker tự tạo JWT trong volume và chạy
Prisma migrations. API và workers chờ các bước này thành công mới khởi động.

- Web: **http://localhost:8080**.
- API health: **http://localhost:4000/health**.
- Kiểm tra PostgreSQL/Redis: **http://localhost:4000/ready**.
- API docs: **http://localhost:4000/api-docs**.

Tạo tài khoản demo theo yêu cầu, không tự seed mỗi lần:

```powershell
docker compose --profile seed up seed
```

Đăng nhập bằng `admin@liemresearch.com` / `Admin123456!`. Seed chỉ dành cho local.
Bảy workers chạy mặc định; dự trù khoảng 8 GB RAM rồi điều chỉnh theo sử dụng thực tế.
Cách tắt workers và bật dịch vụ tùy chọn nằm trong [hướng dẫn Docker](DEPLOY_WITH_DOCKER.md).

## 2. Backend/web native, database trong Docker

Cài Node phù hợp phiên bản Prisma đang dùng (Docker dùng Node 22) và pnpm 11.3.0.
Dừng toàn stack nếu đang chạy để tránh trùng cổng và workers.

```powershell
pnpm install
pnpm setup
# Điền GEMINI_API_KEY vào root .env. Setup giữ nguyên .env đã có.
pnpm docker:infra
pnpm --filter backend db:migrate:deploy
pnpm --filter backend db:seed
pnpm dev:backend   # terminal A, http://localhost:4000
pnpm dev:web       # terminal B, http://localhost:3000
```

Mở terminal khác để chạy `pnpm --filter backend dev:workers` nếu cần.
AI Reviewer với backend native cần `docker compose up -d --build ai-reviewer`.
Backend, Prisma và workers đọc root `.env` bằng đường dẫn tuyệt đối và bung
`${...}` để ghép URL. Mật khẩu local chỉ dùng chữ và số. `pnpm setup` sinh mật khẩu
hex, khóa nội bộ, OTP secret và khóa RSA nếu chưa có.
Vite chỉ đưa `VITE_*` vào bundle; giữ `VITE_API_BASE=/api/v1` để dùng proxy.

## 3. Mobile

```powershell
pnpm dev:mobile
pnpm dev:flutter_mobile
```

Expo dùng `EXPO_PUBLIC_API_BASE`, Flutter dùng `API_BASE_URL` từ root `.env`.
Flutter được truyền riêng URL qua JSON tạm `--dart-define-from-file`, không nhúng file chứa secret.
Emulator Android dùng `http://10.0.2.2:4000/api/v1`; điện thoại thật cần IP LAN
của máy và cùng mạng. SDK Expo/Flutter phải được cài riêng.

## 4. Chuyển cấu hình cũ

Chạy `pnpm setup`, chuyển Gemini/OAuth/storage/email credentials từ các file cũ
vào root `.env`. Giữ mật khẩu Postgres cũ nếu tái sử dụng volume: biến khởi tạo
không đổi mật khẩu role đã có. Redis áp dụng mật khẩu khi khởi động; cập nhật
Redis và clients cùng lúc nếu đổi mật khẩu.
Sau khi kiểm chứng, xóa các file môi trường local cũ. `pnpm docker:reset` xóa toàn
bộ dữ liệu và JWT của Docker; hãy sao lưu trước. Khóa native không bị lệnh này xóa.
Production/Jenkins giữ hợp đồng credential cũ; mẫu production chuyển về root
`.env.production.example`.

## 5. Khắc phục lỗi và kiểm thử

- Docker không kết nối được: mở Docker Desktop, chờ Linux engine sẵn sàng.
- Backend báo invalid env: kiểm tra tên biến được nêu và `GEMINI_API_KEY` trong root `.env`.
- Thiếu bảng: xem `docker compose logs migrate`; native chạy `pnpm --filter backend db:migrate:deploy`.
- DB sai mật khẩu: dùng lại mật khẩu lúc tạo volume; không reset dữ liệu cần giữ.
- Redis không kết nối: chạy `pnpm docker:infra`, kiểm tra `REDIS_HOST_PORT`.
- Kiểm tra: `docker compose ps -a`, `pnpm docker:logs`.
- Test code: `pnpm typecheck`, `pnpm test`, `pnpm --filter web build`, `pnpm test:e2e`.

Test tích hợp cần database/Redis; Playwright cần app và dữ liệu seed.
Xem [danh mục biến môi trường](environment-variables.md) để biết nguồn từng key.
