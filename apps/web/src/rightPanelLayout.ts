export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
// Applied only while a floating preview overlaps the compact sheet.
export const RIGHT_PANEL_SHEET_LAYER_CLASS_NAME = "z-[35]";
export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";

/**
 * The conversation rail in editor layout persists its width separately from the
 * side panel: the two are different columns holding different content, and one
 * remembering the other's width reads as the panel jumping on every mode switch.
 */
export const CHAT_RAIL_WIDTH_STORAGE_KEY = "t3code:chat-rail-width";
export const CHAT_RAIL_DEFAULT_WIDTH = 440;
