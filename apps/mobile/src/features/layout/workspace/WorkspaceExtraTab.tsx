import { InboxScreen } from "../../inbox/InboxScreen";
import { type NavigationTab } from "./navigation-tab-order";
import { NativeStackScreenOptions } from "../../../native/StackHeader";
import { UsageRouteScreen } from "../../usage/UsageRouteScreen";

export function WorkspaceExtraTab(props: { tab: Extract<NavigationTab, "inbox" | "usage"> }) {
  return (
    <>
      <NativeStackScreenOptions options={{ headerSearchBarOptions: undefined }} />
      {props.tab === "inbox" ? <InboxScreen /> : <UsageRouteScreen workspace />}
    </>
  );
}
