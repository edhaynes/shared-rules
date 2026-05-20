import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `browser.open` — official harmony-trained built-in.
 *
 *   type open = (_: {
 *     id?: number | string,   // URL string OR index from prior search results
 *     cursor?: number,
 *     loc?: number,           // line to scroll viewport to
 *     num_lines?: number,
 *     view_source?: boolean,
 *   }) => any;
 *
 * Implementation: fetch the URL, strip HTML to text, return a line-numbered
 * window for follow-up `browser.find`. `cursor` is currently informational —
 * we don't maintain cross-call session state.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"
const DEFAULT_WINDOW = 200
const MAX_FETCH_BYTES = 4 * 1024 * 1024

export default tool({
  description:
    "Open a URL and return its text content with line numbers. Pass `id` as the full URL (number indices into prior search results are not supported here — pass the URL string). Use `loc` to scroll to a specific line, `num_lines` to size the window, `view_source` to keep raw HTML. Trained gpt-oss `browser.open` tool.",
  args: {
    id: tool.schema.string().optional().describe("URL to open (number indices not supported in this implementation)"),
    url: tool.schema.string().optional().describe("Alias for id"),
    cursor: tool.schema.number().optional().describe("Page cursor (informational — no cross-call state)"),
    loc: tool.schema.number().optional().describe("1-indexed line to position the viewport at (default 1)"),
    num_lines: tool.schema.number().optional().describe("Lines visible in the viewport (default 200)"),
    view_source: tool.schema.boolean().optional().describe("If true, return raw HTML instead of extracted text"),
  },
  async execute(args) {
    const url = args.id ?? args.url
    if (!url) {
      return "Error: must supply the URL under `id` (or `url`). Numeric search-result indices are not supported — pass the actual URL string from a prior browser.search result."
    }
    if (!/^https?:\/\//i.test(url)) {
      return `Error: \`${url}\` doesn't look like a URL. Expected http(s)://...`
    }

    const result = await $`curl -fsSL --max-time 20 -A ${UA} --max-filesize ${String(MAX_FETCH_BYTES)} ${url}`
      .nothrow()
      .quiet()
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim()
      return `Error: fetch failed (curl exit ${result.exitCode}). ${stderr}`
    }

    const raw = result.stdout.toString()
    const body = args.view_source
      ? raw
      : raw
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()

    const lines = body.split("\n")
    const loc = Math.max(1, args.loc ?? 1)
    const num = Math.max(1, args.num_lines ?? DEFAULT_WINDOW)
    const startIdx = Math.min(lines.length, loc - 1)
    const endIdx = Math.min(lines.length, startIdx + num)

    const header = `[browser.open] ${url}  (${lines.length} lines total)`
    const window = lines
      .slice(startIdx, endIdx)
      .map((ln, i) => `${String(startIdx + i + 1).padStart(5, " ")}\t${ln}`)
      .join("\n")

    const footer =
      endIdx < lines.length
        ? `\n\n[…${lines.length - endIdx} more lines; call browser.open again with loc=${endIdx + 1}]`
        : ""
    return `${header}\n${window}${footer}`
  },
})
