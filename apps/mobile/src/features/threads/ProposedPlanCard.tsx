import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { proposedPlanTitle, stripDisplayedPlanMarkdown } from "@t3tools/shared/proposedPlanText";
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { useI18n } from "../../i18n/useI18n";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { CopyTextButton } from "./CopyTextButton";

export function ProposedPlanCard(props: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string | null | undefined;
  readonly markdown: string;
  readonly renderMarkdown: (text: string) => ReactNode;
}) {
  const { t } = useI18n();
  const canWrite = useAtomValue(projectEnvironment.writeFile.permissionAtom(props.environmentId));
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [lastPath, setLastPath] = useState("plan.md");
  const contents = `${props.markdown.trimEnd()}\n`;

  const save = async (path: string) => {
    const relativePath = path.trim();
    if (!canWrite || !props.workspaceRoot || inFlight.current) return;
    if (!relativePath) {
      Dialog.alert(t("chat.ui.enterAWorkspacePath"));
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setLastPath(relativePath);
    const result = await writeFile({
      environmentId: props.environmentId,
      input: { cwd: props.workspaceRoot, relativePath, contents },
    }).finally(() => {
      inFlight.current = false;
      setSaving(false);
    });
    if (result._tag === "Success") {
      Dialog.alert(t("chat.ui.planSavedToWorkspace"), result.value.relativePath);
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      Dialog.alert(
        t("chat.ui.couldNotSavePlan"),
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <View className="mb-3 gap-3 rounded-[20px] border border-border bg-card-alt p-4">
      <View className="flex-row items-center gap-2">
        <Text accessibilityRole="header" className="flex-1 font-t3-bold text-base text-foreground">
          {proposedPlanTitle(props.markdown) ?? "Proposed plan"}
        </Text>
        <CopyTextButton
          accessibilityLabel={t("mobile.proposedPlanCard.copyPlan")}
          text={contents}
        />
      </View>
      {props.renderMarkdown(stripDisplayedPlanMarkdown(props.markdown))}
      <View className="flex-row">
        <Button
          label={saving ? "Saving..." : t("chat.ui.saveToWorkspace")}
          tone="secondary"
          disabled={!canWrite || !props.workspaceRoot || saving}
          onPress={() =>
            Dialog.prompt({
              title: t("chat.ui.savePlanToWorkspace"),
              // The write replaces an existing file, and the RPC has no create-only mode.
              message: t("mobile.proposedPlanCard.enterAPathRelativeToWorkspace"),
              initialValue: lastPath,
              confirmText: "Save",
              onConfirm: (path) => void save(path),
            })
          }
        />
      </View>
    </View>
  );
}
