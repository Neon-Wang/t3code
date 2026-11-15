import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Atom } from "effect/reactivity";
import { AppState, Platform } from "react-native";
import { loadOrCreateAgentAwarenessDeviceId } from "../../persistence/imperative";
import { appAtomRegistry } from "../../state/atom-registry";
import { connectedEnvironmentIdsAtom } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";

const oppo =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        addListener(
          event: "token",
          listener: (event: { token: string }) => void,
        ): { remove(): void };
        register(): Promise<string | null>;
      }>("T3OppoPush")
    : null;
const fcmConfigured =
  Platform.OS === "android" && Constants.expoConfig?.extra?.inboxPushFcm === true;
const targetsAtom = Atom.make((get) =>
  get(connectedEnvironmentIdsAtom).filter(
    (environmentId) =>
      get(serverEnvironment.configValueAtom(environmentId))?.environment.capabilities.inboxPush ===
        true && get(serverEnvironment.registerPushDevice.permissionAtom(environmentId)),
  ),
).pipe(
  Atom.withEquality(
    (a: ReadonlyArray<EnvironmentId>, b: ReadonlyArray<EnvironmentId>) =>
      a.length === b.length && a.every((id, index) => id === b[index]),
  ),
);

let requestRefresh = () => {};

export function refreshInboxPushRegistration() {
  requestRefresh();
}

export function installInboxPushRegistration() {
  if (Platform.OS !== "android") return () => {};
  let stopped = false;
  let queue = Promise.resolve();
  let fcmToken: string | null = null;
  let oppoToken: string | null = null;
  const registrations = new Map<EnvironmentId, string>();
  const scheme = Constants.expoConfig?.scheme;
  const appScheme = Array.isArray(scheme) ? scheme[0] : scheme;

  const sync = async () => {
    if (stopped || !appScheme) return;
    const targets = appAtomRegistry.get(targetsAtom);
    for (const id of registrations.keys()) if (!targets.includes(id)) registrations.delete(id);
    if (targets.length === 0) return;
    const deviceId = await loadOrCreateAgentAwarenessDeviceId();
    const permissions = await Notifications.getPermissionsAsync();
    let token: string | null = null;
    let provider: "fcm" | "oppo" = "fcm";
    if (permissions.granted) {
      if (oppo) {
        oppoToken = oppoToken ?? (await oppo.register());
        if (oppoToken) {
          token = oppoToken;
          provider = "oppo";
        }
      }
      if (!token && fcmConfigured) {
        fcmToken = fcmToken ?? String((await Notifications.getDevicePushTokenAsync()).data);
        token = fcmToken;
      }
    }
    if (!(await Notifications.getPermissionsAsync()).granted) token = null;
    if (stopped) return;
    for (const environmentId of targets) {
      if (!appAtomRegistry.get(targetsAtom).includes(environmentId)) continue;
      const signature = token ? `${provider}:${token}:${appScheme}` : "unregistered";
      if (registrations.get(environmentId) === signature) continue;
      const options = { reportFailure: false, reportDefect: false };
      const result = token
        ? await runAtomCommand(
            appAtomRegistry,
            serverEnvironment.registerPushDevice,
            {
              environmentId,
              input: {
                deviceId,
                provider,
                token,
                scheme: appScheme,
                label: Device.deviceName ?? Device.modelName ?? "Android",
              },
            },
            options,
          )
        : await runAtomCommand(
            appAtomRegistry,
            serverEnvironment.unregisterPushDevice,
            {
              environmentId,
              input: { deviceId },
            },
            options,
          );
      if (result._tag === "Success") registrations.set(environmentId, signature);
      else console.warn("Inbox push device registration failed.");
    }
  };
  const refresh = () => {
    queue = queue.then(sync).catch(() => console.warn("Inbox push registration failed."));
  };
  requestRefresh = refresh;
  const unsubscribe = appAtomRegistry.subscribe(
    targetsAtom,
    (targets) => {
      for (const id of registrations.keys()) if (!targets.includes(id)) registrations.delete(id);
      refresh();
    },
    { immediate: true },
  );
  const tokenSubscription = fcmConfigured
    ? Notifications.addPushTokenListener((token) => {
        fcmToken = String(token.data);
        refresh();
      })
    : null;
  const oppoSubscription = oppo?.addListener("token", ({ token }) => {
    oppoToken = token;
    refresh();
  });
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      fcmToken = null;
      oppoToken = null;
      refresh();
    }
  });
  return () => {
    stopped = true;
    requestRefresh = () => {};
    unsubscribe();
    tokenSubscription?.remove();
    oppoSubscription?.remove();
    appStateSubscription.remove();
  };
}
