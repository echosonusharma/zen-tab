import type { Tabs } from "webextension-polyfill";

export type TabData = Record<number, Tabs.Tab[]>;

export type ExtensionMessage =
  | { action: "getCurrentWindowId"; }
  | { action: "closeSearchTab"; }
  | { action: "ping"; data?: undefined };

export enum StoreType {
  LOCAL = "local",
  SESSION = "session",
}
