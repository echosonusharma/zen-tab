import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType, TabData, TabInfo } from "./types";
import { Store, logger } from "./utils";
import initWasmModule, { init_wasm, generate_keyword_for_tab, ld } from "ld-wasm-lib";

initWasmModule()
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

// Runtime Events

browser.runtime.onStartup.addListener(async () => await initWindowAndTabData());

browser.runtime.onInstalled.addListener(async () => {
  await initWindowAndTabData();
  await searchTabStore.set(true);
});

browser.runtime.onMessage.addListener(
  async (message: unknown, _sender: browser.Runtime.MessageSender): Promise<any> => {
    const msg = message as ExtensionMessage;

    switch (msg?.action) {
      case "getCurrentWindowId":
        return (await activeWindowIdStore.get()) as number;

      case "switchToTab":
        await browser.tabs.update(msg.data.tabId, { active: true });
        return true;

      case "getCurrentWindowTabs":
        return await getTabsInCurrentWindow();

      case "orderTabsBySearchKeyword":
        return orderTabsBySearchKeyword(msg.data.searchKeyword, msg.data.tabs);

      default:
        return undefined;
    }
  }
);

// Window Events

browser.windows.onFocusChanged.addListener(async (windowId: number) => {
  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    await activeWindowIdStore.set(windowId);
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
  await activeTabIdStore.set(activeInfo.tabId);
});

// Command Handler

browser.commands.onCommand.addListener(async (command: string) => {
  const activeTabId = (await activeTabIdStore.get()) as number;
  const activeWindowId = (await activeWindowIdStore.get()) as number;

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
      await handleSearchCmd(activeTabId);
      break;
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

async function handleSearchCmd(activeTabId: number): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId: activeTabId },
      files: [PATH_TO_CONTENT_SCRIPT],
    });
  } catch (error) {
    logger(`Error in handleSearchCmd:`, error);
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
      Object.assign(existingTabsData, tabsByWindowId);
      await tabsStore.set(existingTabsData);
    } else {
      await tabsStore.set(tabsByWindowId);
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
}

// Tab Query & Search

const NEW_TAB_URLS = new Set(["about:newtab", "chrome://newtab/"]);

async function getTabsInCurrentWindow(): Promise<TabInfo[]> {
  try {
    const allTabs = (await browser.tabs.query({ currentWindow: true })) as TabInfo[];
    const tabs = allTabs.filter(({ url = "" }) => !NEW_TAB_URLS.has(url));

    for (const tab of tabs) {
      tab.keywords = generate_keyword_for_tab(tab.title, tab.url);
    }

    return tabs;
  } catch (error) {
    logger("Failed to get current window tabs:", error);
    return [];
  }
}

function orderTabsBySearchKeyword(searchKeyword: string, tabs: TabInfo[]): TabInfo[] {
  const sk = searchKeyword.toLowerCase();

  if (!sk) return tabs;

  for (const tab of tabs) {
    const fullText = ((tab.title || "") + " " + (tab.url || "")).toLowerCase();
    const matchIndex = fullText.indexOf(sk);

    // 1. Check Full Substring Match First (FTS) against the whole title+url
    if (matchIndex !== -1) {
      tab.fts = 1;
      tab.ld = 0; // Skip WASM entirely! Zero distance is perfect.
      (tab as any).matchIndex = matchIndex;
      continue;
    }

    // 2. Fallback to Levenshtein against keywords
    const keywords = tab.keywords ?? [];
    tab.fts = 0;
    tab.ld = keywords.length > 0 ? Math.min(...keywords.map((w) => ld(sk, w.toLowerCase()))) : Infinity;
    (tab as any).matchIndex = Infinity;
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
      return (a as any).matchIndex - (b as any).matchIndex;
    }

    // If NEITHER are FTS matches, rank by Levenshtein distance
    return (a.ld ?? Infinity) - (b.ld ?? Infinity);
  });

  return tabs;
}
