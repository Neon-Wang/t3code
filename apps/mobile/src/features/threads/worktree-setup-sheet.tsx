import { useI18n } from "../../i18n/useI18n";
import type { ReactElement } from "react";
import { AppSheet } from "../../components/AppSheet";

export interface WorktreeSetupSheetProps {
  children: ReactElement;
  height: number;
  onClose: () => void;
}

export function WorktreeSetupSheet({ children, onClose }: WorktreeSetupSheetProps) {
  const { t } = useI18n();
  return (
    <AppSheet title={t("mobile.threads.worktreeSetup")} onClose={onClose}>
      {children}
    </AppSheet>
  );
}
