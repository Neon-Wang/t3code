import { useI18n } from "../../i18n/useI18n";
import { Button } from "../../components/ui/Button";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";

export function ThreadCreationFailedCard(props: {
  readonly reason: string;
  readonly onEditTask: () => void;
}) {
  const { t } = useI18n();
  return (
    <View className="gap-2.5 rounded-[20px] border border-border-subtle bg-card-alt p-4">
      <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-danger-foreground">
        {t("mobile.threads.couldNotStartTask")}
      </Text>
      <Text className="font-sans text-sm leading-normal text-foreground-secondary">
        {props.reason}
      </Text>
      <Text className="font-sans text-xs leading-normal text-foreground-secondary">
        {t("mobile.threads.yourPromptWasKeptInTheProjectDraft")}
      </Text>
      <View className="flex-row">
        <Button label={t("mobile.threads.editTask")} tone="primary" onPress={props.onEditTask} />
      </View>
    </View>
  );
}
