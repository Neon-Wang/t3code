import { Plug2Icon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { CompactFilterMenu } from "./CompactFilterMenu";
import type { FilterOption } from "./ListFilters";
import { useI18n } from "../../hooks/useI18n";

function ExpandableSearch({
  label,
  searchInput,
  searchValue,
  open,
  onOpenChange,
  onFocusWithin,
}: {
  label: string;
  searchInput: ReactNode;
  searchValue: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * An unmount fires no blur, which is the point: whoever unmounted this can still see the reader
   * was mid-typing and move the focus somewhere that continues the sentence.
   */
  onFocusWithin?: (focused: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- focuses the search input DOM node when the topbar search opens
  useEffect(() => {
    if (!open) return;
    containerRef.current?.querySelector("input")?.focus();
  }, [open]);
  if (open || searchValue.length > 0) {
    return (
      <div
        ref={containerRef}
        className="w-56 min-w-24 shrink"
        onFocus={() => onFocusWithin?.(true)}
        onBlur={() => {
          onFocusWithin?.(false);
          if (searchValue.length === 0) onOpenChange(false);
        }}
      >
        {searchInput}
      </div>
    );
  }
  return (
    <Button size="icon-sm" variant="ghost" aria-label={label} onClick={() => onOpenChange(true)}>
      <SearchIcon className="size-4" />
    </Button>
  );
}

export function ListColumn<State extends string, Involvement extends string>({
  title,
  scopeLabel,
  breadcrumbLabel,
  area,
  stateOptions,
  involvementOptions,
  searchLabel,
  refreshLabel,
  refreshing,
  onRefresh,
  searchValue,
  involvement,
  state,
  host,
  hostMenuOptions,
  onInvolvement,
  onState,
  onHost,
  searchInput,
  sortMenu,
  filtersMenu,
  rightPanelControl,
  titlebarControls,
  rightPanelOpen,
  maximizedAway,
  listBody,
  scrollRef,
}: {
  title: string;
  scopeLabel: string;
  breadcrumbLabel: string;
  area: string;
  stateOptions: ReadonlyArray<FilterOption<State>>;
  involvementOptions: ReadonlyArray<FilterOption<Involvement>>;
  searchLabel: string;
  refreshLabel: string;
  refreshing: boolean;
  onRefresh: () => void;
  searchValue: string;
  involvement: Involvement;
  state: State;
  host: string | undefined;
  hostMenuOptions: ReadonlyArray<FilterOption<string>>;
  onInvolvement: (involvement: Involvement) => void;
  onState: (state: State) => void;
  onHost: (host: string | undefined) => void;
  searchInput: ReactNode;
  sortMenu: ReactNode;
  filtersMenu: ReactNode;
  rightPanelControl: ReactNode;
  titlebarControls: ReactNode;
  rightPanelOpen: boolean;
  maximizedAway: boolean;
  listBody: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const contentArea = workspaceAreaProps(area, 1, title);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const [condensed, setCondensed] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IntersectionObserver on the scroll marker condenses the topbar
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(entry ? !entry.isIntersecting : false),
      { root: scrollRef.current },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [scrollRef]);
  // Typing into the topbar search narrows the list, and a short enough list un-scrolls the
  // page — which dissolves the condensed topbar and unmounts the very input being typed in.
  const topbarSearchFocusedRef = useRef(false);
  const inFlowSearchRef = useRef<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const topbarSearchRef = useRef<HTMLDivElement | null>(null);
  const searchExpanded = searchOpen || searchValue.length > 0;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener focuses the visible search input on Cmd/Ctrl+F
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key.toLowerCase() !== "f" || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      // A closed topbar search has no input yet; opening it mounts one that focuses itself.
      if (condensed) setSearchOpen(true);
      const input = (condensed ? topbarSearchRef : inFlowSearchRef).current?.querySelector("input");
      input?.focus();
      input?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [condensed]);
  if (!condensed && searchOpen) setSearchOpen(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves DOM focus to the in-flow search when the topbar search it was typed in unmounts
  useEffect(() => {
    if (condensed) return;
    if (!topbarSearchFocusedRef.current) return;
    topbarSearchFocusedRef.current = false;
    const input = inFlowSearchRef.current?.querySelector("input");
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [condensed]);

  return (
    <div
      {...contentArea}
      inert={maximizedAway}
      className={cn(
        "@container/pr-list flex min-h-0 min-w-0 flex-col overflow-x-hidden bg-background",
        maximizedAway ? "w-0 flex-none" : "flex-1",
      )}
    >
      <WorkspacePageHeader
        electron={isElectron}
        reserveNativeControls={!rightPanelOpen}
        className="relative bg-background"
      >
        {titlebarControls}
        {condensed ? (
          <WorkspaceBreadcrumb ariaLabel={scopeLabel} className="overflow-hidden">
            <WorkspaceBreadcrumbItem current className={cn(searchExpanded && "sr-only")}>
              <h1 className="truncate">{title}</h1>
            </WorkspaceBreadcrumbItem>
            {searchExpanded ? null : <WorkspaceBreadcrumbSeparator />}
            <WorkspaceBreadcrumbItem className="shrink gap-1.5">
              <CompactFilterMenu
                label={t("pr.filterByState")}
                value={state}
                options={stateOptions}
                onChange={onState}
                className="shrink-0"
              />
              <CompactFilterMenu
                label={t("pr.filterByInvolvement")}
                value={involvement}
                options={involvementOptions}
                onChange={onInvolvement}
              />
              {hostMenuOptions.length > 2 ? (
                <CompactFilterMenu
                  label={t("pr.filterByHost")}
                  value={host ?? ""}
                  options={hostMenuOptions}
                  onChange={(next) => onHost(next === "" ? undefined : next)}
                />
              ) : null}
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        ) : (
          <WorkspaceBreadcrumb ariaLabel={breadcrumbLabel}>
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">{title}</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        )}
        <div className="min-w-0 flex-1" />
        {condensed ? (
          <div ref={topbarSearchRef} className="flex shrink items-center gap-1.5">
            <ExpandableSearch
              label={searchLabel}
              searchInput={searchInput}
              searchValue={searchValue}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onFocusWithin={(focused) => {
                topbarSearchFocusedRef.current = focused;
              }}
            />
            <RefreshControl
              label={refreshLabel}
              compact
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          </div>
        ) : null}
        {rightPanelControl}
      </WorkspacePageHeader>

      <div
        ref={scrollRef}
        className="topbar-scroll-fade scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto"
      >
        <WorkspacePageContainer width="expanded" className="min-h-full gap-4">
          <div className="flex flex-col gap-3">
            <div ref={inFlowSearchRef} className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 basis-full @lg/pr-list:basis-0 @lg/pr-list:flex-1">
                {searchInput}
              </div>
              {sortMenu}
              {filtersMenu}
              <CompactFilterMenu
                label={t("pr.filterByProvider")}
                outlined
                iconOnly={host !== undefined}
                triggerIcon={<Plug2Icon aria-hidden className="size-4" />}
                triggerLabel={t("pr.all")}
                value={host ?? ""}
                options={hostMenuOptions}
                onChange={(next) => onHost(next === "" ? undefined : next)}
              />
              {!condensed ? (
                <RefreshControl
                  label={refreshLabel}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              ) : null}
            </div>
            <div ref={markerRef} aria-hidden className="-mt-3 h-px w-full" />
          </div>

          {listBody}
        </WorkspacePageContainer>
      </div>
    </div>
  );
}

function RefreshControl({
  label,
  compact = false,
  refreshing,
  onRefresh,
}: {
  label: string;
  compact?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      size={compact ? "icon-sm" : "icon"}
      variant={compact ? "ghost" : "outline"}
      aria-label={label}
      onClick={onRefresh}
      disabled={refreshing}
    >
      <RefreshIcon size="md" refreshing={refreshing} />
    </Button>
  );
}
