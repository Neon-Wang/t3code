import { i18n } from "@t3tools/shared/i18n";
import { BINARY_PREVIEW_MAX_BYTES } from "./binaryPreviewProtocol";

export async function readBinaryPreview(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(i18n.t("files.fileCouldNotBeLoadedCloseRetry"));
  if (Number(response.headers.get("content-length")) > BINARY_PREVIEW_MAX_BYTES)
    throw new Error(i18n.t("files.previewLimitedUnder50Mb"));
  const reader = response.body?.getReader();
  if (!reader) throw new Error(i18n.t("files.fileUnavailable"));
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BINARY_PREVIEW_MAX_BYTES) throw new Error(i18n.t("files.previewLimitedUnder50Mb"));
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}
