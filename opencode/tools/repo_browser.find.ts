import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `repo_browser.find` — companion to `repo_browser.search` and
 * `repo_browser.open_file`. Filename search (`find` complements `search`,
 * which is content search). Not in the harmony spec — observed from
 * gpt-oss's internal OpenAI coding-eval training surface. Pre-emptive
 * wrapper.
 *
 * Backed by ripgrep's `--files` (or `fd` if installed) + a glob filter.
 */

export default tool({
  description:
    "Find files in the repository by name pattern. Returns matching paths, one per line. Complements `repo_browser.search` (content search) and `repo_browser.open_file` (file view). Use this when you know roughly what a file is called but not where it lives.",
  args: {
    pattern: tool.schema.string().describe("Filename pattern. Glob (e.g. '*.ts') or substring match against the path."),
    path: tool.schema.string().optional().describe("Directory to search in (default: cwd)"),
    max_results: tool.schema.number().optional().describe("Max paths to return (default 100, cap 500)"),
  },
  async execute(args) {
    const root = args.path ?? "."
    const max = Math.max(1, Math.min(args.max_results ?? 100, 500))

    // Try fd first (faster, smarter defaults), fall back to rg --files | rg.
    const fdProbe = await $`command -v fd`.nothrow().quiet()
    let result
    if (fdProbe.exitCode === 0) {
      result = await $`fd --hidden --no-ignore-vcs --max-results ${String(max)} ${args.pattern} ${root}`
        .nothrow()
        .quiet()
    } else {
      // rg --files lists every file, then we filter — case-insensitive substring fallback.
      result = await $`sh -c ${`rg --files --hidden ${JSON.stringify(root)} | rg -iS --max-count=1 ${JSON.stringify(args.pattern)} | head -${max}`}`
        .nothrow()
        .quiet()
    }

    if (result.exitCode === 1) return `No files match pattern: ${args.pattern}`
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim()
      return stderr || `find exited ${result.exitCode}`
    }
    return result.stdout.toString().trimEnd() || `No files match pattern: ${args.pattern}`
  },
})
