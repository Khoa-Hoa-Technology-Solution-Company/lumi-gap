# Publication Trend — Design Language

> Single source of truth cho mọi quyết định visual của project. Stitch generate theo doc này. shadcn theme follow doc này. Team build component đồng nhất theo doc này.

---

## 1. Brand & Mood

**Personality:** Serious · Trustworthy · Data-driven · Premium-academic
**Reference vibes:** Google Scholar (information density) + Notion (clarity) + Linear (polish) + Stripe Dashboard (data charts)
**Avoid:** Magazine-style image-forward layouts · Bright saturated colors · Gradient noise · Decorative animations

**1-câu mô tả:**
> *"A research tool that respects researchers' time — dense information, calm aesthetics, and accessible in any lighting condition."*

---

## 2. Color Palette

Project hỗ trợ **cả light + dark mode** (toggle qua `next-themes`). Mỗi mode có 1 palette riêng nhưng cùng visual identity.

### 2.1. Light Mode (Default — đọc paper dài)

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
Primary:    Inter (variable) — UI text, headings
Body:       Inter — abstracts, descriptions
Mono:       JetBrains Mono — code, citation IDs, DOIs
```

Inter chuẩn industry cho academic/SaaS UI: highly legible at small sizes, supports Vietnamese diacritics.

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
- **Vietnamese:** Inter supports đầy đủ — no font fallback needed

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
| Page transitions | NONE — instant (data-heavy app) |
| Skeleton pulse | 1500ms loop | ease-in-out |
| Toast slide-in | 250ms | spring |

**Tránh:**
- ❌ Decorative parallax
- ❌ Auto-playing carousels
- ❌ Spring physics trên cards (academic ≠ playful)

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

| Date | Decision | Reason |
|---|---|---|
| 2026-05-25 | Dual-mode (light + dark) | Academic users đọc paper dài → cần light. Dark cho premium feel |
| 2026-05-25 | Inter làm primary font | Hỗ trợ Vietnamese, industry standard SaaS, free OSS |
| 2026-05-25 | `--radius: 0.75rem` (12px) | Cân bằng giữa playful (16px+) và sterile (4px-) |
| 2026-05-25 | Recharts cho charts | Already in package.json, React-friendly, theme-aware |
| 2026-05-25 | Skeleton thay vì spinner | List-heavy app, skeleton giảm perceived load time |
