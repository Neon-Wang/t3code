import { createFileRoute } from "@tanstack/react-router";
import { useGT, useLocale } from "gt-react";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../components/settings/settingsLayout";
import { Button } from "../components/ui/button";
import { useHiddenItems, unhideItem } from "../hiddenItems";
import { useEnvironmentIdentities } from "../state/environments";

export const Route = createFileRoute("/_chat/settings/hidden")({ component: HiddenSettings });

function HiddenSettings() {
  const gt = useGT();
  const locale = useLocale();
  const hidden = useHiddenItems();
  const environments = useEnvironmentIdentities();
  return (
    <SettingsPageContainer>
      {(["project", "thread"] as const).map((kind) => {
        const items = hidden.items.filter((item) => item.kind === kind).toReversed();
        return (
          <SettingsSection
            key={kind}
            title={kind === "project" ? gt("Projects") : gt("Threads")}
            headerAction={
              kind === "project" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={hidden.items.length === 0}
                  onClick={hidden.clear}
                >
                  {gt("Unhide all")}
                </Button>
              ) : null
            }
          >
            {items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {kind === "project" ? gt("No hidden projects.") : gt("No hidden threads.")}
              </p>
            ) : (
              items.map((item) => (
                <SettingsRow
                  key={JSON.stringify(item.ref)}
                  title={item.title}
                  description={
                    <>
                      {environments.find((env) => env.environmentId === item.ref[0])?.label ??
                        item.ref[0]}{" "}
                      ·{" "}
                      <time dateTime={item.hiddenAt}>
                        {new Date(item.hiddenAt).toLocaleString(locale)}
                      </time>
                    </>
                  }
                  control={
                    <Button variant="outline" size="sm" onClick={() => unhideItem(item)}>
                      {gt("Unhide")}
                    </Button>
                  }
                />
              ))
            )}
          </SettingsSection>
        );
      })}
    </SettingsPageContainer>
  );
}
