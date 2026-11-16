import type common from "@ohos.app.ability.common";

export function connect(pairingUrl: string, context: common.Context): Promise<void>;
export function subscribe(listener: (snapshot: string) => void): () => void;
export function getSnapshot(): string;
export function disconnect(): Promise<void>;

export function initialize(context: common.Context): Promise<unknown>;
export function setForeground(active: boolean): void;
export function dispose(): void;
export function setEnvironmentEnabled(id: string, enabled: boolean): Promise<unknown>;
export function removeEnvironment(id: string): Promise<unknown>;

export function translate(key: string): string;
export function refreshLocale(): void;
