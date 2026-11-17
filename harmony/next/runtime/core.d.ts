import type common from "@ohos.app.ability.common";
export function markdownBlocks(text: string): string;

export function connect(pairingUrl: string, context: common.Context): Promise<void>;
export function subscribe(listener: (snapshot: string) => void): () => void;
export function getSnapshot(): string;
export function subscribeThread(
  environmentId: string,
  threadId: string,
  listener: (snapshot: string) => void,
): () => void;
export function disconnect(): Promise<void>;
export function threadFeedAction(
  environmentId: string,
  threadId: string,
  action: string,
  id: string,
): Promise<unknown>;

export function initialize(context: common.Context): Promise<unknown>;
export function setForeground(active: boolean): void;
export function dispose(): void;
export function setEnvironmentEnabled(id: string, enabled: boolean): Promise<unknown>;
export function removeEnvironment(id: string): Promise<unknown>;

export function translate(key: string): string;
export function refreshLocale(): void;

export function setThreadFilter(searchQuery: string, projectKey: string): void;
export function toggleThreadGroup(group: string): Promise<void>;
export function showMoreThreads(): void;
export function retryThreadPages(): void;
export function threadAction(
  environmentId: string,
  threadId: string,
  action: string,
  value?: string,
): Promise<unknown>;

export function answerQuestion(environmentId: string, id: string, text: string): Promise<unknown>;
export function closeQuestion(environmentId: string, id: string): Promise<unknown>;

export interface CustomSnoozeDefaults {
  date: string;
  time: string;
}
export function customSnoozeDefaults(): CustomSnoozeDefaults;
export function customSnoozeValid(value: string): boolean;

export function setComposerText(environmentId: string, threadId: string, text: string): void;
