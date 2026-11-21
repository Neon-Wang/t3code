import { msg } from "gt-react-native";
import { m } from "../../i18n/messages";
import { tailnetNative } from "./native";

export function syncNotificationLabels(locale: string) {
  return tailnetNative?.setInterfaceLanguage(locale, {
    connectionChannel: m(msg("T3 background connection")),
    connectionDescription: m(
      msg("Keeps your selected remote connection active without alert sounds"),
    ),
    connectionTitle: m(msg("T3 background connection is on")),
    connectionBody: m(msg("Only important task events; deep sleep may delay alerts")),
    stopBackground: m(msg("Stop background connection")),
    tasksChannel: m(msg("T3 important task alerts")),
    tasksDescription: m(msg("Approval, completion and failures; each event alerts once")),
    Connecting: m(msg("Connecting")),
    Working: m(msg("Working")),
    Open: m(msg("Open")),
    Approval: m(msg("Approval")),
    Approve: m(msg("Approve")),
    Input: m(msg("Input")),
    Answer: m(msg("Answer")),
    Waiting: m(msg("Waiting")),
    Done: m(msg("Done")),
    Failed: m(msg("Failed")),
    Active: m(msg("Active")),
    "Agent activity": m(msg("Agent activity")),
    "1 needs you": m(msg("1 needs you")),
    "{count} need you": m(msg("{count} need you", { count: "{count}" })),
    "{count} failed": m(msg("{count} failed", { count: "{count}" })),
    "{count} working": m(msg("{count} working", { count: "{count}" })),
    "Finished, {count} failed": m(msg("Finished, {count} failed", { count: "{count}" })),
    "All finished": m(msg("All finished")),
    "{count} live": m(msg("{count} live", { count: "{count}" })),
    "{count} active": m(msg("{count} active", { count: "{count}" })),
    "{count} threads": m(msg("{count} threads", { count: "{count}" })),
    Dismiss: m(msg("Dismiss")),
    "Agent alerts": m(msg("Agent alerts")),
    "Ongoing agent activity": m(msg("Ongoing agent activity")),
  });
}
