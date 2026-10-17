import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export interface TailnetStatus {
  readonly enabled: boolean;
  readonly uplink?: "wifi" | "cellular" | "ethernet" | "unavailable";
  readonly background: boolean;
  readonly state: string;
  readonly loginUrl?: string;
  readonly ips: ReadonlyArray<string>;
}
interface TailnetNativeModule {
  route(url: string): string;
  setInterfaceLanguage(locale: string, labels: Record<string, string>): Promise<void>;
  status(): Promise<string>;
  setEnabled(enabled: boolean): Promise<void>;
  setBackgroundEnabled(enabled: boolean): Promise<void>;
  logout(): Promise<void>;
  notifyCritical(key: string, title: string, message: string, deepLink: string): Promise<void>;
  addListener(event: "onNetworkChanged", listener: () => void): { remove(): void };
}
export const tailnetNative =
  Platform.OS === "android" ? requireOptionalNativeModule<TailnetNativeModule>("T3Tailnet") : null;

/** Call at the final I/O boundary, after signing URLs and DPoP proofs. */
export function routeTailnetUrl(url: string): string {
  return tailnetNative?.route(url) ?? url;
}
export async function readTailnetStatus(): Promise<TailnetStatus> {
  if (!tailnetNative) return { enabled: false, background: false, state: "Unavailable", ips: [] };
  return JSON.parse(await tailnetNative.status()) as TailnetStatus;
}
