# Phase B — Deep Dive (Hiểu TẤT CẢ về Embeddings + Semantic Search)

> Biến bạn từ "vibe code không hiểu" → "hiểu từng dòng Phase B".
> Đọc cùng [PHASE_A_DEEP_DIVE.md](PHASE_A_DEEP_DIVE.md) (Phase A là nền) và [PHASE_B_PREVIEW.md](PHASE_B_PREVIEW.md) (thiết kế).
> Số dòng lấy từ code thật. Cập nhật: 2026-06-01.

---

## 0. Phase B trong 1 câu

> **Phase B = dạy hệ thống HIỂU NGHĨA: sinh "vector" cho mỗi bài báo, rồi tìm theo nghĩa thay vì khớp chữ.**

Phase A: gõ "LLM" chỉ ra bài có chữ "LLM". **Phase B: gõ "LLM" ra cả "large language models", "GPT-4"...** dù khác chữ.

---

## 1. Khái niệm cốt lõi: Embedding & Vector Search

**Embedding = biến 1 đoạn text thành dãy 768 số biểu diễn NGHĨA.**

```
"large language models"  ─[Gemini]→  [0.21, -0.05, 0.88, ...]  ┐ GẦN nhau
"LLM"                    ─[Gemini]→  [0.20, -0.04, 0.85, ...]  ┘ → cosine ≈ 0.95
"cách nấu phở"           ─[Gemini]→  [-0.7, 0.9, 0.1, ...]       → cosine ≈ 0.05 (xa)
```

- **Vector** = điểm trong không gian 768 chiều.
- **Cosine similarity** = đo độ "gần" giữa 2 vector (1 = giống hệt nghĩa, 0 = không liên quan).
- **Vector search** = "cho 1 vector câu hỏi, tìm các vector paper GẦN nhất". Atlas làm việc này siêu nhanh nhờ index.

---

## 2. Kiến trúc Phase B (vẽ cho thầy)

```
   ┌──────────── LUỒNG A: INDEX (offline — embedding worker) ─────────────┐
   │                                                                       │
   research_papers                                                         │
   (isAiAnalyzable=true,  ─► runEmbedding() ─► Gemini embedBatch ─► vector │
    chưa có embedding)        batch 50          (768 chiều)         768-dim│
        │                                                            │     │
        │                                              paper.embedding ◄───┘
        ▼
   Atlas paper_vector_index (768, cosine) ── tự thấy vector mới

   ┌──────────── LUỒNG B: SEARCH (online — /search endpoint) ─────────────┐
   │                                                                       │
   User: "AI in education"                                                 │
        │                                                                  │
        ▼ embed câu hỏi → vector 768                                       │
        ▼ $vectorSearch trên paper_vector_index → top-K paper gần nghĩa    │
        ▼ trả { data: Paper[] (kèm score), meta }                          │
   └───────────────────────────────────────────────────────────────────────┘
```

**2 process riêng** (giống Phase A):
- `pnpm dev:backend` — API (xử lý `/search`, `/admin/embed`)
- `pnpm --filter backend worker:embedding` — worker sinh vector

---

## 3. Các tầng chi tiết (file:dòng)

### Tầng ① — Embedding Provider (đã có sẵn từ Phase 0)
| File | Vai trò |
|---|---|
| `modules/embeddings/embedding.provider.ts` | Interface `EmbeddingProvider` (embed + embedBatch) — provider-agnostic |
| `modules/embeddings/gemini-embedding.provider.ts` | Gọi Gemini `embedContent` thật, batch 1 round-trip, 768 chiều |
| `modules/embeddings/embedding.factory.ts` | `getEmbeddingProvider()` singleton — chỗ duy nhất chọn provider |

→ Đây là phần khó nhất, **đã làm sẵn**. Phase B chỉ dùng lại.

### Tầng ② — Embedding Service (trái tim Luồng A)
📁 `modules/embeddings/embedding.service.ts` — `runEmbedding()`

| Phần | Dòng | Làm gì |
|---|---|---|
| filter candidates | ~37 | `{ isAiAnalyzable: true, embedding: { $exists: false } }` — chỉ bài đủ tốt + chưa có vector |
| vòng while drain | ~45 | lấy batch 50 → embed → lưu → batch tự rớt khỏi filter |
| build text | ~54 | `title + "\n\n" + abstractText` |
| `embedBatch` | ~59 | gọi Gemini 1 lần cho cả 50 |
| **break on fail** | ~64 | batch lỗi → log + `break` (KHÔNG continue → tránh loop vô hạn) |
| lưu vector | ~70 | `updateOne({_id}, { $set: { embedding: vec } })` |

**Điểm cốt lõi — IDEMPOTENT:** sau khi lưu vector, bài đó **rớt khỏi filter** (`$exists:false` không match nữa). → Chạy lại chỉ xử lý bài mới sync. **Không tốn tiền embed lại.**

**Cổng lọc:** chỉ embed `isAiAnalyzable=true` (Phase A đã chấm) → **không tốn tiền AI cho rác**.

### Tầng ③ — Embedding Worker
📁 `workers/embedding.worker.ts`
- BullMQ Worker tiêu thụ queue `"embedding"`, gọi `runEmbedding`.
- `concurrency: 1` (tôn trọng rate limit Gemini).
- Cron `EMBED_CRON` (mặc định `0 3 * * *`) — tự embed bài mới mỗi đêm.
- Graceful shutdown (SIGINT/SIGTERM).

### Tầng ④ — Admin trigger embedding
📁 `modules/embeddings/embedding.controller.ts` + `embedding.routes.ts`
- `POST /api/v1/admin/embed` → enqueue job → **202** (giống `/admin/sync`).
- `GET /api/v1/admin/embed/status` → `{ analyzable, embedded, pending }` (bao nhiêu bài đã có vector).
- Gate `requireAuth + requireRole("admin")` (bypass `SYNC_ADMIN_BYPASS`).

### Tầng ⑤ — Semantic Search (trái tim Luồng B)
📁 `modules/search/search.service.ts` — `searchService.semantic()`

```ts
queryVector = embed(q)                       // câu hỏi → vector 768
pipeline = [
  { $vectorSearch: {                         // Atlas tìm vector gần nhất
      index: "paper_vector_index",
      path: "embedding",
      queryVector, numCandidates, limit,
      filter: { dataStatus: "active", publicationYear: {...} } } },
  { $addFields: { score: { $meta: "vectorSearchScore" } } },  // độ giống 0..1
  { $skip: (page-1)*pageSize },              // phân trang
  { $project: { embedding: 0, __v: 0 } },    // bỏ vector khỏi response
]
```

| Điểm | Giải thích |
|---|---|
| `numCandidates` | số ứng viên Atlas quét (rộng) trước khi chọn `limit` (chính xác) |
| `filter` | CHỈ field index làm filter: `dataStatus`, `publicationYear`, `topics` |
| `score` | `$meta:"vectorSearchScore"` = độ giống nghĩa (cao = gần) |
| bỏ `embedding` | response không kéo vector 768 số qua mạng |

### Tầng ⑥ — Search endpoint
📁 `search.controller.ts` + `search.routes.ts` + `dto/search.schema.ts`
- `GET /api/v1/search?q=&page=&pageSize=&yearFrom=&yearTo=`
- Zod parse **inline trong controller** (không qua `validate()` middleware) vì **Express 5 làm `req.query` read-only** — gán lại sẽ throw.
- Trả envelope `{ success, data: Paper[] (kèm score), meta: { page, pageSize, total, totalPages, mode:"semantic" } }`.

---

## 4. Endpoint mới của Phase B

| Method + Path | Input | Output |
|---|---|---|
| `GET /api/v1/search` | `?q=&page=&pageSize=&yearFrom=&yearTo=` | `{ data: Paper[] + score, meta }` — semantic |
| `POST /api/v1/admin/embed` | — | `202 { jobId, status:"queued" }` |
| `GET /api/v1/admin/embed/status` | — | `{ analyzable, embedded, pending }` |

**Hàm nội bộ:**
- `runEmbedding({batchSize?, maxPapers?}) → { totalEmbedded, totalFailed, batches }`
- `searchService.semantic({q, page, pageSize, yearFrom?, yearTo?}) → { papers, total }`

---

## 5. 🔗 Phase A nối vào Phase B ở đâu

| Phase A/0 chuẩn bị | Phase B dùng |
|---|---|
| `paper.embedding` field (`select:false`) | `runEmbedding` đổ vector vào — **không đổi schema** |
| `paper_vector_index` (Phase 0, 768 cosine) | `$vectorSearch` query thẳng |
| `isAiAnalyzable = score≥0.7` | filter candidates → không embed rác |
| `title + abstractText` đã normalize | input tạo embedding |
| `getEmbeddingProvider()` + `gemini.client` | gọi vào, không viết lại |
| BullMQ pattern (`sync.worker`) | copy cho `embedding.worker` |

> **Câu chốt demo:** *"Em reserve field embedding + vector index từ Phase A. Phase B chỉ đổ vector + thêm endpoint, không sửa một dòng schema."*

---

## 6. Cách verify (chạy thật)

```powershell
# 0. (BẮT BUỘC) GEMINI_API_KEY còn hạn trong apps/backend/.env

# 1. Sinh vector cho 200 paper
pnpm --filter backend embed:once
   → totalEmbedded: 200

# 2. Kiểm tra coverage
#    GET /api/v1/admin/embed/status → { analyzable:200, embedded:200, pending:0 }

# 3. Test semantic search (Swagger /api-docs hoặc curl)
#    GET /api/v1/search?q=AI in education
#    → trả paper xếp theo score, gõ "LLM" ra cả "large language models"
```

Verify trong Compass: `research_papers` → 1 doc → field `embedding` có **768 số**.

---

## 7. Từ điển thuật ngữ (cho người vibe code)

| Thuật ngữ | Nghĩa đơn giản |
|---|---|
| **Embedding** | Dãy 768 số biểu diễn nghĩa của 1 đoạn text |
| **Vector** | Chính là dãy số đó — 1 điểm trong không gian 768 chiều |
| **Cosine similarity** | Đo độ "gần" 2 vector (1=giống, 0=khác) |
| **Vector search** | Tìm các vector gần nhất với vector câu hỏi |
| **`$vectorSearch`** | Stage aggregate của Atlas để vector search |
| **numCandidates** | Số ứng viên quét rộng trước khi chọn top chính xác |
| **Semantic search** | Tìm theo NGHĨA (vs keyword = theo CHỮ) |
| **Idempotent** | Chạy lại không làm lại việc đã xong (không embed lại) |
| **Batch** | Gộp nhiều text gửi Gemini 1 lần (tiết kiệm request) |

---

## 8. Gotchas (đã gặp / cần nhớ)

| Gotcha | Chi tiết |
|---|---|
| **GEMINI_API_KEY hết hạn** | Lỗi `API key expired` → lấy key mới ở aistudio.google.com/apikey, sửa `.env`. Mỗi dev key riêng |
| **break khi batch lỗi** | `runEmbedding` phải `break` (không `continue`) khi embedBatch fail → tránh loop vô hạn (cùng candidates match lại mãi) |
| **idempotent qua `$exists:false`** | Bài có vector rớt khỏi filter → chạy lại không tốn tiền |
| **Express 5 `req.query` read-only** | Search controller parse Zod **inline**, không dùng `validate(query)` (sẽ throw) |
| **filter $vectorSearch giới hạn** | Chỉ filter được field đã khai trong index (dataStatus, publicationYear, topics) |
| **vector total không rẻ** | `$vectorSearch` không cho tổng chính xác → `total` là ước lượng theo trang |
| **select:false** | `embedding` không bị kéo ra ở list query; search cũng `$project` bỏ nó |
| **rate limit Gemini free** | ~125-250 req/ngày → batch 50 + worker concurrency 1 |

---

## 9. Còn lại của Phase B (optional, sau MVP)

- **LLM relevance re-rank**: Gemini chấm lại top-K + giải thích (cache theo `hash(query+model+prompt_ver)`).
- **`publication_trends` + `/trends`**: đếm bài/năm theo topic → dashboard biểu đồ.
- **FE đổi endpoint**: `/papers?q=` → `/search?q=` (UI giữ nguyên).
- **paper_text_chunks**: chunk abstract/fulltext để RAG (Phase C).

---

## Tham khảo
- [PHASE_B_PREVIEW.md](PHASE_B_PREVIEW.md) — thiết kế tổng
- [PHASE_A_DEEP_DIVE.md](PHASE_A_DEEP_DIVE.md) — nền Phase A
- Code: `apps/backend/src/modules/{embeddings,search}/`, `workers/embedding.worker.ts`
