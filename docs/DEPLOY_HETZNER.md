# Deploy toàn bộ LumiGap lên Hetzner Cloud (CX32)

Tài liệu này hướng dẫn chạy **toàn bộ** stack (PostgreSQL + pgvector, Redis, backend,
web, ai-reviewer và các worker BullMQ) trên **một** VPS Hetzner bằng Docker Compose,
có HTTPS tự động qua Caddy. Cấu hình `deploy/vps/` dùng chung với Azure, xem thêm
[DEPLOY_AZURE.md](DEPLOY_AZURE.md).

| Thành phần | Giá trị |
|---|---|
| Gói | Hetzner Cloud **CX32**: 4 vCPU, 8 GB RAM, 80 GB SSD |
| Chi phí | khoảng €6,8/tháng (khoảng 205.000 ₫), tính theo giờ, có giá trần theo tháng |
| Hệ điều hành | Ubuntu 24.04 |
| Vị trí | Nuremberg/Falkenstein/Helsinki (dòng CX chỉ có ở EU; ping từ Việt Nam khoảng 200 ms) |
| File cấu hình | [`deploy/vps/`](../deploy/vps) |

Các file trong `deploy/vps/`:

- `docker-compose.vps.yml`: override của `docker-compose.yml`. Đóng mọi cổng nội bộ, thêm Caddy (cổng 80/443), tinh chỉnh Postgres cho máy 8 GB, đặt `mem_limit`, và dùng domain HTTPS cho CORS và Google callback.
- `Caddyfile`: `LUMIGAP_DOMAIN` phục vụ web, `/api/*` đi thẳng vào backend (để backend thấy IP thật của client), `API_DOMAIN` dành cho app Flutter và OAuth.
- `bootstrap-server.sh`: chạy một lần trên server mới (Docker, user deploy, swap 4 GB, firewall, chặn đăng nhập SSH bằng mật khẩu).
- `deploy.sh`: `git pull` rồi build và khởi động lại toàn bộ stack.
- `first-run.sh`: tạo provider OpenAlex và nạp danh mục chủ đề (chạy sau lần deploy đầu).
- `make-admin.sh`: nâng một tài khoản đã đăng ký lên ADMIN.
- `backup-db.sh`: `pg_dump` hằng ngày, giữ 7 bản gần nhất.

LibreTranslate **không** chạy (tốn 1–2 GB RAM). Giữ `TRANSLATION_PROVIDER=gemini`.

---

## 1. Tạo server

1. Đăng ký tại https://console.hetzner.cloud, tạo Project mới.
2. Tạo SSH key trên máy bạn (nếu chưa có):
   ```powershell
   ssh-keygen -t ed25519 -C "lumigap-deploy"
   ```
   Nội dung public key nằm ở `~/.ssh/id_ed25519.pub`.
3. **Add Server**: Location EU tuỳ chọn, Image **Ubuntu 24.04**, Type **Shared vCPU / x86 / CX32**,
   Networking giữ IPv4 + IPv6, SSH keys dán public key vừa tạo, đặt tên `lumigap-prod`.
4. Ghi lại địa chỉ IPv4 của server.

## 2. Trỏ domain

Tại nơi quản lý DNS của domain (ví dụ Cloudflare), tạo các bản ghi sau:

| Loại | Tên | Giá trị |
|---|---|---|
| A | `@` (ví dụ `lumigap.uk`) | IPv4 server |
| A | `www` | IPv4 server |
| A | `api` | IPv4 server |

Nếu dùng Cloudflare, để **DNS only (mây xám)** trong lần đầu để Caddy xin được chứng chỉ Let's Encrypt.
Sau khi HTTPS đã chạy, có thể bật proxy (mây cam) với SSL mode **Full (strict)**.

## 3. Chuẩn bị server (một lần)

```powershell
scp deploy/vps/bootstrap-server.sh root@<server-ip>:/root/
```

```powershell
ssh root@<server-ip>
```

Trên server:

```bash
bash /root/bootstrap-server.sh deploy "$(cat /root/.ssh/authorized_keys | head -n1)"
```

Sau khi script chạy xong, root không đăng nhập SSH được nữa. Từ đây dùng `ssh deploy@<server-ip>`.

## 4. Lấy code và tạo `.env`

```bash
ssh deploy@<server-ip>
git clone https://github.com/<org>/<repo>.git lumi-gap
cd lumi-gap

# Tạo .env từ .env.example với mật khẩu ngẫu nhiên (không cần cài Node trên server)
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:22-alpine node scripts/setup.mjs
nano .env
```

Sửa và thêm các biến sau trong `.env`:

```dotenv
# Domain công khai (thêm mới; chỉ dùng cho override Hetzner)
LUMIGAP_DOMAIN=lumigap.uk
API_DOMAIN=api.lumigap.uk
ACME_EMAIL=<email nhận cảnh báo chứng chỉ>

# Bắt buộc
GEMINI_API_KEY=<key Gemini của bạn>
OPENALEX_MAILTO=<email liên hệ cho OpenAlex>

# Giữ dịch bằng Gemini, không chạy LibreTranslate
TRANSLATION_PROVIDER=gemini

# Tuỳ chọn khi bật tính năng tương ứng
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ORCID_REDIRECT_URI=https://lumigap.uk/integrations/orcid/callback
GITHUB_CALLBACK_URL=https://lumigap.uk/integrations/github/callback
EMAIL_DELIVERY_MODE=smtp        # cần SMTP_* nếu muốn gửi OTP thật; "log" bị cấm khi NODE_ENV=production
```

Ghi chú:

- `CORS_ORIGIN` và `GOOGLE_CALLBACK_URL` của service backend được override sinh ra từ
  `LUMIGAP_DOMAIN` / `API_DOMAIN`, nên không cần sửa trong `.env`.
- Google OAuth: trong Google Cloud Console, thêm Authorized redirect URI
  `https://api.lumigap.uk/api/v1/auth/google/callback`.
- File PDF và ảnh được lưu trên volume `backend-uploads` (`STORAGE_PROVIDER=local`). Muốn tách
  ra khỏi server thì chuyển sang `r2` hoặc `cloudinary` (xem `.env.production.example`).
- JWT RS256 key được service `jwt-keys` sinh vào volume `jwt-keys` ở lần chạy đầu.
- `chmod 600 .env`. Không commit và không gửi file này qua chat.

## 5. Chạy lần đầu

```bash
bash deploy/vps/deploy.sh
```

Lần build đầu mất khoảng 5–10 phút. Script sẽ build image, chạy migration, khởi động backend,
web, ai-reviewer, các worker và Caddy, rồi in trạng thái các container.

Tạo provider OpenAlex (bắt buộc để sync dữ liệu, an toàn khi chạy lại nhiều lần):

```bash
bash deploy/vps/first-run.sh
```

Script này tạo provider OpenAlex và nạp danh mục chủ đề. Các bước tạo admin và bật
tự động cào báo giống hệt bước 6 trong [DEPLOY_AZURE.md](DEPLOY_AZURE.md).

Dữ liệu demo (tuỳ chọn, **không** dùng cho production thật):

```bash
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml --profile seed up seed
```

## 6. Kiểm tra

```bash
curl -fsS https://api.lumigap.uk/health
curl -fsS https://api.lumigap.uk/ready
```

Mở `https://lumigap.uk` trên trình duyệt, đăng ký, đăng nhập và thử tìm kiếm.

Theo dõi log và RAM:

```bash
alias dc='docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml'
dc ps
dc logs -f backend
dc logs -f caddy          # lỗi xin chứng chỉ HTTPS thường nằm ở đây
docker stats --no-stream
free -h
```

## 7. Cập nhật phiên bản mới

```bash
cd ~/lumi-gap && bash deploy/vps/deploy.sh
```

Migration mới được service `migrate` áp dụng tự động trước khi backend và worker khởi động.

## 8. Backup database

```bash
mkdir -p ~/backups
crontab -e
```

Thêm dòng:

```
15 1 * * * bash /home/deploy/lumi-gap/deploy/vps/backup-db.sh >> /home/deploy/backups/backup.log 2>&1
```

Nên tải bản backup về máy hoặc lưu sang nơi khác định kỳ (`scp deploy@<ip>:~/backups/*.dump .`).
Có thể bật thêm **Backups** của Hetzner (+20% giá gói) để chụp toàn bộ server mỗi ngày.

Khôi phục:

```bash
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ~/backups/<file>.dump
```

## 9. Nếu thiếu RAM

CX32 đủ chạy tất cả worker. Nếu `docker stats` cho thấy RAM gần đầy:

- Dừng các worker chỉ dùng khi admin chạy campaign:
  `dc stop worker-openalex-ingest worker-topic-backfill worker-corpus-validation`
- Hoặc nâng lên CX42 (16 GB) trong Hetzner Console (**Rescale**). Server phải tắt khoảng 1 phút, dữ liệu vẫn giữ nguyên.

## Chi phí ước tính

| Khoản | €/tháng | VNĐ (1 € khoảng 30.000 ₫) |
|---|---|---|
| CX32 | khoảng 6,8 | khoảng 205.000 |
| Backups Hetzner (tuỳ chọn) | khoảng 1,4 | khoảng 41.000 |
| Gemini, Let's Encrypt, Cloudflare DNS | 0 | 0 |

Giá có thể thay đổi, nên kiểm tra lại tại https://www.hetzner.com/cloud trước khi mua.
