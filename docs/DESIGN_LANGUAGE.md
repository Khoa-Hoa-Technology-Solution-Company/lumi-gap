# LumiGap — Design Language

> Hướng dẫn visual cho web app (`apps/web`). Giá trị token thật nằm trong `apps/web/src/theme/globals.css` và `apps/web/tailwind.config.js`; khi tài liệu này khác code thì code đúng.

---

## 1. Brand & Mood

**Personality:** Serious · Trustworthy · Data-driven · Premium-academic
**Reference vibes:** Google Scholar (information density) + Notion (clarity) + Linear (polish) + Stripe Dashboard (data charts)
**Product screens:** Giữ mật độ thông tin và sự tập trung cho tìm kiếm, đọc tài liệu, dashboard và biểu mẫu.
**Homepage / landing:** Cho phép bố cục giàu chiều sâu, hình ảnh, kết nối bằng chứng và tương tác rõ ràng, dùng cùng nhận diện LumiGap. Academic không đồng nghĩa với thiết kế sơ sài hoặc giao diện cũ.
**Avoid:** Màu ngoài nhận diện · Gradient noise · Chuyển động làm gián đoạn việc đọc · Card grid lặp lại không có mục đích

**1-câu mô tả:**
> *"A research tool that respects researchers' time — dense information, calm aesthetics, and accessible in any lighting condition."*

---

## 2. Color Palette

Project hỗ trợ **cả light + dark mode** (toggle qua `next-themes`). Mỗi mode có 1 palette riêng nhưng cùng visual identity.

### 2.1. Light Mode (Default — đọc paper dài)

**Quy tắc nền:** Nền trang và bề mặt trắng mặc định phải là trắng tinh `#FFFFFF`.
Không dùng trắng ngả vàng, kem, ivory, beige hoặc trắng ấm, trừ khi người dùng
yêu cầu rõ ràng. Bề mặt phụ cần phân cấp có thể dùng xám trung tính; không tự
pha sắc vàng vào nền. Quy tắc này áp dụng cho các thiết kế và chỉnh sửa UI sau này.

Token thật (CSS variables, định dạng HSL của shadcn, `:root` trong `globals.css`):

```
--background / --card / --popover   0 0% 100%          trắng tinh
--foreground                        222.2 84% 4.9%     gần đen xanh navy
--primary                           222.2 47.4% 11.2%  navy đậm (nút chính)
--primary-foreground                210 40% 98%
--secondary / --muted / --accent    210 40% 96.1%
--muted-foreground                  215.4 16.3% 46.9%
--destructive                       0 84.2% 60.2%
--border / --input                  214.3 31.8% 91.4%
--ring                              222.2 84% 4.9%
--radius                            0.5rem
```

### 2.2. Dark Mode (Premium feel — code at night)

Token thật (`.dark` trong `globals.css`):

```
--background / --card / --popover   222.2 84% 4.9%     navy rất đậm, không dùng đen thuần
--foreground                        210 40% 98%
--primary                           210 40% 98%
--primary-foreground                222.2 47.4% 11.2%
--secondary / --muted / --accent    217.2 32.6% 17.5%
--muted-foreground                  215 20.2% 65.1%
--destructive                       0 62.8% 30.6%
--border / --input                  217.2 32.6% 17.5%
--ring                              212.7 26.8% 83.9%
```

### 2.3. Biểu đồ và badge điểm AI

Bảng màu biểu đồ (Recharts) và thang màu badge điểm AI không được định nghĩa thành token trong `globals.css`; màu nằm trong từng component. Bảng hex trước đây trong tài liệu này không khớp code nên đã bị gỡ. Khi thêm màu mới cho series hoặc badge, đặt thành token và ghi lại ở đây; luôn kèm số hoặc icon, không truyền đạt thông tin chỉ bằng màu.

---

## 3. Typography

### 3.1. Font Family

```
Primary:    Source Sans 3 (self-hosted) — UI text, headings
Body:       Source Sans 3 — abstracts, descriptions
Mono:       system monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`) — code, citation IDs, DOIs; no mono webfont is bundled
```

Source Sans 3 là font đang được ứng dụng tải và sử dụng qua `--forum-font`. Dùng cùng font cho homepage và workspace; tạo khác biệt bằng scale, weight và layout. Không tự đổi sang Georgia/Times hoặc font serif để mô phỏng một ảnh tham khảo.

### 3.2. Type Scale

| Token | Size | Line height | Weight | Use case |
|---|---|---|---|---|
| `display`  | 48px | 56px | 700 | Hero titles (landing) |
| `h1`       | 36px | 40px | 700 | Page titles (Dashboard, Search) |
| `h2`       | 30px | 36px | 600 | Section titles |
| `h3`       | 24px | 32px | 600 | Card titles, paper titles in detail |
| `h4`       | 20px | 28px | 600 | Subsections |
| `body-lg`  | 18px | 28px | 400 | Paper abstracts (long reading) |
| `body`     | 16px | 24px | 400 | Default body text |
| `body-sm`  | 14px | 20px | 400 | Metadata, captions |
| `caption`  | 12px | 16px | 500 | Labels, badges, timestamps |
| `mono`     | 14px | 20px | 400 | DOIs, IDs, citation refs |

### 3.3. Reading Rules (Academic Specific)

- **Abstract text:** body-lg (18px) — readers will spend 30s-2min per abstract
- **Long article body** (AI report): body (16px) with 1.6 line-height
- **Max line length:** 75ch (prevents eye fatigue on 30+ page reports)
- **Vietnamese:** Source Sans 3 supports đầy đủ — kiểm tra dấu và xuống dòng trong ảnh chụp thật

---

## 4. Spacing

Follow **8px grid** (Tailwind default). Each step doubles.

| Token | Value | Use case |
|---|---|---|
| `1`  | 4px  | Tight (icon-text gap, badge padding) |
| `2`  | 8px  | Close (button padding-y, list gap) |
| `3`  | 12px | Normal (input padding) |
| `4`  | 16px | Default (card padding, paragraph gap) |
| `6`  | 24px | Section (card-to-card, h-to-body) |
| `8`  | 32px | Page padding (container x-padding) |
| `12` | 48px | Hero section vertical |
| `16` | 64px | Major section break |

**Page container:**
- Desktop: `max-w-7xl` (1280px) + `px-8` (32px gutter)
- Tablet: `px-6` (24px gutter)
- Mobile: `px-4` (16px gutter)

---

## 5. Border Radius

```
sm    calc(var(--radius) - 4px) = 4px
md    calc(var(--radius) - 2px) = 6px
lg    var(--radius)             = 8px   (cards, inputs, buttons)
xl+   Tailwind defaults (12px, 16px, ...) for modals and large surfaces
full  9999px avatars, pills, status dots
```

**Trong CSS:** `--radius: 0.5rem` (8px) trong `globals.css`; `tailwind.config.js` suy ra `sm/md/lg` từ biến này.

---

## 6. Shadows (Light Mode Only)

Dark mode KHÔNG dùng shadow — dùng `border` để phân biệt elements.

```
shadow-xs    0 1px 2px rgba(0,0,0,0.05)         Default card resting state
shadow-sm    0 1px 3px rgba(0,0,0,0.1)          Hover state
shadow-md    0 4px 6px rgba(0,0,0,0.1)          Dropdown, popover
shadow-lg    0 10px 15px rgba(0,0,0,0.1)        Modal, dialog
shadow-xl    0 20px 25px rgba(0,0,0,0.1)        Hero image overlay
```

---

## 7. Component Patterns

### 7.1. Paper Card (Search Results)

```
┌─────────────────────────────────────────────────────────────┐
│  Title (h3, 24px, semibold, max 2 lines, ellipsis)          │
│  Authors · Journal · 2024                            [42] ★ │
│                                                              │
│  Abstract preview (body, 2 lines, line-clamp-2)...           │
│                                                              │
│  [LLM] [Education]   AI Score: 0.87 ●●●●●○         [Save] [→]│
└─────────────────────────────────────────────────────────────┘
```
- Card border 1px, rounded-lg
- Hover: subtle shadow-sm (light) / brighter border (dark)
- Click: → Paper Detail page

### 7.2. Trend Chart Card

```
┌─ Publications about "LLM in Education" ────────────────────┐
│                                                              │
│     [Line chart, X=year, Y=count, primary color]            │
│                                                              │
│  Total: 1,247 papers   ↑ 340% YoY                            │
└─────────────────────────────────────────────────────────────┘
```
- Chart: Recharts, no gridlines on light, soft on dark
- Axis labels: caption (12px) muted-foreground

### 7.3. AI Report Citation

Inline trong markdown:
```
"...recent LLMs show 45% improvement [1]. Vietnamese researchers..."
                                       ^
                            Hoverable footnote
                            Click → scroll to ref
```
- Citation `[1]` is mono font, primary color, underline on hover
- Footnote at bottom: links to paper in search

### 7.4. Empty States

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              📄 (lucide-react icon, 48px)                    │
│                                                              │
│           No papers found                                    │
│           Try adjusting your search filters                  │
│                                                              │
│                  [Clear filters]                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.5. Loading States

**KHÔNG dùng spinner** cho lists. Dùng skeleton:

```
┌─────────────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                  │
│  ▓▓▓▓▓ · ▓▓▓▓▓▓ · ▓▓▓▓                                     │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                  │
└─────────────────────────────────────────────────────────────┘
```
- Pulse animation: 1.5s loop
- Match real layout dimensions

---

## 8. Animation Principles

| Use case | Duration | Easing |
|---|---|---|
| Button hover | 150ms | ease-out |
| Modal open | 200ms | ease-out (fade + scale 0.95 → 1) |
| Tooltip | 100ms | ease-out |
| Page transitions | Instant by default; project section changes use a 200ms opacity reveal, as requested |
| Skeleton pulse | 1500ms loop | ease-in-out |
| Toast slide-in | 250ms | spring |

**Tránh trong màn hình làm việc:**
- ❌ Decorative parallax
- ❌ Auto-playing carousels
- ❌ Spring physics trên cards (academic ≠ playful)

Homepage có thể dùng carousel tự lướt khi người dùng yêu cầu. Phải có nút dừng, dừng khi hover/focus, tôn trọng reduced motion và ngừng khi khu vực không được nhìn thấy. Hover, reveal và kết nối trực quan được phép nếu giúp khám phá nội dung.

### Homepage visual contract (2026-10-13)

- Dùng semantic tokens `--home-*` trong `apps/web/src/features/home/home.css` và font `--forum-font`. Nền trắng/xanh lạnh, chữ navy, accent xanh LumiGap. Không dùng nền kem, nâu hoặc bảng màu pastel riêng cho một section.
- Dùng ảnh tham khảo để hiểu bố cục, không sao chép nhận diện của website khác. Ý tưởng tiêu đề trung tâm với nội dung bao quanh phải được chuyển thành ngôn ngữ trực quan của LumiGap.
- Section câu hỏi cần thể hiện mối liên hệ giữa câu hỏi, chủ đề và bằng chứng: đường kết nối nhẹ, thẻ có phân cấp rõ, CTA nổi bật và chiều sâu có kiểm soát. Tránh các hộp nhỏ giống nhau rải trên một vùng trống lớn.
- Chữ display có thể lớn hơn type scale của dashboard. Chữ nội dung và câu hỏi vẫn dễ đọc; không dùng chữ metadata bé để thay cho nội dung chính.
- Hover/focus có thể làm thẻ nổi rõ và mở hướng khám phá. Không dùng chuyển động nền liên tục làm mất tập trung.
- Kiểm tra screenshot ở desktop, laptop nhỏ và điện thoại; không chồng nội dung trung tâm, không tràn ngang document. Mobile có thể đổi phần bao quanh thành một dải thẻ kéo ngang.

---

## 9. Iconography

**Library:** `lucide-react` (đã install). Stroke-based, consistent 24px default.

Common icons trong project:
```
Search          search
Paper           file-text
Author          user
Journal         book-open
Citation        quote
Bookmark        bookmark
Follow          bell
Trend up        trending-up
AI / sparkle    sparkles
Filter          sliders-horizontal
Theme toggle    sun / moon
Logout          log-out
```

Rule: **icon size = font size × 1**. body text 16px → icon 16px (h-4 w-4).

---

## 10. Accessibility Baseline

- **Contrast:** All text ≥ WCAG AA (4.5:1 for body, 3:1 for h1-h4)
- **Focus rings:** Visible 2px ring on `:focus-visible` (default shadcn)
- **Keyboard nav:** Tab order logical, escape closes modals
- **Screen reader:** All interactive elements have labels (icon-only buttons → `aria-label`)
- **Color reliance:** NEVER convey info by color alone — pair with icon/text (AI Score badge has color + number)

---

## 11. Mobile (Flutter)

Mobile client là Flutter (`apps/flutter_mobile`, Dart); app React Native/Expo cũ đã bị gỡ. Màu của mobile nằm trong `apps/flutter_mobile/lib/core/theme/app_colors.dart` và không tự đồng bộ với CSS variables của web, nên đổi màu phải sửa cả hai nơi.

- Team test trên Android (emulator hoặc thiết bị thật); code Flutter vẫn đa nền tảng.
- Touch target tối thiểu 48dp (Material 3).
- Giữ các nguyên tắc chung: skeleton thay spinner cho danh sách, không truyền đạt thông tin chỉ bằng màu, hỗ trợ light và dark.

---

## 12. Implementation Checklist

Trước khi build component mới, đối chiếu:

- [ ] Color tokens dùng từ CSS variables, KHÔNG hard-code hex
- [ ] Spacing dùng Tailwind classes (p-4, gap-6...), KHÔNG `style={{padding}}`
- [ ] Typography token (text-base, text-lg...), KHÔNG `style={{fontSize}}`
- [ ] Component dùng shadcn primitive nếu có (Button, Card, Input...)
- [ ] Test cả light + dark mode (`<html class="dark">`)
- [ ] Responsive (sm:, md:, lg: breakpoints)
- [ ] Có loading state (skeleton)
- [ ] Có empty state (cho lists)
- [ ] Có error state (cho async)
- [ ] Keyboard accessible

---

## 13. Tham Khảo Bên Ngoài (Inspirations)

| Aspect | Reference |
|---|---|
| Information density | Google Scholar, arXiv |
| Card design | Notion database views |
| Dark mode aesthetic | Linear, Vercel dashboard |
| Charts | Stripe Dashboard, Posthog |
| AI report layout | Notion AI, Perplexity answers |
| Search filters | Algolia, GitHub code search |

---

## 14. Source of Truth Cho Theme

CSS variables nằm trong:
```
apps/web/src/theme/globals.css                       (web — đã wire next-themes)
apps/flutter_mobile/lib/core/theme/app_colors.dart   (mobile Flutter)
```

Đổi màu web → sửa `globals.css`; component dùng token sẽ tự cập nhật. Mobile sửa riêng trong file Dart.

---

## 15. Decision Log

### Project workspace (2026-10-13)

- Danh sách dự án nằm bên trái để đổi dự án và mở nội dung ngay bên phải.
  `/projects` mở sẵn dự án cập nhật gần nhất chưa lưu trữ. Dùng tab ngang cho
  các mục của dự án; trên điện thoại hoặc vùng nội dung hẹp, dùng select có nhãn.
  Trên điện thoại, danh sách dự án cũng chuyển thành bộ chọn phía trên nội dung.
- Danh sách dự án trình bày tên, mục tiêu và thao tác mở dự án rõ ràng; số bài báo
  và thành viên là dữ liệu thực, không thêm biểu đồ hoặc số liệu trang trí.
- Tiêu đề dự án 36px desktop, 32px mobile; nội dung và thao tác chính 16–18px.
  Giữ Source Sans 3 và màu xanh/navy LumiGap, có light/dark cùng cấu trúc.
- Empty state phải có đường bắt đầu: tìm tài liệu, chọn bài đã lưu hoặc thêm DOI.
  Căn trái lời giới thiệu và nút tìm chính; bài đã lưu và DOI là hai hàng thao tác
  phụ có mô tả cụ thể. Tiêu chí sàng lọc và hướng dẫn nằm cạnh phần thêm tài liệu
  trên màn hình rộng, chuyển xuống dưới khi vùng nội dung hẹp.
- Literature dùng xanh cho tìm bài và DOI, cam dịu cho bài đã lưu và tiêu chí
  sàng lọc. Nhấn màu ở icon, thao tác và trạng thái hover/focus; tiêu đề navy,
  nội dung trung tính, nền trang trắng tinh. Không phủ màu rộng lên workspace.
- Bài báo trong dự án hiển thị thành các hàng rộng, không chia đôi danh sách
  và phần đọc. Toolbar chỉ giữ tìm kiếm và một bộ chọn trạng thái sàng lọc;
  mặc định xếp theo bài mới thêm. Số lượng chỉ xuất hiện ở dòng tóm tắt dưới
  tiêu đề, không lặp bằng thẻ thống kê, tab trạng thái hay thanh tiến độ.
  Không thêm bộ lọc nâng cao và bộ chọn sắp xếp nếu chưa được yêu cầu.
  Bấm vào bài mở cửa sổ đọc với tóm tắt, ghi chú và quyết định
  sàng lọc. Cửa sổ nền trắng tinh ở light mode, chữ nội dung 16–17px; phần đọc
  cuộn độc lập để thao tác sàng lọc luôn nhìn thấy. Checkbox chọn nhiều bài
  tách khỏi thao tác mở bài; đóng cửa sổ trả focus về hàng đã chọn hoặc ô tìm.
- Sidebar dự án ưu tiên ô tìm kiếm, sau đó là danh sách sắp theo cập nhật gần nhất.
  Chỉ giữ tiêu đề, nút Tạo, ô tìm và danh sách; không thêm bảng lọc quyền sở hữu,
  trạng thái hay sắp xếp trừ khi người dùng yêu cầu. Bỏ tham số lọc cũ trong URL
  để tránh ẩn dự án khi không còn điều khiển tương ứng. Tìm kiếm hỗ trợ nhiều từ
  không cần đúng thứ tự, khoảng trắng thừa hoặc dấu tiếng Việt. Giữ dự án và tab
  đang mở khi tìm hoặc xóa từ khóa. Số bài báo và thành viên ghi kèm danh từ.
- Giảm cảm giác cứng: bỏ nhãn Workspace và Research project lặp, icon có khung,
  đường kẻ dọc và footer đếm khi chưa lọc. Tab chọn dùng nền xám trung tính nhỏ;
  chỉ giữ đường phân cách giúp nhận biết navigation và tiêu chí sàng lọc.
- Navigation dự án chia hai nhóm có nhãn: Nghiên cứu theo thứ tự Tài liệu,
  Cơ hội nghiên cứu, Sản phẩm, Gửi bài; Cộng tác theo thứ tự Trò chuyện,
  Thành viên, Đóng góp, Hỗ trợ học thuật. Giữ từng mục mở bằng một lần bấm;
  dùng hai hàng gọn, chữ dễ đọc và gạch chân ở mục đang chọn. Trên điện thoại,
  bộ chọn trang giữ nguyên hai nhóm và thứ tự đó.
- Không bọc toàn bộ workspace trong khung bo tròn lớn. Dùng độ tương phản nền,
  đường phân cách và khoảng cách để tạo phân cấp, không làm giao diện nhạt và nhỏ.

| Date | Decision | Reason |
|---|---|---|
| 2026-05-25 | Dual-mode (light + dark) | Academic users đọc paper dài → cần light. Dark cho premium feel |
| 2026-05-25 | Inter làm primary font (đã thay) | Hiện nay app dùng Source Sans 3 (xem §3.1) |
| 2026-05-25 | `--radius: 0.75rem` (đã thay) | Hiện `--radius: 0.5rem` trong `globals.css` |
| 2026-05-25 | Recharts cho charts | Already in package.json, React-friendly, theme-aware |
| 2026-05-25 | Skeleton thay vì spinner | List-heavy app, skeleton giảm perceived load time |
