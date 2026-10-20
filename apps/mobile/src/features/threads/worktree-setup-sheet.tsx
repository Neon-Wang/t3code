import { useI18n } from "../../i18n/useI18n";
import type { ReactElement } from "react";
import { Sheet } from "../../components/ui/Sheet";

export interface WorktreeSetupSheetProps {
  children: ReactElement;
  height: number;
  onClose: () => void;
}

export function WorktreeSetupSheet({ children, onClose }: WorktreeSetupSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet title={t("mobile.threads.worktreeSetup")} onClose={onClose}>
      {children}
    </Sheet>
  );
}
