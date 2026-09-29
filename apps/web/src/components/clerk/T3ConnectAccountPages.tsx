import type { I18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { useAuth, useClerk } from "@clerk/react";
import { ServerIcon, SmartphoneIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";

import { MobileClientsUserProfilePage } from "./MobileClientsUserProfilePage";
import { T3ConnectUserProfilePage } from "./T3ConnectUserProfilePage";

/** Custom pages in the Clerk account modal, in menu order. */
export function getT3ConnectAccountPages(t: I18n["t"]) {
  return [
    {
      label: t("account.mobileClients"),
      url: "mobile-clients",
      icon: <SmartphoneIcon className="size-4" />,
      content: <MobileClientsUserProfilePage />,
    },
    {
      label: "T3 Connect",
      url: "t3-connect",
      icon: <ServerIcon className="size-4" />,
      content: <T3ConnectUserProfilePage />,
    },
  ] as const;
}

type PortalTargets = Readonly<Record<string, HTMLDivElement | undefined>>;

/**
 * Opens the Clerk account modal on the T3 Connect page from outside the
 * UserButton. Clerk mounts custom pages into DOM nodes it owns, so the caller
 * must keep `portals` rendered for as long as the modal can be open.
 */
export function useT3ConnectAccountPage(): {
  readonly open: (() => void) | null;
  readonly portals: ReactNode;
} {
  const { t } = useI18n();
  const pages = getT3ConnectAccountPages(t);
  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const [targets, setTargets] = useState<PortalTargets>({});

  const open = useCallback(() => {
    const setTarget = (key: string, element: HTMLDivElement | undefined) =>
      setTargets((current) => ({ ...current, [key]: element }));
    clerk.openUserProfile({
      __experimental_startPath: "/t3-connect",
      customPages: pages.map((page) => ({
        label: page.label,
        url: page.url,
        mount: (element: HTMLDivElement) => setTarget(`content:${page.url}`, element),
        unmount: () => setTarget(`content:${page.url}`, undefined),
        mountIcon: (element: HTMLDivElement) => setTarget(`icon:${page.url}`, element),
        unmountIcon: () => setTarget(`icon:${page.url}`, undefined),
      })),
    });
  }, [clerk, pages]);

  const portals = pages.flatMap((page) => {
    const content = targets[`content:${page.url}`];
    const icon = targets[`icon:${page.url}`];
    return [
      content ? createPortal(page.content, content, `content:${page.url}`) : null,
      icon ? createPortal(page.icon, icon, `icon:${page.url}`) : null,
    ];
  });

  return { open: isSignedIn ? open : null, portals };
}
