import { View } from "react-native";

import { Notice } from "../../components/ui/Notice";
import { setFreshSessionPending, useComposerDraftSettings } from "../../state/use-composer-drafts";
import { useI18n } from "../../i18n/useI18n";

/** Shown while `/clear` is armed; dismissing it keeps the current session. */
export function FreshSessionNotice(props: { readonly threadKey: string }) {
  const { t } = useI18n();
  if (useComposerDraftSettings(props.threadKey).freshContext !== true) return null;
  return (
    <View className="px-4 pb-3">
      <Notice
        message={t("mobile.freshSessionNotice.message")}
        icon="arrow.clockwise"
        floating
        onDismiss={() => setFreshSessionPending(props.threadKey, false)}
        dismissLabel="Keep the current session"
      />
    </View>
  );
}
