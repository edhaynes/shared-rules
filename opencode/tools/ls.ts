import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

export default tool({
  description: "List directory contents.",
  args: {
    path: tool.schema.string().optional().describe("Path to list (defaults to current directory)"),
    flags: tool.schema.string().optional().describe("Optional flags like '-la', '-lh', '-t'"),
  },
  async execute(args) {
    const path = args.path ?? "."
    const flags = args.flags ?? ""
    const cmd = `ls ${flags} ${path}`
    const result = await $`sh -c ${cmd}`.nothrow().quiet()
    const stdout = result.stdout.toString().trimEnd()
    const stderr = result.stderr.toString().trim()
    if (result.exitCode !== 0) {
      return stderr || `ls exited ${result.exitCode} with no stderr (cmd: ${cmd})`
    }
    return stdout
  },
})
