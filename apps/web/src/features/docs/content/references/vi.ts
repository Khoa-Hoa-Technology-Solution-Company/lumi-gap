import { DOCS_SECTIONS as S } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { ReferencesSectionId } from "./index";

export const referencesVi: DocsModuleContent<ReferencesSectionId> = {
  groupHeading: "Tài liệu tham khảo",
  sections: {
    [S.references]: {
      heading: "Tài liệu tham khảo",
      summary: "Danh mục đầy đủ các nguồn, nhóm theo vai trò trong phương pháp, kèm loại tài liệu và trạng thái kiểm tra.",
      body: [
        {
          kind: "paragraph",
          text: "Mọi DOI được đối chiếu với Crossref (tác giả, năm, tên, nơi đăng). Tài liệu không có DOI được kiểm tra qua trang chính thức của tổ chức phát hành hoặc danh mục thư viện. Nguồn nào chưa kiểm tra được nội dung được đánh dấu **Chưa xác minh**.",
        },
        {
          kind: "bibliography",
          groups: [
            { role: "framework", heading: "Khung chính", intro: "Hai tài liệu của tổ chức chính phủ: NSF định nghĩa đại lượng đo (thị phần), USGS cung cấp phương pháp phát hiện và đo xu hướng." },
            { role: "method-origin", heading: "Nguồn gốc các phép tính", intro: "Bài báo và sách gốc của từng phép tính trong khung chính." },
            { role: "supplementary", heading: "Thông tin bổ sung và bối cảnh", intro: "Phương pháp cho từ khoá nổi lên, PP(top 10%) và bối cảnh tăng trưởng của khoa học. Không ảnh hưởng đến kết luận xu hướng." },
            { role: "data", heading: "Nguồn dữ liệu", intro: "Tài liệu của OpenAlex, nhà cung cấp dữ liệu đếm." },
          ],
        },
      ],
    },
  },
};
