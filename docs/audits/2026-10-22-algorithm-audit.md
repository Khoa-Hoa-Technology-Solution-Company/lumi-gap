# Rà soát lần hai: thuật toán và tính đúng đắn — 22/10/2026

Lượt này tiếp nối [audit đầu tiên](2026-10-22-code-audit.md), tập trung vào truy xuất bằng chứng, xếp hạng và dữ liệu số bất thường. Các thay đổi của người dùng và các bản sửa trước được giữ nguyên.

## Những chỗ đã sửa

| Khu vực | Vấn đề | Thay đổi |
| --- | --- | --- |
| MMR chọn bằng chứng cho research gap | Mỗi vòng chọn lại tính độ giống nhau với toàn bộ bài đã chọn, lặp lại nhiều phép cosine. | Giữ mức trùng lặp lớn nhất của từng ứng viên và chỉ cập nhật với bài vừa chọn. Với số bài ghim cố định, chi phí từ `O(n*k²*d)` xuống `O(n*k*d)`. Giữ thứ tự hòa điểm, không sửa input, không trả ID trùng; xử lý vector lỗi và relevance không hữu hạn. |
| Passage retrieval | Sau khi tìm document, mỗi bài phát sinh một truy vấn chunk và một lần lấy relation; relation lại bị quét lặp cho từng chunk. | Dùng PostgreSQL `LATERAL` lấy top-k riêng từng document trong một lô; lấy relation trong một lô tiếp theo; ghép bằng `Map`. Giữ giới hạn 60 relation riêng cho mỗi document, tránh để bài đầu chiếm hết giới hạn của bài sau. |
| Thang điểm RAG | Full text dùng cosine thô/keyword rank thô, trong khi metadata dùng các điểm đã chuẩn hóa. Điểm hai nguồn được trộn và chuyển tới MMR. | Đưa về `(1 + cosine) / 2` và `rank / (1 + rank)`; giữ trọng số 70/30 khi chọn passage. Các điểm cùng miền số, chưa được coi là xác suất liên quan. |
| Passage thiếu embedding | Cộng khoảng cách vector `NULL` làm toàn bộ điểm hỗn hợp thành `NULL`, đẩy đoạn có từ khóa phù hợp xuống cuối. Vector lưu toàn số 0 có thể tạo khoảng cách `NaN`. | Thiếu/không tính được cosine đóng góp semantic bằng 0; giữ đóng góp lexical và thứ tự hòa theo vị trí. |
| Query embedding | Retriever chỉ kiểm tra chiều vector có sẵn và không kiểm tra kết quả provider; dữ liệu lỗi có thể ném lỗi SQL hoặc trả điểm không hữu hạn. | Dùng chung kiểm tra số chiều, tính hữu hạn và vector khác 0; chuyển sang keyword khi vector không dùng được. Không gọi thêm provider để thử lại. |
| Paper score | Citation âm/`NaN`, năm vô hạn và data quality `NaN` có thể làm điểm lỗi hoặc thưởng recency không hợp lý. | Chuẩn hóa dữ liệu không hợp lệ; đầu ra hữu hạn trong `[0,1]`; kiểm tra năm tham chiếu. Giữ công thức, trọng số và version v3 cho dữ liệu hợp lệ. |
| Integration test gắn email | Assertion đếm toàn bộ bảng user có thể sai khi suite khác tạo tài khoản đồng thời. | Chỉ đếm tài khoản mang email đăng nhập/email công việc của ca kiểm thử; vẫn bắt trường hợp tạo tài khoản thứ hai thay vì gắn email vào user hiện tại. |

Quyền truy xuất được giữ qua điều kiện paper active, trạng thái/version index, source fingerprint và danh sách document đã được chọn. ID UUID/legacy và thứ tự bài đầu vào vẫn được hỗ trợ. Mảng toàn ID không hợp lệ trả về trước khi truy vấn database.

## Đo MMR trên máy local

Node `22.21.1`, vector 768 chiều, lambda `0.7`, hai bài ghim; dữ liệu giả lập xác định bằng seed `1729`. Mỗi cấu hình được warm up, chạy 5 lần xen kẽ thứ tự trước/sau và lấy median. Script so sánh danh sách **và thứ tự** chọn với thuật toán cũ.

| Ứng viên | Số bài chọn | Bản cũ | Bản mới | Nhanh hơn | Số cặp cosine cũ → mới |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 10 | 3,52 ms | 1,41 ms | 2,50 lần | 6.125 → 1.055 |
| 500 | 10 | 20,51 ms | 6,93 ms | 2,96 lần | 32.125 → 5.455 |
| 500 | 24 | 95,59 ms | 11,90 ms | 8,03 lần | 157.124 → 12.224 |

Số cặp trong bảng được tính từ số vòng lặp; thời gian là phép đo thực tế. Cấu hình 24 bài là stress case; mặc định `GAPS_TOP_K` là 10. Đây là CPU của bước MMR, không phải mức tăng tốc toàn bộ API hay pipeline LLM.

Chạy lại từ thư mục gốc:

```powershell
pnpm --filter backend exec tsx scripts/benchmark-gap-mmr.ts
```

## Kiểm thử hồi quy

- MMR được so với định nghĩa tính toàn bộ các cặp trên 30 bộ dữ liệu giả lập xác định, nhiều lambda, có/không ghim và thiếu embedding; kiểm tra thêm ties, duplicate, input không bị sửa và dữ liệu lỗi.
- Kiểm thử PostgreSQL thật xác nhận cosine song song/vuông góc/đối hướng cho điểm `1/0,5/0`, keyword rank trong `[0,1]`, top-k riêng từng document và thứ tự passage theo relevance.
- Mỗi bài vẫn được lấy tối đa 60 relation trong ca hai bài cùng có 65 relation; không lấy bằng chứng từ draft, index cũ, index chưa ready hoặc ngoài paper scope.
- Prisma query events xác nhận lấy bằng chứng cho một bài hoặc ba bài dùng cùng số câu lệnh SQL, tối đa 4 với Prisma hiện tại. Hàm dùng ba lần gọi Prisma thay cho `1 + 2*n`; các include của ORM có thể tạo thêm SQL nên không đồng nhất số lần gọi Prisma với số câu lệnh SQL.
- Kiểm thử numeric kiểm tra điểm hữu hạn, giới hạn, citation monotonic và dữ liệu ngoài miền; retriever kiểm tra vector từ caller/provider bị sai chiều, `NaN`, vô hạn hoặc toàn 0 mà vẫn fallback bằng từ khóa.

## Kết quả xác minh cuối

| Kiểm tra | Kết quả |
| --- | --- |
| Toàn bộ backend, 2 worker, bật integration học thuật/giảng viên/mentorship | **1.606 passed, 0 failed, 247 skipped** |
| Backend TypeScript typecheck | Qua |
| Backend production build | Qua |
| PostgreSQL-only runtime audit trong build | 4/4 test qua |
| Backend lint | 0 lỗi, 5 warning unused code có sẵn |
| Whitespace/diff check của các bản sửa | Qua |

Full suite chạy trên database `codex_algorithms_20261022_test` đã áp dụng 92 migration có sẵn và Redis tạm riêng ở port 16389. Các cờ `STUDENT_AFFILIATION_INTEGRATION`, `LECTURER_VERIFICATION_INTEGRATION`, `MENTORSHIP_INTEGRATION` được bật. Lượt bật integration đầu phát hiện lỗi đếm user giữa các suite; sau khi sửa, toàn bộ suite được chạy lại và qua. 247 test skipped không được tính là đã xác minh.

Log và JSON được giữ trong `apps/backend/test-results/codex-algorithms-*` (thư mục artifact bị gitignore). Database và Redis tạm được dọn sau kiểm tra; không chạy test trên database ứng dụng.

## Giới hạn

- Không thêm lời gọi AI hay thay đổi schema/migration.
- Chưa có bộ nhãn relevance để kết luận precision/recall của tìm kiếm tăng; các thay đổi được xác nhận về tính đúng đắn của công thức, provenance và chi phí thực thi.
- Không chạy giao dịch thật, deploy Jenkins hay end-to-end provider/UI trong lượt này. Frontend, Flutter và Python không có thay đổi mới trong lượt hai; kết quả của chúng thuộc audit đầu tiên.
- Không commit hoặc push. Gợi ý commit message: `perf: optimize MMR and batch scoped RAG evidence retrieval`.

## Kiểm tra bổ sung cùng ngày: giới hạn float32 của vector

Tái hiện bằng `SELECT` trên PostgreSQL/pgvector thật: vector một chiều khác 0 trong tổng 768 chiều có thành phần `1e100` gây lỗi `22003` (out of range); thành phần `1e30`, `1e-30` hoặc `Number.MIN_VALUE` làm khoảng cách cosine với chính nó thành `NaN`. Các giá trị này vẫn hữu hạn trong JavaScript, nên chỉ kiểm tra `Number.isFinite` và khác 0 chưa đủ.

Đã kiểm tra cả thành phần và tổng bình phương trong float32 bằng `Math.fround`, dùng chung ở query retrieval và ingestion. Query lỗi chuyển sang keyword; ingestion lỗi giữ nguyên các chunk cũ và đánh dấu failed, không xuất bản ready. Vector hợp lệ không đổi thang điểm hay thuật toán xếp hạng.

113 kiểm thử liên quan qua trên 12 file, gồm kiểm thử PostgreSQL, các giới hạn số mới và hồi quy MMR/paper score. Build production backend và lint các file sửa qua; PostgreSQL-only runtime audit 4/4 qua. Database `codex_followup_20261022_test` đã được dọn. Không chạy lại toàn bộ suite 1.606 test trong lượt bổ sung này; đó là kết quả của lượt xác minh đầy đủ phía trên.
