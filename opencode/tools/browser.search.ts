import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `browser.search` — official harmony-trained built-in. gpt-oss spec at
 * `openai/harmony` docs/format.md documents:
 *
 *   namespace browser {
 *     type search = (_: { query: string, topn?: number, source?: string }) => any;
 *   }
 *
 * Implementation: DuckDuckGo HTML endpoint (no API key). Parses titles +
 * snippets out of the result page. Fragile by design — DDG can change
 * the HTML at any time; if results stop coming back, refresh the
 * regexes below or swap to a paid search API.
 */

const DDG_URL = "https://html.duckduckgo.com/html/"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"

export default tool({
  description:
    "Search the web for `query` and return the top results (title + URL + snippet). DuckDuckGo HTML endpoint, no API key needed. Trained gpt-oss `browser.search` tool — args match the harmony spec.",
  args: {
    query: tool.schema.string().describe("The search query"),
    topn: tool.schema.number().optional().describe("Max results to return (default 10)"),
    source: tool.schema.string().optional().describe("Source hint (ignored — DDG aggregates web sources)"),
  },
  async execute(args) {
    const topn = Math.max(1, Math.min(args.topn ?? 10, 25))

    const form = new URLSearchParams({ q: args.query, kl: "us-en" }).toString()
    const result = await $`curl -fsSL --max-time 20 -A ${UA} --data-raw ${form} ${DDG_URL}`
      .nothrow()
      .quiet()

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim()
      return `Error: search failed (curl exit ${result.exitCode}). ${stderr}`
    }

    const html = result.stdout.toString()
    const out: string[] = []
    const blockRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const stripTags = (s: string) =>
      s
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    const unwrapUrl = (u: string) => {
      // DDG wraps results in /l/?uddg=ENCODED_URL — unwrap if present
      const m = u.match(/[?&]uddg=([^&]+)/)
      return m ? decodeURIComponent(m[1]) : u
    }

    let m: RegExpExecArray | null
    let i = 0
    while ((m = blockRe.exec(html)) !== null && i < topn) {
      out.push(`[${i + 1}] ${stripTags(m[2])}`)
      out.push(`    ${unwrapUrl(m[1])}`)
      out.push(`    ${stripTags(m[3])}`)
      out.push("")
      i++
    }

    if (i === 0) {
      // Fall back to the lite endpoint if HTML one returned nothing parseable.
      return `No results parsed from DuckDuckGo HTML for query: ${args.query}\n\nIf this is a search you ran successfully via your browser, the DDG HTML layout may have changed — the regex in browser.search.ts needs an update. As a workaround, try \`bash\` with: curl -fsSL "https://lite.duckduckgo.com/lite/?q=$(printf %s ${JSON.stringify(args.query)} | jq -sRr @uri)"`
    }

    return out.join("\n").trimEnd()
  },
})
