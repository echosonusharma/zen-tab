import browser from "webextension-polyfill";
import { Store, StoreType } from "./utils";

type TabData = Record<number, browser.Tabs.Tab[]>;

const tabsStore: Store = new Store("tabs", StoreType.LOCAL);

let activeTabId: number;
let activeWindowId: number;

const TAB_COMMANDS = ["next_tab", "prev_tab"] as const;
const WINDOW_COMMANDS = ["next_win", "prev_win"] as const;

type TabCommand = (typeof TAB_COMMANDS)[number];
type WindowCommand = (typeof WINDOW_COMMANDS)[number];

function logger(message: string, ...args: any[]): void {
  console.log("\x1b[95m%s\x1b[0m", "ZenTab:", message, ...args);
}

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId && windowId !== -1) {
    activeWindowId = windowId;
    await updateTabStores({ windowId: windowId }); // meh
  }
});

browser.windows.onRemoved.addListener(async (windowId) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;

    if (tabsData[windowId]) {
      delete tabsData[windowId];
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
});

browser.windows.onCreated.addListener(async (window) => {
  try {
    if (window && window.id && window.id !== -1) {
      activeWindowId = window.id;
      await updateTabStores({ windowId: window.id });
    }
  } catch (error) {
    logger(`Error in updateTabStores:`, error);
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await initWindowAndTabData();
  console.log("\x1b[96m%s\x1b[0m", "ZenTab installed 🎐");
});

browser.runtime.onStartup.addListener(async () => await initWindowAndTabData());

async function initWindowAndTabData(): Promise<void> {
  const currentWindow = await browser.windows.getCurrent({});
  if (currentWindow.id) {
    activeWindowId = currentWindow.id;
  }
  await updateTabStores();
}

async function updateTabStores(tabQueryOptions: browser.Tabs.QueryQueryInfoType = {}): Promise<void> {
  try {
    const PData = await Promise.all([browser.tabs.query(tabQueryOptions), tabsStore.get()]);
    const data: browser.Tabs.Tab[] = PData[0];
    const tabsData = PData[1] as TabData;

    activeTabId = data.find((t) => t.active === true)?.id as number;

    const tabsByWindowId: TabData = data.reduce((acc: TabData, curVal: browser.Tabs.Tab) => {
      const tabWindowId = curVal.windowId;
      if (!tabWindowId) {
        return acc;
      }

      if (acc[tabWindowId]) {
        acc[tabWindowId].push(curVal);
      } else {
        acc[tabWindowId] = [curVal];
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

browser.tabs.onCreated.addListener(async (tab: browser.Tabs.Tab) => {
  try {
    if (!tab.windowId) {
      return;
    }

    const tabsData = (await tabsStore.get()) as TabData;

    if (!tabsData[tab.windowId]) {
      tabsData[tab.windowId] = [];
    }

    tabsData[tab.windowId].splice(tab.index, 0, tab);

    await tabsStore.set(tabsData);
  } catch (error) {
    logger(`Error in onCreated tab:`, error);
  }
});

browser.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;
    const windowTabs = tabsData[moveInfo.windowId];

    if (!windowTabs) return;

    const tabIndex = windowTabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const [movedTab] = windowTabs.splice(tabIndex, 1);
    windowTabs.splice(moveInfo.toIndex, 0, movedTab);

    await tabsStore.set(tabsData);
  } catch (error) {
    logger(`Error in onMoved tab:`, error);
  }
});

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    const tabsData = (await tabsStore.get()) as TabData;

    if (tabsData[removeInfo.windowId]) {
      tabsData[removeInfo.windowId] = tabsData[removeInfo.windowId].filter((tab) => tab.id !== tabId);
      await tabsStore.set(tabsData);
    }
  } catch (error) {
    logger(`Error in onRemoved tab:`, error);
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

browser.commands.onCommand.addListener(async (command) => {
  if (!activeTabId || !activeWindowId) {
    return;
  }

  const tabIdsData = (await tabsStore.get()) as TabData;

  if (["next_tab", "prev_tab"].includes(command)) {
    await handledTabMoveCmd(tabIdsData, command as TabCommand);
  } else if (["next_win", "prev_win"].includes(command)) {
    await handledWindowMoveCmd(tabIdsData, command as WindowCommand);
  }
});

async function handledTabMoveCmd(tabIdsData: TabData, command: TabCommand): Promise<void> {
  try {
    const windowTabIds = tabIdsData[activeWindowId];

    if (!windowTabIds || windowTabIds.length <= 1) {
      return;
    }

    const currentTabIndex = windowTabIds.findIndex((t) => t.id === activeTabId);
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

    await browser.tabs.update(windowTabIds[newIndex].id, { active: true });
  } catch (error) {
    logger(`Error in handledTabMoveCmd:`, error);
  }
}

async function handledWindowMoveCmd(tabIdsData: TabData, command: WindowCommand): Promise<void> {
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
