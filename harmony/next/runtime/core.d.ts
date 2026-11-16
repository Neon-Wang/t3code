import type common from "@ohos.app.ability.common";

export function connect(pairingUrl: string, context: common.Context): Promise<void>;
export function subscribe(listener: (snapshot: string) => void): () => void;
export function getSnapshot(): string;
export function disconnect(): Promise<void>;
