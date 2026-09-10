import fs from '@ohos.file.fs';
import image from '@ohos.multimedia.image';

/** Preserve supported originals; convert HEIF to a provider-readable JPEG. */
export async function prepareImage(sourceFd: number, destination: string, name: string): Promise<string> {
  const source = image.createImageSource(sourceFd);
  try {
    const info = await source.getImageInfo();
    if (info.mimeType !== 'image/heic' && info.mimeType !== 'image/heif') {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(info.mimeType)) {
        throw new Error('不支持此图片格式，请选择 PNG、JPEG、GIF、WebP 或 HEIC');
      }
      const stat = await fs.stat(sourceFd);
      if (stat.size > 10 * 1024 * 1024) throw new Error('图片须小于或等于 10 MB');
      await fs.copyFile(sourceFd, destination);
      return name;
    }
    const packer = image.createImagePacker();
    try {
      const output = await fs.open(destination, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
      try {
        await packer.packToFile(source, output.fd, {
          format: 'image/jpeg', quality: 90, needsPackProperties: true
        });
      } finally { await fs.close(output); }
    } finally { await packer.release(); }
    return (name.trim().replace(/\.[^.]+$/, '') || 'image') + '.jpg';
  } finally { await source.release(); }
}
