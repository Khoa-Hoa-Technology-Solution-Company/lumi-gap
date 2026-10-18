import { DOCS_SECTIONS as S, docsPath } from "../../docs-section-ids";
import type { DocsModuleContent } from "../../docs.types";
import type { IntroSectionId } from "./index";

export const introVi: DocsModuleContent<IntroSectionId> = {
  groupHeading: "Giới thiệu",
  sections: {
    [S.introReading]: {
      heading: "Cách đọc tài liệu",
      summary: "Tài liệu này giải thích mỗi con số trong LumiGap được tính thế nào, dựa trên nguồn nào và tin được đến đâu.",
      body: [
        {
          kind: "paragraph",
          text: "Mỗi chức năng phân tích có một nhóm mục riêng ở mục lục bên trái. Mỗi mục trả lời ba câu hỏi: **đại lượng này là gì**, **tính bằng công thức gì** và **có đáng tin không**.",
        },
        { kind: "heading", id: "structure", text: "Cấu trúc một mục" },
        {
          kind: "list",
          items: [
            "**Định nghĩa** bằng lời, ngắn gọn.",
            "**Công thức** trong khung chữ đơn cách, kèm phần *Trong đó:* giải thích từng ký hiệu.",
            "**Nhãn trạng thái** (xem [Nhãn trong tài liệu](" + docsPath(S.introLabels) + ")) cho biết một quy tắc là chuẩn đã công bố, suy ra toán học hay quy ước của dự án.",
            "**Nguồn**: liệt kê ở cuối mục; bấm vào tên nguồn để xem trích dẫn đầy đủ trong [Tài liệu tham khảo](" + docsPath(S.references) + ").",
          ],
        },
        { kind: "heading", id: "beginners", text: "Nếu bạn mới làm nghiên cứu" },
        {
          kind: "paragraph",
          text: "Đọc [Thuật ngữ](" + docsPath(S.glossary) + ") trước. Mục đó giải thích bằng lời thường các khái niệm như p-value, khoảng tin cậy, trung vị hay thị phần. Sau đó đọc [Ví dụ tính tay](" + docsPath(S.trendWorkedExample) + ") để thấy toàn bộ phép tính trên một chuỗi 6 năm.",
        },
        { kind: "heading", id: "citing", text: "Trích dẫn tài liệu này" },
        {
          kind: "paragraph",
          text: "Mỗi mục có địa chỉ riêng dạng `/docs/<mã-mục>` và mỗi tiêu đề nhỏ có neo `#<mã>`. Dùng nút sao chép liên kết cạnh tiêu đề để trích dẫn chính xác. Khi trích dẫn phương pháp trong bài viết của bạn, hãy trích dẫn **nguồn gốc** (ví dụ [@usgs-helsel-2020]) chứ không chỉ trang này.",
        },
      ],
    },
    [S.introTransparency]: {
      heading: "Nguyên tắc minh bạch",
      summary: "Không có kết luận nào trong LumiGap mà người dùng không thể tự kiểm tra lại.",
      body: [
        {
          kind: "list",
          ordered: true,
          items: [
            "**Mỗi kết luận có công thức.** Nhãn như \"xu hướng tăng\" được quyết định bởi một quy tắc viết rõ trên trang này, không phải do mô hình AI đánh giá.",
            "**Mỗi công thức có nguồn.** Ưu tiên tài liệu của tổ chức chính phủ và bài báo có bình duyệt; DOI được kiểm tra qua Crossref.",
            "**Tách chuẩn khỏi quy ước.** Ngưỡng nào do dự án tự chọn được ghi rõ là *Quy ước dự án*, kèm lý do.",
            "**Nói rõ hạn chế.** Mỗi phương pháp có mục hạn chế; dữ liệu không đủ thì hệ thống trả lời \"chưa đủ dữ liệu\" thay vì đoán.",
            "**Số liệu tái lập được.** Dữ liệu đếm lấy từ OpenAlex, một cơ sở dữ liệu mở; ai cũng có thể chạy lại cùng truy vấn.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "AI (mô hình ngôn ngữ) chỉ được dùng để diễn giải bằng lời khi người dùng yêu cầu. AI không quyết định nhãn xu hướng và không thay đổi con số thống kê.",
        },
      ],
    },
    [S.introLabels]: {
      heading: "Nhãn trong tài liệu",
      summary: "Các khung màu cho biết một quy tắc đến từ đâu.",
      body: [
        {
          kind: "callout",
          tone: "standard",
          text: "Phương pháp hoặc ngưỡng được dùng đúng như trong tài liệu đã công bố (sổ tay của chính phủ, bài báo có bình duyệt, giáo trình). Ví dụ: kiểm định Mann–Kendall, mức ý nghĩa α = 0,05.",
        },
        {
          kind: "callout",
          tone: "derived",
          text: "Không do ai chọn mà là hệ quả toán học của phương pháp. Ví dụ: với 4 năm, Mann–Kendall không thể cho p < 0,05.",
        },
        {
          kind: "callout",
          tone: "convention",
          text: "Lựa chọn của dự án LumiGap, có lý do nhưng không có tổ chức nào công bố. Ví dụ: cần ít nhất 30 bài. Bạn có thể không đồng ý với quy ước; vì vậy chúng được ghi rõ.",
        },
        {
          kind: "callout",
          tone: "limitation",
          text: "Điều phương pháp không làm được hoặc giả định có thể không đúng. Đọc phần này trước khi dùng kết quả cho quyết định quan trọng.",
        },
        {
          kind: "paragraph",
          text: "Mỗi nguồn trong [Tài liệu tham khảo](" + docsPath(S.references) + ") cũng có nhãn loại tài liệu (báo cáo thống kê của chính phủ, sổ tay kỹ thuật, bài báo có bình duyệt, giáo trình, tài liệu của nhà cung cấp dữ liệu) và trạng thái kiểm tra.",
        },
      ],
    },
  },
};
