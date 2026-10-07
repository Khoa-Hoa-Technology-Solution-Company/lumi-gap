# AGENTS.md — LumiGap

Instructions for AI coding agents other than Claude Code (Codex, Cursor, Gemini CLI, ...).

**Read [`CLAUDE.md`](CLAUDE.md) first.** It is the single source of truth for this repo's stack, layout and non-negotiable conventions (PostgreSQL-only runtime, LLM calls through `modules/llm`, `createRateLimiter`, Prisma migrations, no secrets in git, no auto-commit). Everything there applies to you too; this file does not repeat it.

Service-specific rules: `apps/ai-reviewer/AGENTS.md` (Python service).

The block below is managed by `turbo`; leave it in place.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
