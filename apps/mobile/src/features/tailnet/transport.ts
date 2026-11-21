/** A native Request may keep its body in a Blob instead of exposing a stream. */
export function createTailnetFetch(
  fetch: typeof globalThis.fetch,
  route: (url: string) => string,
): typeof globalThis.fetch {
  return async (input, init) => {
    if (typeof input === "string" || input instanceof URL) return fetch(route(String(input)), init);
    const routed = route(input.url);
    if (routed === input.url) return fetch(input, init);
    const body =
      input.method === "GET" || input.method === "HEAD" ? undefined : await input.clone().blob();
    return fetch(routed, {
      method: input.method,
      headers: input.headers,
      body,
      signal: input.signal,
      credentials: input.credentials,
      redirect: input.redirect,
      cache: input.cache,
      ...init,
    });
  };
}
