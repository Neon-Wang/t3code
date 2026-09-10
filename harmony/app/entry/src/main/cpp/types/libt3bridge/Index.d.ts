export interface BridgeNative {
  initialize(): string;
  constants(moduleName: string): string | null;
  createView(moduleName: string): string | null;
  setProp(instanceId: string, name: string, value: string | number | boolean | null): boolean;
  callAsync(moduleName: string, functionName: string, instanceId: string | null,
    argumentsJson: string): string | null;
  callSync(moduleName: string, functionName: string, argumentsJson: string): string | null;
  displayList(instanceId: string): string | null;
  setFrame(instanceId: string, width: number, height: number, scale: number): void;
  setScrollOffset(instanceId: string, x: number, y: number): void;
  touch(instanceId: string, phase: number, x: number, y: number): void;
  tick(timestamp: number): void;
  pumpMainQueue(): void;
  destroyView(instanceId: string): void;
  setEventSink(callback: (instanceId: string, name: string, payloadJson: string) => void): void;
}

declare const bridge: BridgeNative;
export default bridge;
