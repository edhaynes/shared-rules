import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `python` — official harmony-trained built-in.
 *
 * Harmony spec (docs/format.md): the python tool executes "in a stateful
 * Jupyter notebook environment ... time out after 120 seconds. The drive
 * at '/mnt/data' can be used to save and persist user files."
 *
 * This impl: runs `python3` (or the local `.venv/bin/python` if present)
 * with the code piped to stdin. NOT stateful across calls — each call is
 * a fresh subprocess. NOT sandboxed — the model has the same authority
 * as the user running OpenCode. If you want sandboxing, route through a
 * container instead.
 *
 * Args are accepted under both `code` (harmony's body convention) and
 * `script` / `source` aliases because gpt-oss occasionally varies.
 */

const TIMEOUT_S = 120

export default tool({
  description:
    "Execute a Python snippet and return stdout + stderr. Args: `code` (the source). Each call is a fresh subprocess — no cross-call state. Uses `./.venv/bin/python` if present, else `python3`. Trained gpt-oss `python` tool.",
  args: {
    code: tool.schema.string().optional().describe("Python source to execute"),
    script: tool.schema.string().optional().describe("Alias for code"),
    source: tool.schema.string().optional().describe("Alias for code"),
  },
  async execute(args) {
    const code = args.code ?? args.script ?? args.source
    if (!code) {
      return "Error: must supply Python source under `code` (or `script` / `source`)."
    }

    // Prefer project venv if running from a repo root, else system python3.
    const venvPython = await $`test -x ./.venv/bin/python && echo ./.venv/bin/python`
      .nothrow()
      .quiet()
    const interp = venvPython.stdout.toString().trim() || "python3"

    const result = await $`timeout ${String(TIMEOUT_S)} ${interp} -c ${code}`.nothrow().quiet()
    const stdout = result.stdout.toString()
    const stderr = result.stderr.toString()

    const parts: string[] = []
    if (stdout) parts.push(stdout.trimEnd())
    if (stderr) parts.push(`--- stderr ---\n${stderr.trimEnd()}`)
    if (result.exitCode === 124) parts.push(`--- timed out after ${TIMEOUT_S}s ---`)
    else if (result.exitCode !== 0) parts.push(`--- exit ${result.exitCode} ---`)
    if (parts.length === 0) return "(no output)"
    return parts.join("\n")
  },
})
