import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useState } from "react";
import { Linking, Platform, useWindowDimensions, View } from "react-native";
import Reanimated, { ReduceMotion, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppSymbolName } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { makePermissionStatusAtom } from "../../lib/permissionStatusAtom";
import {
  isMicrophoneDevice,
  type MicrophoneEntry,
  type MicrophoneKind,
  microphoneEntryKey,
} from "../../lib/microphonePriority";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import * as Dialog from "../../components/ui/Dialog";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import {
  chooseVoiceDestination,
  cloudVoiceConnectionAtom,
  voiceConnectionAtom,
  voiceGrantAtom,
  hasEnvironmentVoiceCapture,
} from "../voice-input/voiceDestination";
import { LocalModelChoice } from "./VoiceModelSection";
import { CloudVoiceChoice } from "./CloudVoiceSection";
import type { VoiceGrant } from "../voice-input/voiceGrantStorage";
import type { EnvironmentId } from "@t3tools/contracts";
import { ThreadSwipeable } from "../home/thread-swipe-actions";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsDragHandle } from "./components/SettingsDragHandle";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import {
  deviceMicrophoneOrder,
  localVoiceTranscriberAtom,
} from "../voice-input/VoiceInputProvider";

type MicrophonePermission = "checking" | "granted" | "ask" | "denied";

function toMicrophonePermission(response: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}): MicrophonePermission {
  return response.granted ? "granted" : response.canAskAgain ? "ask" : "denied";
}

const readMicrophonePermission = () =>
  getRecordingPermissionsAsync().then(toMicrophonePermission, (): MicrophonePermission => "ask");

const microphonePermissionAtom = makePermissionStatusAtom<MicrophonePermission>({
  label: "mobile:microphone-permission",
  initial: "checking",
  read: readMicrophonePermission,
});

function useMicrophonePermission() {
  const permission = useAtomValue(microphonePermissionAtom);
  const setPermission = useAtomSet(microphonePermissionAtom);
  const request = () =>
    void requestRecordingPermissionsAsync()
      .then(toMicrophonePermission, readMicrophonePermission)
      .then(setPermission);
  return { permission, request };
}

const microphoneKinds = (
  t: ReturnType<typeof useI18n>["t"],
): Record<
  MicrophoneKind,
  {
    readonly label: string;
    readonly row: string;
    readonly rowDescription: string;
    readonly icon: AppSymbolName;
  }
> => ({
  wired: {
    label: t("mobile.settingsMicrophoneRouteScreen.wired"),
    row: t("mobile.settingsVoice.otherWired"),
    rowDescription: t("mobile.settingsVoice.otherWiredDescription"),
    icon: "cable.connector",
  },
  bluetooth: {
    label: t("mobile.settingsMicrophoneRouteScreen.bluetooth"),
    row: t("mobile.settingsMicrophoneRouteScreen.otherBluetooth"),
    rowDescription:
      Platform.OS === "android"
        ? t("mobile.settingsVoice.otherBluetoothAndroid")
        : t("mobile.settingsVoice.otherBluetoothIos"),
    icon: "headphones",
  },
  builtIn: {
    label: t("mobile.settingsMicrophoneRouteScreen.builtin"),
    row: t("mobile.settingsMicrophoneRouteScreen.builtInMicrophone"),
    rowDescription: t("mobile.settingsMicrophoneRouteScreen.builtInDescription"),
    icon: "iphone",
  },
  carPlay: {
    label: t("mobile.settingsMicrophoneRouteScreen.carPlay"),
    row: t("mobile.settingsMicrophoneRouteScreen.carPlay"),
    rowDescription: t("mobile.settingsMicrophoneRouteScreen.carPlayDescription"),
    icon: "car",
  },
});

// Runs from press handlers, so it takes the component's `t` instead of calling a hook.
function saveDestination(t: ReturnType<typeof useI18n>["t"], id: EnvironmentId | null) {
  try {
    chooseVoiceDestination(id);
  } catch {
    Dialog.alert(
      t("mobile.settingsVoice.couldNotSave"),
      t("mobile.settingsVoice.couldNotSaveDetail"),
    );
  }
}

function EnvironmentChoice({
  environment,
  selected,
  onCloudOnly,
}: {
  environment: EnvironmentPresentation;
  selected: boolean;
  /** Called instead of a local grant when the environment only offers cloud transcription. */
  onCloudOnly: () => void;
}) {
  const { t } = useI18n();
  const local = useAtomValue(voiceConnectionAtom(environment.environmentId)) !== null;
  const cloud = useAtomValue(cloudVoiceConnectionAtom(environment.environmentId)) !== null;
  const usable = local || cloud;
  return (
    <ListChoiceRow
      label={environment.label}
      selected={selected}
      disabled={!usable}
      description={
        environment.connection.phase !== "connected"
          ? t("mobile.cloudVoice.notConnected")
          : !usable
            ? t("mobile.settingsVoice.transcriptionUnavailable")
            : (environment.displayUrl ?? t("mobile.settingsVoice.sendRecordings"))
      }
      separated
      onPress={() => {
        if (selected) return;
        if (!local) return onCloudOnly();
        Dialog.confirm({
          title: t("mobile.settingsVoice.sendAudioTitle", { label: environment.label }),
          message: t("mobile.settingsVoice.sendAudioMessage", {
            target: environment.displayUrl ?? environment.label,
          }),
          confirmText: t("mobile.settingsVoice.useEnvironment"),
          onConfirm: () => saveDestination(t, environment.environmentId),
        });
      }}
    />
  );
}

/** How the selected environment transcribes: its own model or a cloud provider. */
function EnvironmentMethodSection({
  environment,
  grant,
  cloudOpen,
  onCloudOpenChange,
}: {
  environment: EnvironmentPresentation;
  grant: VoiceGrant | null;
  cloudOpen: boolean;
  onCloudOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const id = environment.environmentId;
  const destination = grant?.destination.environmentId === id ? grant.destination : null;
  const cloudCapable =
    environment.serverConfig?.environment.capabilities.cloudVoiceTranscription === true ||
    destination?.kind === "cloud";
  return (
    <SettingsSection title={t("mobile.settingsVoice.methodOn", { label: environment.label })}>
      <LocalModelChoice
        environmentId={id}
        label={environment.label}
        selected={destination?.kind === "environment"}
        // The user already agreed to send audio to this environment.
        onSelect={() => saveDestination(t, id)}
      />
      {cloudCapable ? (
        <CloudVoiceChoice
          environment={environment}
          active={destination?.kind === "cloud" ? destination : null}
          open={cloudOpen}
          onOpenChange={onCloudOpenChange}
        />
      ) : null}
    </SettingsSection>
  );
}

export function SettingsVoiceRouteScreen() {
  const { t } = useI18n();
  const transcriber = useAtomValue(localVoiceTranscriberAtom);
  const grant = useAtomValue(voiceGrantAtom);
  const { environments, isReady } = useEnvironments();
  const grantEnvironment = grant
    ? environments.find(
        (environment) => environment.environmentId === grant.destination.environmentId,
      )
    : undefined;
  // An environment whose cloud sheet is open; it may not hold the grant yet.
  const [cloudSheet, setCloudSheet] = useState<EnvironmentId | null>(null);
  // A sheet whose environment lost cloud transcription is gone, so its pending choice is too.
  const sheetEnvironment = environments.find(
    (environment) =>
      environment.environmentId === cloudSheet &&
      environment.serverConfig?.environment.capabilities.cloudVoiceTranscription === true,
  );
  const methodEnvironment = sheetEnvironment ?? grantEnvironment;
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const ready = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const entries = deviceMicrophoneOrder(
    AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value.microphones : undefined,
  );
  const { permission, request: requestPermission } = useMicrophonePermission();
  const [drag, setDrag] = useState<{ readonly key: string; readonly translation: number } | null>(
    null,
  );
  const [rowHeight, setRowHeight] = useState(0);
  // Each drop remounts the rows so the new order and the cleared offsets land in one frame.
  const [drops, setDrops] = useState(0);

  // Transforms apply to the stored order, so a device recorded meanwhile is kept.
  const move = (key: string, steps: number) =>
    savePreferences({
      transform: (current) => {
        const next = [...deviceMicrophoneOrder(current.microphones)];
        const from = next.findIndex((entry) => microphoneEntryKey(entry) === key);
        const to = Math.min(next.length - 1, Math.max(0, from + steps));
        if (from === -1 || from === to) return {};
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return { microphones: next };
      },
    });
  const forget = (key: string) =>
    savePreferences({
      transform: (current) => ({
        microphones: deviceMicrophoneOrder(current.microphones).filter(
          (entry) => microphoneEntryKey(entry) !== key,
        ),
      }),
    });
  const dropSteps = (from: number, translation: number) =>
    rowHeight === 0
      ? 0
      : Math.min(entries.length - 1, Math.max(0, from + Math.round(translation / rowHeight))) -
        from;

  const dragFrom =
    drag === null ? -1 : entries.findIndex((entry) => microphoneEntryKey(entry) === drag.key);
  const dragTo = drag === null ? -1 : dragFrom + dropSteps(dragFrom, drag.translation);

  return (
    <SettingsScreen title={t("mobile.settingsRouteScreen.voice")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title={t("mobile.settingsVoice.transcribeOn")}>
          <ListChoiceRow
            label={t("settings.connections.thisDevice")}
            description={t("mobile.settingsVoice.thisDeviceDescription")}
            selected={!grant && !sheetEnvironment}
            onPress={() => {
              setCloudSheet(null);
              saveDestination(t, null);
            }}
          />
          {hasEnvironmentVoiceCapture &&
            environments.map((environment) => (
              <EnvironmentChoice
                key={environment.environmentId}
                environment={environment}
                selected={
                  sheetEnvironment
                    ? sheetEnvironment.environmentId === environment.environmentId
                    : grant?.destination.environmentId === environment.environmentId
                }
                onCloudOnly={() => setCloudSheet(environment.environmentId)}
              />
            ))}
          {isReady && grant && !grantEnvironment ? (
            <ListChoiceRow
              label={t("mobile.settingsVoice.previousEnvironment")}
              description={t("mobile.settingsVoice.noLongerPaired")}
              separated
              selected
              disabled
              onPress={() => {}}
            />
          ) : null}
        </SettingsSection>
        {hasEnvironmentVoiceCapture && methodEnvironment ? (
          <EnvironmentMethodSection
            environment={methodEnvironment}
            grant={grant}
            cloudOpen={cloudSheet === methodEnvironment.environmentId}
            onCloudOpenChange={(open) =>
              setCloudSheet(open ? methodEnvironment.environmentId : null)
            }
          />
        ) : null}
        {!grant && transcriber === null ? (
          <Text className="px-2 text-sm text-foreground-muted">
            {t(
              Platform.OS === "android"
                ? "mobile.settingsVoice.unavailableAndroid"
                : "mobile.settingsVoice.unavailableIos",
            )}
          </Text>
        ) : null}
        {permission === "ask" || permission === "denied" ? (
          <>
            <SettingsSection title={t("mobile.settingsMicrophoneRouteScreen.microphoneAccess")}>
              <SettingsActionRow
                icon="mic"
                label={
                  permission === "ask"
                    ? t("mobile.settingsMisc.allowMicrophoneAccess")
                    : t("mobile.pairing.openSettings")
                }
                onPress={
                  permission === "ask" ? requestPermission : () => void Linking.openSettings()
                }
              />
            </SettingsSection>
            <Text className="px-2 text-sm text-foreground-muted">
              {permission === "ask"
                ? t("mobile.settingsVoice.allowMicrophoneAccess")
                : t("mobile.settingsVoice.turnOnMicrophoneAccess")}
            </Text>
          </>
        ) : null}
        <SettingsSection title={t("mobile.settingsMicrophoneRouteScreen.preferredOrder")}>
          {entries.map((entry, index) => {
            const key = microphoneEntryKey(entry);
            const shift =
              dragFrom === -1 || index === dragFrom
                ? 0
                : dragFrom < dragTo && index > dragFrom && index <= dragTo
                  ? -rowHeight
                  : dragFrom > dragTo && index < dragFrom && index >= dragTo
                    ? rowHeight
                    : 0;
            return (
              <MicrophoneRow
                key={`${key}:${drops}`}
                entry={entry}
                position={index + 1}
                count={entries.length}
                reorderable={ready}
                offset={index === dragFrom ? (drag?.translation ?? 0) : shift}
                lifted={index === dragFrom}
                onHeight={setRowHeight}
                onDragStart={() => setDrag({ key, translation: 0 })}
                onDragMove={(translation) => setDrag({ key, translation })}
                onDragEnd={(translation, cancelled) => {
                  setDrag(null);
                  setDrops((count) => count + 1);
                  if (!cancelled) move(key, dropSteps(index, translation));
                }}
                onStep={(direction) => move(key, direction === "up" ? -1 : 1)}
                onForget={isMicrophoneDevice(entry) ? () => forget(key) : undefined}
              />
            );
          })}
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          {t("mobile.settingsVoice.microphoneOrderHint")}
          {Platform.OS === "android" ? t("mobile.settingsVoice.microphoneOrderHintAndroid") : null}
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}

function MicrophoneRow(props: {
  readonly entry: MicrophoneEntry;
  readonly position: number;
  readonly count: number;
  readonly reorderable: boolean;
  readonly offset: number;
  readonly lifted: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDragStart: () => void;
  readonly onDragMove: (translation: number) => void;
  readonly onDragEnd: (translation: number, cancelled: boolean) => void;
  readonly onStep: (direction: "up" | "down") => void;
  readonly onForget: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const { lifted, offset, entry, onForget } = props;
  const kind = microphoneKinds(t)[entry.kind];
  const title = isMicrophoneDevice(entry) ? entry.name : kind.row;
  const { width: windowWidth } = useWindowDimensions();
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: lifted
          ? offset
          : withTiming(offset, { duration: 160, reduceMotion: ReduceMotion.System }),
      },
    ],
    zIndex: lifted ? 1 : 0,
  }));
  const row = (
    // Opaque so the swipe actions stay hidden until the row slides over them.
    <View className="flex-row items-center bg-grouped-card">
      <View
        accessible
        accessibilityLabel={t("mobile.settingsMicrophoneRouteScreen.rowPosition", {
          title,
          kind: kind.label,
          position: props.position,
          count: props.count,
        })}
        accessibilityActions={
          onForget
            ? [{ name: "forget", label: t("mobile.settingsMicrophoneRouteScreen.forget") }]
            : undefined
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "forget") onForget?.();
        }}
        className="min-w-0 flex-1"
      >
        <ListRowLayout
          icon={kind.icon}
          label={title}
          description={isMicrophoneDevice(entry) ? kind.label : kind.rowDescription}
        />
      </View>
      {props.reorderable ? (
        <SettingsDragHandle
          title={title}
          canMoveUp={props.position > 1}
          canMoveDown={props.position < props.count}
          onStart={props.onDragStart}
          onMove={props.onDragMove}
          onEnd={props.onDragEnd}
          onStep={props.onStep}
        />
      ) : null}
    </View>
  );
  return (
    <Reanimated.View
      style={style}
      onLayout={(event) => props.onHeight(event.nativeEvent.layout.height)}
      className={cn(
        props.position > 1 && !lifted && "border-t border-border-subtle",
        lifted && "bg-grouped-card shadow-md",
      )}
    >
      {onForget ? (
        <ThreadSwipeable
          backgroundColor="transparent"
          fullSwipeAction="primary"
          fullSwipeWidth={windowWidth - 40}
          onDelete={onForget}
          primaryAction={{
            accessibilityLabel: t("mobile.settingsMicrophoneRouteScreen.forgetDevice", { title }),
            destructive: true,
            icon: "trash",
            label: t("mobile.settingsMicrophoneRouteScreen.forget"),
            onPress: onForget,
          }}
          secondaryAction={null}
          threadKey={`microphone:${microphoneEntryKey(entry)}`}
          threadTitle={title}
        >
          {() => row}
        </ThreadSwipeable>
      ) : (
        row
      )}
    </Reanimated.View>
  );
}
