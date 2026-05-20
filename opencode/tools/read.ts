import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as path from "node:path"

/**
 * `read` — tolerant-schema replacement for OpenCode's built-in read tool.
 *
 * Why this exists: gpt-oss-120b emits `read` calls with the arg under
 * `path` / `file` / `filename` instead of the canonical `filePath`. The
 * built-in tool's strict schema rejects the call with
 * `tool call validation failed: missing properties: 'filePath'`.
 * Accepting the common aliases and normalizing client-side is more
 * durable than prompt-engineering the model out of its training prior.
 *
 * Behavior mirrors the standard read contract — UTF-8 only, line-numbered
 * output in `cat -n` form, optional `offset` (1-indexed line) and `limit`.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB hard cap — prevents accidentally feeding huge files into the context
const DEFAULT_LIMIT = 2000
const MAX_LINE_LEN = 2000

export default tool({
  description:
    "Read a file from disk and return its contents with line numbers (cat -n format). Accepts the path under any of `filePath`, `path`, `file`, `filename`, or `file_path` for tolerance to model variation. Supports `offset` (1-indexed starting line) and `limit` (max lines, default 2000).",
  args: {
    filePath: tool.schema.string().optional().describe("Absolute or relative path to the file"),
    path: tool.schema.string().optional().describe("Alias for filePath"),
    file: tool.schema.string().optional().describe("Alias for filePath"),
    filename: tool.schema.string().optional().describe("Alias for filePath"),
    file_path: tool.schema.string().optional().describe("Alias for filePath"),
    offset: tool.schema.number().optional().describe("1-indexed line number to start reading from"),
    limit: tool.schema.number().optional().describe("Maximum lines to return (default 2000)"),
  },
  async execute(args) {
    const target =
      args.filePath ?? args.path ?? args.file ?? args.filename ?? args.file_path
    if (!target) {
      return "Error: must supply the file path under one of `filePath`, `path`, `file`, `filename`, or `file_path`."
    }

    const resolved = path.resolve(target)

    let stat
    try {
      stat = await fs.stat(resolved)
    } catch (err: any) {
      if (err?.code === "ENOENT") return `Error: file not found: ${resolved}`
      return `Error: ${err?.message ?? String(err)}`
    }

    if (stat.isDirectory()) {
      return `Error: ${resolved} is a directory, not a file. Use the ls/list tool to inspect directories.`
    }
    if (!stat.isFile()) {
      return `Error: ${resolved} is not a regular file.`
    }
    if (stat.size > MAX_BYTES) {
      return `Error: file is ${stat.size} bytes (cap ${MAX_BYTES}). Re-request with offset+limit to read a slice.`
    }

    let buf: Buffer
    try {
      buf = await fs.readFile(resolved)
    } catch (err: any) {
      return `Error: ${err?.message ?? String(err)}`
    }

    // Binary sniff — if there's a NUL byte in the first 8 KB, treat as binary.
    const sniffEnd = Math.min(buf.length, 8192)
    let binary = false
    for (let i = 0; i < sniffEnd; i++) {
      if (buf[i] === 0) {
        binary = true
        break
      }
    }
    if (binary) {
      return `Error: ${resolved} appears to be a binary file (${stat.size} bytes). This tool reads text only.`
    }

    const text = buf.toString("utf8")
    const lines = text.split("\n")
    const startLine = Math.max(1, args.offset ?? 1)
    const limit = Math.max(1, args.limit ?? DEFAULT_LIMIT)
    const startIdx = startLine - 1
    const endIdx = Math.min(lines.length, startIdx + limit)

    const out: string[] = []
    for (let i = startIdx; i < endIdx; i++) {
      const lineNum = i + 1
      let body = lines[i] ?? ""
      if (body.length > MAX_LINE_LEN) {
        body = body.slice(0, MAX_LINE_LEN) + "  […line truncated]"
      }
      out.push(`${String(lineNum).padStart(6, " ")}\t${body}`)
    }

    if (endIdx < lines.length) {
      const remaining = lines.length - endIdx
      out.push("")
      out.push(`[…${remaining} more lines; pass offset=${endIdx + 1} to continue]`)
    }
    return out.join("\n")
  },
})
