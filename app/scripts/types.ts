import type { Tabs } from "webextension-polyfill";

export type TabData = Record<number, number[]>;

export type ExtensionMessage =
  | { action: "getCurrentWindowId" }
  | { action: "closeSearchTab" }
  | { action: "switchToTab"; data: { tabId: number } }
  | { action: "getCurrentWindowTabs" }
  | { action: "orderTabsBySearchKeyword"; data: { searchKeyword: string; tabs: TabInfo[] } }
  | { action: "ping"; data?: undefined };

export enum StoreType {
  LOCAL = "local",
  SESSION = "session",
}

export interface TabInfo extends Tabs.Tab {
  keywords?: string[];
  ld?: number;
  fts?: number;
}
