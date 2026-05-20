/** Normalize a URL so equivalent variants share the same key in storage. */
export function urlKey(input: string): string {
  try {
    const u = new URL(input);
    const host = u.host.toLowerCase();
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    const query = u.search;
    return `${host}${path}${query}`;
  } catch {
    return input.trim().toLowerCase();
  }
}
