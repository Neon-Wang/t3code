import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

export function DetailTitleRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-h-7 min-w-0 items-center sm:min-h-6", className)} {...props} />
  );
}

export function DetailTabBar<Tab extends string>({
  tabs,
  label,
  value,
  onValueChange,
  onTabIntent,
  inert,
  children,
}: {
  label: string;
  tabs: ReadonlyArray<{ readonly value: Tab; readonly label: string }>;
  value: Tab;
  onValueChange?: (tab: Tab) => void;
  onTabIntent?: (tab: Tab) => void;
  inert?: boolean;
  children?: ReactNode;
}) {
  return (
    <nav
      className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2"
      aria-label={label}
      inert={inert}
    >
      <ToggleGroup
        className="shrink-0"
        size="segmented"
        variant="segmented"
        value={[value]}
        onValueChange={(next) => {
          const nextTab = tabs.find((item) => item.value === next[0])?.value;
          if (nextTab) onValueChange?.(nextTab);
        }}
      >
        {tabs.map((tab) => (
          <Toggle
            key={tab.value}
            value={tab.value}
            onPointerEnter={onTabIntent ? () => onTabIntent(tab.value) : undefined}
            onFocus={onTabIntent ? () => onTabIntent(tab.value) : undefined}
          >
            {tab.label}
          </Toggle>
        ))}
      </ToggleGroup>
      {children}
    </nav>
  );
}
