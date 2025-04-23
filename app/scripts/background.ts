import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType, TabData } from "./types";
import { Store, logger, sendMessageToContentScript } from "./utils";

const PATH_TO_CONTENT_SCRIPT = "scripts/content.js";

const TAB_COMMANDS = ["next_tab", "prev_tab"] as const;
const WINDOW_COMMANDS = ["next_win", "prev_win"] as const;
const SEARCH_COMMANDS = ["open_search", "close_search"] as const;

type TabCommand = (typeof TAB_COMMANDS)[number];
type WindowCommand = (typeof WINDOW_COMMANDS)[number];
type SearchCommand = (typeof SEARCH_COMMANDS)[number];

const tabsStore: Store = new Store("tabs", StoreType.SESSION);

const activeTabIdStore: Store = new Store("activeTabId", StoreType.SESSION);
const activeWindowIdStore: Store = new Store("activeWindowId", StoreType.SESSION);

const audioCaptureStore: Store = new Store("audioCapture", StoreType.LOCAL);
const searchTabStore: Store = new Store("searchTab", StoreType.LOCAL);

browser.windows.onFocusChanged.addListener(async (windowId: number) => {
  if (windowId && windowId !== -1) {
    await activeWindowIdStore.set(windowId);
  }
});

browser.windows.onRemoved.addListener(async (windowId: number) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;

    if (tabsData[windowId]) {
      delete tabsData[windowId];
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in windows onRemoved:`, error);
  }
});

browser.windows.onCreated.addListener(async (window: browser.Windows.Window) => {
  try {
    if (window && window.id && window.id !== -1) {
      await activeWindowIdStore.set(window.id);
      await updateTabStores({ windowId: window.id });
    }
  } catch (error) {
    logger(`Error in windows onCreated:`, error);
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await initWindowAndTabData();
  await audioCaptureStore.set(false);
  await searchTabStore.set(true);
});

browser.runtime.onStartup.addListener(async () => await initWindowAndTabData());

browser.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "active") {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const tab = tabs[0];

    await activeTabIdStore.set(tab.id);
    await activeWindowIdStore.set(tab.windowId);
  }
});

browser.runtime.onMessage.addListener(
  async (message: unknown, _sender: browser.Runtime.MessageSender): Promise<any> => {
    const msg = message as ExtensionMessage;
    if (msg?.action === "getCurrentWindowId") {
      const activeWindowId = (await activeWindowIdStore.get()) as number;
      return activeWindowId;
    }
    if (msg?.action === "switchToTab") {
      await browser.tabs.update(msg.data.tabId, { active: true });
      return true;
    }
    if (msg?.action === "getCurrentWindowTabs") {
      const data = await getTabsInCurrentWindow();
      return data;
    }
  }
);

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

browser.commands.onCommand.addListener(async (command: string) => {
  const activeTabId = (await activeTabIdStore.get()) as number;
  const activeWindowId = (await activeWindowIdStore.get()) as number;

  if (!activeTabId || !activeWindowId) {
    return;
  }

  const tabIdsData = (await tabsStore.get()) as TabData;

  if (["next_tab", "prev_tab"].includes(command)) {
    await handledTabMoveCmd(tabIdsData, command as TabCommand, activeTabId, activeWindowId);
  } else if (["next_win", "prev_win"].includes(command)) {
    await handledWindowMoveCmd(tabIdsData, command as WindowCommand, activeWindowId);
  } else if (["open_search", "close_search"].includes(command)) {
    await handledSearchCmd(tabIdsData, command as SearchCommand, activeTabId, activeWindowId);
  }
});

async function handledTabMoveCmd(
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

    let newIndex: number;
    switch (command) {
      case "next_tab":
        newIndex = (currentTabIndex + 1) % windowTabIds.length;
        break;
      case "prev_tab":
        newIndex = (currentTabIndex - 1 + windowTabIds.length) % windowTabIds.length;
        break;
      default:
        return;
    }

    await browser.tabs.update(windowTabIds[newIndex], { active: true });
  } catch (error) {
    logger(`Error in handledTabMoveCmd:`, error);
  }
}

async function handledWindowMoveCmd(
  tabIdsData: TabData,
  command: WindowCommand,
  activeWindowId: number
): Promise<void> {
  try {
    const windows = Object.keys(tabIdsData);
    if (!windows || windows.length <= 1) {
      return;
    }

    const currentWindowIndex = windows.findIndex((wId) => Number(wId) === activeWindowId);
    if (currentWindowIndex === -1) {
      return;
    }

    let newIndex: number;
    switch (command) {
      case "next_win":
        newIndex = (currentWindowIndex + 1) % windows.length;
        break;
      case "prev_win":
        newIndex = (currentWindowIndex - 1 + windows.length) % windows.length;
        break;
      default:
        return;
    }

    await browser.windows.update(Number(windows[newIndex]), { focused: true });
  } catch (error) {
    logger(`Error in handledWindowMoveCmd:`, error);
  }
}

async function handledSearchCmd(
  tabIdsData: TabData,
  command: SearchCommand,
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

    switch (command) {
      case "open_search":
        await browser.scripting.executeScript({
          target: { tabId: activeTabId },
          files: [PATH_TO_CONTENT_SCRIPT],
        });
        break;
      case "close_search":
        await sendMessageToContentScript(activeTabId, { action: "closeSearchTab" });
        break;
      default:
        return;
    }
  } catch (error) {
    logger(`Error in handledSearchCmd:`, error);
  }
}

async function initWindowAndTabData(): Promise<void> {
  const currentWindow = await browser.windows.getCurrent({});
  if (currentWindow.id) {
    await activeWindowIdStore.set(currentWindow.id);
  }
  await updateTabStores();
}

async function updateTabStores(tabQueryOptions: browser.Tabs.QueryQueryInfoType = {}): Promise<void> {
  try {
    const PData = await Promise.all([browser.tabs.query(tabQueryOptions), tabsStore.get()]);
    const data: browser.Tabs.Tab[] = PData[0];
    const tabsData = PData[1] as TabData;

    const activeTabId = data.find((t) => t.active === true)?.id as number;
    await activeTabIdStore.set(activeTabId);

    const tabsByWindowId: TabData = data.reduce((acc: TabData, curVal: browser.Tabs.Tab) => {
      const tabWindowId = curVal.windowId;
      if (!tabWindowId) {
        return acc;
      }

      if (acc[tabWindowId]) {
        acc[tabWindowId].push(curVal.id as number);
      } else {
        acc[tabWindowId] = [curVal.id as number];
      }

      return acc;
    }, {});

    if (tabsData) {
      Object.assign(tabsData, tabsByWindowId);
      await tabsStore.set(tabsData);
    } else {
      await tabsStore.set(tabsByWindowId);
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
}

async function getTabsInCurrentWindow(): Promise<browser.Tabs.Tab[]> {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    return tabs.filter(({ url = "" }) => !["about:newtab", "chrome://newtab/"].includes(url));
  } catch (error) {
    logger("failed to get current window tabs: ", error);
    return [];
  }
}
