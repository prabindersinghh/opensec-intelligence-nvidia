<div align="center">

<pre>
 ██████╗ ██████╗ ███████╗███╗   ██╗███████╗███████╗ ██████╗ 
██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝██╔════╝ 
██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗█████╗  ██║      
██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║██╔══╝  ██║      
╚██████╔╝██║     ███████╗██║ ╚████║███████║███████╗╚██████╗ 
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝ ╚═════╝ 
</pre>

**Find vulnerabilities. Prove they're real. Patch them. Prove the patch works.**<br/>
**Free forever with Ollama — or run the Analyst/Consensus/Fixer on NVIDIA Nemotron via Nebius Token Factory.**

<br/>

[![npm version](https://img.shields.io/npm/v/opensec-intelligence?color=FF2D78&label=npm&style=flat-square)](https://www.npmjs.com/package/opensec-intelligence)
[![npm downloads](https://img.shields.io/npm/dw/opensec-intelligence?color=00FF94&style=flat-square)](https://www.npmjs.com/package/opensec-intelligence)
[![License: MIT](https://img.shields.io/badge/License-MIT-white?style=flat-square)](LICENSE)
[![Powered by Ollama](https://img.shields.io/badge/runs%20on-Ollama-blue?style=flat-square)](https://ollama.com)
[![NVIDIA Nemotron on Nebius](https://img.shields.io/badge/cloud-NVIDIA%20Nemotron%20on%20Nebius-76B900?style=flat-square)](https://tokenfactory.nebius.com)
[![Tests](https://img.shields.io/badge/tests-182%20passing-00FF94?style=flat-square)](#)
[![Built by Prabinder Singh & Anish Grover](https://img.shields.io/badge/built%20by-Prabinder%20Singh-FF2D78?style=flat-square)](https://github.com/prabindersinghh)

<br/>

[Install](#quickstart) · [The prove loop](#the-prove-loop) · [How it works](#how-it-works) · [NVIDIA Nemotron × Nebius](#nvidia-nemotron--nebius-token-factory-integration) · [CLI reference](#commands) · [Models](#model-recommendations)

</div>

---

## OpenSec Intelligence × NVIDIA Nemotron

**Autonomous security engineering powered by NVIDIA Nemotron on Nebius Token Factory.**

> From vulnerability detection to verified autonomous remediation.

This is the hackathon edition of OpenSec Intelligence, built for the **Nebius × NVIDIA Global AI Hackathon 2026** (Coding and Agentic Engineering track). The original local-first, Ollama-powered engine is unchanged and still the default — this edition adds **Nebius Token Factory as a first-class second provider**, so the Analyst, Consensus, Fixer, and Prover stages can reason with an NVIDIA Nemotron model instead of (or alongside) a local model. See [What's new in this edition](#hackathon-edition--whats-new) and the [Nemotron × Nebius integration section](#nvidia-nemotron--nebius-token-factory-integration) below.

```bash
# Local (default, unchanged)
opensec scan ./

# Cloud — NVIDIA Nemotron via Nebius Token Factory
export NEBIUS_API_KEY=...
opensec scan ./ --provider nebius
```

---

## The problem with every other security tool

They give you a list of 47 findings.  
You fix maybe 3 of them — the ones you're sure about.  
The other 44 sit there because you can't tell what's real.

**OpenSec Intelligence solves the trust problem.**

It doesn't just find the vulnerability. It runs an exploit to prove it exists, patches it with a local AI, then runs the same exploit again to prove the patch closed the hole. You see exactly what happened at every step.

```bash
npm install -g opensec-intelligence
ollama pull qwen2.5-coder:14b
opensec scan ./
```

---

## The prove loop

This is what makes OpenSec different from every other free tool.

```bash
opensec prove ./
```

```
  ╭─────────────────────────────────────────────────────────────╮
  │  PROVING: SQL Injection in src/db/queries.js:47             │
  │                                                             │
  │  🔴 VULNERABILITY CONFIRMED                                 │
  │     Input:  "' OR '1'='1"                                  │
  │     Result: returned 3 rows — authentication bypassed       │
  │                                                             │
  │  ─────────────────────────────────────────────────────────  │
  │                                                             │
  │  ✅ PATCH VERIFIED — exploit no longer works                │
  │     Same input: "' OR '1'='1"                              │
  │     Result:     parameterized query — 0 rows                │
  ╰─────────────────────────────────────────────────────────────╯
```

**What's happening:**
1. A local LLM writes a minimal exploit script for the finding
2. The script runs in a sandboxed subprocess and confirms the vuln fires (`🔴`)
3. The Fixer agent writes and applies the patch
4. The same exploit runs again — it must fail (`✅`)
5. Proof saved to `.opensec/proofs/` for audit

No other free, local tool does this. Most enterprise tools don't either.

---

## Quickstart

```bash
# Install
npm install -g opensec-intelligence

# Pull a model (free, runs locally — one time)
ollama pull qwen2.5-coder:14b

# Scan your repo
opensec scan ./

# See it on a deliberately vulnerable demo app
opensec scan --demo
```

**Local mode (default): no account, no API key, nothing leaves your machine.**

Prefer NVIDIA Nemotron on Nebius Token Factory instead of a local model? See [NVIDIA Nemotron × Nebius Token Factory Integration](#nvidia-nemotron--nebius-token-factory-integration) — it's one env var and one flag:

```bash
export NEBIUS_API_KEY=...
opensec scan --demo --provider nebius
```

---

## How it works

```
Your codebase
      │
      ▼
┌─────────────┐
│   Scanner   │  Walks every file — code, Dockerfiles, k8s, .env,
│             │  Terraform, CI/CD — in under 30 seconds.
│             │  25+ deterministic rules. No LLM needed here.
└──────┬──────┘
       │ structured findings JSON
       ▼
┌─────────────┐
│   Analyst   │  Sends each HIGH/CRITICAL finding to a local LLM
│             │  with ±15 lines of file context.
│             │  Filters anything below 0.7 confidence.
└──────┬──────┘
       │ confirmed findings
       ▼
┌─────────────┐
│  Consensus  │  Adversarial second pass on every CRITICAL.
│             │  Tries to argue the finding ISN'T a vulnerability.
│             │  If it still holds up — it's real.
└──────┬──────┘
       │ validated findings
       ▼
┌─────────────┐
│    Fixer    │  Writes the exact patch.
│             │  Shows you a colored before/after diff.
│             │  [A]pply / [S]kip / [Q]uit — you decide.
│             │  Git commits on approval.
└─────────────┘
```

The insight that makes this work: **single-model tools hallucinate**. If one model says something is a vulnerability, it might be wrong. OpenSec's consensus layer requires independent confirmation — if models disagree, you don't get paged.

---

## What gets scanned

| Category | File types |
|---|---|
| **Code** | `.py` `.js` `.ts` `.go` `.rb` `.java` `.php` `.rs` `.cpp` `.cs` |
| **Infrastructure** | `Dockerfile` `docker-compose.yml` `*.tf` `*.hcl` `*.toml` |
| **Kubernetes / Config** | `*.yaml` `*.yml` `openapi.*` `*.json` |
| **Secrets** | `.env` `.env.*` `*.pem` `*.key` `*.p12` `*.pfx` |
| **CI/CD** | `.github/workflows/*.yml` `.gitlab-ci.yml` `Jenkinsfile` |

What gets detected: AWS/GitHub/Stripe keys, hardcoded passwords, SQL injection, command injection, path traversal, CORS wildcards, weak crypto (MD5/SHA1), eval usage, Docker root users, k8s privileged containers, Terraform open security groups, and more.

---

## Commands

```bash
# Scan
opensec scan ./              # Full 4-agent scan
opensec scan ./ --quick      # Deterministic scanner only (no LLM, instant)
opensec scan ./ --ci         # JSON output, exit 1 on CRITICAL — use in CI/CD
opensec scan --demo          # Run on bundled vulnerable app — see the pipeline live

# Prove + fix
opensec prove ./             # Generate exploit → confirm → patch → re-confirm
opensec prove ./ --dry-run   # Generate and run exploit, skip patching
opensec prove ./ --show-exploit  # Print the LLM-generated exploit code
opensec fix                  # Apply patches from last scan interactively

# Report + serve
opensec report               # HTML security report
opensec serve --port 4141    # Start HTTP + MCP server

# Model
opensec -m llama3.2:3b       # Override Ollama model
opensec --provider nebius -m nvidia/nemotron-super-49b-v1  # Use NVIDIA Nemotron via Nebius Token Factory
```

---

## CI/CD integration

```bash
# .github/workflows/security.yml
opensec scan ./ --ci --output json
# exits 1 if any CRITICAL findings — blocks the merge
```

See [`.github/workflows/opensec.yml`](.github/workflows/opensec.yml) for a full example.

---

## MCP integration

OpenSec exposes an MCP server so any MCP-compatible tool (Claude Code, goose, Cursor) can call it:

```bash
opensec serve --port 4141
# connect any MCP client to http://localhost:4141/v1/stream
```

| Tool | What it does |
|---|---|
| `scan_repo` | Trigger a full or quick scan |
| `get_findings` | Structured JSON of last scan results |
| `apply_fix` | Apply a specific validated fix |
| `prove_finding` | Run the prove loop on a specific finding |
| `get_report` | Generate HTML report |

---

## Model recommendations

| Model | RAM | Best for |
|---|---|---|
| `qwen2.5-coder:14b` | 16GB | Best overall — recommended (local, Ollama) |
| `deepseek-r1:14b` | 16GB | Best for the consensus reasoning pass (local, Ollama) |
| `codellama:13b` | 16GB | Balanced speed + accuracy (local, Ollama) |
| `llama3.2:3b` | 8GB | Fast scanner on low RAM machines (local, Ollama) |
| NVIDIA Nemotron (exact ID varies by account) | n/a — cloud | Analyst/Consensus/Fixer/Prover via Nebius Token Factory, no local GPU/RAM needed |

```bash
ollama pull qwen2.5-coder:14b   # recommended
ollama pull llama3.2:3b          # minimum spec
```

For Nebius, see [NVIDIA Nemotron × Nebius Token Factory Integration](#nvidia-nemotron--nebius-token-factory-integration) — the exact model ID is read from your Token Factory account's live catalog, not hardcoded here.

---

## Local vs Cloud

| Mode | Cost | Privacy | Command |
|---|---|---|---|
| **Local** (default) | Free | 100% private — nothing leaves your machine | `opensec scan ./` |
| **Quick** | Free | 100% private — deterministic scanner only, no LLM | `opensec scan ./ --quick` |
| **Nebius (NVIDIA Nemotron)** | Token Factory usage cost | Finding metadata + ~40 lines of surrounding file context are sent to Nebius Token Factory for the Analyst/Consensus/Fixer/Prover stages — see [Privacy in Nebius mode](#nvidia-nemotron--nebius-token-factory-integration) below | `opensec scan ./ --provider nebius` |

`--cloud` is a legacy flag originally reserved for a generic OpenAI/Anthropic analyst path; it is not wired to a working provider in this build. **`--provider nebius`** (or `OPENSEC_AI_PROVIDER=nebius`) is the real, tested cloud integration — Scanner and the local-file-write side of Fixer always run locally either way; only the model-reasoning calls leave the machine.

---

## Safety

The prove loop runs exploit code in a sandboxed subprocess:

- Real credentials and environment variables are never passed to the subprocess
- `eval()` and `new Function()` string codegen are disabled inside the subprocess
- Network access is blocked before execution
- Filesystem writes outside `/tmp` are blocked
- Hard 10-second timeout
- Exploit files are deleted immediately after use

> ⚠️ Do not run `opensec prove` on untrusted code. File content is embedded in the LLM prompt — a crafted file could influence the generated exploit. Full isolation requires a container.
> This applies in both modes. In **Nebius mode**, that same file content is also part of the prompt sent to Nebius Token Factory over HTTPS — see [Privacy in Nebius mode](#nvidia-nemotron--nebius-token-factory-integration).

---

## NVIDIA Nemotron × Nebius Token Factory Integration

**Why Nemotron.** OpenSec's differentiator is the prove-fix-reprove loop, and that loop lives or dies on the quality of the reasoning behind it: is this finding real, does the adversarial pass still believe it, does the generated patch actually compile into the file, does the exploit really stop firing. NVIDIA's Nemotron family is built for exactly this kind of structured technical reasoning, and Nebius Token Factory exposes it through a standard OpenAI-compatible endpoint — so it drops into the same `generate()`/`generateJson()` call sites the Analyst, Consensus, Fixer, and Prover already used for Ollama, with no changes to those modules' logic.

**Which model.** This build does not hardcode a Nemotron model ID. On startup with `--provider nebius` (and no `NEBIUS_MODEL` set), OpenSec calls `GET /v1/models` against your Token Factory account and selects the first model whose ID matches `nemotron` — whatever Nemotron 3 variant (Nano / Super / Ultra) your account actually has access to. If no Nemotron model is available, or the catalog can't be reached, it fails with an explicit error rather than silently substituting a different model. Set `NEBIUS_MODEL` explicitly to pin a specific model ID.

**How it's wired in.** `src/security/llm.ts` is the shared LLM client used by every reasoning stage in the security pipeline (`analyst.ts`, `consensus.ts`, `fixer.ts`, `prover.ts`). It now supports two providers behind one `LlmConfig` interface:

- `provider: 'ollama'` (default) — talks to Ollama's native `/api/generate`.
- `provider: 'nebius'` — talks to Token Factory's OpenAI-compatible `/chat/completions` with your `NEBIUS_API_KEY` as a Bearer token, a 60s timeout, and up to 3 retries with exponential backoff on `429`/`5xx` responses (honoring a `Retry-After` header when the API sends one).

None of the four reasoning stages had to change — they already called the shared client abstractly. This is also wired into the general-purpose agent layer (`src/llm/provider-factory.ts`, used by `opensec serve` / the REPL), which gained a `nebius` provider that constructs the existing `OpenAIAdapter` against the Token Factory base URL — the same adapter already used for OpenAI/OpenRouter/Groq, since Token Factory speaks the same API shape.

**What actually runs on Nemotron.**

| Stage | What it does with the model | Falls back to |
|---|---|---|
| Analyst | Confirms/rejects each HIGH/CRITICAL finding with ±20 lines of file context, assigns a confidence score and attack vector | Deterministic Scanner result stands unvalidated |
| Consensus | Adversarial second pass — argues the finding is a false positive, then gives a verdict | Analyst's verdict stands |
| Fixer | Writes the actual patch for the vulnerable lines | No patch is written (Fixer requires a model either way) |
| Prover | Writes a minimal proof-of-concept exploit, then (after Fixer patches) confirms it stops firing | Skipped — exploit generation also requires a model |

**Configuration:**

```bash
# .env or your shell
NEBIUS_API_KEY=sk-...                                  # required
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1/ # optional, this is the default
NEBIUS_MODEL=nvidia/nemotron-super-49b-v1               # optional — auto-detected from the catalog if unset
OPENSEC_AI_PROVIDER=nebius                              # optional — selects Nebius without passing --provider every time
```

```bash
# Run in Nebius mode
opensec scan ./ --provider nebius
opensec prove ./ --provider nebius
opensec scan --demo --provider nebius

# Switch back to local/Ollama — just drop the flag and env var
opensec scan ./
```

**Privacy in Nebius mode.** In local/Ollama mode (the default), nothing leaves your machine — that claim is unchanged. In Nebius mode, the Analyst/Consensus/Fixer/Prover prompts (the finding's rule name, file path, line number, and ~40 lines of surrounding source, plus for the Prover the file content needed to write an exploit) are sent to Nebius Token Factory over HTTPS to run inference. The Scanner itself (which does the actual file-walking and pattern matching) always runs locally regardless of provider — only the reasoning calls leave the machine, and only for the findings those stages actually process. The Prover's `sanitizeFileContent()` step (see `src/security/prover.ts`) strips lines that look like embedded prompt-injection attempts before they reach the model, in either mode; it does not redact secrets from the file content itself, so avoid running Nebius mode on files containing live credentials you don't want transmitted — real environment secrets are never passed to the *exploit subprocess* either way (see [Safety](#safety)), but file content shown to the model is a separate concern from subprocess isolation.

---

## Hackathon Edition — What's New

Built for the **Nebius × NVIDIA Global AI Hackathon 2026** (Coding and Agentic Engineering track), on top of the existing OpenSec Intelligence engine. The prove-fix-reprove architecture, the deterministic Scanner, the CLI, and the Ollama path are unchanged from the pre-hackathon build — nothing was rewritten or removed.

What was added during the submission period:

- **Nebius Token Factory provider** for the security pipeline (`src/security/llm.ts`): a second, fully independent code path alongside the existing Ollama client, with real request construction, retry/backoff on `429`/`5xx`, timeout handling, and live model-catalog resolution (`GET /v1/models`) — not a hardcoded model ID.
- **Provider plumbing end-to-end**: `--provider nebius` / `OPENSEC_AI_PROVIDER=nebius` flows from the CLI (`bin/cmdr.ts`, `src/cli/args.ts`) through every security subcommand (`scan`, `fix`, `prove`, `scan --demo`, `--validate-llm`) to the Analyst, Consensus, Fixer, and Prover.
- **General agent-layer Nebius support** (`src/llm/provider-factory.ts`): the same `OpenAIAdapter` used for OpenAI/OpenRouter now also serves Nebius Token Factory, so `opensec serve` and the REPL can use Nemotron too.
- **Provider-aware UX**: the banner, scan footer, `--validate-llm`, and `--demo` output now show which provider/model actually ran, instead of assuming Ollama.
- **34 new automated tests** (`tests/unit/nebius-llm.test.ts`, `tests/unit/provider-factory.test.ts`) covering config loading, missing-API-key handling, model resolution against a mocked catalog, successful mocked inference, invalid-response handling, 429/5xx retry behavior, timeout handling, and provider dispatch — plus a full regression pass confirming all 148 pre-existing tests still pass.
- **Documentation**: this section, [`docs/NEBIUS_NVIDIA_INTEGRATION.md`](docs/NEBIUS_NVIDIA_INTEGRATION.md), [`docs/HACKATHON_CHANGES.md`](docs/HACKATHON_CHANGES.md), [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md), and the corrected privacy claim above.

What was deliberately *not* changed: the Scanner's detection rules, the sandbox/exploit-safety guardrails in `prover.ts`, the git-commit-on-approval flow in `fixer.ts`, and the MIT license.

---

## Architecture

```
 Your codebase
       │
       ▼
 ┌─────────────┐
 │   Scanner   │  Deterministic — always local, either provider
 └──────┬──────┘
        │ structured findings JSON
        ▼
 ┌─────────────┐        ┌──────────────────────────────┐
 │   Analyst   │◄──────▶│  src/security/llm.ts          │
 ├─────────────┤        │  LlmConfig { provider, model } │
 │  Consensus  │◄──────▶│                                │
 ├─────────────┤        │  provider: 'ollama'  → Ollama  │
 │    Fixer    │◄──────▶│    /api/generate (local)       │
 ├─────────────┤        │  provider: 'nebius'  → Nebius  │
 │   Prover    │◄──────▶│    Token Factory /chat/completions │
 └─────────────┘        │    (NVIDIA Nemotron)           │
                         └──────────────────────────────┘
```

See [`docs/HACKATHON_CHANGES.md`](docs/HACKATHON_CHANGES.md#architecture-recap) for the full hackathon-edition architecture recap, and the pre-existing [`docs/architecture.md`](docs/architecture.md) for the underlying agent-framework internals (session layer, tool system, etc.) that this security pipeline sits on top of.

---

## Demo

```bash
# Local mode — unchanged from before the hackathon
opensec scan --demo

# Nebius / NVIDIA Nemotron mode
export NEBIUS_API_KEY=...
opensec scan --demo --provider nebius
```

Both run the full pipeline — Scanner → Analyst → Consensus → Fixer (dry-run diffs) → Prover (exploit → patch → re-exploit) — against the bundled `demo/vulnerable-app` fixture, never against a third-party target. See [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md) for the judge-facing walkthrough.

---

## Evaluation

- **Unit tests:** 182 passing (148 pre-existing + 34 new Nebius/provider tests), `npm test` — see [`docs/HACKATHON_CHANGES.md`](docs/HACKATHON_CHANGES.md) for the full run output.
- **Build/typecheck:** `npm run build` and `npm run lint` (`tsc --noEmit`) both clean.
- **Live Nebius inference:** not verified in the environment this edition was built in — no `NEBIUS_API_KEY` was available there. The integration is covered by mocked tests (request construction, response parsing, retry/timeout behavior) exercised against the real Token Factory request/response shapes from the [public API docs](https://api.tokenfactory.nebius.com/docs). Anyone with a Token Factory account can verify a live call with `opensec scan --demo --provider nebius`.
- **Deterministic Scanner regression:** `opensec scan ./demo/vulnerable-app --quick` still finds all 15 bundled findings (3 CRITICAL, rest HIGH) with no LLM involved, confirming the provider change didn't touch detection.

We are not claiming a live Nemotron inference was observed during this build — see above. The code path, retry/timeout/error handling, and model-catalog resolution are real and tested against mocked Token Factory responses matching its documented API shape.

---

## What's coming

- [ ] VS Code extension — inline vulnerability highlights as you type
- [ ] GitHub App — auto-scan every PR, post findings as review comments
- [ ] SARIF output — GitHub Advanced Security integration
- [ ] Multi-model parallel scanning (`--multi-model`)
- [ ] Web dashboard for team findings
- [ ] Slack / Discord alerts

**Pro + Enterprise tiers** are in development for teams that need zero-false-positive guarantees, air-gapped deployment, and compliance reports (SOC2, ISO 27001, OWASP). [Join the waitlist →](mailto:prabindersinghh@gmail.com)

---

## Contributing

Security rules live in `src/security/patterns.ts` — adding a new detection pattern is a 5-line PR. See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/prabindersinghh/opensec-intelligence
npm install
npm test          # 148 tests
opensec scan ./   # dogfood
```

---

<div align="center">

MIT License · [npm](https://www.npmjs.com/package/opensec-intelligence) · [Issues](https://github.com/prabindersinghh/opensec-intelligence/issues)

Built by [Prabinder Singh](https://github.com/prabindersinghh) — B.Tech CS, Thapar Institute · Founder, [Leorit.ai](https://leorit.ai)

</div>
