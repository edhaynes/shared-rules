import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `repo_browser.search` — content search across the current repository.
 *
 * gpt-oss-120b emits this name from its internal "repo browser" tool
 * namespace (the same training surface that produces `repo_browser.open`
 * / `repo_browser.find`). When it isn't registered, LiteLLM-strict
 * rejects the stream with `tool call validation failed`. Registering a
 * real tool with the exact dotted name is the durable fix.
 *
 * Backed by ripgrep so the model gets the recursive-grep semantics it
 * expects. Args are passed via the Bun `$` template-tag so every
 * interpolation lands as a separate argv entry — no shell injection
 * surface even when the model hands us a query containing shell
 * metacharacters.
 */
export default tool({
  description:
    "Search the repository for a regex pattern. Returns file paths with line numbers and matching lines (ripgrep semantics). Use this to find where a symbol, identifier, string, or pattern appears in the codebase. Smart-case by default. Use `glob` to scope by file pattern.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Search pattern. Regex by default (PCRE2). Pass a literal string with no regex metacharacters for plain substring search.",
      ),
    path: tool.schema
      .string()
      .optional()
      .describe("Directory or file to search within (defaults to current working directory)"),
    glob: tool.schema
      .string()
      .optional()
      .describe(
        "Optional file-name glob filter, e.g. '*.ts' or '!*.test.*' (leading '!' negates). Repeat by separating with newlines.",
      ),
    case_sensitive: tool.schema
      .boolean()
      .optional()
      .describe("Force case-sensitive match. Default: smart-case (case-insensitive unless the query has uppercase)."),
    max_results: tool.schema
      .number()
      .optional()
      .describe("Maximum matching lines to return before truncation. Default: 200."),
  },
  async execute(args) {
    const path = args.path ?? "."
    const max = Math.max(1, Math.min(args.max_results ?? 200, 1000))
    const caseFlag = args.case_sensitive ? "-s" : "-S"

    const flags: string[] = [
      "-n", // line numbers
      "--no-heading",
      "--color=never",
      "--max-count=50", // per-file cap so one huge file can't drown the result
      caseFlag,
    ]
    if (args.glob) {
      for (const g of args.glob.split("\n").map((x) => x.trim()).filter(Boolean)) {
        flags.push("-g", g)
      }
    }

    const result = await $`rg ${flags} -- ${args.query} ${path}`.nothrow().quiet()

    if (result.exitCode === 1) {
      return "No matches."
    }
    if (result.exitCode === 2) {
      const stderr = result.stderr.toString().trim()
      return stderr || `rg exited 2 (search error). Check your query.`
    }
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim()
      return stderr || `rg exited ${result.exitCode}`
    }

    const all = result.stdout.toString().split("\n").filter((l) => l.length > 0)
    if (all.length <= max) {
      return all.join("\n")
    }
    return [
      ...all.slice(0, max),
      "",
      `[...truncated to ${max} of ${all.length} matches; refine your query, narrow with \`path\` or \`glob\`, or raise \`max_results\` (cap 1000)]`,
    ].join("\n")
  },
})
