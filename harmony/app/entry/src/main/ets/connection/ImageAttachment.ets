import fs from '@ohos.file.fs';
import http from '@ohos.net.http';
import { RpcClient } from './Rpc';

export interface UploadedImage { type: string; id: string; name: string; mimeType: string; sizeBytes: number; }
interface DeleteRequest { attachmentId: string; }
interface UploadRequest { name: string; mimeType: string; sizeBytes: number; }
interface UploadUrl { attachmentId: string; relativeUrl: string; }
export function imageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片');
}
export async function uploadImage(rpc: RpcClient, baseUrl: string, uri: string, originalName: string = ''): Promise<UploadedImage> {
  const file = await fs.open(uri, fs.OpenMode.READ_ONLY);
  let bytes: ArrayBuffer;
  try {
    const stat = await fs.stat(file.fd);
    if (stat.size < 1 || stat.size > 10 * 1024 * 1024) throw new Error('图片须小于或等于 10 MB 且不能为空');
    bytes = new ArrayBuffer(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const chunk = new ArrayBuffer(stat.size - offset);
      const count = await fs.read(file.fd, chunk, { offset: offset, length: chunk.byteLength });
      if (count <= 0) throw new Error('图片读取未完成，请重新选择');
      new Uint8Array(bytes).set(new Uint8Array(chunk, 0, count), offset);
      offset += count;
    }
  } finally { await fs.close(file); }
  const mimeType = imageMime(new Uint8Array(bytes));
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.substring(6);
  const name = originalName.trim();
  const request: UploadRequest = { name: name.length > 0 && name.length <= 255 ? name : `image.${extension}`, mimeType: mimeType, sizeBytes: bytes.byteLength };
  const upload = await rpc.call<UploadUrl>('attachments.createUploadUrl', request);
  const client = http.createHttp();
  try {
    if (!upload.relativeUrl.startsWith('/') || upload.relativeUrl.startsWith('//')) throw new Error('上传地址无效');
    const response = await client.request(baseUrl.replace(/\/$/, '') + upload.relativeUrl, {
      method: http.RequestMethod.POST, header: { 'Content-Type': mimeType }, extraData: bytes,
      connectTimeout: 15000, readTimeout: 60000
    });
    if (response.responseCode < 200 || response.responseCode >= 300) throw new Error(`图片上传失败 (${response.responseCode})`);
    return { type: 'image', id: upload.attachmentId, name: request.name, mimeType: mimeType, sizeBytes: bytes.byteLength };
  } catch (error) {
    const deletion: DeleteRequest = { attachmentId: upload.attachmentId };
    try { await rpc.call('attachments.delete', deletion); } catch (_) {}
    throw new Error(error instanceof Error ? error.message : String(error));
  } finally { client.destroy(); }
}

interface ImageAsset { _tag: string; attachmentId: string; }
interface ImageAssetRequest { resource: ImageAsset; }
export async function imageUploadExists(rpc: RpcClient, id: string): Promise<boolean> {
  const resource: ImageAsset = { _tag: 'attachment', attachmentId: id };
  const request: ImageAssetRequest = { resource: resource };
  try { await rpc.call('assets.createUrl', request); return true; }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('AssetAttachmentNotFoundError')) return false;
    throw new Error(message);
  }
}
export async function deleteImageUpload(rpc: RpcClient, id: string): Promise<void> {
  const request: DeleteRequest = { attachmentId: id };
  try { await rpc.call('attachments.delete', request); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('AssetAttachmentNotFoundError')) throw new Error(message);
  }
}
