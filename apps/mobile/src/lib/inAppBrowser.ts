/** Root-mounted browser presentation shared by Markdown, host previews and settings. */
export interface BrowserRequest {
  readonly url: string;
}
let present: ((request: BrowserRequest) => void) | null = null;

export function registerInAppBrowser(handler: (request: BrowserRequest) => void): () => void {
  present = handler;
  return () => {
    if (present === handler) present = null;
  };
}

export function openInAppBrowser(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported browser URL scheme");
  }
  if (!present) throw new Error("In-app browser is not ready");
  present({ url });
}

/** Response metadata wins over extensions, including extensionless download URLs. */
export function browserDownloadName(url: string, disposition: string | null | undefined): string {
  const encoded = /(?:^|;)\s*filename\*\s*=\s*(?:"?)(?:UTF-8)'[^']*'([^;"\r\n]+)/i.exec(
    disposition ?? "",
  );
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* Try the legacy field. */
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\r\n]+))/i.exec(
    disposition ?? "",
  );
  if (plain) return (plain[1]?.replace(/\\(.)/g, "$1") ?? plain[2] ?? "download").trim();
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").at(-1) || "download");
  } catch {
    return "download";
  }
}
