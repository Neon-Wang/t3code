import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../../i18n/useI18n";
import { Toast } from "../../components/ui/Toast";
import { APP_BAR_HEIGHT } from "../../lib/layoutMetrics";
import { dismissThreadUndoNotice, useThreadUndoNotice } from "./thread-undo-notice";

const ACTION_MESSAGES = {
  Settled: "mobile.threadUndoNotice.settledThread",
  Snoozed: "mobile.threadUndoNotice.snoozedThread",
  Unpinned: "mobile.threadUndoNotice.unpinnedThread",
} as const;

export function ThreadUndoNotice(props: { readonly visible: boolean }) {
  const { t } = useI18n();
  const notice = useThreadUndoNotice();
  const insets = useSafeAreaInsets();
  if (!props.visible || notice === null) return null;
  return (
    <View
      className="absolute inset-x-3 z-[100]"
      style={{ top: insets.top + APP_BAR_HEIGHT + 8 }}
      pointerEvents="box-none"
    >
      <Toast
        message={t(ACTION_MESSAGES[notice.action])}
        action={{
          label: t("sidebar.ui.undo"),
          onPress: () => {
            void notice.undo();
          },
        }}
        onDismiss={dismissThreadUndoNotice}
      />
    </View>
  );
}
