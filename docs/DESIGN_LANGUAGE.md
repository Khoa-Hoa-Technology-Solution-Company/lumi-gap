# Publication Trend — Design Language

> Single source of truth cho mọi quyết định visual của project. Stitch generate theo doc này. shadcn theme follow doc này. Team build component đồng nhất theo doc này.

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

```
Background        #FFFFFF      pure white — main surface
Card              #FFFFFF      same as background, distinguished by border
Border            #E5E7EB      neutral-200 — subtle dividers
Foreground        #0F172A      slate-900 — primary text
Muted             #F8FAFC      slate-50 — section backgrounds
Muted Foreground  #64748B      slate-500 — metadata, captions

Primary           #1E40AF      blue-800 — academic blue, CTA buttons
Primary FG        #FFFFFF      white text on primary
Secondary         #F1F5F9      slate-100 — secondary buttons bg
Secondary FG      #0F172A      slate-900 — text on secondary
Accent            #0891B2      cyan-600 — highlights, links, charts
Destructive       #DC2626      red-600 — delete, errors
Success           #16A34A      green-600 — success states, AI-verified
Warning           #D97706      amber-600 — low-quality data warnings
```

### 2.2. Dark Mode (Premium feel — code at night)

```
Background        #0F1B2D      deep navy — NOT pure black
Card              #1A2332      slightly lighter than bg
Border            #1E293B      slate-800 — subtle on dark
Foreground        #F8FAFC      slate-50 — primary text
Muted             #1E293B      slate-800 — section bg
Muted Foreground  #94A3B8      slate-400 — metadata

Primary           #60A5FA      blue-400 — lighter for contrast
Primary FG        #0F1B2D      navy text on primary
Secondary         #1E293B      slate-800
Secondary FG      #F8FAFC      white text
Accent            #22D3EE      cyan-400 — glow effect on dark
Destructive       #EF4444      red-500
Success           #22C55E      green-500
Warning           #F59E0B      amber-500
```

### 2.3. Data Visualization Palette (Charts)

Dùng cho line/bar/area charts. Color-blind safe, work in both modes:

```
Series 1 (primary)    #3B82F6   blue-500
Series 2              #06B6D4   cyan-500
Series 3              #8B5CF6   violet-500
Series 4              #10B981   emerald-500
Series 5              #F59E0B   amber-500
Series 6              #EC4899   pink-500
```

### 2.4. AI Score Badge Colors (Match `paper_ai_scores.finalScore`)

```
0.9 – 1.0    #16A34A    green-600       Excellent match
0.7 – 0.9    #84CC16    lime-500        Good match
0.5 – 0.7    #F59E0B    amber-500       Moderate match
0.3 – 0.5    #F97316    orange-500      Low match
0.0 – 0.3    #94A3B8    slate-400       Poor / not analyzed
```

---

## 3. Typography

### 3.1. Font Family

```
Primary:    Source Sans 3 (self-hosted) — UI text, headings
Body:       Source Sans 3 — abstracts, descriptions
Mono:       JetBrains Mono — code, citation IDs, DOIs
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
sm    6px    badges, tooltips
md    8px    inputs, buttons (default)
lg    12px   cards (DEFAULT for content cards)
xl    16px   modals, hero images, AI report viewer
2xl   24px   prominent feature cards
full  9999px avatars, pills, status dots
```

**Trong CSS:** `--radius: 0.75rem` (12px) — đã set trong `globals.css`.

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
- Hướng dẫn riêng của homepage được ghi trong `docs/home-redesign.md`; phản hồi mới nhất của người dùng có ưu tiên cao hơn các ghi chú lịch sử.

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

## 11. Mobile Adaptations (Android-First)

Mobile build bằng **Expo + React Native + NativeWind**. Team chỉ test trên **Android** (Android Studio emulator + Expo Go Android). Code vẫn cross-platform nhưng iOS không trong scope test.

Mobile inherit cùng design tokens với web, nhưng:

- **Frame chuẩn để design:** Pixel 6 (412×892dp). Tránh frame iPhone vì sai aspect ratio.
- **Touch targets:** Min **48dp × 48dp** (Material 3 accessibility minimum — strict hơn iOS 44pt)
- **System bars:**
  - Top: status bar ~28dp (clock, signal)
  - Bottom: navigation bar ~48dp (3-button) hoặc ~24dp (gesture)
- **Safe area:** dùng `react-native-safe-area-context` để handle cả 2 nav modes
- **Hardware back button:** Android có. Header back chevron vẫn giữ cho one-handed reach
- **Bottom sheets > Modals:** Modals khó dùng mobile, dùng `@gorhom/bottom-sheet` hoặc Drawer
- **Tab bar bottom:** Floating pill (custom) — KHÔNG dùng Material 3 NavigationBar default
- **No hover states:** Replace với `:active` press states (opacity-70 hoặc background change)
- **Cards full-width:** No multi-column trên mobile
- **Status bar style:** Light icons trên dark mode, dark icons trên light mode (`StatusBar` API)
- **Edge-to-edge content:** Set `android:windowLayoutInDisplayCutoutMode` để fill notch area (Pixel 7+)
- **Soft keyboard:** Form screens cần `KeyboardAvoidingView` với `behavior="height"` (Android) thay vì `padding` (iOS)

### Android-Specific Gotchas Cần Nhớ Khi Code

| Trap | Fix |
|---|---|
| Text input không scroll khi keyboard mở | Wrap với `KeyboardAvoidingView behavior="height"` |
| Status bar đè lên header | `<StatusBar style="light" />` + `SafeAreaView` |
| Tab bar bị system gesture nav che | `useSafeAreaInsets()` bottom padding |
| Swipe gesture conflict (Android có back gesture) | Test swipe-to-delete chỉ từ right-to-left |
| Ripple effect mặc định | NativeWind không tự có — dùng `Pressable` với `android_ripple` prop |
| Font không load đúng | Dùng `expo-font` + preload trong `_layout.tsx` |

---

## 12. Implementation Checklist

Trước khi build component mới, đối chiếu:

- [ ] Color tokens dùng từ CSS variables, KHÔNG hard-code hex
- [ ] Spacing dùng Tailwind classes (p-4, gap-6...), KHÔNG `style={{padding}}`
- [ ] Typography token (text-base, text-lg...), KHÔNG `style={{fontSize}}`
- [ ] Component dùng shadcn primitive nếu có (Button, Card, Input...)
- [ ] Test cả light + dark mode (`<html class="dark">`)
- [ ] Mobile responsive (sm:, md:, lg: breakpoints)
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
apps/web/src/theme/globals.css     (web — đã wire next-themes)
apps/mobile/src/theme/colors.ts    (mobile — màu cho non-className usage)
```

Update color → sửa 2 file này → mọi component tự cập nhật.

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
| 2026-05-25 | Inter làm primary font | Hỗ trợ Vietnamese, industry standard SaaS, free OSS |
| 2026-05-25 | `--radius: 0.75rem` (12px) | Cân bằng giữa playful (16px+) và sterile (4px-) |
| 2026-05-25 | Recharts cho charts | Already in package.json, React-friendly, theme-aware |
| 2026-05-25 | Skeleton thay vì spinner | List-heavy app, skeleton giảm perceived load time |
