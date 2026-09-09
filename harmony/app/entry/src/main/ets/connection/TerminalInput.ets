/** Preserve key order. Failed or disconnected input must never be replayed. */
export class TerminalInput {
  private send: (data: string) => Promise<void>;
  private tail: Promise<void> = Promise.resolve();
  private closed: boolean = false;

  constructor(send: (data: string) => Promise<void>) { this.send = send; }
  close(): void { this.closed = true; }

  write(data: string): Promise<void> { return this.enqueue(() => this.sendData(data)); }

  paste(read: () => Promise<string>): Promise<void> {
    return this.enqueue(async () => {
      const data = await read();
      if (this.closed) throw new Error('Terminal input closed');
      if (data) await this.sendData(data);
    });
  }

  private async sendData(data: string): Promise<void> {
    try {
      for (let start = 0; start < data.length;) {
        if (this.closed) throw new Error('Terminal input closed');
        // Match terminal.write's UTF-16 length limit without cutting an emoji in half.
        let end = Math.min(start + 65536, data.length);
        if (end < data.length && data.charCodeAt(end - 1) >= 0xD800 && data.charCodeAt(end - 1) <= 0xDBFF
          && data.charCodeAt(end) >= 0xDC00 && data.charCodeAt(end) <= 0xDFFF) end--;
        await this.send(data.substring(start, end));
        start = end;
      }
    }
    catch (error) { this.closed = true; throw new Error(error instanceof Error ? error.message : String(error)); }
  }

  private enqueue(send: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Terminal input closed'));
    const operation = this.tail.then(async () => {
      if (this.closed) throw new Error('Terminal input closed');
      await send();
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
