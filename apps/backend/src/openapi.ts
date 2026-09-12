/**
 * OpenAPI 3.0 spec for the Publication Trend API. Served as interactive,
 * testable docs at GET /api-docs (Swagger UI). Hand-maintained for now;
 * keep it in sync when adding/changing endpoints.
 */
export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Publication Trend API",
    version: "0.1.0 (Phase A)",
    description:
      "AI-assisted academic publication trend system. Phase A exposes auth, " +
      "paper search/detail, and admin sync. Every response uses the envelope " +
      "`{ success, data, meta? }` or `{ success: false, error }`.",
  },
  servers: [{ url: "http://localhost:4000", description: "Local dev" }],
  tags: [
    { name: "Health" },
    { name: "Home" },
    { name: "Auth" },
    { name: "Papers" },
    { name: "Search" },
    { name: "Trends" },
    { name: "Reports" },
    { name: "Admin" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "NOT_FOUND" },
              message: { type: "string", example: "Paper not found" },
              details: {},
            },
          },
        },
      },
      Meta: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          pageSize: { type: "integer", example: 20 },
          total: { type: "integer", example: 200 },
          totalPages: { type: "integer", example: 10 },
        },
      },
      PaperAuthor: {
        type: "object",
        properties: {
          displayName: { type: "string", example: "Enkelejda Kasneci" },
          position: { type: "integer", example: 0 },
          isCorresponding: { type: "boolean", example: true },
        },
      },
      Paper: {
        type: "object",
        properties: {
          id: { type: "string", example: "6a1a6e79b89cd7e3196fdc98" },
          title: {
            type: "string",
            example:
              "ChatGPT for good? On opportunities and challenges of large language models for education",
          },
          abstractText: { type: "string" },
          authors: { type: "array", items: { $ref: "#/components/schemas/PaperAuthor" } },
          journalName: { type: "string", example: "Learning and Individual Differences" },
          publicationYear: { type: "integer", example: 2023 },
          citationCount: { type: "integer", example: 4826 },
          fwci: { type: "number", example: 2.35 },
          citationNormalizedPercentile: {
            type: "object",
            properties: {
              value: { type: "number", example: 0.96 },
              isInTop1Percent: { type: "boolean", example: false },
              isInTop10Percent: { type: "boolean", example: true },
            },
          },
          relatedWorksCount: { type: "integer", example: 10 },
          topics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                openalexTopicId: { type: "string", example: "T12547" },
                topicName: {
                  type: "string",
                  example: "Pharmaceutical studies and practices",
                },
                confidence: { type: "number", example: 0.98 },
                isPrimary: { type: "boolean", example: true },
                subfieldId: { type: "string", example: "2735" },
                subfieldName: {
                  type: "string",
                  example: "Pediatrics, Perinatology and Child Health",
                },
                fieldId: { type: "string", example: "27" },
                fieldName: { type: "string", example: "Medicine" },
                domainId: { type: "string", example: "4" },
                domainName: { type: "string", example: "Health Sciences" },
              },
            },
          },
          externalIds: {
            type: "object",
            properties: {
              doi: { type: "string", example: "10.1016/j.lindif.2023.102274" },
              openalexId: { type: "string", example: "W4321..." },
            },
          },
          openAccessStatus: {
            type: "string",
            enum: ["gold", "green", "hybrid", "bronze", "closed", "unknown"],
          },
          openAccessUrl: { type: "string" },
          dataQualityScore: { type: "number", example: 0.857 },
          isAiAnalyzable: { type: "boolean", example: true },
          dataStatus: { type: "string", enum: ["draft", "active", "low-quality", "archived"] },
          primaryProvider: { type: "string", example: "openalex" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      YearlyCount: {
        type: "object",
        properties: {
          year: { type: "integer", example: 2024 },
          count: { type: "integer", example: 87 },
        },
      },
      TopItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", example: "Computers and Education" },
          count: { type: "integer", example: 12 },
        },
      },
      TrendingTopic: {
        type: "object",
        properties: {
          topic: { type: "string", example: "Artificial Intelligence" },
          totalPapers: { type: "integer", example: 142 },
          yearlyBreakdown: { type: "array", items: { $ref: "#/components/schemas/YearlyCount" } },
          growthRatePct: { type: "number", example: 38.5, description: "YoY %, last complete year vs the one before" },
          cagr3yPct: { type: "number", nullable: true, example: 52.1, description: "Compound annual growth over <=3 complete years" },
          momentum: { type: "number", example: 21.4, description: "Least-squares slope, papers/year" },
        },
      },
      RisingKeyword: {
        type: "object",
        properties: {
          keyword: { type: "string", example: "retrieval-augmented generation" },
          totalPapers: { type: "integer", example: 9 },
          growthRatePct: { type: "number", example: 350 },
          yearlyBreakdown: { type: "array", items: { $ref: "#/components/schemas/YearlyCount" } },
        },
      },
      TrendsOverview: {
        type: "object",
        properties: {
          yearFrom: { type: "integer", example: 2021 },
          yearTo: { type: "integer", example: 2026 },
          lastCompleteYear: {
            type: "integer",
            example: 2025,
            description:
              "Metrics use years <= this. yearlyBreakdown entries beyond it are the running YTD year — label/style them accordingly on charts.",
          },
          totalPapersInWindow: { type: "integer", example: 594 },
          facets: {
            type: "object",
            properties: {
              paperKinds: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              openAccessStatuses: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              providers: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              topSources: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              languages: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              citationBands: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              domains: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              fields: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              subfields: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
              topics: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
            },
          },
          topics: { type: "array", items: { $ref: "#/components/schemas/TrendingTopic" } },
          risingKeywords: { type: "array", items: { $ref: "#/components/schemas/RisingKeyword" } },
          computedAt: { type: "string", format: "date-time" },
        },
      },
      PublicationTrend: {
        type: "object",
        properties: {
          topic: { type: "string", example: "Artificial Intelligence" },
          totalPapers: { type: "integer", example: 142 },
          yearlyBreakdown: { type: "array", items: { $ref: "#/components/schemas/YearlyCount" } },
          lastCompleteYear: {
            type: "integer",
            example: 2025,
            description: "Same semantics as TrendsOverview.lastCompleteYear",
          },
          growthRatePct: { type: "number", example: 38.5 },
          cagr3yPct: { type: "number", nullable: true, example: 52.1 },
          momentum: { type: "number", example: 21.4 },
          topJournals: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
          topAuthors: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
          topKeywords: { type: "array", items: { $ref: "#/components/schemas/TopItem" } },
          computedAt: { type: "string", format: "date-time" },
        },
      },
      ResearchGap: {
        type: "object",
        properties: {
          title: { type: "string", example: "Thiếu nghiên cứu dài hạn về tác động học tập" },
          description: { type: "string" },
          rationale: { type: "string" },
          supportingPaperIds: {
            type: "array",
            items: { type: "string" },
            description: "RESOLVED paper ids (not citation numbers) — link directly to /papers/{id}",
          },
          confidence: { type: "number", example: 0.7 },
        },
      },
      AnalyticalReport: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          topic: { type: "string", description: "Optional display label — may be absent" },
          query: { type: "string", example: "Xu hướng dùng LLM trong giáo dục đại học?" },
          status: { type: "string", enum: ["queued", "generating", "ready", "failed"] },
          markdown: {
            type: "string",
            description:
              "Report body, present when ready. Inline citations are [n] where n is 1-BASED " +
              "into groundingPaperIds: render [n] as a link to groundingPaperIds[n-1].",
          },
          groundingPaperIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Paper ids in RETRIEVAL ORDER — ORDER-SIGNIFICANT. Citation [n] in markdown " +
              "maps to index n-1. Do NOT sort or dedupe this array.",
          },
          selectedPaperIds: {
            type: "array",
            items: { type: "string" },
            description: "User-pinned evidence papers, placed before retrieved papers during generation.",
          },
          researchGaps: { type: "array", items: { $ref: "#/components/schemas/ResearchGap" } },
          modelVersion: { type: "string", example: "gemini-3.5-flash" },
          promptVersion: { type: "string", example: "report-v2" },
          errorMessage: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      ReportEvidencePaper: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          abstractText: { type: "string" },
          publicationYear: { type: "integer" },
          journalName: { type: "string" },
          citationCount: { type: "integer" },
          authorNames: { type: "array", items: { type: "string" } },
          score: { type: "number" },
          source: { type: "string", enum: ["selected", "retrieved"] },
        },
      },
      PreviewReportEvidenceResponse: {
        type: "object",
        properties: {
          papers: { type: "array", items: { $ref: "#/components/schemas/ReportEvidencePaper" } },
          retrievedPaperIds: { type: "array", items: { type: "string" } },
          selectedPaperIds: { type: "array", items: { type: "string" } },
          maxEvidencePapers: { type: "integer" },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
      ReportListItem: {
        type: "object",
        description:
          "Light row returned by GET /reports — markdown, researchGaps and groundingPaperIds " +
          "are STRIPPED to keep the list cheap; fetch GET /reports/{id} for the full report.",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          topic: { type: "string" },
          query: { type: "string" },
          status: { type: "string", enum: ["queued", "generating", "ready", "failed"] },
          modelVersion: { type: "string" },
          promptVersion: { type: "string" },
          errorMessage: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      AuthCredentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "researcher@university.edu" },
          password: { type: "string", format: "password", example: "password123" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        responses: { "200": { description: "OK" } },
      },
    },
    "/ready": {
      get: {
        tags: ["Health"],
        summary: "MongoDB and Redis readiness check",
        responses: {
          "200": { description: "Required dependencies are ready" },
          "503": { description: "At least one required dependency is unavailable" },
        },
      },
    },
    "/api/v1/home/overview": {
      get: {
        tags: ["Home"],
        summary: "Hybrid home overview for guest, signed-in user, or admin",
        description:
          "Public endpoint with optional bearer auth. Without a valid token it returns guest landing data. " +
          "With a valid user token it adds workspace data. With an admin token it also adds system-health data.",
        security: [{}, { bearerAuth: [] }],
        responses: {
          "200": {
            description:
              "OK — returns HomeOverview: { mode, summary, trends, recentPapers, workspace?, admin? }",
          },
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/AuthCredentials" },
                  {
                    type: "object",
                    required: ["fullName"],
                    properties: {
                      fullName: { type: "string", example: "Hoang Long Anh" },
                      role: { type: "string", enum: ["student", "lecturer", "researcher"] },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: { "201": { description: "Created — returns { user, tokens }" } },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AuthCredentials" } },
          },
        },
        responses: {
          "200": { description: "OK — returns { user, tokens }" },
          "401": {
            description: "Invalid credentials",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
          },
        },
      },
    },
    "/api/v1/auth/oauth/exchange": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a one-time OAuth callback code for an authenticated session",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: {
                  code: {
                    type: "string",
                    minLength: 32,
                    description: "Short-lived, single-use code returned by the Google OAuth callback",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "OK - returns { user, tokens }" },
          "401": {
            description: "Code is invalid, expired, or already consumed",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
            },
          },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK — returns { user }" }, "401": { description: "Unauthorized" } },
      },
    },
    "/api/v1/papers": {
      get: {
        tags: ["Papers"],
        summary: "Search + list papers (paginated)",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Keyword over title + abstract" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
        ],
        responses: {
          "200": {
            description: "List of papers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/Paper" } },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/papers/{id}": {
      get: {
        tags: ["Papers"],
        summary: "Paper detail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Single paper",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/Paper" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
          },
        },
      },
    },
    "/api/v1/search": {
      get: {
        tags: ["Search"],
        summary: "Semantic search (Phase B) — match by meaning via vector embeddings",
        description:
          "Embeds the query and finds nearest paper vectors (cosine). With " +
          "`rerank=true`, the top candidate pool is additionally re-scored by an " +
          "LLM for true query relevance and re-ordered (each item then carries " +
          "`rerankScore` 0..1); results are LLM-cached 7 days and the rerank path " +
          "is rate-limited per IP. meta.mode reflects 'semantic' or 'semantic+rerank'. " +
          "PAGINATION NOTE: with rerank=true, results are bounded to a candidate pool " +
          "(>= the requested page; ~RERANK_CANDIDATES default 20) and meta.total is the " +
          "pool size, so pages far beyond the pool are empty. Plain mode's meta.total " +
          "is a running lower-bound estimate, not the exact corpus match count.",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Natural-language query" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
          { name: "yearFrom", in: "query", schema: { type: "integer" } },
          { name: "yearTo", in: "query", schema: { type: "integer" } },
          {
            name: "rerank",
            in: "query",
            schema: { type: "string", enum: ["true", "false"], default: "false" },
            description: "Opt-in LLM re-ranking of the top candidate pool",
          },
        ],
        responses: {
          "200": {
            description:
              "Papers ranked by relevance. Each item has `score` (0..1 vector similarity); " +
              "when reranked, also `rerankScore` (0..1 LLM relevance, the sort key).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: {
                        allOf: [
                          { $ref: "#/components/schemas/Paper" },
                          {
                            type: "object",
                            properties: {
                              score: { type: "number", example: 0.91 },
                              rerankScore: { type: "number", nullable: true, example: 0.97, description: "Present only when rerank=true" },
                            },
                          },
                        ],
                      },
                    },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/trends": {
      get: {
        tags: ["Trends"],
        summary: "Trending topics overview — yearly series + growth metrics + rising keywords",
        description:
          "Aggregates research_papers per topic per year, then computes growth metrics " +
          "over COMPLETE years (the running calendar year is charted but excluded from " +
          "the math). Formulas: YoY growth %, 3-year CAGR %, momentum (least-squares " +
          "slope, papers/year). Cached in Redis for 1h.",
        parameters: [
          { name: "yearFrom", in: "query", schema: { type: "integer" }, description: "Default: yearTo - 5" },
          { name: "yearTo", in: "query", schema: { type: "integer" }, description: "Default: current year" },
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
          { name: "minPapers", in: "query", schema: { type: "integer", default: 3 }, description: "Hide topics with fewer total papers (noise filter)" },
          { name: "sortBy", in: "query", schema: { type: "string", enum: ["momentum", "growth", "total"], default: "momentum" } },
        ],
        responses: {
          "200": {
            description: "Trends overview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/TrendsOverview" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/trends/{topic}": {
      get: {
        tags: ["Trends"],
        summary: "Deep dive into one topic — series, metrics, top journals/authors/keywords",
        parameters: [
          { name: "topic", in: "path", required: true, schema: { type: "string" }, description: "Exact topic name (URL-encoded), e.g. 'Artificial Intelligence'" },
          { name: "yearFrom", in: "query", schema: { type: "integer" } },
          { name: "yearTo", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Topic trend detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/PublicationTrend" },
                  },
                },
              },
            },
          },
          "404": {
            description: "Topic has no papers in the window",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
          },
        },
      },
    },
    "/api/v1/reports": {
      post: {
        tags: ["Reports"],
        summary: "Request an AI analytical report (RAG) — async, returns 202",
        description:
          "Creates a queued report and enqueues a BullMQ job. The report worker runs the " +
          "RAG pipeline: embed the question → pin selected evidence papers → vector-search top-K evidence papers → " +
          "Gemini 2.5 Pro writes a grounded markdown report with [n] citations plus " +
          "preliminary research gaps. The output language is controlled by the language field. " +
          "Poll GET /reports/{id} (~3s) until status is ready/failed.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          description: "yearFrom must be <= yearTo, otherwise 400 BAD_REQUEST.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string", minLength: 3, maxLength: 500, example: "Xu hướng dùng LLM trong giáo dục đại học?" },
                  topic: { type: "string", maxLength: 200, example: "Artificial Intelligence in Healthcare and Education" },
                  yearFrom: { type: "integer", minimum: 1900, maximum: 2100, example: 2022 },
                  yearTo: { type: "integer", minimum: 1900, maximum: 2100, example: 2026 },
                  language: { type: "string", enum: ["auto", "en", "vi"], default: "auto" },
                  selectedPaperIds: { type: "array", maxItems: 20, items: { type: "string" } },
                  fillWithRetrieved: {
                    type: "boolean",
                    default: true,
                    description: "Set false while editing a reviewed evidence pack so removed papers are not auto-filled again.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "Queued — returns { id, status: 'queued' }" },
          "400": { description: "Validation failed (query too short/long, yearFrom > yearTo)" },
          "401": { description: "Login required" },
          "429": { description: "Too many pending reports, or hourly creation limit reached" },
        },
      },
      get: {
        tags: ["Reports"],
        summary: "List my reports (newest first — light rows, no markdown/gaps)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of the caller's reports",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/ReportListItem" } },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/reports/evidence-preview": {
      post: {
        tags: ["Reports"],
        summary: "Preview the report evidence pack before generation",
        description:
          "Embeds the query and returns the exact ordered evidence pack the report worker will use. " +
          "Selected papers are pinned first; vector retrieval fills the remaining evidence budget. " +
          "This endpoint does not call the LLM generator.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string", minLength: 3, maxLength: 500 },
                  topic: { type: "string", maxLength: 200 },
                  yearFrom: { type: "integer", minimum: 1900, maximum: 2100 },
                  yearTo: { type: "integer", minimum: 1900, maximum: 2100 },
                  language: { type: "string", enum: ["auto", "en", "vi"], default: "auto" },
                  selectedPaperIds: { type: "array", maxItems: 20, items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Evidence preview",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/PreviewReportEvidenceResponse" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation failed" },
          "401": { description: "Login required" },
        },
      },
    },
    "/api/v1/reports/{id}": {
      get: {
        tags: ["Reports"],
        summary: "Get one report (full content) — owner only",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "The report",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/AnalyticalReport" },
                  },
                },
              },
            },
          },
          "404": { description: "Not found (or not yours)" },
        },
      },
    },
    "/api/v1/admin/embed": {
      post: {
        tags: ["Admin"],
        summary: "Trigger an embedding run (enqueues a job)",
        security: [{ bearerAuth: [] }],
        responses: { "202": { description: "Queued — returns { jobId, status }" }, "403": { description: "Admin only" } },
      },
    },
    "/api/v1/admin/embed/status": {
      get: {
        tags: ["Admin"],
        summary: "Embedding coverage — how many analyzable papers have vectors",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "{ analyzable, embedded, pending }" } },
      },
    },
    "/api/v1/admin/pipeline/status": {
      get: {
        tags: ["Admin"],
        summary: "Operational health for queues, workers, corpus readiness, and stale AI jobs",
        description:
          "Returns BullMQ queue counts, queue latency, worker heartbeat status, recent failed/dead-letter jobs, Redis availability, corpus embedding/AI-analysis coverage, latest sync run, stale report/gap counts, and deterministic recommendations.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description:
              "Pipeline status. If Redis/queue or heartbeat inspection fails, the endpoint still returns corpus diagnostics with redis.ok=false or missing worker heartbeats.",
          },
          "403": { description: "Admin only" },
        },
      },
    },
    "/api/v1/admin/evaluation/summary": {
      get: {
        tags: ["Admin"],
        summary: "AI correctness and acceptance benchmark summary",
        description:
          "Returns deterministic checks for search readiness, trend formulas, gap evidence, report grounding, paper score rubric, and corpus-backed report/gap coverage. This endpoint does not call an LLM.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description:
              "Evaluation summary with overall score, score rubric, corpus metrics, and per-feature acceptance checks.",
          },
          "403": { description: "Admin only" },
        },
      },
    },
    "/api/v1/admin/sync": {
      post: {
        tags: ["Admin"],
        summary: "Trigger an OpenAlex sync (enqueues a job)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["searchText"],
                properties: {
                  searchText: { type: "string", example: "large language model education" },
                  yearFrom: { type: "integer", default: 2022 },
                  maxPages: { type: "integer", default: 1, maximum: 50 },
                },
              },
            },
          },
        },
        responses: { "202": { description: "Queued — returns { jobId, status }" }, "403": { description: "Admin only" } },
      },
    },
    "/api/v1/admin/sync/runs": {
      get: {
        tags: ["Admin"],
        summary: "List recent sync runs with stats",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Recent runs" }, "403": { description: "Admin only" } },
      },
    },
  },
} as const;
