# OpenCode Tool Wrappers — Canonical

Custom OpenCode tools live here. They exist because weaker tool-callers
(notably `gpt-oss-120b` via Groq) repeatedly invoke tool names that aren't
in the OpenCode registry — `webfetch`, `fetch`, `ls`, `apply_patch`, etc.
Prompt-engineering it away is unreliable; registering a real tool with the
exact hallucinated name is the durable fix.

See `../tooling/opencode-tools.md` for the full pattern, including the
fallback path (block the name in `opencode.json` when it shouldn't run at
all).

## Wrappers in this folder

| File | Purpose |
|---|---|
| `tools/fetch.ts` | `curl` wrapper. Returns response body as text. |
| `tools/webfetch.ts` | Same body as `fetch.ts`; the model hallucinates both names. |
| `tools/ls.ts` | `ls` with optional path + flags. Returns stdout or stderr+exit code on failure. |
| `tools/apply_patch.ts` | Parses OpenAI `apply_patch` envelope format (Add/Update/Delete/Move). Tolerates JSON-wrapped or fenced inputs. |
| `tools/repo_browser.search.ts` | Repo content search via ripgrep with `query`/`path`/`glob`/`case_sensitive`/`max_results`. Matches the `repo_browser.search` name from gpt-oss-120b's internal namespace. |
| `tools/read.ts` | Tolerant-schema replacement for the built-in `read`. Accepts the file path under `filePath`/`path`/`file`/`filename`/`file_path` so gpt-oss-120b's variant arg names validate. Mirrors the standard contract (line-numbered output, `offset`+`limit`, 5MB cap, binary sniff). |
| `tools/repo_browser.open_file.ts` | View a file (or line range) — companion to `repo_browser.search`. Accepts path under several aliases, line range under `line_start`+`line_end` / `start_line`+`end_line` / `offset`+`limit`. Default window: first 200 lines. cat -n output, 5 MB cap, binary sniff. |
| `tools/repo_browser.find.ts` | Filename search (complements `repo_browser.search` content search). `fd` if installed, else `rg --files \| rg`. |
| `tools/browser.search.ts` | Web search — DuckDuckGo HTML endpoint, no API key. Trained gpt-oss `browser.search`: `query`, `topn`, `source`. |
| `tools/browser.open.ts` | Open a URL — `curl` + text extraction + line-numbered window. Trained gpt-oss `browser.open`: `id` (URL), `loc`, `num_lines`, `view_source`. |
| `tools/browser.find.ts` | Find a pattern on a page — `curl` + grep. Pass `url` (preferred) or `cursor` as the URL string. Trained gpt-oss `browser.find`. |
| `tools/python.ts` | Execute Python via `./.venv/bin/python` if present else `python3`, 120 s timeout, fresh subprocess per call. Trained gpt-oss `python` tool. |

## Wiring into OpenCode

OpenCode loads tools from one of two locations; the filename is the tool
name (`webfetch.ts` registers a tool called `webfetch`).

- Global: `~/.config/opencode/tools/<name>.ts`
- Project-local: `.opencode/tools/<name>.ts`

This folder is the canonical source. Sync into `~/.config/opencode/tools/`
with `sync.sh`:

```bash
~/projects/shared-rules/opencode/sync.sh
```

Restart the OpenCode session after running `sync.sh` — the plugin registry
is built at startup.

### Why copies and not symlinks

OpenCode's plugin loader (Bun) resolves symlinks to their real path before
looking up imports, then resolves `@opencode-ai/plugin` walking up from
there. That package only exists under `~/.config/opencode/node_modules`,
so a symlink pointing into this repo causes `Cannot find module
'@opencode-ai/plugin'` and **silently kills tool resolution for every
prompt** — the model sits there with no tools to call. File copies dodge
the resolution problem entirely.

Override the destination by setting `OPENCODE_TOOLS_DIR` before invoking
the script.

## Why this matters (the LiteLLM crash chain)

When `gpt-oss-120b` emits a tool call for a name that isn't in
`request.tools`, Groq returns a stream error with
`status_code: 'tool_use_failed'` (a string). LiteLLM ≤1.85.0 then crashes
on `int(status_code)` inside `MidStreamFallbackError.__init__`, surfacing
as a confusing `litellm.MidStreamFallbackError` that masks the real cause.

The full defense is two layers:

1. **Proxy side** — the monkey-patch in
   `~/projects/llm-proxy/scrub_reasoning.py` coerces non-numeric
   `status_code` to `502` so LiteLLM stops crashing. Documented in
   `../tooling/litellm-proxy.md`.
2. **OpenCode side** — wrappers in this folder so the model's tool call
   is actually valid in the first place. Prevention beats recovery.

## Adding a new wrapper

1. Note the exact tool name the model keeps inventing (check OpenCode
   session transcript or the LiteLLM proxy logs for the failing call).
2. Create `tools/<that-exact-name>.ts` using the template below.
3. Symlink into `~/.config/opencode/tools/`.
4. Restart OpenCode.

### Template

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "<one-line description the model uses to decide when to call>",
  args: {
    url: tool.schema.string().describe("<arg description>"),
  },
  async execute(args) {
    const result = await Bun.$`<cli> ${args.url}`.text()
    return result
  },
})
```

Always use `Bun.$` template-tag (or `node:fs` etc.) — **never**
string-concat arguments into a shell command. The template-tag escapes
args and prevents command injection from model-supplied input.
