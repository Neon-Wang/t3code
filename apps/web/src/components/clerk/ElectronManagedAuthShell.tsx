import { useI18n } from "../../hooks/useI18n";
import { clerkZhCN } from "./clerkZhCN";
import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider } from "@clerk/electron/react";
import type { ReactNode } from "react";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";

/** Load only lazily inside desktop; clerk-js is statically bundled and would otherwise enter every
 * client's startup graph. */
export default function ElectronManagedAuthShell({
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
      passkeys={passkeys}
    >
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
