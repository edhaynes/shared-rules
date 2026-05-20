# LiteLLM Proxy — Rate-Limit Pacing for Groq (and other providers)

A small local proxy that sits between coding agents (opencode, Claude Code,
anything OpenAI-compatible) and upstream LLM providers. Its job is to absorb
the rate-limit pain that those agents handle badly — particularly Groq's
tight RPM/TPM caps and the aggressive backoff some clients pile on top of
429 responses.

This is **optional infrastructure**. Tools that talk to providers direct
keep working unchanged. The proxy is opt-in by model selection.

These guidelines extend `coding-rules.md` and `process-rules.md`; the hard
rules from those files still apply.

---

## Why a proxy

- Groq enforces RPM **and** TPM at the org level; hitting either returns 429.
- Coding agents often retry naively. Their backoff stacks on top of Groq's
  own `Retry-After`, and the cascade gets aggressive fast.
- A proxy gives one place to: cap RPM/TPM cleanly, honor `Retry-After`,
  queue requests instead of bouncing them, and protect a single key from
  being burned by parallel sessions.
- It is also the natural home for the future routing layer (vLLM Semantic
  Router "Athena") that decides cloud-vs-local per-request.

## Architecture

```
opencode / Claude Code / other --- (OpenAI-compatible) --->  LiteLLM :4000  ---> Groq / others
                                                                                   (later: Ollama, vLLM SR)
```

When [[vllm-semantic-router-athena]] lands, it sits in front on a separate
port and proxies *to* LiteLLM for cloud traffic, to local Ollama for
state-free / quick work.

## Layout

```
~/projects/llm-proxy/
├── litellm_config.yaml   # model list, rpm/tpm caps, retry policy
├── .env.example          # GROQ_API_KEY, LITELLM_MASTER_KEY
├── .env                  # mode 0600, gitignored
├── .gitignore
├── proxy.sh              # start | stop | restart | status | logs
└── .venv/                # uv-managed; never committed
```

`proxy.sh` is symlinked into `~/.local/bin/` as `litellm-proxy` so it is
callable from anywhere on `PATH`.

## Install

```bash
mkdir -p ~/projects/llm-proxy && cd ~/projects/llm-proxy
uv venv --python 3.12
uv pip install 'litellm[proxy]'

cp .env.example .env
chmod 600 .env
$EDITOR .env   # fill GROQ_API_KEY + LITELLM_MASTER_KEY

ln -s "$PWD/proxy.sh" ~/.local/bin/litellm-proxy
```

`LITELLM_MASTER_KEY` is a local-only auth token. Generate with
`openssl rand -hex 24` and prefix with `sk-litellm-local-` for legibility.
It MUST also be exported in the shell rc so OpenAI-compatible clients can
read it at startup:

```bash
# ~/.zshrc
export LITELLM_MASTER_KEY="sk-litellm-local-<hex>"
```

## Config — `litellm_config.yaml`

Minimal Groq-only example. Tune `rpm` / `tpm` to your account tier; the
values below are conservative defaults that leave headroom.

```yaml
model_list:
  - model_name: gpt-oss-120b
    litellm_params:
      model: groq/openai/gpt-oss-120b
      api_key: os.environ/GROQ_API_KEY
      rpm: 25
      tpm: 28000

  - model_name: gpt-oss-20b
    litellm_params:
      model: groq/openai/gpt-oss-20b
      api_key: os.environ/GROQ_API_KEY
      rpm: 25
      tpm: 28000

  - model_name: llama-3.3-70b
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY
      rpm: 25
      tpm: 12000

router_settings:
  num_retries: 4
  retry_after: 5
  allowed_fails: 3
  cooldown_time: 30

litellm_settings:
  drop_params: true
  request_timeout: 600

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

## Control script — `proxy.sh`

A small bash wrapper. Resolves its own symlink so `litellm-proxy` works from
any working directory. Writes pid + log next to the config.

```
litellm-proxy start      # background, nohup, pid file
litellm-proxy stop       # SIGTERM, then SIGKILL after 5s
litellm-proxy restart
litellm-proxy status     # process check + /health/liveliness probe
litellm-proxy logs       # tail -f
```

## Wiring opencode

Add a provider block to `~/.config/opencode/opencode.jsonc`. This is
**additive** — the existing direct Groq provider stays available; users pick
which path by model selection.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "litellm-groq": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LiteLLM (Groq)",
      "options": {
        "baseURL": "http://localhost:4000/v1",
        "apiKey": "{env:LITELLM_MASTER_KEY}"
      },
      "models": {
        "gpt-oss-120b":  { "name": "gpt-oss-120b" },
        "gpt-oss-20b":   { "name": "gpt-oss-20b" },
        "llama-3.3-70b": { "name": "llama-3.3-70b" }
      }
    }
  }
}
```

Selection model:
- `litellm-groq/*` → through the proxy (rate-paced, retried, queued)
- `groq/*` (existing auth) → direct, bypasses the proxy entirely

## Gotcha — Groq rejects `reasoning_content` on echoed assistant turns

Groq's chat-completions API *returns* `reasoning_content` on assistant
messages for reasoning-capable models (gpt-oss-*, qwen3-*, etc.) but
**rejects** the same field when a client echoes the prior assistant turn
back as part of multi-turn `messages`. opencode and similar clients
faithfully replay the full history including `reasoning_content`, so the
first follow-up turn 400s with:

```
'messages.N' : for 'role:assistant' the following must be satisfied
[('messages.N' : property 'reasoning_content' is unsupported)]
```

This is independent of LiteLLM's `drop_params` (which only operates on
top-level call params, not on message contents).

**Fix:** a pre-call hook that scrubs `reasoning_content`, `reasoning`,
`thinking`, `thinking_blocks` from any assistant message. The canonical
module lives alongside the config at `~/projects/llm-proxy/scrub_reasoning.py`:

```python
from typing import Literal, Optional, Union
from litellm.caching.caching import DualCache
from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

_REASONING_FIELDS = ("reasoning_content", "reasoning", "thinking", "thinking_blocks")

class ScrubReasoning(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth,
                                  cache: DualCache, data: dict,
                                  call_type: Literal["completion", ...]
                                  ) -> Optional[Union[Exception, str, dict]]:
        for msg in data.get("messages", []) or []:
            if isinstance(msg, dict) and msg.get("role") == "assistant":
                for f in _REASONING_FIELDS:
                    msg.pop(f, None)
        return data

proxy_handler_instance = ScrubReasoning()
```

Register in `litellm_config.yaml`:

```yaml
litellm_settings:
  callbacks: scrub_reasoning.proxy_handler_instance
```

The `proxy.sh` control script must `cd` into the project directory before
launching `litellm` so the callback module is importable.

This same hook is the right place to add other harmony-format fixes as they
come up (tool-call shape coercion, stream-token cleanup, etc.) — extend the
class, don't add separate hooks.

## Gotcha — LiteLLM 1.85.0 crashes on Groq's `tool_use_failed` status

When gpt-oss calls a tool not in `request.tools`, Groq returns a stream error
with `status_code: 'tool_use_failed'` (a string, not an int). LiteLLM's
`MidStreamFallbackError.__init__` does `int(original_status)` unconditionally
and crashes with `ValueError: invalid literal for int() with base 10:
'tool_use_failed'`, masking the real error.

Reproduce: opencode session where the model picks any tool the harness
didn't advertise (e.g. `apply_patch` when only `edit` was offered).

**Fix:** import-time monkey-patch in the same callback module
(`scrub_reasoning.py`). Coerce non-numeric `status_code` on the original
exception to `502` before LiteLLM's `int()` call runs:

```python
from litellm import exceptions as _le

_orig = _le.MidStreamFallbackError.__init__

def _safe_init(self, *args, **kwargs):
    exc = kwargs.get("original_exception")
    if exc is None and len(args) >= 4:
        exc = args[3]
    if exc is not None:
        sc = getattr(exc, "status_code", None)
        if sc is not None and not isinstance(sc, int):
            try: int(sc)
            except (ValueError, TypeError):
                try: exc.status_code = 502
                except Exception: pass
    return _orig(self, *args, **kwargs)

_le.MidStreamFallbackError.__init__ = _safe_init
```

This turns a confusing internal crash into a clean `502 Bad Gateway` that
opencode can surface or retry. It does **not** fix the underlying problem
(model hallucinating tool names not in the request) — that needs either a
post-call rewrite hook or fixing the harness to advertise all opencode
built-ins on every call.

Re-check this gotcha when upgrading LiteLLM; if upstream lands a guard,
remove the monkey-patch.

## Gotcha — env var not in opencode's process

`{env:LITELLM_MASTER_KEY}` is resolved at opencode's launch time, not
dynamically. If opencode was launched from a shell that pre-dates the
`export` line in `~/.zshrc`, it will send no auth header and the proxy will
reject the request with `Authentication Error, No api key passed in.` (401).

Symptom: opencode reaches the proxy (logs show the POST) but every call
401s.

Fix paths:
1. Open a fresh terminal — `.zshrc` reloads, opencode launched from it
   inherits the var. This is the right answer for terminal-launched
   opencode.
2. `source ~/.zshrc` in the existing terminal, then relaunch opencode.
3. If the launcher does not source `.zshrc` at all (some GUI launchers,
   Spotlight-spawned apps), replace `{env:LITELLM_MASTER_KEY}` with the
   literal key value in `opencode.jsonc`. Trust level is identical to the
   provider key already in `~/.local/share/opencode/auth.json`; the master
   key is a localhost gate, not a remote credential.

## Operational notes

- The proxy is single-user, single-host. Do not expose `:4000` beyond
  `localhost` without auth hardening — the master key is the only gate.
- `.env` MUST be mode `0600` and MUST be in `.gitignore`. See
  [[secret-hygiene]] in `coding-rules.md` §7.
- The Groq key in `.env` is a copy of the one already in shell env / opencode
  `auth.json`. Rotation: rotate at Groq, update **both** locations, restart
  the proxy.
- LiteLLM proxy logs include request payloads at debug level. Keep
  `set_verbose` off in production-like use.

## When to use which

| Situation | Use |
|---|---|
| Quick one-off CLI call, no parallel sessions | Direct provider |
| Multiple opencode sessions sharing one Groq key | Proxy |
| Hitting 429s and watching opencode backoff escalate | Proxy |
| Need a single dashboard of token use across tools | Proxy |
| Need cloud-vs-local routing per request | Athena (future) in front of proxy |

## Forward look — Athena

vLLM Semantic Router (Athena release) is the eventual layer in front of this
proxy. It classifies each request and picks a backend — local Ollama for
cheap state-free work, the LiteLLM proxy for cloud tier, possibly other
clouds for specific reasoning workloads. The LiteLLM config above does not
need to change when Athena lands; Athena is a new upstream pointed at
`http://localhost:4000` for its "cloud" backend.
