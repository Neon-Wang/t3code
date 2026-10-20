import { describe, expect, it, vi } from "@effect/vitest";
import { createTailnetFetch } from "./transport";

describe("tailnet fetch boundary", () => {
  it("preserves a Request POST body, authorization and cancellation when routing", async () => {
    const controller = new AbortController();
    const request = new Request("https://mint.example.ts.net/submit", {
      method: "POST",
      body: "user payload",
      signal: controller.signal,
      headers: { Authorization: "Bearer test", DPoP: "proof-for-original-url" },
    });
    const original = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const fetchRouted = createTailnetFetch(original, () => "http://127.0.0.1:1234/private/submit");
    await fetchRouted(request);
    const [url, init] = original.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:1234/private/submit");
    expect(init?.method).toBe("POST");
    const body = init?.body;
    if (!(body instanceof Blob)) throw new Error("Routed POST body is missing");
    expect(await body.text()).toBe("user payload");
    expect(new Headers(init?.headers).get("DPoP")).toBe("proof-for-original-url");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test");
    controller.abort();
    expect(init?.signal?.aborted).toBe(true);
    expect(request.bodyUsed).toBe(false);
  });
  it("does not consume or clone public and local Requests", async () => {
    const request = new Request("https://example.com/", { method: "POST", body: "keep" });
    const original = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    await createTailnetFetch(original, (url) => url)(request);
    expect(original.mock.calls[0]?.[0]).toBe(request);
    expect(request.bodyUsed).toBe(false);
  });
});
