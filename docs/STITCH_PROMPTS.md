# Stitch Prompts — Publication Trend System

> 13 ready-to-paste prompts cho Google Stitch để generate UI mockups. **7 web + 6 mobile**. Mỗi prompt tự đứng được, có thể paste vào Stitch lần lượt mà không cần thêm context.
>
> **Workflow:** Stitch generate mockup → bạn xem visual → team translate qua shadcn components theo design tokens trong [DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md).
>
> **⚠️ KHÔNG copy code Stitch sinh vào project** — chỉ lấy **visual mockup** làm reference. Code thật build với shadcn (web) hoặc NativeWind (mobile).
>
> **📱 Mobile = Android only.** Team chỉ test trên Android Studio emulator + Expo Go Android. Mockup dùng Pixel 6 (412×892dp) làm khung mẫu. Code Expo vẫn cross-platform nhưng iOS không được test.

---

## 📋 Mục Lục

**Web (1440px desktop):**
1. [Web 1 — Login + Register](#web-1--login--register)
2. [Web 2 — Home / Dashboard](#web-2--home--dashboard)
3. [Web 3 — Search Results](#web-3--search-results)
4. [Web 4 — Paper Detail](#web-4--paper-detail)
5. [Web 5 — Trend Dashboard](#web-5--trend-dashboard)
6. [Web 6 — AI Report Viewer](#web-6--ai-report-viewer)
7. [Web 7 — Admin Panel](#web-7--admin-panel)

**Mobile (412dp × 892dp Android Pixel 6 — team tests Android only via Android Studio + Expo Go):**
8. [Mobile 1 — Login + Register](#mobile-1--login--register)
9. [Mobile 2 — Home / Search Tab](#mobile-2--home--search-tab)
10. [Mobile 3 — Paper Detail](#mobile-3--paper-detail)
11. [Mobile 4 — Bookmarks Tab](#mobile-4--bookmarks-tab)
12. [Mobile 5 — Profile Tab](#mobile-5--profile-tab)
13. [Mobile 6 — Admin Sync](#mobile-6--admin-sync) (admin only)

---

## 🎨 Shared Style Context (Paste FIRST khi mới mở Stitch project)

```
Visual system for an academic research platform called "Publication Trend":

Brand: Serious, trustworthy, data-driven. Like Google Scholar meets Linear
and Notion. NOT a consumer/magazine app — this is a research tool.

Dual-mode theme (light default, dark optional):
LIGHT MODE:
  background #FFFFFF, foreground #0F172A (slate-900),
  card #FFFFFF with 1px border #E5E7EB, muted bg #F8FAFC,
  primary #1E40AF (deep blue), accent #0891B2 (cyan-600),
  success #16A34A, destructive #DC2626

DARK MODE:
  background #0F1B2D (NOT pure black — slightly blue navy),
  foreground #F8FAFC, card #1A2332 with 1px border #1E293B,
  primary #60A5FA (blue-400 lighter), accent #22D3EE (cyan-400 glow)

Typography: Inter variable font.
  Page titles 36px/700, section h2 30px/600, card titles 24px/600,
  body 16px/400 with 1.6 line-height, metadata 14px caption 12px.
  DOIs and citation IDs in JetBrains Mono.

Spacing: 8px grid. Card padding 16px. Section gap 24px.
Page container 1280px max-width, 32px gutter.

Components:
  Rounded corners 12px on cards, 8px on inputs/buttons, 6px on badges.
  Border 1px solid on cards (NO heavy shadows on dark mode).
  Buttons: solid primary (filled), ghost (text only), outline (border).
  Icons: lucide-react style, stroke-based, 16-24px.

Avoid:
  Magazine layouts with hero images. Bright saturated colors.
  Decorative animations. Image-forward design.
  Spinners (use skeleton pulse for loading).
```

→ **Paste block trên trước**, sau đó paste prompt từng screen bên dưới.

---

## Web 1 — Login + Register

```
Design a desktop login/register page (1440px width) for "Publication Trend",
an academic research platform. Use the shared visual system.

Layout: Split-screen 50/50.

LEFT SIDE (gradient background, primary blue #1E40AF to deep navy #0F172A):
- Top: small logo (text "Publication Trend" in white, semibold)
- Center: large quote "Discover what's next in research." (white, 36px bold)
- Below quote: 3 stat chips horizontal —
    "250M+ papers indexed"
    "AI-grounded analysis"
    "4 academic sources"
  (translucent white pills with cyan icon)
- Bottom: subtle footer "FPT University · WDP301 capstone"

RIGHT SIDE (white background, centered card):
- Card 400px wide, padding 32px, rounded 12px, border 1px slate-200
- Tab switcher at top: "Sign in" | "Create account" (active underlined cyan)
- Form fields (Sign in mode):
    Email input (full width, with envelope icon prefix)
    Password input (with eye icon to toggle visibility)
    "Forgot password?" link right-aligned, cyan accent
- Primary button "Sign in" (full width, solid blue)
- Divider "OR"
- Outline button "Continue with Google" (with Google G icon)
- Bottom helper: "By signing in, you agree to our Terms"

Show BOTH form states (Sign in active, Register inactive tab).
Add input validation example: red border + small error text "Invalid email".

Generate both light AND dark mode versions of this screen side-by-side.
```

---

## Web 2 — Home / Dashboard

```
Design the home dashboard (1440px) for "Publication Trend".
User is logged in as a researcher. Use the shared visual system.

LAYOUT:
- Top nav bar (64px height, sticky): logo left, global search center
  (large pill input "Search papers, authors, journals..."),
  theme toggle, notifications bell with badge "3",
  user avatar dropdown right
- Below nav: page container, 32px padding

CONTENT (vertical stack):

1. Greeting hero (top):
   "Welcome back, Hoàng Long Anh" (h1 36px)
   "5 new papers match your followed topics this week" (muted)

2. Quick stats row (4 cards in a grid):
   Card 1: "Papers indexed" — 1,247 (with trending arrow +12%)
   Card 2: "Topics followed" — 8
   Card 3: "Reports generated" — 14
   Card 4: "Saved papers" — 47
   Each card: icon + label + big number + delta indicator

3. "Trending topics this week" section (h2):
   Horizontal scroll row of 5 topic chips with mini sparkline:
   "LLM in education" (↑ 340%)
   "Generative AI for medical imaging" (↑ 220%)
   "Vector databases" (↑ 180%)
   "Multimodal LLMs" (↑ 156%)
   "RAG architectures" (↑ 134%)

4. "Recent papers in your topics" section (h2):
   List of 4 paper cards (use Paper Card pattern from DESIGN_LANGUAGE.md):
   - "Large Language Models in Higher Education: A Systematic Review"
     by Chen et al. · Nature Education · 2024 · 87 citations · AI Score: 0.92
   - "Generative AI and Academic Integrity: New Challenges"
     by Nguyen, Tran · IEEE Education · 2024 · 45 citations · AI Score: 0.85
   - "Prompt Engineering for Pedagogical Applications"
     by Smith, Brown · ACM TOCE · 2023 · 124 citations · AI Score: 0.78
   - "ChatGPT in Vietnamese Education: A Survey"
     by Le et al. · VNU Journal · 2024 · 23 citations · AI Score: 0.81

5. Right sidebar (320px, sticky from top):
   "Generate AI Report" CTA card (primary blue, prominent button)
   "Run analysis" with sparkles icon
   Below: "Your saved searches" list (3 items, each row clickable)

Footer: minimal, "© 2026 Publication Trend".

Generate light mode. Use realistic skeleton states for the right-side widgets.
```

---

## Web 3 — Search Results

```
Design the search results page (1440px) for "Publication Trend".
User has searched for "large language model education". Use shared visual system.

LAYOUT:
- Same top nav as dashboard
- Below: 2-column layout — filter sidebar left (280px), results main right

LEFT SIDEBAR (filter panel):
Title: "Filters" with "Clear all" link top-right
Sections (collapsible):

  Mode (radio):
    ○ Keyword search
    ● Semantic search via embeddings  (with sparkles icon)

  Publication year (range slider):
    2010 — 2024 (current handle at 2020-2024)

  Open Access (toggle): ON

  Journal type (checkboxes):
    ☑ Article  ☑ Conference
    ☐ Preprint  ☐ Review

  Source (checkboxes):
    ☑ OpenAlex (1,247)
    ☐ Semantic Scholar (340)
    ☐ Crossref (89)

  AI Score threshold:
    Slider 0.0 — 1.0, current at 0.5
    "Show only papers AI scored ≥ 0.5"

  Apply button (sticky bottom)

MAIN RESULTS (right column):

Top toolbar:
  "1,247 papers found for 'large language model education'" (h3)
  Right: Sort dropdown ("Sort by: Relevance ▼")
  Below: Active filter chips ("Semantic", "2020-2024", "Open Access", "Score ≥ 0.5")
  with × to remove each

Results list (5-6 paper cards visible), each card:
  Title (24px bold) — example: "ChatGPT for Personalized Learning: Evidence from K-12"
  Authors row: "Sarah Chen · Michael Rodriguez · 4 more"
  Metadata row: "Nature Education · 2024 · DOI: 10.1038/s41586-024-..." (mono font for DOI)
  Abstract preview (2 lines, line-clamp): "This study examines the integration of
    ChatGPT into K-12 personalized learning environments across 12 schools..."
  Bottom row:
    Left: topic chips "LLM" "K-12" "Personalization"
    Center: AI Score badge "0.92 ●●●●●" green
    Right: actions — Bookmark (heart), Add to Project (folder+), View → (arrow)

Pagination at bottom: "Page 1 of 84  ← 1 2 3 ... 84 →"

Empty state alt: show below results list ("Show me what an empty state looks like").

Generate light mode. Show 1 result with hover state (shadow-sm).
```

---

## Web 4 — Paper Detail

```
Design the paper detail page (1440px). Use shared visual system.

LAYOUT: top nav + 2-column layout (main 880px, right sidebar 320px).

BREADCRUMB top: "Home / Search / Paper Detail" (muted, separator chevrons)

MAIN (left column):

1. Hero block:
   Title (h1 36px bold): "Large Language Models in Higher Education:
                          A Systematic Review of Pedagogical Applications"
   Authors (chips with avatars, comma-separated):
     [SC] Sarah Chen (corresponding) · [MR] Michael Rodriguez ·
     [JL] James Liu · "+ 2 more"

   Metadata strip (horizontal pills with icons):
     📖 Nature Education
     📅 March 2024
     🔗 DOI: 10.1038/s41586-024-xxxxx (mono, click-to-copy)
     ⭐ 87 citations
     🌐 Open Access (green badge)

   Action buttons row (right-aligned):
     [Bookmark ♥]  [Follow topic]  [Add to project +]  [Export ⤓]  [Share ↗]

2. AI Analysis card (highlighted, accent border):
   Title: "AI Score: 0.92" with sparkles icon
   Subtitle: "This paper is a strong match for your interest in LLM in education"
   Score breakdown (mini bars):
     Relevance     ████████░░ 0.95
     Semantic      ████████░░ 0.88
     Trend align   █████████░ 0.91
     Recency       ██████████ 1.00
     Quality       █████████░ 0.93

3. Abstract section:
   h3 "Abstract"
   body-lg text (18px, 1.6 line-height, max 75ch): full abstract ~300 words

4. Topics + Keywords (chips):
   h3 "Topics" — chips: "LLM", "Higher Education", "Pedagogy", "Systematic Review"

5. References section:
   h3 "References" (87)
   Collapsible list, first 5 visible:
   [1] Brown, T. et al. (2020). Language Models are Few-Shot Learners. NeurIPS.
   [2] Vaswani, A. et al. (2017). Attention Is All You Need. NeurIPS.
   ... "Show all 87 references"

RIGHT SIDEBAR (sticky):

1. "Similar papers" card:
   List of 3 small paper rows (image-less, title + 1-line metadata)
   "Generative AI in Academic Settings"
   "ChatGPT for Education Survey"
   "AI Tutors in Vietnamese Universities"

2. "Author profile" preview:
   Avatar + name + affiliation + h-index + "View profile →"

3. "Cited by recent papers" card:
   3 small rows of newer papers citing this work

Generate LIGHT mode. Make AI Analysis card visually prominent.
```

---

## Web 5 — Trend Dashboard

```
Design the trend dashboard page (1440px). User is analyzing publication trends
for topic "LLM in education". Use shared visual system.

LAYOUT: top nav + page container (1280px).

TOP CONTROLS BAR (sticky below nav):
- Left: topic selector (autocomplete dropdown showing "LLM in education")
- Center: year range slider, 2015 — 2024 (handles at 2020 and 2024)
- Right: "Export" button + "Generate AI Report" primary button (sparkles icon)

CONTENT GRID:

Row 1 — KPI cards (4 columns):
  "Total papers" — 1,247 (with trend ↑ +340% YoY)
  "Active authors" — 423
  "Top journal" — Nature Education (98 papers)
  "Avg citations" — 23.4

Row 2 — Main chart (full width):
  Card title: "Publications per year"
  Large area chart, 400px height
  X-axis: 2015 to 2024
  Y-axis: paper count
  Area: gradient primary blue → cyan, smooth curve
  Hover tooltip example: "2023: 412 papers · +89% YoY"
  Annotations: vertical dashed line at "2022: ChatGPT release"
  Below chart: chip legend "Total" "Open Access" "High AI Score"

Row 3 — Two charts side by side (2 columns):
  Left card "Top 10 Journals" (horizontal bar chart):
    Nature Education       ████████████████ 98
    IEEE Trans. Education  ███████████ 76
    Computers & Education  █████████ 54
    ACM TOCE               ████████ 43
    ... (10 bars total)

  Right card "Top 10 Authors" (horizontal bar chart):
    Sarah Chen        ███████ 18 papers
    Michael Rodriguez ██████ 15
    James Liu         █████ 12
    ... (10 bars)

Row 4 — Keyword cloud + Geographic map (2 columns):
  Left "Trending keywords" (tag cloud, bigger = more frequent):
    "ChatGPT" (large) · "GPT-4" · "Personalization" · "Assessment" ·
    "Academic integrity" · "K-12" · "Higher Education" · "Vietnamese context"

  Right "Geographic distribution" (world map heatmap):
    Countries shaded by paper count
    Top contributors listed below: USA (340), China (210), UK (89), Vietnam (12)

Row 5 — Recent breakthrough papers list (full width):
  "Most cited in 2024 for this topic"
  3 paper cards (compact version)

Generate light mode. Charts should look modern but understated — no
gradient noise, no 3D effects.
```

---

## Web 6 — AI Report Viewer

```
Design the AI analytical report viewer (1440px). The user has generated a
report on "LLM in education trends 2020-2024". Use shared visual system.

LAYOUT: top nav + 3-column (TOC 240px left, main 720px center, side panel 280px right).

LEFT — TABLE OF CONTENTS (sticky):
"Report sections" (h3 muted)
  • Executive Summary
  • Trend Analysis
  • Top Journals
  • Top Authors
  • Methodology
  • Research Gaps
  • References
Active section highlighted with accent border-left + bg muted.

MAIN — REPORT CONTENT (center column):

Top header bar:
  Breadcrumb: "Reports / LLM in Education 2020-2024"
  Title (h1): "LLM in Education: Trend Analysis 2020-2024"
  Subtitle line: "Generated by AI · 2026-05-25 · 1,247 papers analyzed"
  Verification badge: ✓ "AI-verified" (green)
  Action buttons right: Export PDF · Export Markdown · Share

Report body (markdown rendered, body-lg 18px, max 75ch):
  ## Executive Summary
  Three paragraph summary. Includes inline citations like
  "ChatGPT showed 340% YoY growth [1, 2, 3]".

  Embedded chart card inline:
  [Mini publication trend line chart — same style as Trend Dashboard]

  ## Trend Analysis
  Several paragraphs. Bullet list of key findings:
  • Vietnamese context underrepresented (only 12 of 1,247 papers)
  • Privacy & ethics research lagging behind capability research
  • K-12 contexts emerging in 2023-2024

  ## Top Journals
  Embedded table:
  | Rank | Journal | Papers | Avg Citations |
  | 1 | Nature Education | 98 | 45 |
  | 2 | IEEE Trans. Education | 76 | 38 |
  | ... |

  ## Research Gaps
  4 callout cards (accent border, sparkles icon):

  Gap 1: "Few studies focus on Vietnamese higher education"
  Confidence: 0.87 (high)
  Supporting papers: [12], [34], [56]
  Suggested direction: "Empirical studies with Vietnamese universities"

  (similar Gap 2, 3, 4)

  ## References
  Numbered list of 87 papers in academic style.
  Each item is clickable → opens paper detail.

RIGHT — METADATA PANEL (sticky):
"Report info" card:
  Model: Gemini 2.5 Pro
  Prompt version: v1.3
  Generated: 2 minutes ago
  Tokens used: 12,400
  Cost: $0.18

"Verification checklist" card (with green checkmarks):
  ✓ All sections present
  ✓ Citations match real papers
  ✓ No contradictions detected
  ✓ Sources verified (87/87)

"Share with team" card: input + invite button.

Generate light mode. Make the inline citations [1] [2] in primary blue,
underline on hover.
```

---

## Web 7 — Admin Panel

```
Design the admin sync management page (1440px). User is admin role.
Use shared visual system. Layout: top nav + page container.

PAGE HEADER:
  Title (h1): "Sync Management"
  Subtitle (muted): "Trigger and monitor academic API synchronization"
  Right: primary button "Trigger new sync" (with refresh icon)

TABS (below header):
  ● Active Configs  ○ Run History  ○ API Providers  ○ Audit Logs
  (cyan underline on active)

TAB 1 CONTENT — Active Configs (table):

Table header: Config name | Provider | Search | Years | Schedule | Status | Last run | Actions

Rows (5 example rows):

Row 1:
  "LLM in Education — OpenAlex"
  OpenAlex (with logo chip)
  "large language model education"
  2022 — 2024
  "Daily at 2am" (cron 0 2 * * *)
  Status: ● Enabled (green dot)
  Last run: "2h ago" with success ✓
  Actions: Edit / Pause / Delete (icon buttons)

Row 2:
  "Generative AI Healthcare — Semantic Scholar"
  Semantic Scholar
  "generative AI healthcare"
  2020 — 2024
  "Weekly Monday 3am"
  Status: ● Enabled
  Last run: "5d ago" with success
  Actions: ...

Row 3:
  "RAG Architectures — Crossref"
  Crossref
  "RAG retrieval augmented generation"
  Disabled status (gray dot) — Last run "Never"

Row 4: ... another active sync
Row 5: ... another paused sync

Below table: "Showing 5 of 12" with pagination

Side panel (right, 320px):
"Trigger inline sync" card:
  Form to start ad-hoc sync without saving config:
    Search input
    Year range
    Max pages (default 1)
    Primary button "Run now"

"System status" card:
  Worker process: ● Running (green)
  Queue depth: 3 jobs
  Today's stats: 287 papers ingested
  Errors today: 0

Generate light mode. Table should look like Linear/Stripe — clean, dense,
no zebra stripes. Status dots colored.
```

---

## Mobile 1 — Login + Register

```
Design a mobile login screen for "Publication Trend" Android app
(built with Expo / React Native, NativeWind for styling).
Frame: 412dp × 892dp (Android Pixel 6). Use shared visual system.
Dark mode default for mobile (premium feel matches research-at-night vibe).

LAYOUT (vertical stack, 24px padding):

TOP (200px):
  Status bar padding (~28dp top — Android system bar)
  Centered logo wordmark "Publication Trend" (white, 24px semibold)
  Subtitle below "AI-powered research discovery" (muted 14px)

FORM CARD (centered, full-width minus padding):
  Tab switcher: "Sign in" | "Create account" (active underlined cyan)

  Sign in form:
    "Email" label (caption, muted)
    Email input (full-width, 48px tall, rounded 12px, dark card bg)
    "Password" label
    Password input with eye toggle icon right
    "Forgot password?" link right-aligned, cyan
    Primary button "Sign in" (full width, 48px, blue solid)
    Divider with "OR" centered
    Outline button "Continue with Google" (G icon)

BOTTOM (sticky to system nav area):
  Tiny footer text "By signing in you agree to Terms"
  Bottom system nav padding (~48dp for 3-button nav, ~24dp for gesture nav)

Show keyboard up state in one variant (form pushed up, password field focused).

Generate dark mode primary. Background gradient #0F1B2D top → #1A2332 bottom.
Cyan glow on focused inputs.
```

---

## Mobile 2 — Home / Search Tab

```
Design mobile home screen (412dp × 892dp Android (Pixel 6)).
User is in the "Search" tab. Use shared visual system. Dark mode default.

LAYOUT:

TOP STATUS BAR (44px, system):
  System chrome — leave space, don't draw

HEADER (140px):
  Greeting "Hi, Long Anh" (white 18px semibold)
  Subtitle "What are you researching today?" (muted 14px)
  Avatar top-right (40px circular, click → profile)

SEARCH BAR (sticky, below header):
  Pill input 48px tall, rounded 24px (full pill shape)
  Placeholder "Search papers, topics, authors..."
  Magnifying glass icon left, filter icon right (opens filter sheet)

SCROLL CONTENT (vertical):

Section 1 — "Trending topics" horizontal scroll:
  Title h3 18px
  Horizontal scroll of 5 chip cards, each 140×80px:
    "LLM in education" with sparkline up ↑
    "RAG systems" ↑
    "Vector databases" ↑
    "Generative AI" ↑
    "Multimodal LLMs" ↑

Section 2 — "Recent papers" vertical list:
  Title h3 + "See all →" link right
  3 paper cards (mobile-optimized):
    Card 1:
      Title (16px semibold, 2 lines): "ChatGPT for K-12 Personalized Learning"
      Authors row (12px muted): "S. Chen, M. Rodriguez · 2024"
      Bottom: Citations chip "87 ★" + AI score "0.92" + Bookmark icon
    Card 2 (similar)
    Card 3 (similar)

Section 3 — "Quick actions" 2-column grid:
  Card 1: "Browse trends" with TrendingUp icon
  Card 2: "AI reports" with Sparkles icon (primary)

BOTTOM TAB BAR (floating pill, sticky):
  Pill shape, 4 tabs:
    🔍 Search (active, primary tint)
    🔖 Bookmarks
    🔔 Notifications (with badge "3")
    👤 Profile
  Bottom system nav padding (gesture-bar safe)
  Note: floating pill chosen over Material 3 NavigationBar for premium feel,
  but tap targets remain ≥ 48dp (Material accessibility minimum)

Generate dark mode. Cards should have subtle border (no heavy shadow on dark).
Tab bar has cyan glow underline on active tab.
```

---

## Mobile 3 — Paper Detail

```
Design mobile paper detail screen (412dp × 892dp Android Pixel 6). User tapped a paper.
Use shared visual system. Dark mode default. Built with Expo / React Native + NativeWind.

LAYOUT:

TOP NAV (Android system bar + 56dp Material toolbar header):
  Back button left (chevron — Android also has hardware/gesture back, but kept for reach)
  Title center: "Paper Detail" (16px, truncated)
  Share icon right

SCROLL CONTENT (vertical stack, 16px padding):

1. Title block:
   h2 20px bold, wrap to ~3 lines:
   "Large Language Models in Higher Education: A Systematic Review"

   Authors row (chips, scrollable horizontally if many):
   [SC] Sarah Chen · [MR] Michael Rodriguez · +3 more

   Metadata row (2 lines, small):
   "Nature Education · March 2024"
   "DOI: 10.1038/..." (mono, truncated)

   Bottom: chips inline: "87 ★ citations" · "🌐 Open Access" · "AI Score 0.92"

2. Action button row (4 equal buttons, 44px tall):
   [♥ Save]  [🔔 Follow]  [📁 Add]  [⤓ PDF]

3. "AI Analysis" card (highlighted accent):
   Title with sparkles icon "AI Match: Excellent (0.92)"
   Tap to expand → show score breakdown
   Default collapsed

4. Tab switcher (sticky after this scrolls into view):
   "Abstract" | "Topics" | "References" | "Cited by"

5. Tab content (Abstract default visible):
   body-lg 16px white, 1.6 line-height
   ~300 word abstract paragraph
   "Read more" if truncated

6. Below tab content — "Similar papers" horizontal scroll:
   Title "Similar papers" + "See all →"
   3 mini paper cards (140px wide each)

BOTTOM ACTION BAR (sticky, system nav aware):
  Single primary button "Open full text →" (cyan accent)
  Or if not Open Access: outline button "Request access"
  Padding bottom to clear Android gesture navigation bar

Generate dark mode. AI Analysis card should have cyan accent border + subtle glow.
Action button row uses icon + small label below (vertical).
```

---

## Mobile 4 — Bookmarks Tab

```
Design mobile Bookmarks tab (412×892 Android Pixel 6). User is in their saved papers list.
Use shared visual system. Dark mode default. Built with Expo / React Native + NativeWind.

LAYOUT:

TOP NAV:
  Title "Bookmarks" left (24px h1 semibold)
  Edit button right ("Edit" text or pencil icon)

FILTER STRIP (horizontal scroll chips, below title):
  "All (47)" (active, primary fill) · "Papers (32)" · "Topics (8)" · "Authors (7)"

CONTENT — LIST OF SAVED ITEMS (vertical):

Each item card (full-width, 16px padding, 12px gap between):

Card 1 (paper):
  Top row: 📄 icon + topic chip "LLM" · timestamp "2d ago"
  Title (16px semibold, 2 lines): "ChatGPT for K-12 Personalized Learning"
  Authors row (12px muted): "S. Chen, M. Rodriguez · 2024"
  Bottom: citations · AI score · trash icon (right)

Card 2 (topic):
  Top row: 🏷️ icon + "Topic" label · timestamp "1w ago"
  Title: "LLM in education"
  Subtitle (muted): "Following 1,247 papers · ↑ 340% this year"
  Right: bell icon (notifications enabled) · trash

Card 3 (author):
  Top row: 👤 icon + "Author" label
  Title: "Sarah Chen"
  Subtitle: "MIT · h-index 42 · Following"
  Right: trash

(Show 5-6 cards mixed, scrolling beyond fold)

EMPTY STATE alt design (no saved items):
  Center: large bookmark outline icon
  "No bookmarks yet"
  body muted: "Save papers, topics, or authors to keep them here"
  Primary outline button "Start searching"

BOTTOM TAB BAR: same as Mobile 2, "Bookmarks" tab active.

Generate dark mode. Cards use subtle border, no heavy shadow.
Swipe-to-delete preview on one card (red action revealed under swipe).
Note: swipe-from-right works on Android, no conflict with iOS swipe-back gesture.
```

---

## Mobile 5 — Profile Tab

```
Design mobile Profile tab (412×892 Android Pixel 6). Use shared visual system. Dark mode.
Built with Expo / React Native + NativeWind.

LAYOUT:

TOP NAV:
  Title "Profile" left
  Settings gear icon right

CONTENT (scrollable):

1. User card (top, with bg gradient subtle):
   Avatar 80px circular centered
   Name h2: "Hoàng Long Anh" (white, 24px)
   Role badge: "Researcher" (cyan pill chip)
   Email (muted small): "hoanglonganh@gmail.com"
   Institution (muted): "FPT University"

2. Stats row (3 equal columns):
   "Bookmarks" 47
   "Topics" 8
   "Reports" 14
   (Each is a tappable mini-card)

3. Menu sections (list of rows, 56px tall each):

   Section "Activity":
     📊 Reading history
     🔔 Notifications (with toggle right ON)
     📁 Projects (with badge "3")

   Section "Account":
     👤 Edit profile
     🔒 Change password
     📧 Email preferences
     🌐 Language (showing "English ›")

   Section "Appearance":
     🌓 Theme (showing "Dark ›")
     🔤 Font size

   Section "Help":
     ❓ Help & FAQ
     ✉️ Contact support
     📜 Terms & Privacy

4. Sign out button (full-width outline, red destructive color):
   "Sign out"

BOTTOM TAB BAR: "Profile" tab active.

Generate dark mode. Use subtle dividers between menu sections.
Row tap state: brief flash background highlight.
```

---

## Mobile 6 — Admin Sync

> ⚠️ Admin-only screen. KHÔNG nằm trong bottom tab bar (chỉ admin thấy). Vào từ Profile → "Admin" row (chỉ hiện khi `role === "admin"`). Bảng nhiều cột của web → trên mobile chuyển thành **list of cards** + **bottom sheet** để trigger (theo DESIGN_LANGUAGE §11: "Bottom sheets > Modals").

```
Design a mobile Admin Sync Management screen (412dp × 892dp Android Pixel 6).
User is admin role. Use shared visual system. Dark mode default.
Built with Expo / React Native + NativeWind.

This is the mobile version of the web "Admin Panel" — but redesigned for a
phone: NO wide tables. Use stacked cards + a bottom sheet for the form.

LAYOUT:

TOP NAV (Android system bar + 56dp toolbar header):
  Back chevron left (returns to Profile)
  Title center: "Sync Management" (16px semibold)
  No right action

SCROLL CONTENT (vertical stack, 16px padding):

1. "System status" card (top, accent border):
   Row 1: Worker process — ● Running (green dot + label)
   Row 2: Queue depth — "3 jobs waiting"
   Row 3: Today — "287 papers ingested · 0 errors"
   Compact, 3 rows with icon + label + value.

2. Section title "Run history" (h3 18px) + count "(20)" muted.

3. List of RUN CARDS (full-width, 12px gap), each card:
   Top row:
     Left: search text "large language model education" (16px semibold, 1 line truncate)
     Right: status pill — ● Succeeded (green) / ● Running (amber, pulsing) /
            ● Failed (red)
   Middle row (4 stat chips, small, horizontal):
     "200 fetched" · "200 inserted" · "0 updated" · "0 dup"
   Bottom row (12px muted):
     "Started 2h ago · finished in 47s"
   If failed: show red error line "OpenAlex 503: service unavailable".

   Show 5 cards: 1 running (amber, no finished time), 3 succeeded, 1 failed.

BOTTOM ACTION (sticky, system-nav aware):
  Full-width primary button "＋ Trigger new sync" (blue solid, 48dp tall)
  → tapping opens a BOTTOM SHEET (not a modal):

BOTTOM SHEET "Trigger sync" (slides up from bottom, rounded-top 16px):
  Drag handle at top (small pill)
  Title "Trigger new sync"
  Form fields:
    "Search text" input (full width, 48dp) placeholder "e.g. LLM education"
    "Year from" stepper/input (default 2022)
    "Max pages" stepper (default 1, max 50)
  Primary button "Run now" (full width)
  Secondary "Cancel" (ghost)
  Helper note (caption muted): "Runs in background — refresh to see result."

Generate dark mode. Status pills colored (green/amber/red) WITH text label
(never color alone). Run cards use subtle border, no heavy shadow.
Show the bottom sheet open in one variant, closed in another.
Touch targets ≥ 48dp. Respect Android gesture-nav bottom inset.
```

---

## 🎯 Sau Khi Generate Stitch Mockups

### Bước Tiếp Theo

1. **Review mockup tất cả 12 screens** — pick 1 visual direction yêu thích nhất
2. **Export design tokens** từ Stitch:
   - Lấy actual color hex Stitch dùng (có thể khác doc gốc)
   - Lấy spacing, border radius, typography
3. **Update `DESIGN_LANGUAGE.md`** với token thật từ mockup
4. **Update `apps/web/src/theme/globals.css`** với CSS variables mới
5. **Update `apps/mobile/src/theme/colors.ts`**

### Translate Sang shadcn (cho team Dev 2)

Mỗi screen mockup → 1 PR:
```
feat(web): implement paper detail page from design mockup

- Add /papers/:id route
- Build PaperHeader component (title, authors, metadata)
- Build AIAnalysisCard component (score + breakdown)
- Build AbstractSection component (collapsible)
- Build SimilarPapersSidebar component
- Wire useEffect to call papersApi.detail(id)
- Match visual to design mockup screen "Web 4 — Paper Detail"
```

### Storybook Setup (Khuyến Nghị)

Sau khi có 12 mockup + design tokens, cài Storybook trong `apps/web`:
```bash
pnpm dlx storybook@latest init
```

→ Team build component trong isolation, đối chiếu với Stitch mockup trực tiếp, không cần chạy full app.

---

## 📚 Tham Khảo

- [DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md) — full design system spec
- [CLAUDE.md](../CLAUDE.md) — project context
- [PHASE_A_TEAM_TASKS.md](PHASE_A_TEAM_TASKS.md) — task ownership

---

## ⚠️ Lưu Ý Cuối

**Stitch generate UI là Phase Design — đứng riêng khỏi Phase A.** Phase A đang focus data foundation (sync, models). Phase Design có thể chạy song song bởi Dev 2 (Track UI Library) hoặc đợi Phase A xong làm.

Nếu team chỉ có 4 người và đang focus Phase A, design phase **có thể defer 1-2 tuần** không sao — vì Phase A không cần UI hoàn chỉnh, chỉ cần basic search + admin sync UI để demo.
