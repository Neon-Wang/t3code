import { createI18n, DEFAULT_LOCALE, type Locale } from "@t3tools/shared/i18n";
import {
  collectLimitAccounts,
  collectLimitPools,
  type LimitAccount,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";

import type { WidgetTheme } from "./widgetTheme";

export interface SubscriptionUsageSnapshot {
  locale?: Locale;
  labels?: Readonly<Record<string, string>>;
  theme?: WidgetTheme;
  url?: string;
  checkedAt: number;
  providers: Array<{
    name: string;
    detail: string;
    windows: Array<{ kind?: string; label: string; remaining: number; reset: string }>;
    expiresAt: number;
    totalWindows: number;
  }>;
}

// Snapshots expire after 15 minutes; suspended refresh requires a separate authenticated transport.
const SNAPSHOT_MAX_AGE = 15 * 60_000;
export const WIDGET_REFRESH_INTERVAL = 5 * 60_000;

export function createWidgetRefresher<Id>(refresh: (id: Id) => Promise<unknown>) {
  const attempted = new Map<Id, number>();
  const pending = new Set<Id>();
  return async (connected: readonly Id[], now: number) => {
    await Promise.allSettled(
      connected.map(async (id) => {
        if (pending.has(id) || now - (attempted.get(id) ?? -Infinity) < WIDGET_REFRESH_INTERVAL)
          return;
        attempted.set(id, now);
        pending.add(id);
        try {
          await refresh(id);
        } finally {
          pending.delete(id);
        }
      }),
    );
  };
}

function subscriptionUsageProps(
  accounts: readonly LimitAccount[],
  now: number,
  configuredDrivers: ReadonlySet<string>,
  maxWindowsPerProvider: number,
  locale: Locale,
): SubscriptionUsageSnapshot {
  const t = createI18n({ locale }).t;
  const pools = collectLimitPools(accounts, now);
  const checked = accounts
    .filter((account) => account.driver === "codex" || account.driver === "claudeAgent")
    .map((account) => Date.parse(account.limits.checkedAt));
  return {
    checkedAt: checked.length > 0 && checked.every(Number.isFinite) ? Math.min(...checked) : 0,
    providers: (["codex", "claudeAgent"] as const)
      .filter(
        (driver) =>
          configuredDrivers.has(driver) || accounts.some((account) => account.driver === driver),
      )
      .map((driver) => {
        const pool = pools.find((candidate) => candidate.driver === driver);
        const name = driver === "codex" ? "Codex" : "Claude";
        if (!pool)
          return {
            name,
            detail: t("mobile.subscriptionUsageSnapshot.noLimitsAvailable"),
            windows: [],
            expiresAt: 0,
            totalWindows: 0,
          };
        const checkedAt = Math.min(...pool.accounts.map((a) => Date.parse(a.limits.checkedAt)));
        const expiresAt = Math.min(
          checkedAt + SNAPSHOT_MAX_AGE,
          ...pool.windows.flatMap((window) => window.resets.map((reset) => reset.at)),
        );
        const fresh = Number.isFinite(expiresAt) && expiresAt > now;
        const sortedWindows = [...pool.windows].sort(
          (a, b) => a.remainingPercent - b.remainingPercent,
        );
        const selectedWindows = [
          ...new Set([
            sortedWindows.find((window) => window.kind === "session"),
            sortedWindows.find((window) => window.kind === "weekly"),
            ...sortedWindows,
          ]),
        ]
          .filter((window) => window !== undefined)
          .slice(0, maxWindowsPerProvider)
          .sort((a, b) => a.remainingPercent - b.remainingPercent);
        return {
          name,
          detail: !fresh
            ? t("mobile.subscriptionUsageSnapshot.openT3ToRefresh")
            : pool.accounts.length > 1
              ? t("mobile.subscriptionUsageSnapshot.accountsPooled", {
                  count: pool.accounts.length,
                })
              : t("mobile.subscriptionUsageSnapshot.subscriptionRemaining"),
          expiresAt: fresh ? expiresAt : 0,
          totalWindows: fresh ? pool.windows.length : 0,
          windows: fresh
            ? selectedWindows.map((window) => ({
                kind: window.kind,
                label: window.label,
                remaining: Math.round(window.remainingPercent),
                reset: window.resets[0]
                  ? t("mobile.subscriptionUsageSnapshot.nextReset", {
                      time: new Date(window.resets[0].at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }),
                    })
                  : t("mobile.subscriptionUsageSnapshot.resetUnavailable"),
              }))
            : [],
        };
      }),
  };
}

export function buildSubscriptionUsageSnapshot(
  presentations: LimitPresentations,
  url: string,
  maxWindowsPerProvider = 6,
  locale: Locale = DEFAULT_LOCALE,
): SubscriptionUsageSnapshot {
  const configuredDrivers = new Set(
    [...presentations.values()].flatMap((presentation) =>
      (presentation.serverConfig?.providers ?? [])
        // Servers report default-enabled drivers even when their CLI is missing.
        .filter(
          (provider) =>
            provider.enabled &&
            provider.installed &&
            provider.usageLimits?.unavailable?.reason !== "unsupported",
        )
        .map((provider) => provider.driver),
    ),
  );
  return {
    ...subscriptionUsageProps(
      collectLimitAccounts(presentations),
      0,
      configuredDrivers,
      maxWindowsPerProvider,
      locale,
    ),
    locale,
    url,
  };
}

export function subscriptionUsageTimeline(snapshot: SubscriptionUsageSnapshot, now: number) {
  const t = createI18n({ locale: snapshot.locale ?? DEFAULT_LOCALE }).t;
  const deadlines = [...new Set(snapshot.providers.map((p) => p.expiresAt))]
    .filter((deadline) => deadline > now)
    .sort((a, b) => a - b);
  return [now, ...deadlines].map((date) => ({
    date: new Date(date),
    props: {
      ...snapshot,
      providers: snapshot.providers.map((provider) =>
        provider.windows.length > 0 && provider.expiresAt <= date
          ? {
              ...provider,
              detail: t("mobile.subscriptionUsageSnapshot.openT3ToRefresh"),
              windows: [],
              totalWindows: 0,
            }
          : provider,
      ),
    },
  }));
}
