import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as path from "node:path"

/**
 * `repo_browser.open_file` — view a file (or a slice of it) at a path.
 *
 * Companion to `repo_browser.search`. gpt-oss-120b emits this from the
 * same internal namespace, typically as a follow-up to a search hit
 * ("open file X at line N"). Without a registered tool, LiteLLM-strict
 * rejects the stream with `tool call validation failed`.
 *
 * Accepts the path under several aliases and the line range under
 * several aliases — the model's training varies. Output mirrors the
 * `read` tool's cat -n line-numbered format so the model can refer to
 * specific lines in follow-up calls.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB hard cap
const DEFAULT_WINDOW = 200 // lines shown when no range given
const MAX_LINE_LEN = 2000

export default tool({
  description:
    "Open a file at a path and return its contents with line numbers (cat -n format). Use as a follow-up to `repo_browser.search` to view context around a match. Accepts the path under `path`/`filePath`/`file`/`filename`/`file_path`; accepts a line range under `line_start`+`line_end` / `start_line`+`end_line` / `offset`+`limit`. With no range, returns the first 200 lines.",
  args: {
    path: tool.schema.string().optional().describe("Path to the file (absolute or relative)"),
    filePath: tool.schema.string().optional().describe("Alias for path"),
    file: tool.schema.string().optional().describe("Alias for path"),
    filename: tool.schema.string().optional().describe("Alias for path"),
    file_path: tool.schema.string().optional().describe("Alias for path"),
    line_start: tool.schema.number().optional().describe("1-indexed first line to include"),
    line_end: tool.schema.number().optional().describe("1-indexed last line to include (inclusive)"),
    start_line: tool.schema.number().optional().describe("Alias for line_start"),
    end_line: tool.schema.number().optional().describe("Alias for line_end"),
    offset: tool.schema.number().optional().describe("Alias for line_start"),
    limit: tool.schema.number().optional().describe("Max lines to return (used when no line_end is given)"),
  },
  async execute(args) {
    const target =
      args.path ?? args.filePath ?? args.file ?? args.filename ?? args.file_path
    if (!target) {
      return "Error: must supply the file path under one of `path`, `filePath`, `file`, `filename`, or `file_path`."
    }

    const start = args.line_start ?? args.start_line ?? args.offset ?? 1
    const end = args.line_end ?? args.end_line
    const limit = args.limit

    const resolved = path.resolve(target)

    let stat
    try {
      stat = await fs.stat(resolved)
    } catch (err: any) {
      if (err?.code === "ENOENT") return `Error: file not found: ${resolved}`
      return `Error: ${err?.message ?? String(err)}`
    }
    if (stat.isDirectory()) {
      return `Error: ${resolved} is a directory, not a file.`
    }
    if (!stat.isFile()) {
      return `Error: ${resolved} is not a regular file.`
    }
    if (stat.size > MAX_BYTES) {
      return `Error: file is ${stat.size} bytes (cap ${MAX_BYTES}). Pass an explicit line range to read a slice.`
    }

    let buf: Buffer
    try {
      buf = await fs.readFile(resolved)
    } catch (err: any) {
      return `Error: ${err?.message ?? String(err)}`
    }

    // Binary sniff
    const sniffEnd = Math.min(buf.length, 8192)
    for (let i = 0; i < sniffEnd; i++) {
      if (buf[i] === 0) {
        return `Error: ${resolved} appears to be a binary file (${stat.size} bytes). This tool reads text only.`
      }
    }

    const lines = buf.toString("utf8").split("\n")
    const startIdx = Math.max(0, Math.min(lines.length, start - 1))

    let endIdx: number
    if (typeof end === "number") {
      endIdx = Math.max(startIdx, Math.min(lines.length, end))
    } else if (typeof limit === "number") {
      endIdx = Math.min(lines.length, startIdx + Math.max(1, limit))
    } else {
      endIdx = Math.min(lines.length, startIdx + DEFAULT_WINDOW)
    }

    const out: string[] = []
    for (let i = startIdx; i < endIdx; i++) {
      let body = lines[i] ?? ""
      if (body.length > MAX_LINE_LEN) {
        body = body.slice(0, MAX_LINE_LEN) + "  […line truncated]"
      }
      out.push(`${String(i + 1).padStart(6, " ")}\t${body}`)
    }

    if (endIdx < lines.length) {
      const remaining = lines.length - endIdx
      out.push("")
      out.push(`[…${remaining} more lines; pass line_start=${endIdx + 1} to continue]`)
    } else if (out.length === 0) {
      return `[empty range: file has ${lines.length} lines; start=${start}, end=${end ?? "—"}]`
    }
    return out.join("\n")
  },
})
