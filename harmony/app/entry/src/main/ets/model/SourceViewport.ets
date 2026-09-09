import { SourceLineLabel, SourceTargetRange, sourceTargetLine } from './SourceLines';

export interface SourceVisualMetric { startIndex: number; baseline: number; bottom: number; }
export interface SourcePosition { baseline: number; range: SourceTargetRange; }

export class SourceViewport {
  private count: number;
  private read: (index: number) => SourceVisualMetric;
  private yieldFrame: () => Promise<void>;
  private cache: Map<number, SourceVisualMetric> = new Map();
  private deadline: number = 0;

  constructor(count: number, read: (index: number) => SourceVisualMetric, yieldFrame: () => Promise<void>) {
    this.count = count;
    this.read = read;
    this.yieldFrame = yieldFrame;
  }

  private async at(index: number): Promise<SourceVisualMetric> {
    const cached = this.cache.get(index);
    if (cached) return cached;
    if (Date.now() >= this.deadline) {
      await this.yieldFrame();
      this.deadline = Date.now() + 8;
    }
    const value = this.read(index);
    if (this.cache.size >= 512) {
      for (const key of this.cache.keys()) { this.cache.delete(key); break; }
    }
    this.cache.set(index, value);
    return value;
  }

  private async lowerBound(value: number, byIndex: boolean): Promise<number> {
    let low = 0;
    let high = this.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const metric = await this.at(middle);
      if ((byIndex ? metric.startIndex : metric.baseline) < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  async labels(starts: number[], offset: number, height: number, fontHeight: number): Promise<SourceLineLabel[]> {
    const labels: SourceLineLabel[] = [];
    const first = await this.lowerBound(Math.max(0, offset - fontHeight * 2), false);
    for (let index = first; index < this.count; index++) {
      const metric = await this.at(index);
      if (metric.baseline > offset + height + fontHeight * 2) break;
      let low = 0;
      let high = starts.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (starts[middle] < metric.startIndex) low = middle + 1;
        else high = middle;
      }
      const finalEmpty = index === this.count - 1 && metric.startIndex === starts[starts.length - 1] - 1;
      if (finalEmpty) labels.push({ number: starts.length, baseline: metric.baseline });
      else if (low < starts.length && starts[low] === metric.startIndex) {
        labels.push({ number: low + 1, baseline: metric.baseline });
      }
    }
    return labels;
  }

  async target(starts: number[], line: number, fontHeight: number): Promise<SourcePosition | null> {
    const target = sourceTargetLine(line, starts.length);
    if (!target || !this.count) return null;
    const index = Math.min(await this.lowerBound(starts[target - 1], true), this.count - 1);
    const metric = await this.at(index);
    const top = metric.baseline - fontHeight;
    let bottom: number;
    if (target < starts.length) {
      const next = Math.min(await this.lowerBound(starts[target], true), this.count - 1);
      bottom = (await this.at(next)).baseline - fontHeight;
    } else bottom = (await this.at(this.count - 1)).bottom;
    return { baseline: metric.baseline, range: { top: top, height: bottom - top } };
  }
}
