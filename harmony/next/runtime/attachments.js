import fs from "@ohos.file.fs";
import picker from "@ohos.file.picker";
import photoAccessHelper from "@ohos.file.photoAccessHelper";
import image from "@ohos.multimedia.image";
import uniformTypeDescriptor from "@ohos.data.uniformTypeDescriptor";
import http from "@ohos.net.http";
import { fitImageAttachmentSize } from "@t3tools/client-runtime/image-attachment-size";
import { imageMimeType } from "@t3tools/shared/image";
import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
} from "@t3tools/contracts";

export async function pickAttachment(context, photo) {
  const uris = photo
    ? (
        await new photoAccessHelper.PhotoViewPicker().select({
          MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
          maxSelectNumber: 1,
        })
      ).photoUris
    : await new picker.DocumentViewPicker(context).select({ maxSelectNumber: 1 });
  if (uris.length === 0) return null;
  const uri = uris[0];
  let name = decodeURIComponent(uri.substring(uri.lastIndexOf("/") + 1));
  const extension = name.includes(".") ? name.substring(name.lastIndexOf(".")) : "";
  const typeId = uniformTypeDescriptor.getUniformDataTypeByFilenameExtension(extension);
  let mimeType =
    uniformTypeDescriptor.getTypeDescriptor(typeId).mimeTypes[0] ?? "application/octet-stream";
  const file = await fs.open(uri, fs.OpenMode.READ_ONLY);
  let bytes;
  try {
    const stat = await fs.stat(file.fd);
    if (stat.size > PROVIDER_SEND_TURN_MAX_FILE_BYTES && !photo)
      throw new Error("文件超过 50 MB 限制");
    const convert = photo || imageMimeType({ name, mimeType }) !== null;
    if (convert) {
      const source = image.createImageSource(file.fd);
      const packer = image.createImagePacker();
      let pixels;
      try {
        const info = await source.getImageInfo();
        const size = fitImageAttachmentSize(info.size);
        pixels = await source.createPixelMap(size ? { desiredSize: size } : {});
        // Android keeps PNG; all other picker photos (including HEIC) become JPEG.
        mimeType = mimeType === "image/png" ? "image/png" : "image/jpeg";
        name = name.replace(/\.[^.]+$/, "") + (mimeType === "image/png" ? ".png" : ".jpg");
        for (let shrinks = 0; ; shrinks++) {
          bytes = new Uint8Array(await packer.packing(pixels, { format: mimeType, quality: 85 }));
          if (bytes.length <= PROVIDER_SEND_TURN_MAX_IMAGE_BYTES || shrinks === 3) break;
          const scale = Math.sqrt(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / bytes.length) * 0.9;
          await pixels.scale(scale, scale);
        }
      } finally {
        if (pixels) await pixels.release();
        await packer.release();
        await source.release();
      }
      if (bytes.length > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) throw new Error("图片超过 10 MB 限制");
    } else {
      const buffer = new ArrayBuffer(stat.size);
      let offset = 0;
      while (offset < stat.size) {
        const chunk = new ArrayBuffer(stat.size - offset);
        const count = await fs.read(file.fd, chunk, { length: chunk.byteLength });
        if (count === 0) throw new Error("文件读取不完整");
        new Uint8Array(buffer).set(new Uint8Array(chunk, 0, count), offset);
        offset += count;
      }
      bytes = new Uint8Array(buffer);
    }
  } finally {
    await fs.close(file);
  }
  if (bytes.length === 0) throw new Error("不能发送空文件");
  return {
    bytes,
    upload: {
      type: imageMimeType({ name, mimeType }) ? "image" : "file",
      name,
      mimeType,
      sizeBytes: bytes.length,
    },
  };
}

export function uploadAttachmentBytes(url, attachment) {
  const client = http.createHttp();
  return {
    abort: () => client.destroy(),
    done: client
      .request(url, {
        method: http.RequestMethod.POST,
        header: {
          "Content-Type": attachment.upload.mimeType,
          "Content-Length": String(attachment.bytes.length),
        },
        extraData: attachment.bytes.buffer.slice(
          attachment.bytes.byteOffset,
          attachment.bytes.byteOffset + attachment.bytes.byteLength,
        ),
        usingCache: false,
      })
      .then((response) => {
        if (response.responseCode < 200 || response.responseCode >= 300)
          throw new Error(`附件上传失败（HTTP ${response.responseCode}）`);
      })
      .finally(() => client.destroy()),
  };
}
