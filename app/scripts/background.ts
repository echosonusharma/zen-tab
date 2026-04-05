import browser from "webextension-polyfill";
import { ExtensionMessage, OpenTabInfo, SearchableTab, StoreType, TabData, TabInfo } from "./types";
import { Store, getNewTabUrls, logger, openShortcutSettings } from "./utils";
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

// Runtime Events

let searchPopupConnections = 0;

browser.runtime.onConnect.addListener((port) => {
  if (port.name === "popupSearchMode") {
    searchPopupConnections++;
    port.onDisconnect.addListener(() => {
      searchPopupConnections--;
    });
  }
});

browser.runtime.onStartup.addListener(async () => await initWindowAndTabData());

browser.runtime.onInstalled.addListener(async (details) => {
  await initWindowAndTabData();
  await searchTabStore.set(true);

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
      await browser.action.openPopup({ windowId: activeWindowId });
    } catch (fallbackError) {
      logger(`Failed to open fallback popup:`, fallbackError);
    }
  }
}

// Data Initialization

async function initWindowAndTabData(): Promise<void> {
  const currentWindow = await browser.windows.getCurrent({});
  logger("initWindowAndTabData", currentWindow);

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

function orderTabsBySearchKeyword(searchKeyword: string, tabs: SearchableTab[]): SearchableTab[] {
  const sk = searchKeyword.toLowerCase();

  if (!sk) return tabs;

  for (const tab of tabs) {
    const fullText = ((tab.title || "") + " " + (tab.url || "")).toLowerCase();
    const matchIndex = fullText.indexOf(sk);

    // 1. Check Full Substring Match First (FTS) against the whole title+url
    if (matchIndex !== -1) {
      tab.fts = 1;
      tab.ld = 0; // Skip WASM entirely! Zero distance is perfect.
      tab.matchIndex = matchIndex;
      continue;
    }

    // 2. Fallback to Levenshtein against keywords
    const keywords = tab.keywords ?? [];
    tab.fts = 0;
    tab.ld = keywords.length > 0 ? Math.min(...keywords.map((w) => ld(sk, w.toLowerCase()))) : Infinity;
    tab.matchIndex = Infinity;
  }

  tabs.sort((a, b) => {
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

  return tabs;
}

const FAVICON_CACHE_KEY = "favicon_cache";
const FAVICON_TTL = 24 * 60 * 60 * 1000;
let faviconMemoryCache: Record<string, any> | null = null;

async function handleFetchFavicon(iconUrl: string): Promise<string> {
  const now = Date.now();

  if (!faviconMemoryCache) {
    const result = await browser.storage.local.get(FAVICON_CACHE_KEY);
    faviconMemoryCache = result[FAVICON_CACHE_KEY] || {};

    let hasStaleEntries = false;
    for (const key of Object.keys(faviconMemoryCache)) {
      if (now - faviconMemoryCache[key].timestamp >= FAVICON_TTL) {
        delete faviconMemoryCache[key];
        hasStaleEntries = true;
      }
    }

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

    faviconMemoryCache![iconUrl] = { data: dataUrl, timestamp: now };
    await browser.storage.local.set({ [FAVICON_CACHE_KEY]: faviconMemoryCache });

    return dataUrl;
  } catch (error) {
    return entry?.data || "";
  }
}
