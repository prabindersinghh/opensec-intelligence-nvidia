# Demo Guide — for Hackathon Judges

[← Back to README](../README.md)

This is the exact, reproducible path to see the full prove-fix-reprove loop running on NVIDIA Nemotron via Nebius Token Factory. Everything here runs against the bundled `demo/vulnerable-app` fixture — never against a third-party target.

## Prerequisites

- Node.js ≥ 20
- A Nebius Token Factory account and API key ([api.tokenfactory.nebius.com](https://api.tokenfactory.nebius.com)) for the Nebius path. The local/Ollama path needs [Ollama](https://ollama.com) installed and a model pulled instead — see the main [README Quickstart](../README.md#quickstart).

## Setup

```bash
git clone <this-repository-url>
cd opensec-intelligence-nvidia
npm install
npm run build

export NEBIUS_API_KEY=your-key-here
# optional — only if you want to pin a specific model instead of auto-detecting from the catalog:
# export NEBIUS_MODEL=nvidia/nemotron-super-49b-v1
```

## One-command demo

```bash
node bin/opensec.js scan --demo --provider nebius
```

What this does, in order:

1. Copies the bundled `demo/vulnerable-app` (Node.js app with 15 deliberate vulnerabilities — hardcoded secrets, SQL injection, command injection, weak hashing, a privileged Kubernetes container, etc.) into a temp directory.
2. Prints the banner showing `nebius · nemotron` as the active provider/model.
3. **Scanner** — deterministic pass, finds all 15 issues in under a second.
4. **Analyst** — sends each HIGH/CRITICAL finding (with ±20 lines of file context) to NVIDIA Nemotron via Token Factory, asking it to confirm or reject the finding and assign a confidence score.
5. **Consensus** — an adversarial second pass on each CRITICAL finding, arguing against it, then giving a final verdict.
6. **Fixer** (dry-run) — generates and displays before/after diffs for the top findings without writing them to disk.
7. **Prover** — for the top 3 CRITICAL findings: generates a minimal exploit, runs it in the sandbox (confirms it fires), applies the AI-generated patch, re-runs the same exploit (confirms it no longer fires), and prints a red/green verification box per finding.
8. Prints a summary box with the total findings, elapsed time, and the `opensec prove ./` call-to-action.

Expect this to take noticeably longer than the Ollama demo per model call (network round-trip to Token Factory instead of local inference) — the exact latency depends on the account's Nemotron variant and Token Factory's current load; see [`FEEDBACK.md`](../FEEDBACK.md) for latency notes once a live run has been recorded there.

## Step-by-step, if you want to see each stage individually

```bash
# 1. Scan only (deterministic, no LLM, instant)
node bin/opensec.js scan ./demo/vulnerable-app --quick

# 2. Full pipeline — Scanner + Analyst + Consensus, on Nemotron
node bin/opensec.js scan ./demo/vulnerable-app --provider nebius

# 3. The prove loop on the findings from step 2
node bin/opensec.js prove ./demo/vulnerable-app --provider nebius

#    ...with the generated exploit code printed:
node bin/opensec.js prove ./demo/vulnerable-app --provider nebius --show-exploit

#    ...or just the exploit, without applying the patch:
node bin/opensec.js prove ./demo/vulnerable-app --provider nebius --dry-run

# 4. Interactively apply fixes from the last scan
node bin/opensec.js fix --provider nebius

# 5. Generate the HTML report
node bin/opensec.js report
```

## Sanity check — confirm the Nemotron connection before the full demo

```bash
node bin/opensec.js --validate-llm --provider nebius
```

Runs 3 small smoke-test prompts (JSON extraction, a security classification, a false-positive discrimination case) directly against the configured Nemotron model and reports pass/fail — useful as a 5-second check that `NEBIUS_API_KEY`/`NEBIUS_MODEL` are working before running the full demo.

## Switching back to local/Ollama

Nothing to undo — just drop `--provider nebius` (and unset `NEBIUS_API_KEY` if you want to confirm it's not being used):

```bash
node bin/opensec.js scan --demo
```

## If something fails

- **"Could not reach the Nebius Token Factory model catalog"** — `NEBIUS_API_KEY` is missing/invalid, or `NEBIUS_BASE_URL` is wrong. Set `NEBIUS_MODEL` explicitly to skip the catalog lookup if you already know your model ID.
- **"No NVIDIA Nemotron model is available in the Token Factory catalog for this account"** — your account doesn't currently have a model with `nemotron` in its ID. Check your Token Factory dashboard for the exact model ID and set `NEBIUS_MODEL` to it.
- **Rate limited / 429s during the demo** — the client already retries up to 3 times with backoff; if it still fails, Token Factory is rate-limiting the account — wait and retry, or reduce concurrency.
