// apps/backend/src/modules/mcp/mcp.tools.ts
/**
 * Tool definitions for Gemini function-calling mode.
 * PURE DATA — no I/O. Executor handles dispatch.
 */
export const MCP_TOOL_DEFS = [
  {
    name: "search_papers",
    description:
      "Semantic search for academic papers by meaning. Returns top-K papers with title, abstract, citations, year.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (any language)" },
        yearFrom: { type: "number", description: "Filter: published from this year (inclusive)" },
        yearTo: { type: "number", description: "Filter: published up to this year (inclusive)" },
        limit: { type: "number", description: "Max results (1-10, default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_trends",
    description:
      "Get publication trend metrics for a topic: YoY growth, CAGR, momentum score, yearly paper counts.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Research topic keyword" },
        yearFrom: { type: "number" },
        yearTo: { type: "number" },
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
        topic: { type: "string" },
        yearFrom: { type: "number" },
        yearTo: { type: "number" },
        keyword: { type: "string", description: "Filter by keyword in title/abstract" },
      },
    },
  },
] as const;
