/**
 * Validate external URLs in a markdown body before they ship to the editor.
 *
 * The research/brief stage uses Claude web search, which occasionally
 * returns stale or fabricated URLs that 404 in production. Those broken
 * links make their way into the draft, then get protected by the editor's
 * "external links are sacred" rule — so unless we check them explicitly,
 * they survive all the way to the published article.
 *
 * This validator runs an HTTP HEAD request on every unique external URL
 * in the markdown. Any URL that returns 4xx, 5xx, or fails to resolve
 * within the timeout is flagged. The caller can then strip or unwrap
 * the dead links.
 */

type Status = "ok" | "broken" | "timeout" | "error";

export interface UrlValidationResult {
  url: string;
  status: Status;
  statusCode?: number;
}

export interface ValidatedBodyResult {
  cleaned: string;
  broken: UrlValidationResult[];
  checked: number;
}

function normalizeUrl(url: string): string {
  return url.trim();
}

function extractLinks(markdown: string): Array<{
  match: string;
  anchor: string;
  url: string;
  start: number;
  end: number;
}> {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out: Array<{
    match: string;
    anchor: string;
    url: string;
    start: number;
    end: number;
  }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push({
      match: m[0],
      anchor: m[1],
      url: normalizeUrl(m[2]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** Run a single HTTP HEAD check. Falls back to GET if the server rejects HEAD. */
async function checkUrl(
  url: string,
  timeoutMs = 8000
): Promise<UrlValidationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SequelBrandBrain-LinkChecker/1.0)",
      },
    });
    // Some servers don't support HEAD — retry with GET.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SequelBrandBrain-LinkChecker/1.0)",
        },
      });
    }
    clearTimeout(timer);
    if (res.status >= 400) {
      return { url, status: "broken", statusCode: res.status };
    }
    return { url, status: "ok", statusCode: res.status };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort") || message.includes("Abort")) {
      return { url, status: "timeout" };
    }
    return { url, status: "error" };
  }
}

/**
 * Validate every unique external URL in a markdown body, strip the
 * broken ones, and return the cleaned body plus the list of failures.
 *
 * @param markdown — the article body to check
 * @param opts.isExternal — predicate for whether a URL is external (so internal Sequel links are skipped)
 * @param opts.concurrency — how many URL checks to run in parallel (default 6)
 * @param opts.strategy — "unwrap" (keep anchor text as plain text) or "remove_sentence" (future; currently defaults to unwrap)
 */
export async function validateAndCleanUrls(
  markdown: string,
  opts: {
    isExternal: (url: string) => boolean;
    concurrency?: number;
  }
): Promise<ValidatedBodyResult> {
  const concurrency = opts.concurrency || 6;
  const links = extractLinks(markdown);
  const externalLinks = links.filter((l) => opts.isExternal(l.url));
  const uniqueUrls = Array.from(new Set(externalLinks.map((l) => l.url)));

  if (uniqueUrls.length === 0) {
    return { cleaned: markdown, broken: [], checked: 0 };
  }

  // Run checks in parallel, batched to `concurrency` at a time.
  const results = new Map<string, UrlValidationResult>();
  for (let i = 0; i < uniqueUrls.length; i += concurrency) {
    const batch = uniqueUrls.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map((u) => checkUrl(u)));
    for (const r of settled) results.set(r.url, r);
  }

  const broken: UrlValidationResult[] = [];
  Array.from(results.values()).forEach((r) => {
    if (r.status !== "ok") broken.push(r);
  });

  if (broken.length === 0) {
    return { cleaned: markdown, broken: [], checked: uniqueUrls.length };
  }

  // Strip every markdown link whose URL is in the broken set.
  // Strategy: unwrap — replace [anchor](broken_url) with plain "anchor".
  const brokenSet = new Set(broken.map((b) => b.url));
  const cleaned = markdown.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, anchor: string, url: string) => {
      if (brokenSet.has(normalizeUrl(url))) {
        return anchor;
      }
      return match;
    }
  );

  return { cleaned, broken, checked: uniqueUrls.length };
}
