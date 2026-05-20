import { tool } from "@opencode-ai/plugin"
import { $ } from "bun"

/**
 * `browser.find` — official harmony-trained built-in.
 *
 *   type find = (_: { pattern: string, cursor?: number }) => any;
 *
 * The spec says `find` operates on the "current page (or the page given
 * by `cursor`)". We don't maintain cross-call session state, so this
 * impl takes an explicit `url` arg (preferred) or, falling back to the
 * spec, accepts `cursor` as the URL itself. Fetches + greps in one shot.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"
const MAX_FETCH_BYTES = 4 * 1024 * 1024
const MAX_MATCHES = 50

export default tool({
  description:
    "Find a pattern on a web page. Pass `url` (preferred) or `cursor` containing the URL string from a prior browser.open. Returns line-numbered match context. Trained gpt-oss `browser.find` tool — implemented as fetch + grep so it works without session state.",
  args: {
    pattern: tool.schema.string().describe("Pattern to find (PCRE regex; smart-case)"),
    url: tool.schema.string().optional().describe("URL to search within"),
    cursor: tool.schema.string().optional().describe("Spec-compatible alias for url (pass the URL as a string)"),
  },
  async execute(args) {
    const url = args.url ?? args.cursor
    if (!url) {
      return "Error: must supply `url` (the page to search). The harmony spec uses `cursor`; this impl accepts either, with the URL as the value."
    }
    if (!/^https?:\/\//i.test(url)) {
      return `Error: \`${url}\` doesn't look like a URL.`
    }

    const fetched = await $`curl -fsSL --max-time 20 -A ${UA} --max-filesize ${String(MAX_FETCH_BYTES)} ${url}`
      .nothrow()
      .quiet()
    if (fetched.exitCode !== 0) {
      return `Error: fetch failed (curl exit ${fetched.exitCode}). ${fetched.stderr.toString().trim()}`
    }

    const text = fetched.stdout
      .toString()
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")

    let re: RegExp
    try {
      const hasUpper = /[A-Z]/.test(args.pattern)
      re = new RegExp(args.pattern, hasUpper ? "g" : "gi")
    } catch (err: any) {
      return `Error: invalid regex \`${args.pattern}\`: ${err?.message ?? String(err)}`
    }

    const lines = text.split("\n")
    const hits: string[] = []
    for (let i = 0; i < lines.length && hits.length < MAX_MATCHES; i++) {
      if (re.test(lines[i])) {
        hits.push(`${String(i + 1).padStart(5, " ")}\t${lines[i].trim().slice(0, 400)}`)
      }
    }

    if (hits.length === 0) {
      return `No matches for \`${args.pattern}\` in ${url} (${lines.length} lines scanned).`
    }
    const more = hits.length === MAX_MATCHES ? `\n\n[…truncated at ${MAX_MATCHES} matches; refine the pattern]` : ""
    return `[browser.find] ${url}\n${hits.join("\n")}${more}`
  },
})
