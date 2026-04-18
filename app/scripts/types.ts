import type { Tabs } from "webextension-polyfill";

export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export interface TabGroupRule {
  id: string;
  pattern: string;
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
  enabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export type ManagedTabGroupMap = Record<string, Record<string, number>>;

export type TabData = Record<number, number[]>;

export type ExtensionMessage =
  | { action: "getCurrentWindowId" }
  | { action: "closeSearchTab" }
  | { action: "switchToTab"; data: { tabId: number; windowId?: number } }
  | { action: "restoreRecentlyClosed"; data: { sessionId: string } }
  | { action: "getAllTabs" }
  | { action: "orderTabsBySearchKeyword"; data: { searchKeyword: string; tabs: SearchableTab[] } }
  | { action: "fetchFavicon"; data: { iconUrl: string } }
  | { action: "executeCommand"; data: { commandKey: string; keyword: string } }
  | { action: "recordCommand"; data: { commandKey: string; keyword: string } }
  | { action: "getRecentCommands"; data: { commandKey: string } }
  | { action: "searchBookmarks"; data: { searchKeyword: string } }
  | { action: "openBookmark"; data: { url: string } }
  | { action: "groupTabsByRule"; data: { ruleId: string } };

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

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  keywords?: string[];
  ld?: number;
  fts?: number;
  matchIndex?: number;
  parentId?: string;
  parentTitle?: string;
  dateAdded?: number;
}

export interface CommandDefinition {
  /** Single-character trigger, e.g. "s" */
  key: string;
  /** Human-readable label shown in the UI badge */
  label: string;
  /** Short description of what this command does */
  description: string;
  /** Action performed by the background script */
  execute: (keyword: string) => void;
}
