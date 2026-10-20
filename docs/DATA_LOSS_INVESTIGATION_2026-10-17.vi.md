# Điều tra dữ liệu bài báo trống — 17/10/2026

## Kết quả kiểm tra trực tiếp

- Backend đang kết nối database `lumi_gap` trong PostgreSQL Docker.
- `SELECT count(*) FROM papers` trả về **0**.
- API danh sách bài báo và tìm kiếm đều trả về thành công, `meta.total = 0`.
- PostgreSQL vẫn gắn volume `lumi-gap_postgres-data`, được tạo ngày 06/10/2026. Container PostgreSQL cũng được tạo ngày 06/10; lần chạy Docker hiện tại dùng lại container và volume này.
- Root `.env` có thời điểm chỉnh sửa gần nhất ngày 07/10/2026; các thao tác Git trong cuộc trò chuyện không sửa file này.
- Thống kê tích lũy của bảng `papers`: `n_tup_ins = 5235`, `n_tup_del = 5235`. Đây là số lượt chèn/xóa, có bao gồm dữ liệu test; không phải số bài báo thực duy nhất.
- Lịch sử đồng bộ ngày 07/10 còn 3 lần chạy, tổng cộng ghi nhận 4.997 lượt thêm mới, với truy vấn `large language model education`. Lần chạy lớn nhất lấy 5.000 kết quả, từ năm 2022, tối đa 50 trang.

## Lỗi xóa dữ liệu đã tái hiện

File: `apps/backend/src/modules/communities/__tests__/community.persistence.test.ts`.

Phần `afterAll` trước khi sửa chứa:

```ts
await prisma.paper.deleteMany({ where: { id: researchIds.paper || undefined } });
```

ID mặc định là chuỗi rỗng và chỉ được gán ở một test nằm cuối suite. Nếu chạy một phần suite hoặc fixture chưa được tạo, Prisma bỏ điều kiện `id: undefined`; lệnh dọn dữ liệu trở thành xóa mọi bài báo.

Đây là cơ chế có thể gây đúng tình trạng dữ liệu hiện tại. PostgreSQL không bật ghi log câu lệnh SQL và không có audit ghi nhận lần xóa này, nên chưa thể xác định chính xác lần chạy nào đã xóa corpus thật. Không kết luận rằng lần `docker build` hoặc `docker compose up -d` vừa rồi đã thực thi test này.

## Bản sửa và bằng chứng

- Tách thao tác dọn bài báo thành `removeCreatedPaper` và bỏ qua thao tác xóa khi không có ID.
- Thêm kiểm tra hồi quy cho cả trường hợp chưa có ID và trường hợp chỉ được xóa đúng bài fixture.
- Tạo database QA riêng từ **cấu trúc** database hiện tại; không sao chép dữ liệu thật vào test và không chạy test trên `lumi_gap`.

| Kiểm chứng trên QA | Kết quả test | Bài báo độc lập sau khi dọn dữ liệu |
| --- | --- | --- |
| Code cũ, chỉ chạy test tạo cộng đồng | 1 PASS | Bị xóa: 0 bản ghi còn lại |
| Code đã sửa, test tạo cộng đồng và kiểm tra hồi quy | 2 PASS | Được giữ: 1 bản ghi còn lại |

Không chạy toàn bộ suite trên database thật. Các truy vấn điều tra dữ liệu thật dùng kết nối chỉ đọc; việc tạo và xóa database QA chỉ phục vụ kiểm chứng riêng.

## Khả năng phục hồi

- Người dùng xác nhận không có backup; chưa tìm thấy bản dump PostgreSQL trong workspace.
- PostgreSQL hiện không bật WAL archiving để phục hồi theo thời điểm.
- Git không chứa dữ liệu PostgreSQL và việc đổi nhánh không phục hồi được các dòng đã xóa.
- Có thể nạp lại corpus từ OpenAlex bằng truy vấn và giới hạn cũ. Đây là đồng bộ lại từ nguồn hiện tại, không phải khôi phục nguyên trạng; UUID nội bộ, metadata và quan hệ đến các bản ghi cũ có thể không còn như trước.
- Cuộc điều tra này chưa chạy đồng bộ lại, seed hoặc ghi thêm bài báo vào database thật.
