# Feedback — Nebius Token Factory & NVIDIA Nemotron

Prepared during the Nebius × NVIDIA Global AI Hackathon 2026 submission build of OpenSec Intelligence. These are technical observations from integrating against the [public Token Factory API docs](https://api.tokenfactory.nebius.com/docs), not a marketing endorsement. Items that could not be established (no live `NEBIUS_API_KEY` was available in the build environment) are marked as placeholders rather than guessed at.

## Integration experience

- **OpenAI-compatible API shape.** Token Factory's documented `/v1/chat/completions` and `/v1/models` endpoints match the OpenAI Chat Completions shape closely enough that the project's existing `OpenAIAdapter` (already used for OpenAI/OpenRouter/Groq) worked for Nebius with zero changes — only the base URL and API key differ. This made the general agent-layer integration (`src/llm/provider-factory.ts`) a ~15-line addition rather than a new adapter class.
- **No model listing in the hackathon docs page we read, but a documented endpoint.** The integration relies on `GET /v1/models` to discover which Nemotron variant an account has access to, per the API reference. We did not have a live key to confirm the exact response shape (`{"data": [{"id": "..."}]}` is assumed from the OpenAI-compatible convention Token Factory advertises) — this is the single biggest unverified assumption in the integration, and it's isolated to one function (`checkNebius()` / `resolveNebiusModel()` in `src/security/llm.ts`) specifically so it's easy to patch if the real response shape differs slightly.
- **Separate security-pipeline client, by design.** OpenSec's security pipeline (Analyst/Consensus/Fixer/Prover) already had its own minimal Ollama client, independent of the general agent framework's adapter interface. Adding Nebius there meant writing a second small `/chat/completions` caller rather than reusing `OpenAIAdapter` — a deliberate choice to keep that pipeline's existing "no hard dependency on the agent framework" property intact.

## What we could not measure (no live API key)

| Observation | Status |
|---|---|
| Actual latency per Analyst/Consensus/Fixer/Prover call | **Not measured.** `<fill in after a live run: p50/p95 request latency for a single chat/completions call>` |
| Response quality on real security findings (vs. local Ollama models) | **Not measured.** `<fill in after a live run: does the model's confidence scoring, attack-vector explanation, and patch quality meaningfully differ from qwen2.5-coder:14b/deepseek-r1:14b on the same findings?>` |
| Rate limits encountered in practice | **Not measured.** `<fill in: did the 429 retry/backoff path actually trigger under real load?>` |
| Exact Nemotron model ID(s) available to a Token Factory account | **Not established.** `<fill in: paste the model ID(s) GET /v1/models returned>` |
| Streaming support for `/chat/completions` | **Not exercised.** The security pipeline only uses single-shot (non-streaming) completions; the general agent layer's `OpenAIAdapter.stream()` path was not tested against Token Factory specifically. |

## What we are confident about

- The retry/backoff/timeout logic in `src/security/llm.ts` is exercised against a mocked `fetch` that reproduces documented HTTP semantics (429 with `Retry-After`, 5xx, timeouts) — this logic doesn't depend on Nebius-specific behavior, just standard HTTP semantics, so it should hold regardless of what a live key reveals.
- The failure modes (missing key, missing model, unreachable catalog, no Nemotron model in catalog) all produce explicit, actionable error messages rather than silent fallbacks — verified by running the actual CLI (`opensec scan ./ --provider nebius` with no key configured exits 1 with a clear message).

## For reviewers/judges

If you run this with a real `NEBIUS_API_KEY`, the single most useful piece of feedback you could add to this file is the actual response shape of `GET /v1/models` for your account, and whether `resolveNebiusModel()` correctly picked a sensible Nemotron variant from it.
