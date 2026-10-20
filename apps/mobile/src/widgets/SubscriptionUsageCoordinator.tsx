import { useI18n } from "../i18n/useI18n";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Platform } from "react-native";
import { environmentCatalog } from "../connection/catalog";
import { environmentPresentations } from "../state/presentation";
import { publishSubscriptionUsage } from "./publishSubscriptionUsage";
import { useSubscriptionUsage } from "./useSubscriptionUsage";
import { buildSubscriptionUsageSnapshot } from "./subscriptionUsageSnapshot";

// Isolate quota changes from the much busier thread/config presentation stream.
const snapshotAtom = Atom.make((get) =>
  buildSubscriptionUsageSnapshot(
    get(environmentPresentations.presentationsWithProvidersAtom),
    Linking.createURL("settings/usage", { queryParams: { tab: "limits" } }),
    Platform.OS === "android" ? Infinity : 6,
  ),
).pipe(Atom.withEquality((a, b) => JSON.stringify(a) === JSON.stringify(b)));

export function SubscriptionUsageCoordinator() {
  const { locale, t } = useI18n();
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const snapshot = useAtomValue(snapshotAtom);
  useSubscriptionUsage(catalog.isReady);
  useEffect(() => {
    if (!catalog.isReady) return;
    void Promise.resolve()
      .then(() =>
        publishSubscriptionUsage({
          ...snapshot,
          locale,
          labels: {
            "mobile.widget.refresh": t("mobile.widget.refresh"),
            "mobile.widget.connect": t("mobile.widget.connect"),
            "mobile.widget.asOf": t("mobile.widget.asOf"),
            "mobile.widget.remaining": t("mobile.widget.remaining"),
            "mobile.widget.open": t("mobile.widget.open"),
            "mobile.subscriptionUsage.openT3ToConnect": t(
              "mobile.subscriptionUsage.openT3ToConnect",
            ),
            "mobile.subscriptionUsage.noSubscriptionLimitsAvailable": t(
              "mobile.subscriptionUsage.noSubscriptionLimitsAvailable",
            ),
            "mobile.SubscriptionUsage.left": t("mobile.SubscriptionUsage.left"),
            "mobile.SubscriptionUsage.moreInT3": t("mobile.SubscriptionUsage.moreInT3"),
          },
        }),
      )
      .catch((error: unknown) => {
        console.warn("Could not update subscription usage widget", error);
      });
  }, [catalog.isReady, snapshot, locale, t]);
  return null;
}
