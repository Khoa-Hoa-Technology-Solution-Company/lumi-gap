// apps/backend/src/modules/mcp/mcp.executor.ts
import { logger } from "../../infrastructure/logger.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { searchService } from "../search/search.service.js";
import { trendService } from "../trends/trend.service.js";
import { paperService } from "../papers/paper.service.js";

export interface McpToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface McpExecutorContext {
  reportId?: string;
  userId?: string;
}

export async function executeMcpTool(
  call: McpToolCall,
  context: McpExecutorContext,
): Promise<unknown> {
  const t0 = Date.now();
  let output: unknown;

  // A tool error must NEVER escape into the deep-report pipeline: it would bypass
  // the truncation/content fallback in rag.service and fail the whole report
  // through all 5 BullMQ retries (each re-embedding + re-running the model). Instead
  // we hand the model a `{ error }` payload so it can recover or proceed without it.
  // Example: get_trends throws AppError.notFound for a sparse topic — that is a normal
  // tool outcome, not a pipeline failure.
  try {
    switch (call.name) {
      case "search_papers": {
        const result = await searchService.semantic({
          q: String(call.args.query ?? ""),
          page: 1,
          pageSize: Math.min(Math.max(1, Number(call.args.limit ?? 8)), 10),
          yearFrom: call.args.yearFrom as number | undefined,
          yearTo: call.args.yearTo as number | undefined,
        });
        output = {
          total: result.total,
          papers: result.papers.map((p) => {
            const raw = p as unknown as Record<string, unknown>;
            return {
              id: p.id,
              title: p.title,
              publicationYear: raw.publicationYear,
              citationCount: raw.citationCount,
              abstractText: raw.abstractText,
              score: p.score,
            };
          }),
        };
        break;
      }
      case "get_trends": {
        const topic = String(call.args.topic ?? "");
        output = await trendService.topic(topic, {
          yearFrom: call.args.yearFrom as number | undefined,
          yearTo: call.args.yearTo as number | undefined,
        });
        break;
      }
      case "count_papers": {
        output = await paperService.count({
          topic: call.args.topic as string | undefined,
          yearFrom: call.args.yearFrom as number | undefined,
          yearTo: call.args.yearTo as number | undefined,
          keyword: call.args.keyword as string | undefined,
        });
        break;
      }
      default:
        output = { error: `Unknown MCP tool: ${call.name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, tool: call.name }, "mcp tool errored — returning error payload to model");
    output = { error: message };
  }

  // Fire-and-forget audit log
  const resolveId = async (kind: "report" | "user", value?: string) => {
    if (!value) return undefined;
    const parsed = parseDatabaseId(value);
    if (!parsed) return undefined;
    const where = parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
    const row = kind === "report"
      ? await getPrisma().report.findUnique({ where, select: { id: true } })
      : await getPrisma().user.findUnique({ where, select: { id: true } });
    return row?.id;
  };
  Promise.all([resolveId("report", context.reportId), resolveId("user", context.userId)])
    .then(([reportId, userId]) => getPrisma().mcpToolRun.create({
      data: {
        reportId,
        userId,
        toolName: call.name,
        input: call.args as never,
        output: output as never,
        durationMs: Date.now() - t0,
      },
    }))
    .catch((err) => logger.warn({ err }, "mcp_tool_run log failed (non-fatal)"));

  return output;
}
