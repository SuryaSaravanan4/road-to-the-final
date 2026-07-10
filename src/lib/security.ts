/**
 * Cross-site request checks for state-changing route handlers. Phase 1 has
 * no cookies or sessions, so there is no ambient credential for classic
 * CSRF to ride — the risk is a hostile page triggering paid extractions or
 * confirms cross-site. Browsers always send Origin on cross-origin POSTs,
 * so a mismatched Origin (or an explicitly cross-site Sec-Fetch-Site) is
 * rejected; requests with neither header (curl, server-to-server) are
 * allowed because they carry nothing to forge. Token-based CSRF protection
 * arrives with real sessions in Phase 2.
 */
export function isSameOriginRequest(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  // "null" is an opaque origin (sandboxed iframe, some redirects) — hostile
  // until proven otherwise. A missing Origin is a non-browser client.
  if (origin === "null") return false;
  if (!origin) {
    return secFetchSite === null || secFetchSite === "same-origin" || secFetchSite === "none";
  }

  const host = request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
