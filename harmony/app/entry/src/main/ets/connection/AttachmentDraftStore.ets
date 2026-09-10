import fs from '@ohos.file.fs';
import util from '@ohos.util';
import { DraftStore } from './DraftStore';
import { prepareImage } from './ImagePreparation';
import { UploadedImage } from './ImageAttachment';

export interface DraftImage { uri: string; name?: string; uploaded?: UploadedImage; }
export class AttachmentDraftStore {
  images: DraftImage[] = [];
  private root: string;
  private metadata: DraftStore;
  private constructor(root: string, metadata: DraftStore) { this.root = root; this.metadata = metadata; }
  static async open(filesDir: string, environmentId: string, threadId: string): Promise<AttachmentDraftStore> {
    const root = `${filesDir}/draft-images`;
    if (!fs.accessSync(root)) fs.mkdirSync(root);
    const metadata = await DraftStore.open(filesDir, environmentId, `images:${threadId}`);
    const store = new AttachmentDraftStore(root, metadata);
    const raw = await metadata.load();
    if (raw) {
      const images = JSON.parse(raw) as DraftImage[];
      if (!Array.isArray(images) || images.length > 8) throw new Error('图片草稿格式无效');
      for (const image of images) {
        const name = image.uri?.substring(root.length + 1) ?? '';
        if (!image.uri?.startsWith(root + '/') || !/^[0-9a-f-]{36}\.img$/.test(name)) throw new Error('图片草稿路径无效');
        if (!fs.accessSync(image.uri)) throw new Error('图片草稿文件丢失，请重新选择');
      }
      store.images = images;
    }
    return store;
  }
  async add(sourceUri: string, name: string = ''): Promise<DraftImage> {
    if (this.images.length >= 8) throw new Error('每条消息最多 8 张图片');
    const file = await fs.open(sourceUri, fs.OpenMode.READ_ONLY);
    const uri = `${this.root}/${util.generateRandomUUID(true)}.img`;
    let preparedName = name;
    try {
      const stat = await fs.stat(file.fd);
      if (stat.size < 1) throw new Error('图片不能为空');
      preparedName = await prepareImage(file.fd, uri, name);
      const prepared = await fs.stat(uri);
      if (prepared.size < 1 || prepared.size > 10 * 1024 * 1024) throw new Error('转换后图片须小于或等于 10 MB 且不能为空');
    } catch (error) {
      if (fs.accessSync(uri)) await fs.unlink(uri);
      throw new Error(error instanceof Error ? error.message : String(error));
    } finally { await fs.close(file); }
    const image: DraftImage = { uri: uri, name: preparedName };
    try { await this.replace(this.images.concat([image])); }
    catch (error) { await fs.unlink(uri); throw new Error(error instanceof Error ? error.message : String(error)); }
    return image;
  }
  async setUploaded(uri: string, uploaded: UploadedImage): Promise<void> {
    await this.replace(this.images.map((image: DraftImage): DraftImage => image.uri === uri ? { uri: uri, name: image.name, uploaded: uploaded } : image));
  }
  async remove(uri: string): Promise<void> {
    if (!this.images.some((image: DraftImage) => image.uri === uri)) return;
    await this.replace(this.images.filter((image: DraftImage) => image.uri !== uri));
    if (fs.accessSync(uri)) await fs.unlink(uri);
  }
  async clear(): Promise<void> {
    const previous = this.images;
    await this.replace([]);
    for (const image of previous) if (fs.accessSync(image.uri)) await fs.unlink(image.uri);
  }
  private async replace(images: DraftImage[]): Promise<void> {
    await this.metadata.save(images.length > 0 ? JSON.stringify(images) : '');
    this.images = images;
  }
}
