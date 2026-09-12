# Hướng Dẫn Cài Đặt và Khởi Chạy Hệ Thống
## Tài liệu hướng dẫn dành cho Nhà phát triển & Giám khảo đồ án

---

## 1. Giới thiệu chung
Hệ thống **LiemResearch** (Hệ thống phân tích xu hướng nghiên cứu khoa học bằng AI) là một ứng dụng monorepo sử dụng **Turborepo** và **pnpm** để quản lý nhiều gói ứng dụng (packages) bao gồm:
*   `apps/backend`: Server REST API (Express, Mongoose).
*   `apps/web`: Ứng dụng client giao diện quản trị và nghiên cứu (React, Vite, TailwindCSS, shadcn/ui).
*   `apps/mobile`: Ứng dụng điện thoại dành cho nhà nghiên cứu (Expo, React Native).
*   `packages/shared-types`: Chứa định nghĩa kiểu TypeScript dùng chung cho toàn bộ dự án.

---

## 2. Yêu cầu chuẩn bị (Prerequisites)
Trước khi cài đặt, hãy đảm bảo máy tính của bạn đã được cài đặt các công cụ sau:
1.  **Node.js**: Phiên bản `>= 20.0.0` (Khuyên dùng bản LTS mới nhất).
2.  **pnpm**: Phiên bản `>= 11.0.0` (Công cụ quản lý gói bắt buộc của dự án).
    *   *Cách cài đặt nhanh:* Chạy lệnh `npm install -g pnpm`.
3.  **Docker & Docker Compose**: Dùng để chạy Redis container (phục vụ hàng đợi BullMQ xử lý tác vụ nền cho AI Report và Research Gaps).

---

## 3. Cấu hình biến môi trường (Environment Variables)

Hãy tạo hoặc chỉnh sửa file cấu hình môi trường `.env` theo hướng dẫn dưới đây.

### 3.1 Cấu hình cho Backend (`apps/backend/.env`)
Tạo file `.env` nằm trong thư mục `apps/backend/` và cấu hình các biến sau:
```env
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173

# Kết nối MongoDB (Atlas hoặc Local)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/publication_trend?retryWrites=true&w=majority

# Kết nối Redis (Dùng cho hàng đợi BullMQ và Cache)
REDIS_URL=redis://127.0.0.1:6379

# Google Gemini API Key & Model (Bắt buộc để chạy Vector Embeddings & RAG Reports)
# Lấy key miễn phí tại: https://aistudio.google.com/
GEMINI_API_KEY=AIzaSyD...
GEMINI_MODEL_FAST=gemini-3.5-flash
GEMINI_MODEL_DEEP=gemini-2.5-pro
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768

# Cấu hình bảo mật JWT
JWT_ACCESS_SECRET=your_super_secret_jwt_access_key_minimum_32_characters
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key_minimum_32_characters
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Giới hạn số lượng báo cáo tạo ra tối đa
REPORT_MAX_PENDING_PER_USER=2
REPORT_MAX_PER_HOUR=10
```

### 3.2 Cấu hình cho Frontend Web (`apps/web/.env`)
Tạo file `.env` nằm trong thư mục `apps/web/` để định nghĩa cổng kết nối API:
```env
VITE_API_URL=http://localhost:4000/api/v1
```

---

## 4. Các bước cài đặt và khởi chạy dự án

Mở terminal tại thư mục gốc của dự án (`LiemResearch/`) và thực hiện các bước sau:

### Bước 1: Khởi động cơ sở dữ liệu hàng đợi Redis
Chạy lệnh sau để khởi chạy Redis Container ở chế độ nền (Docker cần đang chạy):
```bash
pnpm docker:up
```
*(Nếu muốn dừng Redis sau khi test xong, bạn có thể chạy `pnpm docker:down`)*.

### Bước 2: Tải và cài đặt các thư viện liên kết (Dependencies)
Thực hiện cài đặt tất cả các gói thư viện cho các dự án con chỉ với 1 lệnh ở thư mục gốc:
```bash
pnpm install
```

### Bước 3: Chạy dự án ở chế độ phát triển (Development Mode)
Bạn có hai cách để khởi chạy dự án:

*   **Cách 1: Khởi chạy toàn bộ hệ thống (Khuyên dùng)**
    Chạy lệnh sau để khởi động đồng thời cả frontend web, backend API, các workers (gaps, reports):
    ```bash
    pnpm dev
    ```
*   **Cách 2: Khởi chạy độc lập từng ứng dụng**
    Mở các tab terminal riêng biệt và chạy các lệnh tương ứng:
    *   Khởi chạy riêng Backend API (cổng `4000`): `pnpm dev:backend`
    *   Khởi chạy riêng Frontend Web (cổng `5173`): `pnpm dev:web`

Sau khi chạy thành công, truy cập **http://localhost:5173** trên trình duyệt để trải nghiệm hệ thống. Xem tài liệu hướng dẫn API tương tác tại **http://localhost:4000/api-docs**.

---

## 5. Khắc phục lỗi thường gặp (Troubleshooting)

### 5.1 Lỗi hết hạn hoặc sai API Key Gemini (`GEMINI_API_KEY_ERROR`)
*   **Triệu chứng:** Khi tìm kiếm Semantic Search, hệ thống trả về màn hình đỏ cảnh báo lỗi khóa API key, hoặc khi tạo AI Report báo cáo bị chuyển trạng thái `Failed`.
*   **Cách xử lý:**
    1. Truy cập vào [Google AI Studio](https://aistudio.google.com/) để tạo một API key mới.
    2. Cập nhật lại giá trị `GEMINI_API_KEY` trong file `apps/backend/.env`.
    3. Khởi động lại server backend.
    4. *Mẹo:* Trong khi chưa cập nhật key, bạn có thể bấm nút **"Chuyển sang Tìm kiếm Từ khóa (Keyword Mode)"** trên trang Tìm kiếm để sử dụng công cụ tìm kiếm nội bộ MongoDB không cần API key.

### 5.2 Lỗi kết nối Redis (`ECONNREFUSED 127.0.0.1:6379`)
*   **Triệu chứng:** Backend crash hoặc báo lỗi không thể kết nối tới hàng đợi tác vụ khi tạo báo cáo hoặc phân tích khoảng trống nghiên cứu.
*   **Cách xử lý:**
    1. Đảm bảo ứng dụng **Docker Desktop** đã được mở và đang chạy.
    2. Chạy lại lệnh `pnpm docker:up` để kích hoạt container.
    3. Kiểm tra xem cổng `6379` có bị ứng dụng khác trên máy chiếm dụng hay không.
