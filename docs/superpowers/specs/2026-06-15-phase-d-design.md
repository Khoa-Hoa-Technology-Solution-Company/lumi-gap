# Phase D Design — Research Gaps · Gemini Function Calling · Search Analytics

> Spec cho implementation plan. Cập nhật: 2026-06-15.
> Người review: Lead (hoangtira@gmail.com).

---

## 1. Phạm vi (Scope)

Phase D gồm **3 features** theo thứ tự ưu tiên:

| # | Feature | Core deliverable | Gemini calls? |
|---|---|---|---|
| D1 | **Research Gaps (A+B)** | `POST /gaps/analyze` + FE page | Có — nhẹ hơn report |
| D2 | **Gemini Function Calling** | Upgrade RAG report với tool-use mode | Có — multi-turn |
| D3 | **Search Analytics** | `search_logs` + analytics endpoints | Không |

**Ngoài scope Phase D:**
- Paper Upload (cần S3 — Phase E)
- AI Paper Scoring (scope creep — sau khi D1-D3 xong)
- CI/CD: đã xong qua PR #10 (GitHub Actions `.github/workflows/ci.yml`)
- Neo4j: dùng MongoDB `$graphLookup` nếu cần citation graph
- MCP stdio/SSE server thật: D2 dùng Gemini function calling (tương đương, dễ demo hơn)

---

## 2. Kiến trúc tổng thể

```
           ┌─────── D3: Search Analytics ───────┐
           │  search.service.ts (fire-and-forget)│
           │       ↓                             │
User ──► GET /search ──────────────────► search_logs (TTL 90d)
           │                                     │
           │        ┌──── D1: Gaps ─────────────────────────────────────┐
           ├──► POST /gaps/analyze                                        │
           │        │                                                     │
           │    BullMQ gaps queue                                         │
           │        │                                                     │
           │    runGapPipeline()                                          │
           │    ① embed topic → vector → top-6 papers                    │
           │    ② Gemini (GAPS prompt) → gaps[] JSON only               │
           │    ③ persist → research_gaps (source:"standalone")          │
           │                                                              │
           ├──► GET /reports/:id (on report "ready")                     │
           │        │                                                     │
           │    rag.service.ts → copy researchGaps[]                     │
           │        → research_gaps (source:"report")                    │
           │                                                              │
           └─── GET /gaps ← FE research-gaps.tsx ──────────────────────┘
           
           ┌─────────────── D2: Function Calling ──────────────────────┐
POST /reports { deepAnalysis: true }                                     │
    → runRagPipeline(mode: "deep")                                       │
    → generateWithTools(prompt, MCP_TOOL_DEFS)                          │
    → Gemini calls: search_papers / get_trends / count_papers           │
    → mcp_executor.dispatch() → existing services                        │
    → each call logged → mcp_tool_runs                                  │
    → Gemini final text → report.markdown (richer evidence)             │
    └────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature D1 — Research Gaps Module

### 3.1. Data Model

**Collection: `research_gaps`**

```ts
// modules/gaps/models/research-gap.model.ts
{
  _id:              ObjectId
  topic:            String, required                // display name: "LLM in Education"
  normalizedTopic:  String, required, index         // lowercase + trim: "llm in education"
                                                    // dùng để group/dedup; index này thay vì topic
  title:            String, required, maxlength 200
  description:      String, required
  rationale:        String, required                // tại sao đây là gap
  supportingPaperIds: [ObjectId], ref "Paper"       // bài báo chứng minh gap
  confidence:       Number, min 0, max 1            // 0..1 từ LLM
  source:           enum ["report", "standalone"]
  sourceReportId?:  ObjectId, ref "Report"          // nếu source = "report"
  userId:           ObjectId, ref "User", index     // creator (cho PATCH ownership)
  status:           enum ["active", "resolved", "dismissed"], default "active"
  timestamps:       true
}

// Helper (trong service): normalizeTopicStr(t) = t.trim().toLowerCase()

// Indexes
{ normalizedTopic: 1, confidence: -1 }  // query by topic, sorted by relevance
{ userId: 1, createdAt: -1 }            // creator history
{ status: 1, createdAt: -1 }            // filter active gaps
```

**Collection: `gap_analyses`** (lightweight job tracker — tương tự report)

```ts
// modules/gaps/models/gap-analysis.model.ts
{
  _id:        ObjectId
  userId:     ObjectId, ref "User"
  topic:      String
  yearFrom?:  Number
  yearTo?:    Number
  status:     enum ["queued", "analyzing", "ready", "failed"]
  gapIds:     [ObjectId], ref "research_gaps"     // populated khi ready
  errorMessage?: String
  promptVersion: String
  modelVersion:  String
  timestamps: true
}
```

### 3.2. API Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `POST /api/v1/gaps/analyze` | `{ topic, yearFrom?, yearTo? }` | requireAuth | Enqueue standalone analysis → 202 `{ analysisId }` |
| `GET /api/v1/gaps/analyze/:id` | — | requireAuth | Poll job status + gapIds when ready |
| `GET /api/v1/gaps` | `?topic=&minConfidence=&source=&status=active&page=&pageSize=` | requireAuth | List ALL gaps (shared knowledge — không filter theo userId). Query dùng `normalizedTopic` |
| `PATCH /api/v1/gaps/:id` | `{ status: "resolved"\|"dismissed" }` | requireAuth (creator only) | Update gap status — service check `gap.userId === req.user.sub` |

**Ownership model:** Gaps là **knowledge chung** — mọi authenticated user đều thấy tất cả gaps. Chỉ creator (`userId`) mới PATCH được status. Không có "private gap".

### 3.3. Standalone Gap Pipeline

`runGapPipeline(job: GapJob)` trong `gaps.service.ts`:

```
① Embed topic → queryVector (768d)
② $vectorSearch → top-6 papers retrieved (numCandidates 80, lighter than reports' 200)
   — paper IDs bây giờ mới biết, dùng cho ③
③ Cache lookup: key = hash(normalizedTopic + filters + model + GAP_PROMPT_VERSION + paperIds[])
   — PHẢI sau ② vì cache key phụ thuộc vào paper IDs từ vector search
   — Giống đúng pattern rag.service.ts:64-71
④ Cache hit → skip Gemini, dùng cached gaps[]
   Cache miss → generateJSON(GAPS_PROMPT, papers) → { gaps[] }  (no markdown section)
⑤ Validate: confidence clamp 0..1, supportingEvidence (1-based index) → paperId lookup
⑥ normalizedTopic = topic.trim().toLowerCase() → persist to research_gaps (source: "standalone")
⑦ Update gap_analyses: status "ready", gapIds[]
```

**GAPS_SYSTEM_PROMPT** (khác với REPORT_SYSTEM_PROMPT — không có markdown section):
```
"You are a research gap analyst.
Return ONLY a JSON object: { gaps: GapItem[] }
Each GapItem: { title, description, rationale, supportingEvidence: number[], confidence: 0..1 }
- 3-5 gaps maximum.
- A gap = something the evidence shows is under-explored, contradictory, or missing.
- supportingEvidence: 1-based indices into provided papers.
- confidence: your certainty that this is a real gap (not a known active area).
- Same language as the question."
```

### 3.4. Fan-out từ Reports

Trong `rag.service.ts`, sau khi `report.status = "ready"`:

```ts
// Fan-out gaps vào research_gaps collection (source: "report")
// Non-blocking — lỗi chỉ log, không fail report
await fanOutGapsFromReport(report, papers).catch(err =>
  logger.warn({ err, reportId: report._id }, "gap fan-out failed (non-fatal)")
);
```

Hàm `fanOutGapsFromReport` trong `gaps.service.ts`:
- Map `report.researchGaps[]` → insert nhiều `research_gaps` docs
- `source: "report"`, `sourceReportId: report._id`
- `upsert: false` — duplicate gaps từ reports bình thường (topic có thể có nhiều perspectives)
- Chạy **inline trong `runRagPipeline()`** (không phải BullMQ job riêng), wrapped trong `.catch()` để không fail report

### 3.5. Frontend: `/research-gaps`

Thay thế stub 511-byte hiện tại (`research-gaps.tsx`):

```
┌─────────────────────────────────────────────────┐
│  Research Gaps                                   │
│  AI-suggested research opportunities grounded    │
│  in retrieved papers.                            │
│                                                  │
│  [Topic selector ▼] [minConfidence ▼] [Source ▼]│
│  [Analyze new topic: ____________] [→ Analyze]   │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🔴 Gap Title                    Conf: 0.82 │ │
│  │ Description of the gap...                   │ │
│  │ Rationale: because [1][3] show that...      │ │
│  │ Supporting: [Paper A] [Paper B]             │ │
│  │ [Mark Resolved] [Dismiss]   source: report  │ │
│  └─────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐  │
│  │ (more gap cards...)                         │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Hook: `useGaps(filters)` + `useAnalyzeGap()` trong `features/gaps/`.

---

## 4. Feature D2 — Gemini Function Calling

### 4.1. Nguyên tắc

Gemini function calling (còn gọi là "tool use") cho phép Gemini **tự quyết định gọi tool** thay vì nhận evidence thụ động. Flow:

```
Prompt + Tool Definitions → Gemini
  → Gemini: "Tôi cần thêm data, gọi search_papers('healthcare AI 2024')"
  → Executor: gọi searchService.semantic() → trả 10 papers
  → Gemini nhận kết quả → gọi thêm tool hoặc tổng hợp
  → Gemini: (final text) → report.markdown
```

Điểm mạnh so với RAG cũ: Gemini chủ động query nhiều góc độ, không bị giới hạn 1 lần vector search.

### 4.2. Tool Definitions

**File:** `modules/mcp/mcp.tools.ts`

```ts
export const MCP_TOOL_DEFS = [
  {
    name: "search_papers",
    description: "Semantic search for academic papers by meaning. Returns top-K papers with title, abstract, citations, year.",
    parameters: {
      type: "object",
      properties: {
        query:    { type: "string", description: "Search query (any language)" },
        yearFrom: { type: "number", description: "Filter: published from this year (inclusive)" },
        yearTo:   { type: "number", description: "Filter: published up to this year (inclusive)" },
        limit:    { type: "number", description: "Max results (1-10, default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_trends",
    description: "Get publication trend metrics for a topic: YoY growth, CAGR, momentum score, yearly paper counts.",
    parameters: {
      type: "object",
      properties: {
        topic:    { type: "string", description: "Research topic keyword" },
        yearFrom: { type: "number" },
        yearTo:   { type: "number" },
      },
      required: ["topic"],
    },
  },
  {
    name: "count_papers",
    description: "Count papers matching criteria — validates claims about research volume.",
    parameters: {
      type: "object",
      properties: {
        topic:    { type: "string" },
        yearFrom: { type: "number" },
        yearTo:   { type: "number" },
        keyword:  { type: "string", description: "Keyword in title/abstract" },
      },
    },
  },
] as const;
```

### 4.3. Executor

**File:** `modules/mcp/mcp.executor.ts`

```ts
export async function executeMcpTool(
  call: { name: string; args: Record<string, unknown> },
  context: { reportId?: string; userId?: string },
): Promise<unknown> {
  const t0 = Date.now();
  let output: unknown;

  switch (call.name) {
    case "search_papers":
      output = await searchService.semantic({
        q: String(call.args.query),
        page: 1,
        pageSize: Math.min(Number(call.args.limit ?? 8), 10),
        yearFrom: call.args.yearFrom as number | undefined,
        yearTo:   call.args.yearTo   as number | undefined,
      });
      break;
    case "get_trends":
      output = await trendService.topic(String(call.args.topic), call.args);
      break;
    case "count_papers":
      output = await paperService.count(call.args);
      // NOTE: paperService.count() chưa tồn tại — cần thêm vào paper.service.ts:
      // count({ topic?, yearFrom?, yearTo?, keyword? }) → { count: number }
      // Implementation: PaperModel.countDocuments(buildFilter(args))
      break;
    default:
      throw new Error(`Unknown MCP tool: ${call.name}`);
  }

  // Audit log — fire and forget
  await McpToolRunModel.create({
    reportId: context.reportId,
    userId:   context.userId,
    toolName: call.name,
    input:    call.args,
    output,
    durationMs: Date.now() - t0,
  }).catch(err => logger.warn({ err }, "mcp_tool_run log failed (non-fatal)"));

  return output;
}
```

### 4.4. `generateWithTools()` trong gemini.client.ts

Thêm function mới (không sửa `generateText` / `generateJSON` hiện có):

```ts
export async function generateWithTools(
  prompt: string,
  tools: typeof MCP_TOOL_DEFS,
  executor: (call: {name: string; args: Record<string, unknown>}) => Promise<unknown>,
  opts: GenerateOptions & { maxTurns?: number } = {},
): Promise<string>
// Return type: MARKDOWN STRING (giống generateText) — KHÔNG phải JSON.
// Gemini tự gọi tools cho đến khi tổng hợp đủ → trả text thuần.
// Gaps trong deepAnalysis mode vẫn dùng classic prompt riêng (REPORT_SYSTEM_PROMPT
// vẫn yêu cầu "gaps" JSON field) — generateWithTools chỉ thay thế evidence-gathering,
// không thay thế output format. Output vẫn là ReportLlmOutput JSON cuối cùng.
```

Multi-turn loop:
1. Gửi prompt + tool defs → Gemini
2. Nếu Gemini trả `functionCall` → executor → tool result
3. Gửi lại tool result → Gemini (tối đa `maxTurns`, default 5)
4. Khi Gemini trả text (không phải functionCall) → return text
5. Guard: nếu đến maxTurns mà vẫn tool calls → throw `LlmTruncationError`

### 4.5. Tích hợp vào RAG Reports

**Thêm `deepAnalysis` vào 2 chỗ:**

```ts
// 1. shared-types/src/report.ts — CreateReportRequest
export interface CreateReportRequest {
  query: string;
  topic?: string;
  yearFrom?: number;
  yearTo?: number;
  deepAnalysis?: boolean;  // NEW: opt-in function calling mode
}

// 2. modules/reports/models/report.model.ts — Mongoose schema
// Thêm vào reportSchema:
deepAnalysis: { type: Boolean, default: false }
// Và vào AnalyticalReport shared-type:
deepAnalysis: boolean
```

**Trong `rag.service.ts`:**
```ts
if (report.deepAnalysis) {
  // D2 path: function calling
  output = await generateDeepReport(report, executeMcpTool);
} else {
  // Classic path: giữ nguyên RAG cũ
  output = await generateJSON<ReportLlmOutput>(buildReportPrompt(...));
}
```

**Rate limiting cho deepAnalysis:** Gọi function calling tốn nhiều Gemini quota hơn classic (multi-turn). Giới hạn `deepAnalysis: true` chung với `REPORT_MAX_PER_HOUR` — không cần env var riêng. Admin không bị giới hạn (role check hiện có trong report.controller).

### 4.6. Data Model: mcp_tool_runs

```ts
// modules/mcp/models/mcp-tool-run.model.ts
{
  _id:        ObjectId
  reportId?:  ObjectId, ref "Report", index
  userId?:    ObjectId, ref "User"
  toolName:   String, required
  input:      Schema.Types.Mixed      // JSON của args
  output:     Schema.Types.Mixed      // JSON của kết quả
  durationMs: Number
  createdAt   // TTL 90 ngày
}
```

---

## 5. Feature D3 — Search Analytics

### 5.1. Data Model

**Collection: `search_logs`**

```ts
// modules/analytics/models/search-log.model.ts
{
  _id:         ObjectId
  userId?:     ObjectId, ref "User", index   // null nếu guest
  query:       String, required
  mode:        enum ["semantic", "semantic+rerank"]
  resultCount: Number
  durationMs:  Number
  filters:     { yearFrom?: Number, yearTo?: Number }
  createdAt    // TTL index: 90 ngày
}

// Indexes
{ createdAt: -1 }                    // recent logs
{ userId: 1, createdAt: -1 }         // user history
{ query: "text", language: "none" }  // optional: top queries aggregation
```

### 5.2. Logging trong search.service.ts

```ts
// Fire-and-forget — không block response, không throw
SearchLogModel.create({ userId, query, mode, resultCount, durationMs, filters })
  .catch(err => logger.warn({ err }, "search log write failed (non-fatal)"));
```

### 5.3. API Endpoints

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET /api/v1/analytics/search/summary` | — | **public** | `{ totalSearches, totalPapers, uniqueUsers }` — dùng cho Home page stats ("12K papers, 500+ searches") |
| `GET /api/v1/analytics/search` | `?days=7` | admin | `{ topQueries[{query,count}], volumeByDay[{date,count}] }` |
| `GET /api/v1/analytics/search/me` | — | requireAuth | `{ history: SearchLog[] }` (last 50) |

Aggregation cho `topQueries`:
```
$match: { createdAt: { $gte: daysAgo } }
$group: { _id: "$query", count: { $sum: 1 } }
$sort:  { count: -1 }
$limit: 10
```

### 5.4. Frontend: Dashboard (thay stub 847 bytes)

`apps/web/src/pages/dashboard.tsx`:
- Bar chart: Top 10 queries (last 7 ngày)
- Line chart: Search volume by day
- Section: "My recent searches" (authenticated)

---

## 6. Env Variables mới

```ts
// Phase D — Research Gaps
GAPS_TOP_K:                  z.coerce.number().int().min(1).max(10).default(6)
GAPS_MAX_PER_HOUR:           z.coerce.number().int().positive().default(10)
// Rationale: Gemini free tier ~125 RPD (Pro) / ~250 RPD (Flash). Gap analysis
// + reports share quota. 10/giờ = max 240 calls/ngày — đủ margin cho cả 2 feature.
GAPS_MAX_OUTPUT_TOKENS:      z.coerce.number().int().positive().default(2048)

// Phase D — Function Calling
DEEP_ANALYSIS_MAX_TURNS:     z.coerce.number().int().min(1).max(10).default(5)
DEEP_ANALYSIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(8192)
```

---

## 7. Module Layout

```
apps/backend/src/modules/
├── gaps/                          NEW (D1)
│   ├── dto/gaps.schema.ts
│   ├── models/research-gap.model.ts
│   ├── models/gap-analysis.model.ts
│   ├── gaps.prompt.ts             PURE — GAPS_SYSTEM_PROMPT + buildGapsPrompt()
│   ├── gaps.service.ts            runGapPipeline(), fanOutGapsFromReport(), list(), patch()
│   ├── gaps.controller.ts
│   └── gaps.routes.ts
│
├── mcp/                           NEW (D2)
│   ├── mcp.tools.ts               MCP_TOOL_DEFS (const, no I/O)
│   ├── mcp.executor.ts            executeMcpTool() → dispatch → audit
│   └── models/mcp-tool-run.model.ts
│
├── analytics/                     NEW (D3)
│   ├── models/search-log.model.ts
│   ├── analytics.service.ts       logSearch(), getTopQueries(), getUserHistory()
│   ├── analytics.controller.ts
│   └── analytics.routes.ts
│
├── reports/
│   ├── rag.service.ts             MODIFY: fan-out gaps + deepAnalysis mode switch
│   └── report.prompt.ts           MODIFY: PROMPT_VERSION bump nếu cần
│
└── llm/
    └── gemini.client.ts           MODIFY: thêm generateWithTools()

apps/backend/src/workers/
└── gaps.worker.ts                 NEW — BullMQ Worker cho gaps queue

packages/shared-types/src/
├── report.ts                      MODIFY: thêm deepAnalysis?: boolean vào CreateReportRequest
└── gaps.ts                        NEW — ResearchGap, GapAnalysis, GapsQuery types

apps/web/src/
├── pages/research-gaps.tsx        MODIFY: thay stub bằng full page
├── pages/dashboard.tsx            MODIFY: thay stub bằng analytics charts
└── features/gaps/                 NEW — api/, hooks/, index.ts
```

---

## 8. Error Handling

| Tình huống | Xử lý |
|---|---|
| Gap pipeline: 0 papers retrieved | Mark `gap_analysis.status = "failed"`, message: "Không đủ dữ liệu cho topic này — thử câu hỏi rộng hơn" |
| LLM trả gaps rỗng / malformed | Throw → BullMQ retry (max 3) → "failed" |
| Function calling: maxTurns exceeded | Fallback sang classic RAG mode (không fail — degrade gracefully) |
| Fan-out gaps từ report lỗi | Log warn, không fail report (non-fatal) |
| Search log write lỗi | Log warn, không fail search (non-fatal) |
| `executeMcpTool` unknown tool | Throw — lỗi coding, không retry |

---

## 9. Testing

**Unit tests (Vitest, pure functions):**
- `gaps.prompt.ts`: `buildGapsPrompt()` — input/output shape, delimiter injection hardening
- `mcp.tools.ts`: tool definition schema validation

**Integration smoke (verify thủ công sau khi chạy):**

```powershell
# D1 — Standalone gap analysis
POST /api/v1/gaps/analyze { "topic": "large language models education" }
→ 202 { analysisId }
GET /api/v1/gaps/analyze/:analysisId → { status: "ready", gapIds: [...] }
GET /api/v1/gaps?topic=large+language+models → trả ≥1 gap với confidence

# D1 — Fan-out từ report
POST /api/v1/reports { "query": "AI healthcare" }
→ worker completes → GET /api/v1/gaps?source=report → gaps xuất hiện

# D2 — Function calling
POST /api/v1/reports { "query": "climate AI", "deepAnalysis": true }
→ worker completes → GET /mcp_tool_runs?reportId=... → có entries
→ report.markdown dài hơn classic mode (nhiều evidence hơn)

# D3 — Search logging
GET /api/v1/search?q=neural+networks → response 200
→ DB search_logs có row mới với query="neural networks"
GET /api/v1/analytics/search?days=1 → topQueries có "neural networks"
```

---

## 10. Implementation Order

```
Step 1: D3 Search Analytics         (no LLM, warm up pattern)
  → models + service + routes + FE dashboard stub

Step 2: D1 Research Gaps — BE       (core value, uses existing RAG)
  → models + prompt (với GAP_PROMPT_VERSION constant) + service + gaps.worker.ts + routes
  → gaps.worker.ts CẦN có startup sweep: mark gap_analyses stuck "analyzing" > 5 phút
    thành "failed" — giống pattern report.worker.ts:30-39
  → mount /gaps + /gaps/analyze trong routes/index.ts
  → fan-out hook inline trong rag.service.ts (non-fatal)
  → MODIFY paper.service.ts: thêm count() method (PaperModel.countDocuments)

Step 3: D1 Research Gaps — FE       (research-gaps.tsx full page + feature hooks)

Step 4: D2 Gemini Function Calling  (most complex, builds on D1)
  → generateWithTools() + mcp.tools + mcp.executor + deep mode in rag.service

Step 5: PHASE_D_DEEP_DIVE.md        (viết sau khi tất cả chạy được)
  → giải thích từng tầng như Phase A/B deep dive
```
