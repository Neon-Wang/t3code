import { useI18n } from "../../hooks/useI18n";
import { clerkZhCN } from "./clerkZhCN";
import { ClerkProvider } from "@clerk/react";
import type { ReactNode } from "react";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";

/** Lazy-load Clerk so cloudless local mode never downloads it. */
export default function BrowserManagedAuthShell({
  publishableKey,
  children,
}: {
  readonly publishableKey: string;
  readonly children: ReactNode;
}) {
  const { locale } = useI18n();
  return (
    <ClerkProvider
      {...(locale === "zh-CN" ? { localization: clerkZhCN } : {})}
      appearance={clerkAppearance}
      publishableKey={publishableKey}
    >
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
