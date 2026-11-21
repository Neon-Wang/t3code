import { ClerkProvider } from "@clerk/react";
import type { ReactNode } from "react";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";

import { useClerkLocalization } from "./clerkZhCN";

/** Lazy-load Clerk so cloudless local mode never downloads it. */
export default function BrowserManagedAuthShell({
  publishableKey,
  children,
}: {
  readonly publishableKey: string;
  readonly children: ReactNode;
}) {
  const localization = useClerkLocalization();
  return (
    <ClerkProvider
      localization={localization}
      appearance={clerkAppearance}
      publishableKey={publishableKey}
    >
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
