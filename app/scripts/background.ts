import browser from "webextension-polyfill";
import { BookmarkItem, ExtensionMessage, OpenTabInfo, SearchableTab, StoreType, TabData, TabInfo } from "./types";
import { Store, getNewTabUrls, logger, openShortcutSettings, looksLikeDomain, openSettingsPage } from "./utils";
import initWasmModule, { init_wasm, generate_keyword_for_tab, ld } from "ld-wasm-lib";

const wasmReadyPromise = initWasmModule()
  .then(() => {
    init_wasm("wasm module loaded successfully");
  })
  .catch((e: Error) => console.debug(`Error in wasm module init:`, e));

const PATH_TO_CONTENT_SCRIPT: string = "scripts/content.js";

type TabCommand = "next_tab" | "prev_tab";
type WindowCommand = "next_win" | "prev_win";

const tabsStore: Store<TabData> = new Store("tabs", StoreType.SESSION);
const activeTabIdStore: Store<number> = new Store("activeTabId", StoreType.SESSION);
const activeWindowIdStore: Store<number> = new Store("activeWindowId", StoreType.SESSION);
const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
const searchFallbackStore: Store<number> = new Store("searchFallback", StoreType.SESSION);
const commandHistoryStore: Store<Record<string, string[]>> = new Store("commandHistory", StoreType.LOCAL);
const bookmarksStore: Store<BookmarkItem[]> = new Store("bookmarks", StoreType.LOCAL);

// Runtime Events

let searchPopupConnections = 0;

browser.runtime.onConnect.addListener((port) => {
  if (port.name === "popupSearchMode") {
    searchPopupConnections++;
    port.onDisconnect.addListener(async () => {
      searchPopupConnections--;
      try {
        await browser.action.setPopup({ popup: "" });
      } catch (e) {
        logger("Error clearing popup:", e);
      }
    });
  }
});

browser.action.onClicked.addListener(async () => {
  await openSettingsPage();
});

browser.runtime.onStartup.addListener(async () => {
  await initWindowAndTabData();
  await rebuildBookmarksIndex();
});

browser.runtime.onInstalled.addListener(async (details) => {
  await initWindowAndTabData();
  await searchTabStore.set(true);
  await rebuildBookmarksIndex();

  if (details.reason === "install") {
    checkAndPromptShortcuts();
  }
});

async function checkAndPromptShortcuts(): Promise<void> {
  try {
    const commands = await browser.commands.getAll();
    const missingShortcuts = commands.filter(
      (cmd) => cmd.name !== "_execute_action" && cmd.name !== "_execute_browser_action" && !cmd.shortcut
    );

    if (missingShortcuts.length > 0) {
      // Cannot force set keys, prompt user by opening the extensions shortcut page
      await openShortcutSettings();
    }
  } catch (error) {
    logger(`Error checking shortcuts:`, error);
  }
}

browser.runtime.onMessage.addListener(
  async (message: unknown, _sender: browser.Runtime.MessageSender): Promise<any> => {
    const msg = message as ExtensionMessage;

    switch (msg?.action) {
      case "getCurrentWindowId":
        return (await activeWindowIdStore.get()) as number;

      case "switchToTab":
        if (msg.data.windowId) {
          await browser.windows.update(msg.data.windowId, { focused: true });
        }
        await browser.tabs.update(msg.data.tabId, { active: true });
        return true;

      case "restoreRecentlyClosed":
        return await restoreRecentlyClosedSession(msg.data.sessionId);

      case "getAllTabs":
        return await getAllSearchableTabs();

      case "orderTabsBySearchKeyword":
        await wasmReadyPromise;
        return orderTabsBySearchKeyword(msg.data.searchKeyword, msg.data.tabs);

      case "fetchFavicon":
        return await handleFetchFavicon(msg.data.iconUrl);

      case "executeCommand":
        return await handleExecuteCommand(msg.data.commandKey, msg.data.keyword);

      case "recordCommand":
        return await recordCommandHistory(msg.data.commandKey, msg.data.keyword);

      case "getRecentCommands":
        return await getCommandHistory(msg.data.commandKey);

      case "searchBookmarks":
        await wasmReadyPromise;
        return await searchBookmarks(msg.data.searchKeyword);

      case "openBookmark":
        return await handleOpenBookmark(msg.data.url);

      default:
        return undefined;
    }
  }
);

// Window Events

browser.windows.onFocusChanged.addListener(async (windowId: number) => {
  const previousWindowId = (await activeWindowIdStore.get()) as number;

  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    await activeWindowIdStore.set(windowId);
  }

  if (previousWindowId && previousWindowId !== windowId && previousWindowId !== browser.windows.WINDOW_ID_NONE) {
    try {
      const prevActiveTabs = await browser.tabs.query({ active: true, windowId: previousWindowId });
      if (prevActiveTabs[0]?.id !== undefined) {
        await browser.tabs.sendMessage(prevActiveTabs[0].id, { action: "closeSearchTab" });
      }
    } catch {
      // Ignore errors when a tab context does not contain the listener
    }
  }
});

browser.windows.onRemoved.addListener(async (windowId: number) => {
  try {
    const tabsData = await tabsStore.get();
    if (tabsData?.[windowId]) {
      delete tabsData[windowId];
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in windows onRemoved:`, error);
  }
});

browser.windows.onCreated.addListener(async (window: browser.Windows.Window) => {
  try {
    if (window.id && window.id !== browser.windows.WINDOW_ID_NONE) {
      await activeWindowIdStore.set(window.id);
      await updateTabStores({ windowId: window.id });
    }
  } catch (error) {
    logger(`Error in windows onCreated:`, error);
  }
});

// Tab Events

browser.idle.onStateChanged.addListener(async (newState: browser.Idle.IdleState) => {
  if (newState === "active") {
    // When waking up or returning to active state, re-initialize everything
    // to ensure no tab/window events were missed during sleep.
    await initWindowAndTabData();
  }
});

browser.tabs.onCreated.addListener(async (tab: browser.Tabs.Tab) => {
  try {
    if (!tab.windowId || !tab.id) {
      return;
    }

    const tabsData = (await tabsStore.get()) as TabData;

    if (!tabsData[tab.windowId]) {
      tabsData[tab.windowId] = [];
    }

    tabsData[tab.windowId].splice(tab.index, 0, tab.id);
    await tabsStore.set(tabsData);
  } catch (error) {
    logger(`Error in onCreated tab:`, error);
  }
});

browser.tabs.onMoved.addListener(async (tabId: number, moveInfo: browser.Tabs.OnMovedMoveInfoType) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;
    const windowTabIds = tabsData[moveInfo.windowId];

    if (!windowTabIds) return;

    const tabIndex = windowTabIds.findIndex((id) => id === tabId);
    if (tabIndex === -1) return;

    const [movedTabId] = windowTabIds.splice(tabIndex, 1);
    windowTabIds.splice(moveInfo.toIndex, 0, movedTabId);

    await tabsStore.set(tabsData);
  } catch (error) {
    logger(`Error in onMoved tab:`, error);
  }
});

browser.tabs.onRemoved.addListener(async (tabId: number, removeInfo: browser.Tabs.OnRemovedRemoveInfoType) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;

    if (tabsData[removeInfo.windowId]) {
      tabsData[removeInfo.windowId] = tabsData[removeInfo.windowId].filter((id) => id !== tabId);
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in onRemoved tab:`, error);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo: browser.Tabs.OnActivatedActiveInfoType) => {
  const previousTabId = (await activeTabIdStore.get()) as number;

  await activeTabIdStore.set(activeInfo.tabId);

  // Instantly instruct the previous tab to destroy any injected search UI
  if (previousTabId && previousTabId !== activeInfo.tabId) {
    try {
      await browser.tabs.sendMessage(previousTabId, { action: "closeSearchTab" });
    } catch {
      // Ignore errors when the tab does not have the content script injected
    }
  }
});

// Command Handler

browser.commands.onCommand.addListener(async (command: string) => {
  try {
    const activeTabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTabs || activeTabs.length === 0) return;

    const activeTabId = activeTabs[0].id;
    const activeWindowId = activeTabs[0].windowId;

    if (!activeTabId || !activeWindowId) {
      return;
    }

    const tabIdsData = (await tabsStore.get()) as TabData;

    switch (command) {
      case "next_tab":
      case "prev_tab":
        await handleTabMoveCmd(tabIdsData, command as TabCommand, activeTabId, activeWindowId);
        break;
      case "next_win":
      case "prev_win":
        await handleWindowMoveCmd(tabIdsData, command as WindowCommand, activeWindowId);
        break;
      case "open_and_close_search":
        await handleSearchCmd(activeTabId, activeWindowId);
        break;
      case "kill_tab":
        await browser.tabs.remove(activeTabId);
        break;
    }
  } catch (err) {
    logger("Error handling command:", err);
  }
});

// Command Handlers

async function handleTabMoveCmd(
  tabIdsData: TabData,
  command: TabCommand,
  activeTabId: number,
  activeWindowId: number
): Promise<void> {
  try {
    const windowTabIds = tabIdsData[activeWindowId];

    if (!windowTabIds || windowTabIds.length <= 1) {
      return;
    }

    const currentTabIndex = windowTabIds.findIndex((id) => id === activeTabId);
    if (currentTabIndex === -1) {
      return;
    }

    const direction = command === "next_tab" ? 1 : -1;
    const newIndex = (currentTabIndex + direction + windowTabIds.length) % windowTabIds.length;

    await browser.tabs.update(windowTabIds[newIndex], { active: true });
  } catch (error) {
    logger(`Error in handleTabMoveCmd:`, error);
  }
}

async function handleWindowMoveCmd(
  tabIdsData: TabData,
  command: WindowCommand,
  activeWindowId: number
): Promise<void> {
  try {
    const windowIds = Object.keys(tabIdsData);
    if (windowIds.length <= 1) {
      return;
    }

    const currentWindowIndex = windowIds.findIndex((wId) => Number(wId) === activeWindowId);
    if (currentWindowIndex === -1) {
      return;
    }

    const direction = command === "next_win" ? 1 : -1;
    const newIndex = (currentWindowIndex + direction + windowIds.length) % windowIds.length;

    await browser.windows.update(Number(windowIds[newIndex]), { focused: true });
  } catch (error) {
    logger(`Error in handleWindowMoveCmd:`, error);
  }
}

async function handleSearchCmd(activeTabId: number, activeWindowId: number): Promise<void> {
  if (searchPopupConnections > 0) {
    return;
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId: activeTabId },
      files: [PATH_TO_CONTENT_SCRIPT],
    });
  } catch (error) {
    logger(`Error in handleSearchCmd, falling back to popup:`, error);
    try {
      await searchFallbackStore.set(Date.now());
      await browser.action.setPopup({ popup: "popup.html" });
      await browser.action.openPopup({ windowId: activeWindowId });
    } catch (fallbackError) {
      logger(`Failed to open fallback popup:`, fallbackError);
      await browser.action.setPopup({ popup: "" });
    }
  }
}

// Data Initialization

async function initWindowAndTabData(): Promise<void> {
  const currentWindow = await browser.windows.getCurrent({});

  if (currentWindow.id) {
    await activeWindowIdStore.set(currentWindow.id);
  }

  await updateTabStores();
}

async function updateTabStores(tabQueryOptions: browser.Tabs.QueryQueryInfoType = {}): Promise<void> {
  try {
    const [queriedTabs, existingTabsData, activeTabs] = await Promise.all([
      browser.tabs.query(tabQueryOptions),
      tabsStore.get(),
      browser.tabs.query({ active: true, currentWindow: true }),
    ]);

    const activeTabId = activeTabs?.[0]?.id;
    if (activeTabId !== undefined) {
      await activeTabIdStore.set(activeTabId);
    }

    const tabsByWindowId = queriedTabs.reduce<TabData>((acc, tab) => {
      if (!tab.windowId || tab.id === undefined) {
        return acc;
      }

      if (!acc[tab.windowId]) {
        acc[tab.windowId] = [];
      }
      acc[tab.windowId].push(tab.id);

      return acc;
    }, {});

    if (existingTabsData) {
      const isQueryingAllTabs = Object.keys(tabQueryOptions).length === 0;

      if (isQueryingAllTabs) {
        await tabsStore.set(tabsByWindowId);
      } else {
        Object.assign(existingTabsData, tabsByWindowId);
        await tabsStore.set(existingTabsData);
      }
    } else {
      await tabsStore.set(tabsByWindowId);
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
}

// Tab Query & Search

const NEW_TAB_URLS = getNewTabUrls();

async function getAllSearchableTabs(): Promise<SearchableTab[]> {
  try {
    await wasmReadyPromise;
    const [allTabs, currentWindowId, recentTabs] = await Promise.all([
      browser.tabs.query({}) as Promise<TabInfo[]>,
      activeWindowIdStore.get(),
      getRecentlyClosedTabs(),
    ]);

    const openTabs = allTabs
      .filter(({ url = "" }) => !NEW_TAB_URLS.has(url))
      .map((tab) => ({
        ...tab,
        source: "open" as const,
        resultId: `open:${tab.id}`,
      })) as OpenTabInfo[];

    for (const tab of openTabs) {
      tab.keywords = generate_keyword_for_tab(tab.title, tab.url);
      tab.inCurrentWindow = tab.windowId === currentWindowId;
    }

    return [...openTabs, ...recentTabs];
  } catch (error) {
    logger("Failed to get all tabs:", error);
    return [];
  }
}

const NO_OF_RECENT_TABS = 6;

async function getRecentlyClosedTabs(): Promise<SearchableTab[]> {
  if (!browser.sessions?.getRecentlyClosed) {
    return [];
  }

  try {
    const sessions = await browser.sessions.getRecentlyClosed({ maxResults: NO_OF_RECENT_TABS });
    const seenUrls = new Set<string>();

    return sessions
      .filter((session) => session.tab)
      .map((session) => {
        const recentTab = session.tab!;
        const sessionId = recentTab.sessionId;

        if (!sessionId) {
          return null;
        }

        return {
          source: "recent" as const,
          resultId: `recent:${sessionId}`,
          sessionId,
          title: recentTab.title,
          url: recentTab.url,
          favIconUrl: recentTab.favIconUrl,
          windowId: recentTab.windowId,
          keywords: generate_keyword_for_tab(recentTab.title, recentTab.url),
        };
      })
      .filter((tab): tab is Exclude<typeof tab, null> => tab !== null)
      .filter(({ url = "" }) => {
        if (seenUrls.has(url)) {
          return false;
        }
        seenUrls.add(url);

        return !NEW_TAB_URLS.has(url);
      });
  } catch (error) {
    logger("Failed to get recently closed tabs:", error);
    return [];
  }
}

async function restoreRecentlyClosedSession(sessionId: string): Promise<boolean> {
  if (!browser.sessions?.restore) {
    return false;
  }

  try {
    await browser.sessions.restore(sessionId);
    return true;
  } catch (error) {
    logger("Failed to restore recently closed tab:", error);
    return false;
  }
}

interface RankableItem {
  title?: string;
  url?: string;
  keywords?: string[];
  fts?: number;
  ld?: number;
  matchIndex?: number;
}

function orderItemsBySearchKeyword<T extends RankableItem>(searchKeyword: string, items: T[]): T[] {
  const sk = searchKeyword.toLowerCase();

  if (!sk) return items;

  for (const item of items) {
    const fullText = ((item.title || "") + " " + (item.url || "")).toLowerCase();
    const matchIndex = fullText.indexOf(sk);

    // 1. Check Full Substring Match First (FTS) against the whole title+url
    if (matchIndex !== -1) {
      item.fts = 1;
      item.ld = 0; // Skip WASM entirely! Zero distance is perfect.
      item.matchIndex = matchIndex;
      continue;
    }

    // 2. Fallback to Levenshtein against keywords
    const keywords = item.keywords ?? [];
    item.fts = 0;
    item.ld = keywords.length > 0 ? Math.min(...keywords.map((w) => ld(sk, w.toLowerCase()))) : Infinity;
    item.matchIndex = Infinity;
  }

  items.sort((a, b) => {
    const ftsA = a.fts ?? 0;
    const ftsB = b.fts ?? 0;

    // FTS matches always beat Levenshtein matches
    if (ftsA !== ftsB) {
      return ftsB - ftsA;
    }

    // If BOTH are FTS matches, rank by which match happens earlier in the string
    if (ftsA === 1 && ftsB === 1) {
      return (a.matchIndex ?? Infinity) - (b.matchIndex ?? Infinity);
    }

    // If NEITHER are FTS matches, rank by Levenshtein distance
    return (a.ld ?? Infinity) - (b.ld ?? Infinity);
  });

  return items;
}

function orderTabsBySearchKeyword(searchKeyword: string, tabs: SearchableTab[]): SearchableTab[] {
  return orderItemsBySearchKeyword(searchKeyword, tabs);
}

const FAVICON_CACHE_KEY = "favicon_cache";
const FAVICON_TTL = 24 * 60 * 60 * 1000;
type FaviconEntry = { data: string; timestamp: number };
let faviconMemoryCache: Record<string, FaviconEntry> | null = null;

async function handleFetchFavicon(iconUrl: string): Promise<string> {
  const now = Date.now();

  if (!faviconMemoryCache) {
    const result = await browser.storage.local.get(FAVICON_CACHE_KEY);
    const cache = (result[FAVICON_CACHE_KEY] ?? {}) as Record<string, FaviconEntry>;

    let hasStaleEntries = false;
    for (const key of Object.keys(cache)) {
      if (now - cache[key].timestamp >= FAVICON_TTL) {
        delete cache[key];
        hasStaleEntries = true;
      }
    }

    faviconMemoryCache = cache;

    if (hasStaleEntries) {
      await browser.storage.local.set({ [FAVICON_CACHE_KEY]: faviconMemoryCache });
    }
  }

  const entry = faviconMemoryCache[iconUrl];

  if (entry && now - entry.timestamp < FAVICON_TTL) {
    return entry.data;
  }

  try {
    const res = await fetch(iconUrl);
    if (!res.ok) throw new Error("Fetch failed");

    const buffer = await res.arrayBuffer();

    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const contentType = res.headers.get("content-type") || "image/png";
    const dataUrl = `data:${contentType};base64,${base64}`;

    faviconMemoryCache[iconUrl] = { data: dataUrl, timestamp: now };
    await browser.storage.local.set({ [FAVICON_CACHE_KEY]: faviconMemoryCache });

    return dataUrl;
  } catch (error) {
    return entry?.data || "";
  }
}

async function handleSearch(keyword: string): Promise<boolean> {
  if (looksLikeDomain(keyword)) {
    const url = keyword.startsWith("http") ? keyword : `https://${keyword}`;
    await browser.tabs.create({ url });
  } else {
    await browser.search.query({
      text: keyword,
      disposition: "NEW_TAB",
    });
  }
  return true;
}

const MAX_COMMAND_HISTORY = 5;

async function recordCommandHistory(commandKey: string, keyword: string): Promise<boolean> {
  const history = (await commandHistoryStore.get()) ?? {};
  const existing = history[commandKey] ?? [];
  history[commandKey] = [keyword, ...existing.filter((k) => k !== keyword)].slice(0, MAX_COMMAND_HISTORY);
  return commandHistoryStore.set(history);
}

async function getCommandHistory(commandKey: string): Promise<string[]> {
  const history = (await commandHistoryStore.get()) ?? {};
  return history[commandKey] ?? [];
}

async function handleExecuteCommand(commandKey: string, keyword: string): Promise<boolean> {
  try {
    switch (commandKey) {
      case "s": {
        return await handleSearch(keyword);
      }
      default:
        logger(`Unknown command key: ${commandKey}`);
        return false;
    }
  } catch (error) {
    logger(`Error executing command '${commandKey}':`, error);
    return false;
  }
}

// Bookmarks

const BOOKMARK_RESULT_LIMIT = 50;

function deriveFaviconUrlForBookmark(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return undefined;
    // Chrome's built-in favicon store — local, no network, matches what
    // Chrome itself uses for bookmark UI. Unresolvable in Firefox; the UI
    // falls back to the default icon via the image-load error handler.
    return `${browser.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=32`;
  } catch {
    return undefined;
  }
}

const folderTitleCache = new Map<string, string>();

async function getFolderTitle(parentId: string | undefined): Promise<string | undefined> {
  if (!parentId) return undefined;
  const cached = folderTitleCache.get(parentId);
  if (cached !== undefined) return cached;
  try {
    const nodes = await browser.bookmarks.get(parentId);
    const title = nodes[0]?.title || "";
    folderTitleCache.set(parentId, title);
    return title;
  } catch {
    return undefined;
  }
}

async function populateFolderTitleCacheFromTree(): Promise<void> {
  try {
    const tree = await browser.bookmarks.getTree();
    const walk = (nodes: browser.Bookmarks.BookmarkTreeNode[]): void => {
      for (const node of nodes) {
        if (!node.url && node.id) {
          folderTitleCache.set(node.id, node.title || "");
        }
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
  } catch {
    // If getTree fails we fall back to missing titles.
  }
}

async function rebuildBookmarksIndex(): Promise<void> {
  try {
    await wasmReadyPromise;
    const tree = await browser.bookmarks.getTree();
    const items: BookmarkItem[] = [];
    folderTitleCache.clear();

    const walk = (nodes: browser.Bookmarks.BookmarkTreeNode[], parentTitle?: string): void => {
      for (const node of nodes) {
        if (node.url) {
          items.push({
            id: node.id,
            title: node.title || "",
            url: node.url,
            favIconUrl: deriveFaviconUrlForBookmark(node.url),
            keywords: generate_keyword_for_tab(node.title || "", node.url),
            parentId: node.parentId,
            parentTitle,
            dateAdded: node.dateAdded,
          });
        } else if (node.id) {
          folderTitleCache.set(node.id, node.title || "");
        }
        if (node.children) walk(node.children, node.url ? parentTitle : (node.title || parentTitle));
      }
    };

    walk(tree);
    await bookmarksStore.set(items);
  } catch (error) {
    logger("Failed to rebuild bookmarks index:", error);
  }
}

browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    if (!bookmark.url) {
      if (id && bookmark.title) folderTitleCache.set(id, bookmark.title);
      return;
    }
    await wasmReadyPromise;
    const items = (await bookmarksStore.get()) ?? [];
    items.push({
      id,
      title: bookmark.title || "",
      url: bookmark.url,
      favIconUrl: deriveFaviconUrlForBookmark(bookmark.url),
      keywords: generate_keyword_for_tab(bookmark.title || "", bookmark.url),
      parentId: bookmark.parentId,
      parentTitle: await getFolderTitle(bookmark.parentId),
      dateAdded: bookmark.dateAdded,
    });
    await bookmarksStore.set(items);
  } catch (error) {
    logger("Error in bookmarks.onCreated:", error);
  }
});

browser.bookmarks.onRemoved.addListener(async (_id, removeInfo) => {
  try {
    const items = (await bookmarksStore.get()) ?? [];
    const removedIds = new Set<string>();

    const collectIds = (node: browser.Bookmarks.BookmarkTreeNode): void => {
      removedIds.add(node.id);
      if (!node.url) folderTitleCache.delete(node.id);
      if (node.children) node.children.forEach(collectIds);
    };

    collectIds(removeInfo.node);
    await bookmarksStore.set(items.filter((it) => !removedIds.has(it.id)));
  } catch (error) {
    logger("Error in bookmarks.onRemoved:", error);
  }
});

browser.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    await wasmReadyPromise;
    const items = (await bookmarksStore.get()) ?? [];
    const item = items.find((it) => it.id === id);

    if (!item) {
      if (changeInfo.title !== undefined) {
        folderTitleCache.set(id, changeInfo.title);
        let touched = false;
        for (const it of items) {
          if (it.parentId === id) {
            it.parentTitle = changeInfo.title;
            touched = true;
          }
        }
        if (touched) await bookmarksStore.set(items);
      }
      return;
    }

    if (changeInfo.title !== undefined) item.title = changeInfo.title;
    if (changeInfo.url !== undefined) {
      item.url = changeInfo.url;
      item.favIconUrl = deriveFaviconUrlForBookmark(changeInfo.url);
    }
    item.keywords = generate_keyword_for_tab(item.title, item.url);

    await bookmarksStore.set(items);
  } catch (error) {
    logger("Error in bookmarks.onChanged:", error);
  }
});

browser.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  try {
    const items = (await bookmarksStore.get()) ?? [];
    const item = items.find((it) => it.id === id);
    if (!item) return;
    item.parentId = moveInfo.parentId;
    item.parentTitle = await getFolderTitle(moveInfo.parentId);
    await bookmarksStore.set(items);
  } catch (error) {
    logger("Error in bookmarks.onMoved:", error);
  }
});

async function searchBookmarks(searchKeyword: string): Promise<BookmarkItem[]> {
  const items = (await bookmarksStore.get()) ?? [];

  let backfilled = false;
  let hasMissingParent = false;
  for (const item of items) {
    if (!item.favIconUrl && item.url) {
      item.favIconUrl = deriveFaviconUrlForBookmark(item.url);
      backfilled = true;
    }
    if (item.parentTitle === undefined && item.parentId) {
      hasMissingParent = true;
    }
  }
  if (hasMissingParent) {
    await populateFolderTitleCacheFromTree();
    for (const item of items) {
      if (item.parentTitle === undefined && item.parentId) {
        const t = folderTitleCache.get(item.parentId);
        if (t !== undefined) {
          item.parentTitle = t;
          backfilled = true;
        }
      }
    }
  }
  if (backfilled) await bookmarksStore.set(items);

  const keyword = searchKeyword.trim();

  if (!keyword) {
    return [...items]
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
      .slice(0, BOOKMARK_RESULT_LIMIT);
  }

  return orderItemsBySearchKeyword(keyword, items).slice(0, BOOKMARK_RESULT_LIMIT);
}

async function handleOpenBookmark(url: string): Promise<boolean> {
  try {
    await browser.tabs.create({ url });
    return true;
  } catch (error) {
    logger("Failed to open bookmark:", error);
    return false;
  }
}
