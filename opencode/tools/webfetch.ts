import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Fetch a URL and return its text content.",
  args: {
    url: tool.schema.string().describe("The URL to fetch"),
  },
  async execute(args) {
    const result = await Bun.$`curl -fsSL --max-time 30 ${args.url}`.text()
    return result
  },
})
