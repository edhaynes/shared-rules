# OpenCode Tooling Guidelines

These guidelines apply to OpenCode sessions. In non-OpenCode contexts, they
are optional and can be ignored unless a project explicitly opts into them.

They extend `coding-rules.md` and `process-rules.md`. All hard rules from
those files still apply when OpenCode is used.

---

## Built-in tool suite

When working with the OpenCode assistant, you may use the built-in tool suite
(`glob`, `grep`, `read`, `edit`, `write`, `bash`, `ls`, etc.) for rapid codebase
exploration and modifications. These tools are optional; the shared coding and
process rules still govern the work.

## Configuration files

If a project stores configuration for OpenCode scripts, use a simple JSON file
such as `opencode_config.json`. Keep it in the repository root and add it to
`.gitignore` if it contains secrets. The schema should be simple key-value
pairs matching existing environment variable names.

Example:

```json
{
  "use_tool_glob": true,
  "max_read_lines": 2000,
  "default_workdir": "."
}
```

## Treatment of OpenCode JSON files

Treat OpenCode `.json` files as non-secret only when they contain no
credentials. If they contain credentials, handle them like any other
secret-bearing file: scan them, gitignore them, and never commit them.

## Hallucinated tool calls (gpt-oss and similar models)

`gpt-oss-120b` and other weaker tool-calling models will repeatedly invoke
tools that do not exist in the OpenCode registry (e.g. `webfetch`, `fetch`,
`search`). Prompt-engineering this away is unreliable. The durable fix is to
**meet the model where it is**: define a real custom tool with the exact name
the model keeps inventing, and have it shell out to the underlying CLI.

### Where custom tools live

- Project-local: `.opencode/tools/<name>.ts`
- Global (all projects on this machine): `~/.config/opencode/tools/<name>.ts`

The **filename is the tool name**. `webfetch.ts` registers a tool called
`webfetch`. Custom tools cannot be defined inline in `opencode.json` — they
must be separate `.ts` or `.js` files.

### Template

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "<one-line description the model will see>",
  args: {
    url: tool.schema.string().describe("<arg description>"),
  },
  async execute(args) {
    const result = await Bun.$`<cli> ${args.url}`.text()
    return result
  },
})
```

Use `Bun.$` template-tagged shell, not string concatenation — it escapes
arguments and prevents command injection from model-supplied input. Keep the
description short and accurate; the model uses it to decide when to call the
tool.

### Recipe

1. Note the exact name the model keeps inventing (check the OpenCode session
   transcript or error logs).
2. Drop a file at `~/.config/opencode/tools/<that-exact-name>.ts` using the
   template above, replacing the body with the CLI command that does the job.
3. Restart the OpenCode session. The tool is now real; the hallucination
   becomes a successful call.

### When to block instead of implement

If the model is hallucinating a tool that should never run (network access in
a sandboxed agent, destructive ops, etc.), block it in `opencode.json`
instead:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "tools": {
    "webfetch": false
  },
  "permission": {
    "bash": {
      "*": "allow",
      "rm -rf *": "deny"
    }
  }
}
```

Note that `tools: { name: false }` only suppresses built-ins OpenCode already
registers — it cannot disable a name OpenCode never knew about. For purely
invented names, the unknown-tool error returned to the model is the only
defense, which is why implementing the tool (above) is usually the better
move.
