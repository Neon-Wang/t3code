import { cn } from "~/lib/utils";

import { CommandBlock } from "./CommandBlock";

import { useI18n } from "../hooks/useI18n";
/**
 * Setup steps for another computer: install `t3`, then run `command`. Both installers are shown
 * because the browser showing this is often not the computer being set up.
 */
export function InstallT3Commands({
  command,
  className,
}: {
  readonly command: string;
  readonly className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">{t("mcp.install.macLinux")}</p>
      <CommandBlock command="curl -fsSL https://t3.codes/install.sh | sh" />
      <p className="text-xs text-muted-foreground">{t("mcp.install.windows")}</p>
      <CommandBlock command="irm https://t3.codes/install.ps1 | iex" />
      <p className="text-xs text-muted-foreground">{t("mcp.install.then")}</p>
      <CommandBlock command={command} />
      <p className="text-xs text-muted-foreground">
        {t("mcp.install.skipPrefix")}
        <code className="font-mono">t3</code>
        {t("mcp.install.skipMiddle")}
        <code className="font-mono">t3</code>
        {t("mcp.install.skipSuffix")}
      </p>
    </div>
  );
}
