import { useNavigation } from "@react-navigation/native";
import { useLayoutEffect, type ComponentType } from "react";
import type { MessageKey } from "@t3tools/shared/i18n";
import { useI18n } from "./useI18n";

/** Keep static route names stable while updating the visible native header in place. */
export function withLocalizedTitle<P extends object>(Screen: ComponentType<P>, key: MessageKey) {
  return function LocalizedScreen(props: P) {
    const navigation = useNavigation();
    const { t } = useI18n();
    useLayoutEffect(() => {
      navigation.setOptions({ title: t(key) });
    }, [navigation, t]);
    return <Screen {...props} />;
  };
}
