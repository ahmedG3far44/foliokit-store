/**
 * CLIENT_URL is a comma-separated list of browser origins. Normalize it once so
 * harmless formatting differences (such as a trailing slash) do not cause CORS
 * mismatches, and reject URLs that are not actually origins.
 */
export function parseClientOrigins(value: string): string[] {
  const origins = value.split(",").map((item) => {
    const input = item.trim();
    if (!input) throw new Error("CLIENT_URL contains an empty origin");

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error(`CLIENT_URL contains an invalid origin: ${input}`);
    }

    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`CLIENT_URL entries must be origins without paths or credentials: ${input}`);
    }
    return url.origin;
  });

  return [...new Set(origins)];
}
