import fs from '@ohos.file.fs';
import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';

export class DraftStore {
  private static writes: Map<string, Promise<void>> = new Map();
  private path: string;

  private constructor(path: string) { this.path = path; }

  static async open(filesDir: string, environmentId: string, threadId: string): Promise<DraftStore> {
    const root = `${filesDir}/drafts`;
    if (!fs.accessSync(root)) fs.mkdirSync(root);
    const md = cryptoFramework.createMd('SHA256');
    await md.update({ data: new util.TextEncoder().encodeInto(JSON.stringify([environmentId, threadId])) });
    const digest = await md.digest();
    let key = '';
    for (const byte of digest.data) key += byte.toString(16).padStart(2, '0');
    return new DraftStore(`${root}/${key}.txt`);
  }

  async load(): Promise<string> {
    await DraftStore.writes.get(this.path);
    return fs.accessSync(this.path) ? await fs.readText(this.path) : '';
  }

  save(text: string): Promise<void> {
    const previous = DraftStore.writes.get(this.path) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(() => this.write(text));
    DraftStore.writes.set(this.path, operation);
    const cleanup = (): void => {
      if (DraftStore.writes.get(this.path) === operation) DraftStore.writes.delete(this.path);
    };
    operation.then(cleanup, cleanup);
    return operation;
  }

  private async write(text: string): Promise<void> {
    if (text.length === 0) {
      if (fs.accessSync(this.path)) await fs.unlink(this.path);
      return;
    }
    const temporary = `${this.path}.tmp`;
    const file = await fs.open(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      const bytes = new util.TextEncoder().encodeInto(text);
      let written = 0;
      while (written < bytes.length) {
        const count = await fs.write(file.fd, bytes.buffer.slice(written));
        if (count <= 0) throw new Error('草稿写入未完成');
        written += count;
      }
    } finally {
      await fs.close(file);
    }
    await fs.rename(temporary, this.path);
  }
}
