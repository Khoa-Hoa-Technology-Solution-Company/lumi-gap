/**
 * Probe the CURRENT Gemini key (from apps/backend/.env) with one embed + one
 * generate call, to see exactly what quota is available right now. No DB needed.
 *
 * Run: pnpm --filter backend exec tsx scripts/probe-gemini.ts
 */
import { env } from "../src/config/env.js";
import { getEmbeddingProvider } from "../src/modules/embeddings/embedding.factory.js";
import { generateText } from "../src/modules/llm/gemini.client.js";

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  const log = console.log;
  log(`Embedding model : ${env.GEMINI_EMBEDDING_MODEL} (${env.GEMINI_EMBEDDING_DIMENSIONS}d)`);
  log(`Fast model      : ${env.GEMINI_MODEL_FAST}`);
  log(`Deep model      : ${env.GEMINI_MODEL_DEEP}`);
  log(`API key (tail)  : ...${env.GEMINI_API_KEY.slice(-4)}`); // last 4 only — never the full key
  log("------------------------------------------------------------");

  // 1) Embed probe — this is what search / report / gaps spend per query.
  try {
    const vec = await getEmbeddingProvider().embed("hello world embedding probe");
    log(`✅ EMBED ok — got a ${vec.length}-dim vector. Embed quota is AVAILABLE.`);
  } catch (e) {
    log(`❌ EMBED failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) Generate probe (Flash) — this is the report/gap LLM call.
  try {
    const txt = await generateText("Reply with exactly: OK", {
      model: env.GEMINI_MODEL_FAST,
      maxOutputTokens: 16,
    });
    log(`✅ GENERATE (Flash) ok — reply: "${txt.trim().slice(0, 40)}"`);
  } catch (e) {
    log(`❌ GENERATE failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  process.exit(0);
}

void main();
