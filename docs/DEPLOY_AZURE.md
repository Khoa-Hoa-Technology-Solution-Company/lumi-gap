# Deploy toàn bộ LumiGap lên Azure VM (Azure for Students)

Tài liệu này hướng dẫn chạy **toàn bộ** stack (PostgreSQL + pgvector, Redis, backend, web,
ai-reviewer và **các worker tự động cào báo**) trên **một** VM Ubuntu của Azure, dùng
Docker Compose và HTTPS tự động qua Caddy. Cấu hình nằm trong [`deploy/vps/`](../deploy/vps)
và dùng chung cho cả Hetzner ([DEPLOY_HETZNER.md](DEPLOY_HETZNER.md)).

| File | Việc |
|---|---|
| `docker-compose.vps.yml` | Override của `docker-compose.yml`: chỉ Caddy mở cổng 80/443; API và worker chạy bằng `node` (tiết kiệm RAM); domain HTTPS cho CORS, link email và Google callback; RAM của Postgres chỉnh qua biến `PG_*` |
| `Caddyfile` | `LUMIGAP_DOMAIN` phục vụ web và chuyển `/api/*` thẳng vào backend; `API_DOMAIN` dành cho app Flutter và OAuth |
| `bootstrap-server.sh` | Chạy một lần: cài Docker, tạo user `deploy`, swap 4 GB, firewall, chặn SSH bằng mật khẩu |
| `deploy.sh` | `git pull`, build, khởi động lại toàn bộ stack |
| `first-run.sh` | Tạo provider OpenAlex và nạp danh mục chủ đề (taxonomy) |
| `make-admin.sh` | Nâng một tài khoản đã đăng ký lên ADMIN |
| `backup-db.sh` | `pg_dump` hằng ngày, giữ 7 bản |

LibreTranslate **không** chạy. Giữ `TRANSLATION_PROVIDER=gemini`.

---

## Chọn cỡ VM và tính credit

| VM | Cấu hình | Giá ước tính (Southeast Asia) | $100 chạy 24/7 được |
|---|---|---|---|
| **Standard_B2ms** (khuyến nghị) | 2 vCPU, 8 GB | khoảng $60–70/tháng | khoảng 1,5 tháng |
| Standard_B2s | 2 vCPU, 4 GB | khoảng $30–35/tháng | khoảng 3 tháng (dùng cấu hình 4 GB ở bước 4) |

Ổ đĩa (Standard SSD 64 GB) và IP public tính thêm khoảng $5–8/tháng. Bạn có thể xem giá chính xác
trong Azure Pricing Calculator.

**Tự động cào báo cần VM bật vào giờ chạy lịch.** Mặc định các lịch chạy theo giờ UTC:

| Biến | Mặc định | Giờ Việt Nam | Việc |
|---|---|---|---|
| `SYNC_CRON` | `0 2 * * *` | 09:00 | Cào bài mới từ OpenAlex cho các chủ đề đang "Follow daily" |
| `EMBED_CRON` | `0 3 * * *` | 10:00 | Tạo embedding cho bài mới |
| `PAPER_ANALYSIS_CRON` | `0 4 * * *` | 11:00 | AI phân tích và chấm điểm bài mới |

Nếu VM tắt đúng lúc đó, lần chạy hôm đó bị **bỏ qua** (BullMQ không chạy bù). Bạn có 2 cách:

- Để VM chạy 24/7. Đây là cách đơn giản nhất.
- Bật Auto-shutdown vào ban đêm (ví dụ 23:00) và bật VM lại mỗi sáng trước 09:00. Khi tắt bằng
  **Stop** (trạng thái *Stopped (deallocated)*), Azure không tính tiền CPU/RAM nữa, chỉ còn tính
  tiền ổ đĩa.

---

## 1. Tạo SSH key (trên máy Windows của bạn)

```powershell
ssh-keygen -t ed25519 -C "lumigap-deploy"
```

```powershell
Get-Content $HOME\.ssh\id_ed25519.pub
```

## 2. Tạo VM trên Azure Portal

1. Tìm **Virtual machines**, bấm **Create**, chọn **Azure virtual machine**.
2. Tab **Basics**:
   - Subscription: **Azure for Students**
   - Resource group: **Create new**, đặt tên `lumigap-rg`
   - Virtual machine name: `lumigap-prod`
   - Region: **(Asia Pacific) Southeast Asia**. Nếu báo lỗi region không được phép, thử East Asia,
     Japan East hoặc Korea Central.
   - Availability options: No infrastructure redundancy required
   - Security type: Standard
   - Image: **Ubuntu Server 24.04 LTS - x64 Gen2**
   - Size: **Standard_B2ms** (hoặc Standard_B2s)
   - Authentication type: **SSH public key**, Username: `azureuser`
   - SSH public key source: **Use existing public key**, rồi dán nội dung `id_ed25519.pub`
   - Public inbound ports: **Allow selected ports**, chọn **SSH (22), HTTP (80), HTTPS (443)**
3. Tab **Disks**: OS disk type **Standard SSD**, bấm **Create and attach**/đổi size lên **64 GiB**
   (30 GiB mặc định không đủ cho Docker image và database).
4. Tab **Management**: Auto-shutdown tuỳ chọn (đọc mục "Chọn cỡ VM" ở trên), time zone
   **(UTC+07:00) Bangkok, Hanoi, Jakarta**.
5. Bấm **Review + create**, rồi **Create**. Đợi khoảng 2 phút, sau đó mở VM và ghi lại
   **Public IP address**.
6. Nên cố định IP: vào VM, chọn **Networking**, bấm vào **Public IP**, chọn **Configuration**,
   đặt Assignment = **Static**. Bản Standard SKU mặc định đã là static.

## 3. Trỏ domain và chuẩn bị server

Tạo 3 bản ghi **A** cùng trỏ về Public IP: `@`, `www`, `api`. Nếu dùng Cloudflare, để **DNS only
(mây xám)** cho đến khi HTTPS chạy được.

Từ thư mục repo trên máy bạn:

```powershell
scp deploy/vps/bootstrap-server.sh azureuser@<IP>:~/
```

```powershell
ssh azureuser@<IP>
```

Trên VM:

```bash
sudo bash ~/bootstrap-server.sh deploy "$(head -n1 ~/.ssh/authorized_keys)"
exit
```

Từ giờ đăng nhập bằng `ssh deploy@<IP>`.

## 4. Lấy code và tạo `.env`

Code phải có thư mục `deploy/vps/` trên nhánh bạn clone, tức là đã được commit và push.

```bash
ssh deploy@<IP>
git clone https://github.com/Khoa-Hoa-Technology-Solution-Company/lumi-gap.git
cd lumi-gap
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:22-alpine node scripts/setup.mjs
chmod 600 .env
nano .env
```

Sửa hoặc thêm các dòng sau trong `.env`:

```dotenv
# Domain công khai (biến mới, chỉ override VPS dùng)
LUMIGAP_DOMAIN=lumigap.uk
API_DOMAIN=api.lumigap.uk
ACME_EMAIL=<email nhận cảnh báo chứng chỉ>

# Bắt buộc
GEMINI_API_KEY=<key Gemini>
OPENALEX_MAILTO=<email liên hệ cho OpenAlex>
TRANSLATION_PROVIDER=gemini

# Tự động cào báo (giờ UTC, xem bảng ở đầu tài liệu)
SYNC_CRON=0 2 * * *
EMBED_CRON=0 3 * * *
PAPER_ANALYSIS_CRON=0 4 * * *
TOPIC_WATCH_DAILY_MAX_PAPERS=500

# Tuỳ chọn
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_DELIVERY_MODE=disabled    # "smtp" + SMTP_* để gửi OTP thật; "log" bị cấm khi NODE_ENV=production
```

**Nếu dùng VM 4 GB (B2s)**, thêm các dòng sau:

```dotenv
PG_SHARED_BUFFERS=512MB
PG_EFFECTIVE_CACHE_SIZE=1GB
PG_MAINTENANCE_WORK_MEM=128MB
PG_MEM_LIMIT=1g
PG_SHM_SIZE=512m
WORKER_MEM_LIMIT=384m
```

Ghi chú:

- `CORS_ORIGIN` và `GOOGLE_CALLBACK_URL` được override sinh ra từ `LUMIGAP_DOMAIN` / `API_DOMAIN`.
- Google OAuth: thêm redirect URI `https://api.lumigap.uk/api/v1/auth/google/callback`.
- Gói free của Gemini giới hạn số request mỗi ngày. Nếu bị lỗi quota, giảm `PAPER_ANALYSIS_MAX_PAPERS_PER_RUN`
  và `TOPIC_WATCH_DAILY_MAX_PAPERS`.
- Không commit `.env` và không gửi file này qua chat.

## 5. Deploy

```bash
bash deploy/vps/deploy.sh
```

Lần build đầu trên 2 vCPU mất khoảng 10–15 phút. Sau khi các container chạy:

```bash
bash deploy/vps/first-run.sh
```

**Nếu dùng VM 4 GB**, dừng các worker chỉ chạy khi admin bấm tay, để dành RAM:

```bash
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml \
  stop worker-openalex-ingest worker-corpus-validation
```

Lưu ý: `deploy.sh` sẽ bật lại các worker này ở lần deploy sau, nên phải chạy lại lệnh `stop`.

## 6. Bật tự động cào báo

1. Mở `https://lumigap.uk` và **đăng ký** tài khoản của bạn.
2. Trên VM, nâng tài khoản đó lên admin:
   ```bash
   bash deploy/vps/make-admin.sh <email-vừa-đăng-ký>
   ```
3. Đăng xuất rồi đăng nhập lại trên web, vào **Admin**, chọn **Sync** (`/admin/sync`),
   bấm **Import from catalogue**.
4. Tìm một chủ đề (topic, subfield, keyword hoặc tag), chọn rồi bấm **Follow daily**.
   Hệ thống sẽ nhập ngay một lượng bài ban đầu (backlog). Sau đó **mỗi ngày** vào giờ `SYNC_CRON`,
   worker-sync tự lấy bài mới; worker-embedding và worker-paper-analysis xử lý tiếp.
5. Muốn chạy ngay không đợi lịch: bấm **Run now** trong bảng topic watch của trang Sync, hoặc gọi
   `POST /api/v1/admin/topic-watches/run` bằng token admin.

Kiểm tra worker cào báo đang chạy:

```bash
alias dc='docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml'
echo "alias dc='docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml'" >> ~/.bashrc
dc logs --tail 50 worker-sync          # thấy "sync worker listening on api-sync queue"
dc logs --tail 50 worker-embedding
dc logs --tail 50 worker-paper-analysis
dc logs -f worker-sync | grep "topic watch run finished"   # sau giờ SYNC_CRON
```

## 7. Kiểm tra chung

```bash
curl -fsS https://api.lumigap.uk/health
curl -fsS https://api.lumigap.uk/ready
dc ps
docker stats --no-stream
free -h
```

Lỗi HTTPS thì xem `dc logs caddy`. Nguyên nhân thường là DNS chưa trỏ đúng, hoặc chưa mở
cổng 80/443 trong **Networking** (Network security group) của VM.

## 8. Backup và cập nhật

```bash
mkdir -p ~/backups
(crontab -l 2>/dev/null; echo "15 1 * * * bash /home/deploy/lumi-gap/deploy/vps/backup-db.sh >> /home/deploy/backups/backup.log 2>&1") | crontab -
```

Cập nhật code mới:

```bash
cd ~/lumi-gap && bash deploy/vps/deploy.sh
```

## 9. Theo dõi chi phí

- Vào **Education**, xem **Overview** để thấy credit còn lại.
- Nên đặt cảnh báo ngân sách: vào **Cost Management**, chọn **Budgets**, tạo budget $20/tháng
  với cảnh báo ở 80%.
- Khi không cần chạy (ví dụ nghỉ lễ), bấm **Stop** trên trang VM. Dữ liệu vẫn giữ nguyên,
  và khi tắt thì không bị tính tiền CPU/RAM.
- Khi credit hết, subscription bị vô hiệu hoá chứ không tự trừ tiền. Nhớ tải backup về trước thời điểm đó.
