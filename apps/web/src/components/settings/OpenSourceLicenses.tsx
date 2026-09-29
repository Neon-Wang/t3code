import type { MessageKey } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { ChevronRightIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  decodeThirdPartyLicenseManifest,
  filterThirdPartyLicenseEntries,
  thirdPartyLicenseEntryKey,
  type ThirdPartyLicenseEntry,
  type ThirdPartyLicenseManifest,
} from "@t3tools/shared/thirdPartyLicenses";

import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const LICENSE_BUNDLE_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  assets: "settings.theme.licenses.bundle.assets",
  desktop: "settings.theme.licenses.bundle.desktop",
  "device-tools": "settings.theme.licenses.bundle.device-tools",
  mobile: "settings.theme.licenses.bundle.mobile",
  server: "settings.theme.licenses.bundle.server",
  web: "settings.theme.licenses.bundle.web",
};

type LicenseManifestState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string | null }
  | { readonly status: "ready"; readonly manifest: ThirdPartyLicenseManifest };

async function loadLicenseManifest(signal: AbortSignal): Promise<ThirdPartyLicenseManifest> {
  const response = await fetch(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/third-party-licenses.json`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`The license manifest request failed with status ${String(response.status)}.`);
  }
  return decodeThirdPartyLicenseManifest((await response.json()) as unknown);
}

function LicenseNoticeRow({
  entry,
  open,
  onOpenChange,
}: {
  readonly entry: ThirdPartyLicenseEntry;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <article>
        <div className="flex min-h-10 items-center hover:bg-muted/35 sm:min-h-9">
          <CollapsibleTrigger className="group flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 text-left sm:min-h-9 sm:px-4">
            <ChevronRightIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-90"
            />
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-medium text-foreground">{entry.name}</span>
              {entry.version ? (
                <code className="shrink-0 text-xs text-muted-foreground">{entry.version}</code>
              ) : null}
            </span>
            <span className="max-w-[42%] shrink-0 truncate text-xs text-muted-foreground">
              {entry.license} ·{" "}
              {entry.bundles
                .map((bundle) => {
                  const key = LICENSE_BUNDLE_LABEL_KEYS[bundle];
                  return key
                    ? t(key)
                    : bundle === "android"
                      ? "Android"
                      : bundle === "ios"
                        ? "iOS"
                        : bundle;
                })
                .join(", ")}
            </span>
          </CollapsibleTrigger>
          {entry.sourceUrl ? (
            <Button
              aria-label={t("settings.theme.licenses.viewProjectSource", { name: entry.name })}
              className="me-3 shrink-0 sm:me-4"
              render={<a href={entry.sourceUrl} rel="noreferrer noopener" target="_blank" />}
              size="icon-micro"
              title={t("settings.theme.projectSource")}
              variant="ghost-muted"
            >
              <ExternalLinkIcon aria-hidden className="size-3" />
            </Button>
          ) : null}
        </div>
        <CollapsiblePanel>
          {open ? (
            <div className="px-9 pt-1 pb-4 sm:px-10">
              <pre className="max-w-[76ch] whitespace-pre-wrap break-words font-mono text-xs/5 text-foreground/80">
                {entry.noticeText}
              </pre>
            </div>
          ) : null}
        </CollapsiblePanel>
      </article>
    </Collapsible>
  );
}

function LicenseCount({
  filteredCount,
  totalCount,
}: {
  filteredCount: number;
  totalCount: number;
}) {
  const { t } = useI18n();
  return (
    <p className="whitespace-nowrap text-xs font-normal text-muted-foreground tabular-nums">
      {filteredCount === totalCount
        ? t("settings.theme.licenses.noticeCount", { count: totalCount })
        : t("settings.theme.licenses.filteredCount", {
            filtered: filteredCount,
            total: totalCount,
          })}
    </p>
  );
}

function LicenseHeaderAction({
  query,
  onQueryChange,
  searchOpen,
  onSearchOpenChange,
  filteredCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  filteredCount: number;
  totalCount: number;
}) {
  const { t } = useI18n();
  if (!searchOpen) {
    return (
      <div className="flex items-center gap-1.5">
        <LicenseCount filteredCount={filteredCount} totalCount={totalCount} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("settings.theme.searchOpenSourceLicenses")}
                onClick={() => onSearchOpenChange(true)}
                size="icon-micro"
                type="button"
                variant="ghost-muted"
              >
                <SearchIcon className="size-3" />
              </Button>
            }
          />
          <TooltipPopup side="top">{t("settings.theme.searchLicenses")}</TooltipPopup>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:block">
        <LicenseCount filteredCount={filteredCount} totalCount={totalCount} />
      </div>
      <InputGroup className="w-36 sm:w-44">
        <InputGroupAddon>
          <SearchIcon aria-hidden className="size-3" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t("settings.theme.searchOpenSourceLicenses")}
          autoFocus
          onBlur={() => {
            if (query.length === 0) onSearchOpenChange(false);
          }}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onQueryChange("");
            onSearchOpenChange(false);
          }}
          placeholder={t("settings.theme.searchLicenses")}
          size="sm"
          type="search"
          value={query}
        />
      </InputGroup>
    </div>
  );
}

function LicenseManifestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 px-3 py-5 sm:px-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("settings.theme.openSourceNoticesAreUnavailable")}
        </h3>
        <p className="max-w-[70ch] text-pretty text-xs leading-normal text-muted-foreground/80">
          {message}
        </p>
      </div>
      <Button type="button" size="xs" variant="outline" onClick={onRetry}>
        {t("settings.snapShotSetupDialog.tryAgain")}
      </Button>
    </div>
  );
}

export function OpenSourceLicensesPanel() {
  const { t } = useI18n();
  const [state, setState] = useState<LicenseManifestState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openEntryKey, setOpenEntryKey] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadLicenseManifest(controller.signal).then(
      (manifest) => setState({ status: "ready", manifest }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : null,
        });
      },
    );
    return () => controller.abort();
  }, [requestVersion]);

  const entries = state.status === "ready" ? state.manifest.entries : [];
  const filteredEntries = useMemo(
    () => filterThirdPartyLicenseEntries(entries, query),
    [entries, query],
  );
  const retry = useCallback(() => setRequestVersion((value) => value + 1), []);

  return (
    <SettingsPageContainer>
      <SettingsSection
        title={t("settings.theme.thirdPartyNotices")}
        headerAction={
          state.status === "ready" ? (
            <LicenseHeaderAction
              query={query}
              onQueryChange={setQuery}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              filteredCount={filteredEntries.length}
              totalCount={entries.length}
            />
          ) : null
        }
      >
        {state.status === "ready" ? (
          <div className="text-base sm:text-sm">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => {
                const entryKey = thirdPartyLicenseEntryKey(entry);
                return (
                  <LicenseNoticeRow
                    key={entryKey}
                    entry={entry}
                    open={openEntryKey === entryKey}
                    onOpenChange={(open) => setOpenEntryKey(open ? entryKey : null)}
                  />
                );
              })
            ) : (
              <p className="px-3 py-8 text-center text-sm/6 text-muted-foreground sm:px-4">
                {t("settings.theme.noLicensesMatchThatSearch")}
              </p>
            )}
          </div>
        ) : state.status === "error" ? (
          <LicenseManifestError
            message={state.message ?? t("settings.theme.theLicenseManifestCouldNotLoad")}
            onRetry={retry}
          />
        ) : (
          <p className="px-3 py-5 text-sm/6 text-muted-foreground sm:px-4">
            {t("settings.theme.loadingOpenSourceNotices")}
          </p>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
