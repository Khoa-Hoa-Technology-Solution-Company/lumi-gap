# Nghiệm thu Docker và root `.env`

Ngày kiểm thử: 2026-10-05, Windows / Docker Desktop Linux containers.
Nhánh: `refactor/single-env-docker`. Các lựa chọn D1–D6 đã được áp dụng.

## Môi trường cô lập

Clone thử tại `../single-env-smoke`, overlay thay đổi triển khai, chỉ có root
`.env`; không có `apps/backend/.env` hoặc `apps/web/.env`.
Compose project `lumi-gap-env-smoke` dùng volume mới, tách khỏi dữ liệu local:

| Thành phần | Cổng host kiểm thử |
|---|---|
| API | 14000 |
| nginx web | 18080 |
| PostgreSQL | 15433 |
| Redis | 16379 |
| Vite native | 3000 |

Gemini dùng giá trị giả để kiểm thử khởi động. Không xác nhận chất lượng hoặc
khả năng gọi AI bên ngoài. Native dùng lại dependencies đã cài của checkout
chính, tạo Prisma client trong clone thử và bổ sung workspace links tại đó.
`--env-mode=loose` được dùng trong harness để chuyển cấu hình dependencies
kiểm thử qua Turbo; không cần thay đổi script của repo.

## Kết quả

| Tiêu chí | Kết quả |
|---|---|
| `docker compose config -q`, không truyền env-file | Exit 0 |
| `docker compose up -d --build` trên volume mới | API/web/AI Reviewer và 7 workers khởi động |
| Migration tự chạy trước API/workers | 45 migration, 145 bảng; initializer exit 0 |
| JWT tự tạo và tái sử dụng | Initializer exit 0, lần sau xác minh cặp khóa cũ |
| API `/health`, `/ready` | HTTP 200 |
| nginx và API proxy | Web 200; `/api/v1/auth/me` trả 401 khi chưa đăng nhập |
| Seed bằng profile thông thường, image cuối | Seed exit 0 |
| Admin qua nginx, Chromium thật | Login API 200, chuyển tới `/admin` |
| `pnpm docker:infra`, `pnpm dev:backend`, `pnpm dev:web` | Cùng root `.env`; PostgreSQL/Redis kết nối, health/ready 200 |
| Admin qua Vite native, Chromium thật | Login API 200 qua cổng 3000, chuyển tới `/admin` |
| `pnpm typecheck` | 5/5 task đạt |
| `pnpm test` với PostgreSQL/Redis cô lập | Backend 586/586; web 272/272 |
| `pnpm test:e2e` trên Docker web | 6/6 đạt |
| `pnpm --filter web build` | Đạt; initial graph 898.5 KiB trong budget 950 KiB |
| Quét secret trong bundle | 264 file JS/HTML/CSS không chứa các giá trị secret root đã kiểm tra |
| Frozen lockfile | Đạt, 1775 dependency entries |
| Setup chạy lặp lại | 2 test đạt: không đổi `.env`/JWT, secrets độc lập, khóa hợp lệ |
| Loader/config | 9 test đạt: root path, expansion, biến injected và production validator |
| Expo/Flutter launcher | Help chạy được; Flutter hỗ trợ dart-define-from-file; chỉ truyền API URL công khai |
| Jenkins | Không thay đổi nội dung so với lúc bắt đầu task |

Jenkinsfile đã có thay đổi của người dùng trước task. SHA256 trước/sau:
`5565FC6A4B64AE177040088514B875AEE7340427AD042275C440D1D3F282373C`.

## Baseline và các lỗi đã xử lý

- Baseline typecheck đạt. Baseline test thiếu PostgreSQL/Redis và test nút
  discussion đếm cả nút đổi cách hiển thị.
- Test Google OAuth được cấp allowlist riêng, tránh phụ thuộc port trong `.env`.
- Test tag forum dùng tên riêng theo marker, tránh phụ thuộc tag có sẵn từ seed.
- Test discussion chỉ đếm các nút tạo discussion theo đúng mục tiêu của test.
- Seed forum dùng role `USER` theo constraint DB hiện tại.
- Root `NODE_ENV=development` từng làm web build lấy React development runtime;
  build launcher đặt production trước khi import Vite, build cuối đã đạt budget.
- Một lần test đồng thời với Docker export gặp timeout 5 giây. Sau khi build
  xong, chạy lại toàn bộ test đạt; không tăng timeout để che lỗi.

## Thời gian và phần cần xác nhận bởi team

Lần build đầy đủ được quan sát từ 15:34:40 tới 16:11:41, khoảng 37 phút.
Lần rebuild cuối từ 16:23:19 tới 16:42:49, khoảng 19 phút 30 giây.
Đây là số đo trên máy này với cache/download sẵn có, không phải cam kết thời
gian clone-to-ready trên máy mới. Dependency/export image chiếm phần lớn thời gian.

- Chưa có thành viên chưa từng setup chạy theo README và phản hồi.
- Chưa kiểm thử AI với Gemini key thật, OAuth, email và storage bên ngoài.
- Native vẫn phát cảnh báo rate-limit IPv6 từ code hiện có; health và login đạt.
- Root `.env` của checkout chính được setup tạo và giữ ngoài Git; cần điền
  `GEMINI_API_KEY`, chuyển credential dịch vụ và dùng lại mật khẩu DB cũ nếu
  tiếp tục sử dụng volume cũ. Các file env local cũ được giữ để chuyển cấu hình.

Xem [README](../README.md), [hướng dẫn Docker](DEPLOY_WITH_DOCKER.md) và
[danh mục biến](environment-variables.md) để tái hiện.
