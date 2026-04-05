import type { Tabs } from "webextension-polyfill";

export type TabData = Record<number, number[]>;

export type ExtensionMessage =
  | { action: "getCurrentWindowId" }
  | { action: "closeSearchTab" }
  | { action: "switchToTab"; data: { tabId: number; windowId?: number } }
  | { action: "restoreRecentlyClosed"; data: { sessionId: string } }
  | { action: "getAllTabs" }
  | { action: "orderTabsBySearchKeyword"; data: { searchKeyword: string; tabs: SearchableTab[] } }
  | { action: "fetchFavicon"; data: { iconUrl: string } };

export enum StoreType {
  LOCAL = "local",
  SESSION = "session",
}

export interface TabInfo extends Tabs.Tab {
  keywords?: string[];
  ld?: number;
  fts?: number;
  inCurrentWindow?: boolean;
  matchIndex?: number;
}

export interface RecentlyClosedTabInfo {
  source: "recent";
  resultId: string;
  sessionId: string;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId?: number;
  keywords?: string[];
  ld?: number;
  fts?: number;
  matchIndex?: number;
}

export interface OpenTabInfo extends TabInfo {
  source: "open";
  resultId: string;
}

export type SearchableTab = OpenTabInfo | RecentlyClosedTabInfo;
