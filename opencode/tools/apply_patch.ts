import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as path from "node:path"

interface Hunk {
  contexts: string[]
  oldLines: string[]
  newLines: string[]
}

type Op =
  | { kind: "add"; filePath: string; lines: string[] }
  | { kind: "delete"; filePath: string }
  | { kind: "update"; filePath: string; movePath?: string; hunks: Hunk[] }

function unwrapInput(raw: string): string {
  let s = raw
  try {
    const parsed = JSON.parse(s)
    if (typeof parsed === "string") s = parsed
    else if (parsed && typeof parsed === "object") {
      const candidate = parsed.input ?? parsed.patch ?? parsed.diff
      if (typeof candidate === "string") s = candidate
    }
  } catch {}
  const fence = s.match(/^\s*```(?:diff|patch|text)?\s*\n([\s\S]*?)\n?```\s*$/)
  if (fence) s = fence[1]
  return s
}

function parsePatch(raw: string): Op[] {
  const input = unwrapInput(raw)
  const lines = input.split("\n")
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  if (i < lines.length && lines[i].trim() === "*** Begin Patch") i++

  const ops: Op[] = []
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === "*** End Patch" || trimmed === "") { i++; continue }

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim()
      i++
      const contentLines: string[] = []
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        const l = lines[i]
        if (l.startsWith("+")) contentLines.push(l.slice(1))
        else if (l === "") contentLines.push("")
        i++
      }
      ops.push({ kind: "add", filePath, lines: contentLines })
    } else if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim()
      i++
      ops.push({ kind: "delete", filePath })
    } else if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim()
      i++
      let movePath: string | undefined
      if (i < lines.length && lines[i].startsWith("*** Move to: ")) {
        movePath = lines[i].slice("*** Move to: ".length).trim()
        i++
      }
      const hunks: Hunk[] = []
      let current: Hunk | null = null
      let inBody = false
      while (i < lines.length) {
        const l = lines[i]
        if (l.startsWith("*** ")) break
        if (l.startsWith("@@")) {
          if (inBody && current) { hunks.push(current); current = null; inBody = false }
          if (!current) current = { contexts: [], oldLines: [], newLines: [] }
          const ctx = l.slice(2).trim()
          if (ctx) current.contexts.push(ctx)
        } else if (l.startsWith("+")) {
          if (!current) current = { contexts: [], oldLines: [], newLines: [] }
          current.newLines.push(l.slice(1))
          inBody = true
        } else if (l.startsWith("-")) {
          if (!current) current = { contexts: [], oldLines: [], newLines: [] }
          current.oldLines.push(l.slice(1))
          inBody = true
        } else if (l.startsWith(" ")) {
          if (!current) current = { contexts: [], oldLines: [], newLines: [] }
          current.oldLines.push(l.slice(1))
          current.newLines.push(l.slice(1))
          inBody = true
        } else if (l === "") {
          if (current && inBody) {
            current.oldLines.push("")
            current.newLines.push("")
          }
        } else {
          if (current) {
            current.oldLines.push(l)
            current.newLines.push(l)
            inBody = true
          }
        }
        i++
      }
      if (current) hunks.push(current)
      ops.push({ kind: "update", filePath, movePath, hunks })
    } else {
      i++
    }
  }
  return ops
}

function applyHunk(content: string, hunk: Hunk): string {
  const oldBlock = hunk.oldLines.join("\n")
  const newBlock = hunk.newLines.join("\n")
  if (oldBlock === "") {
    return content.endsWith("\n") || content === "" ? content + newBlock : content + "\n" + newBlock
  }
  let searchFrom = 0
  for (const ctx of hunk.contexts) {
    const idx = content.indexOf(ctx, searchFrom)
    if (idx === -1) throw new Error(`apply_patch: context anchor not found: "${ctx}"`)
    searchFrom = idx
  }
  const target = content.indexOf(oldBlock, searchFrom)
  if (target === -1) throw new Error(`apply_patch: could not locate hunk in file. Expected:\n${oldBlock}`)
  if (hunk.contexts.length === 0) {
    const second = content.indexOf(oldBlock, target + 1)
    if (second !== -1) throw new Error("apply_patch: hunk is ambiguous (multiple matches); add an @@ context anchor")
  }
  return content.slice(0, target) + newBlock + content.slice(target + oldBlock.length)
}

async function applyOp(op: Op): Promise<string> {
  if (op.kind === "add") {
    await fs.mkdir(path.dirname(op.filePath), { recursive: true })
    const body = op.lines.length > 0 ? op.lines.join("\n") + "\n" : ""
    await fs.writeFile(op.filePath, body)
    return `Added ${op.filePath}`
  }
  if (op.kind === "delete") {
    await fs.unlink(op.filePath)
    return `Deleted ${op.filePath}`
  }
  const original = await fs.readFile(op.filePath, "utf8")
  let content = original
  for (const hunk of op.hunks) content = applyHunk(content, hunk)
  if (op.movePath) {
    await fs.mkdir(path.dirname(op.movePath), { recursive: true })
    await fs.writeFile(op.movePath, content)
    await fs.unlink(op.filePath)
    return `Updated ${op.filePath} -> ${op.movePath}`
  }
  await fs.writeFile(op.filePath, content)
  return `Updated ${op.filePath}`
}

export default tool({
  description:
    "Apply a multi-file patch in OpenAI apply_patch envelope format (*** Begin Patch / *** Update File / *** Add File / *** Delete File / *** End Patch). Accepts plain text, JSON-string-wrapped, or fenced ```diff blocks.",
  args: {
    input: tool.schema.string().describe("The patch text. Should start with '*** Begin Patch' and end with '*** End Patch'."),
  },
  async execute(args) {
    try {
      const ops = parsePatch(args.input)
      if (ops.length === 0) return "apply_patch: no operations parsed from input"
      const results: string[] = []
      for (const op of ops) results.push(await applyOp(op))
      return results.join("\n")
    } catch (e: any) {
      return `apply_patch error: ${e?.message ?? String(e)}`
    }
  },
})
