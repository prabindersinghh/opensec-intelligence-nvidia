# Hackathon Changes — Nebius × NVIDIA Global AI Hackathon 2026

[← Back to README](../README.md)

Track: **Coding and Agentic Engineering**. This document records what existed before the hackathon submission period and what was added during it, per the submission rules requiring previously-existing projects to document their improvements.

---

## Before the hackathon

OpenSec Intelligence (v3.2.0, [original repo](https://github.com/prabindersinghh/opensec-intelligence)) already had:

- A deterministic multi-category Scanner (code, Docker, Kubernetes, Terraform, CI/CD, secrets — 25+ rules).
- A 4-stage pipeline: Scanner → Analyst → Consensus → Fixer, all running against a local Ollama model.
- The **prove loop** (`opensec prove`): LLM-generated exploit → sandboxed execution → patch → re-execution → verification — this is the project's core differentiator and was already fully implemented and tested (13 passing tests in `tests/unit/prover.test.ts`) before this hackathon edition.
- A CLI (`opensec scan`/`fix`/`report`/`prove`/`serve`), an HTTP+MCP server, CI/CD integration, and a bundled intentionally-vulnerable demo app.
- 148 passing unit tests, a Playwright e2e suite, and an MIT license.
- Ollama as the *only* supported inference backend for the security pipeline specifically (the broader agent framework underneath it already supported OpenAI/Anthropic/Ollama for general coding tasks, but the security Analyst/Consensus/Fixer/Prover stages were hardcoded to Ollama's native API).

## What this hackathon edition adds

**Nothing about the prove-fix-reprove architecture, the Scanner's detection rules, the sandbox/safety guardrails, or the CLI's existing commands was rewritten.** The addition is a second provider for the reasoning stages:

1. **`src/security/llm.ts`** — added `LlmProvider = 'ollama' | 'nebius'`, a Nebius Token Factory request path (`generateNebius`) with real retry/timeout/error handling, a live model-catalog check (`checkNebius`, `GET /v1/models`), and model resolution that never guesses a model ID (`resolveNebiusModel`). The pre-existing Ollama path, `extractJson`/`repairJson` JSON-extraction logic, and `generateJson` retry wrapper are untouched.
2. **`src/security/pipeline.ts`** — the hardcoded `ollamaAvailable()` availability check became a generic `isLlmAvailable()` dispatch. One line changed.
3. **`src/security/cli.ts`** — every security subcommand (`securityScan`, `securityFix`, `securityProve`, `securityDemo`, `validateLlmPipeline`) now accepts `provider`/`baseUrl`/`apiKey` and builds a provider-correct `LlmConfig` via a shared `toLlmConfig()` helper, with provider-aware status messages (e.g. "Nebius Token Factory is not reachable" instead of always saying "Ollama").
4. **`bin/cmdr.ts`** — resolves the provider from `--provider` / `OPENSEC_AI_PROVIDER` / `OPENSEC_PROVIDER`, and for Nebius resolves the model via the live catalog (or `NEBIUS_MODEL`) before dispatching to any security subcommand.
5. **`src/llm/provider-factory.ts`** (general agent layer) — added a `'nebius'` `ProviderName` that reuses the existing `OpenAIAdapter`, plus a `nemotron` pattern in `detectProviderFromModel()`. This extends Nebius support to `opensec serve`/the REPL as well, not just the security pipeline.
6. **`src/core/types.ts`, `src/config/schema.ts`, `src/config/config-loader.ts`** — `'nebius'` added to the three existing provider type unions, and `OPENSEC_AI_PROVIDER` added as the hackathon-spec env var name (`OPENSEC_PROVIDER` kept working for compatibility).
7. **UX**: `renderBanner()` now shows the active provider; the scan footer says "Nebius Token Factory-validated" instead of always "LLM-validated"; `--demo` prints the active provider before running.
8. **Tests**: `tests/unit/nebius-llm.test.ts` (24 tests) and `tests/unit/provider-factory.test.ts` (10 tests) — 34 new tests, all passing alongside the 148 pre-existing ones (182 total).
9. **Docs**: this file, [`NEBIUS_NVIDIA_INTEGRATION.md`](NEBIUS_NVIDIA_INTEGRATION.md), [`DEMO_GUIDE.md`](DEMO_GUIDE.md), README updates (new sections + corrected privacy claim), and `docs/architecture.md`/`docs/configuration.md` updates.
10. **`.env.example`** at the repo root listing `NEBIUS_API_KEY`/`NEBIUS_BASE_URL`/`NEBIUS_MODEL`/`OPENSEC_AI_PROVIDER`.

## Architecture recap

```
                 ┌──────────────────────────────────────────┐
                 │         src/security/llm.ts (LlmConfig)   │
Analyst ────────▶│                                            │
Consensus ──────▶│  provider: 'ollama' (default, unchanged)   │──▶ Ollama /api/generate (local)
Fixer ──────────▶│  provider: 'nebius' (new this hackathon)   │──▶ Nebius Token Factory
Prover ─────────▶│                                            │    /chat/completions
                 └──────────────────────────────────────────┘    (NVIDIA Nemotron)
```

The Scanner is not in this diagram because it never calls an LLM — it's deterministic and runs identically regardless of provider.

## Verification performed

- `npm run lint` (`tsc --noEmit`) — clean.
- `npm run build` (`tsc`) — clean.
- `npx vitest run` — **182/182 tests passing** (148 pre-existing + 34 new).
- `opensec scan ./demo/vulnerable-app --quick` — deterministic scan still finds all 15 bundled findings, confirming the Scanner is unaffected.
- `opensec scan ./ --provider nebius` with no `NEBIUS_API_KEY` configured — fails fast with a clear, actionable error instead of hanging or silently falling back.
- `opensec --help` — renders the new Nebius flags/env vars correctly.
- Live Nebius Token Factory inference — **not verified**, no API key was available in the build environment. See [`NEBIUS_NVIDIA_INTEGRATION.md`](NEBIUS_NVIDIA_INTEGRATION.md#what-was-verified-vs-what-wasnt) for exactly what was and wasn't tested.
