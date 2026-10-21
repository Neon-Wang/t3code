import { Button } from "../../components/ui/Button";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { useI18n } from "../../i18n/useI18n";
import { ConnectionTraceId } from "./ConnectionTraceId";
import {
  type EnvironmentConnectionPhase,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";
import { SymbolView } from "../../components/ui/AppSymbol";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { i18n } from "@t3tools/shared/i18n";

function noticeTitle(phase: EnvironmentConnectionPhase, environmentLabel: string): string {
  switch (phase) {
    case "offline":
      return i18n.t("mobile.environmentConnectionNotice.youAreOffline");
    case "connecting":
      return i18n.t("mobile.environmentConnectionNotice.connectingToEnvironment", {
        environment: environmentLabel,
      });
    case "reconnecting":
      return i18n.t("mobile.environmentConnectionNotice.reconnectingToEnvironment", {
        environment: environmentLabel,
      });
    case "unsupported":
      return i18n.t("mobile.useremoteenvironmentregistry.clientNotSupported");
    case "error":
      return i18n.t("mobile.environmentConnectionNotice.environmentIsUnavailable", {
        environment: environmentLabel,
      });
    case "available":
      return i18n.t("mobile.environmentConnectionNotice.environmentIsDisconnected", {
        environment: environmentLabel,
      });
    case "connected":
      return "";
  }
}

function noticeDetail(
  phase: EnvironmentConnectionPhase,
  resourceName: string,
  error: string | null,
): string {
  if (error) {
    return phase === "reconnecting"
      ? i18n.t("mobile.environmentConnectionNotice.theAppWillKeepRetryingAutomaticallyError", {
          error,
        })
      : error;
  }

  switch (phase) {
    case "offline":
      return i18n.t("mobile.environmentConnectionNotice.cachedDataRemainsAvailable", {
        resource: resourceName,
      });
    case "connecting":
    case "reconnecting":
      return i18n.t("mobile.environmentConnectionNotice.theResourceWillLoadAsSoonAsReady", {
        resource: resourceName,
      });
    case "unsupported":
      return i18n.t("mobile.environmentConnectionNotice.useCompatibleVersions");
    case "available":
    case "error":
      return i18n.t("mobile.environmentConnectionNotice.reconnectTheEnvironmentToLoad", {
        resource: resourceName,
      });
    case "connected":
      return "";
  }
}

export function EnvironmentConnectionNotice(props: {
  readonly environmentLabel: string;
  readonly connection: EnvironmentConnectionPresentation;
  readonly resourceName: string;
  readonly onRetry: () => void;
}) {
  const { t } = useI18n();
  const isRetrying =
    props.connection.phase === "connecting" || props.connection.phase === "reconnecting";

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="max-w-[320px] items-center gap-3">
        {isRetrying ? (
          <AppActivityIndicator size="small" colorClassName={"accent-icon-muted"} />
        ) : (
          <SymbolView
            name={props.connection.phase === "offline" ? "wifi.slash" : "bolt.horizontal.circle"}
            size={24}
            tintColorClassName={"accent-icon-muted"}
            type="monochrome"
          />
        )}

        <Text className="text-center text-lg font-t3-bold text-foreground">
          {noticeTitle(props.connection.phase, props.environmentLabel)}
        </Text>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          {noticeDetail(props.connection.phase, props.resourceName, props.connection.error)}
          {props.connection.traceId ? (
            <ConnectionTraceId traceId={props.connection.traceId} />
          ) : null}
        </Text>

        {props.connection.phase !== "offline" && props.connection.phase !== "unsupported" ? (
          <View className="mt-1">
            <Button
              label={t("mobile.environmentConnectionNotice.retryNow")}
              tone="secondary"
              onPress={props.onRetry}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
