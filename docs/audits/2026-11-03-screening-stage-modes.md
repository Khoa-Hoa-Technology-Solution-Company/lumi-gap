# Screening hai Reviewer theo giai đoạn

Ngày kiểm tra: 03/11/2026. Nhánh: `screening-adjudication-synthesis-20261102`.

## Phạm vi đã triển khai

- Protocol v11 lưu rõ `SINGLE_STAGE` hoặc `TWO_STAGE`. Chủ dự án chọn tại Quy trình review. Cấu hình mới áp dụng cho vòng mới; snapshot của các vòng đã tạo giữ nguyên.
- `evaluateScreeningPair` là hàm tính kết quả chung cho recompute và phân loại bất đồng. Chỉ nhận các phiên bản phiếu đã gửi đang hiệu lực, cùng vòng, từ hai reviewer khác nhau.
- Chưa đủ hai phiếu không có kết luận nhóm và không mở phiếu độc lập của người còn lại.
- Hai phiếu loại cần tiêu chí thực tế và nguồn hợp lệ. Vòng toàn văn cần vị trí nguồn; khác tiêu chí loại phải được giải quyết.

P = Phù hợp, K = Không phù hợp, C = Chưa chắc chắn. Bảng giả định nguồn và tiêu chí hợp lệ.

| Hai phiếu | Một giai đoạn | Hai giai đoạn: tiêu đề/tóm tắt | Hai giai đoạn: toàn văn |
| --- | --- | --- | --- |
| P + P | Chấp nhận cuối | Chuyển toàn văn | Chấp nhận cuối |
| P + K | Bất đồng | Bất đồng | Bất đồng |
| K + P | Bất đồng | Bất đồng | Bất đồng |
| K + K | Loại | Loại | Loại sau đối chiếu lý do |
| P + C | Cần làm rõ | Chuyển toàn văn | Cần làm rõ |
| C + P | Cần làm rõ | Chuyển toàn văn | Cần làm rõ |
| C + C | Cần làm rõ | Chuyển toàn văn | Cần làm rõ |
| K + C | Cần giải quyết | Bất đồng | Cần làm rõ |
| C + K | Cần giải quyết | Bất đồng | Cần làm rõ |

## Toàn văn, sửa phiếu và phân xử

- Qua tiêu đề/tóm tắt trong TWO_STAGE chưa vào danh sách Được chấp nhận. Chưa có PDF hoặc nguồn toàn văn thì chờ `WAITING_FULLTEXT`, không tạo nhiệm vụ reviewer vòng hai.
- Chủ dự án/người đề xuất được bổ sung PDF qua chức năng tải tài liệu hiện có, rồi xác nhận mở vòng hai. Backend kiểm tra quyền, phiên bản và nguồn; xử lý đồng thời không tạo hai vòng.
- Vòng tiếp theo có bộ phiếu độc lập mới. DOI/trang giới thiệu không tự được coi là nguồn toàn văn.
- Sửa phiếu trước kết quả chốt giữ lịch sử, tính lại kết quả và đóng hồ sơ chưa khóa nếu đã thống nhất hợp lệ. Protocol mới cho sửa căn cứ dù giữ kết luận.
- Form sửa phiếu toàn văn giữ và cho đối chiếu lại vị trí nguồn; giữ các liên kết RQ. Thiếu nguồn không gửi được.
- Mở lại cần quyền và lý do. Các vòng phụ thuộc mất hiệu lực hiện tại nhưng vẫn giữ phiếu, quyết định và dấu vết lịch sử; thu hồi quyền phân xử cũ.
- Hồ sơ chung chống trùng, hai bên có hạn chung 48 giờ theo cấu hình và được dùng ý kiến đã ghi hoặc bổ sung riêng. Hết hạn không coi im lặng là đồng ý.
- Sau khóa, phân công trực tiếp người độc lập đủ quyền, bao gồm Lecturer phù hợp. Chưa có người hợp lệ thì chờ phân công. Quyết định phân xử riêng, không có phiếu thứ ba hoặc chat ba người.
- Kết quả cần thêm thông tin tạo việc tiếp theo cho đúng vai trò. Việc của tôi/Tasks dùng dữ liệu backend, tách phiếu cá nhân và kết quả nhóm. Chat reviewer đã lưu vẫn đọc được sau khi chốt.

## Migration và tương thích

Migration viết tay: `20261103180000_screening_stage_mode`.

Chỉ thêm trường nullable `screening_settings.screening_mode`, kiểm tra giá trị và bổ sung trạng thái chờ toàn văn vào constraint. Không sửa các snapshot JSON hay kết quả lịch sử. Cấu hình cũ không có mode tiếp tục dùng quy tắc đã đóng băng đến khi chủ dự án lưu rõ mode cho vòng mới.

Không chạy `prisma migrate dev`, không reset dữ liệu ứng dụng. Các test ghi dữ liệu chạy trong database PostgreSQL cô lập.

## Kiểm tra thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| `node apps/backend/scripts/test-screening-workflow.mjs` | 210/210, 6 suite |
| `node apps/backend/scripts/test-screening-cases.mjs` | 38/38, 1 suite |
| Vitest web: workspace, case, adjudication, conflict-resolution, paper-card, my-work-model, team-tasks, discussion, mentor-conversation | 171/171, 9 suite |
| Backend `pnpm exec tsc -p tsconfig.build.json` | Thành công |
| Web `pnpm build` (tsc + Vite) | Thành công, build lại sau sửa form nguồn toàn văn |
| Giao diện cô lập: A/B × chờ toàn văn/cần làm rõ/đã chốt × 1280/390 px | 12 lượt đạt, không lỗi JS hoặc tràn ngang |
| Migration trong container ứng dụng | 131 migration, schema up to date |
| `GET http://localhost:4000/ready` | 200; PostgreSQL và Redis sẵn sàng |
| Index localhost và bản build | Khớp hoàn toàn; 8 asset đầu trang trả 200 |
| API Project không có token | 401 |

Các test PostgreSQL bao gồm toàn bộ 27 tổ hợp, 0/2 và 1/2, giữ kín phiếu, sửa/chốt/mở lại, thiếu nguồn/tiêu chí, khóa hồ sơ và hết hạn, phân công Lecturer, thao tác đồng thời và bảo toàn lịch sử vòng phụ thuộc.

Ghi chú build: sửa tương thích type/Prisma tối thiểu trong file `scientific-integrity.service.ts` có sẵn để backend biên dịch được. Không đưa module không liên quan này vào bản cập nhật container Screening.

## Cập nhật localhost và giới hạn

- Đã sao lưu runtime backend và index trước khi cập nhật; giữ asset băm cũ cho tab đang mở.
- Đã cập nhật các module Screening, DTO, eligibility, Prisma client và web. Backend runtime khớp SHA-256 của bản đã biên dịch; index web khớp bản build cuối.
- Docker từng lỗi 500 sau khi chép bản đầu; sau khởi động lại đã kiểm tra lại `/ready`, migration và asset. Không xóa volume hoặc dữ liệu.
- Log tại `apps/backend/scratch/stage-workflow-final.log`, `stage-case-regression.log`, `stage-deployment.log`, `stage-live-smoke.json`; web tại `apps/web/scratch/stage-web-final.log`, `stage-web-build-final.log`, `stage-browser.log`, ảnh trong `stage-ui/`.
- Tab browser kiểm tra trực tiếp chưa đăng nhập nên chỉ xác nhận được chặn truy cập Project. Không thực hiện gửi phiếu hay chốt bài thật bằng tài khoản người dùng. Các luồng nghiệp vụ và quyền đã kiểm tra bằng test PostgreSQL và UI cô lập.
- Chưa commit hoặc push trong nhiệm vụ này.

## Rà soát bổ sung

Đã kiểm tra tiếp theo yêu cầu rà soát thêm và sửa ba điểm ở web:

1. `fixedScope` trong `AssessmentContextFields` trước đây khóa cả ô nguồn toàn văn và các ô chọn RQ. Nay chỉ cố định giai đoạn; các trường căn cứ vẫn nhập được theo quyền. `disabled` tiếp tục khóa trường khi không có quyền hoặc đang lưu.
2. Khi sửa phiếu đã nộp trước khi reviewer thứ hai gửi, form trước đây khởi tạo nguồn/RQ rỗng. Nay điền lại từ phiếu của chính người dùng và gửi đúng các liên kết đã lưu.
3. Nội dung hướng dẫn lấy theo classification của backend: phân biệt cần làm rõ thông tin, cần thống nhất tiêu chí loại và bất đồng kết luận. Giới hạn trường nguồn trong form sửa phiếu được đồng bộ với backend ở 1.000 ký tự.

Hai test qua form Toàn văn (gửi mới và sửa phiếu) thất bại trước bản sửa vì trường nguồn bị disabled, sau đó đều đạt. Thêm ba trường hợp kiểm tra hướng dẫn theo classification.

Lượt hồi quy bổ sung: **205/205 test, 10 suite**, gồm 9 suite Screening trước đó và `project-literature-flow`. Log: `apps/web/scratch/stage-extra-before.log`, `stage-extra-after.log`, `stage-extra-final.log`. Backend giữ nguyên bản đã kiểm tra 248 test trước đó; không áp dụng migration mới.

Build web bổ sung thành công (`stage-extra-build.log`). Kiểm tra phát hành phát hiện đường dẫn `resolve(..., 'directory/.')` làm mất phần `/.`, khiến Docker chép thành thư mục lồng. Đã sửa script chép nội dung thư mục, cập nhật lại asset và Prisma client đúng vị trí, rồi khởi động lại backend. Chỉ đối chiếu hash của service ở lượt đầu chưa đủ để phát hiện client cũ; lượt này đã đối chiếu thêm hash của `dist/generated/prisma/internal/class.js`, khớp hoàn toàn.

Xác nhận sau cập nhật: `/ready` 200, index khớp build, cả 8 asset đầu trang trả 200 (`stage-extra-live-smoke.json`). Truy vấn `screeningMode` bằng Prisma client trong container và đọc cấu hình qua `screeningService.config` thành công; cấu hình cũ vẫn giữ mode null/workflow v10. Không sửa dữ liệu Project trong bước xác nhận này.
