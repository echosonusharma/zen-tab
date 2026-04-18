import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType } from "./types";

type BrowserKey = "chromium" | "edge" | "firefox" | "opera" | "vivaldi";

type BrowserConfig = {
  newTabUrls: string[];
  shortcutsPageUrl: string;
};

const BROWSER_CONFIG_MAP: Record<BrowserKey, BrowserConfig> = {
  chromium: {
    newTabUrls: ["chrome://newtab/"],
    shortcutsPageUrl: "chrome://extensions/shortcuts",
  },
  edge: {
    newTabUrls: ["edge://newtab/"],
    shortcutsPageUrl: "edge://extensions/shortcuts",
  },
  firefox: {
    newTabUrls: ["about:newtab"],
    shortcutsPageUrl: "about:addons",
  },
  opera: {
    newTabUrls: ["opera://startpage/"],
    shortcutsPageUrl: "opera://extensions/shortcuts",
  },
  vivaldi: {
    newTabUrls: ["vivaldi://newtab/"],
    shortcutsPageUrl: "vivaldi://extensions",
  },
};

function getBrowserKey(): BrowserKey {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("edg/")) {
    return "edge";
  }
  if (userAgent.includes("opr/") || userAgent.includes("opera")) {
    return "opera";
  }
  if (userAgent.includes("vivaldi")) {
    return "vivaldi";
  }
  if (userAgent.includes("firefox")) {
    return "firefox";
  }

  return "chromium";
}

export function getBrowserConfig(): BrowserConfig {
  return BROWSER_CONFIG_MAP[getBrowserKey()];
}

export function getNewTabUrls(): Set<string> {
  const browserConfig = getBrowserConfig();
  const sharedUrls = new Set<string>();

  for (const config of Object.values(BROWSER_CONFIG_MAP)) {
    for (const newTabUrl of config.newTabUrls) {
      sharedUrls.add(newTabUrl);
    }
  }

  for (const newTabUrl of browserConfig.newTabUrls) {
    sharedUrls.add(newTabUrl);
  }

  return sharedUrls;
}

export class Store<T> {
  public readonly keyName: string;
  public readonly type: StoreType;
  private readonly storageEngine: browser.Storage.StorageArea;

  constructor(keyName: string, type: StoreType = StoreType.LOCAL) {
    this.keyName = keyName;
    this.type = type;
    this.storageEngine = type === StoreType.LOCAL ? browser.storage.local : browser.storage.session;
  }

  /**
   * Get data from storage.
   * @returns The stored data or undefined if not found.
   */
  public async get(): Promise<T> {
    const data = await this.storageEngine.get(this.keyName);
    return data[this.keyName] as T;
  }

  /**
   * Set data in storage.
   * @param data The data to store.
   * @returns true if successful.
   */
  public async set(data: T): Promise<boolean> {
    await this.storageEngine.set({ [this.keyName]: data });
    return true;
  }
}

export function logger(...args: any[]): void {
  console.log("\x1b[95m%s\x1b[0m", "Tabaru:", ...args);
}

export async function broadcastMsgToServiceWorker(data: ExtensionMessage): Promise<any> {
  try {
    return await browser.runtime.sendMessage(data);
  } catch (err) {
    logger("Service worker not available:", err);
    return null;
  }
}

export function getShortcutsPageUrl(): string {
  return getBrowserConfig().shortcutsPageUrl;
}

export async function openSettingsPage(): Promise<void> {
  const url = browser.runtime.getURL("settings.html");
  try {
    await browser.tabs.create({ url });
  } catch (e) {
    logger("Error opening settings page", e);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function openShortcutSettings(): Promise<void> {
  const url = getShortcutsPageUrl();

  try {
    await browser.tabs.create({ url });
    return;
  } catch (e) {
    logger("Error opening shortcuts page programmatically", e);
  }

  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  } catch (e) {
    logger("Error opening shortcuts page via window.open", e);
  }

  try {
    window.location.href = url;
  } catch (e) {
    logger("Error navigating to shortcuts page", e);
  }
}

export function looksLikeDomain(input: string): boolean {
  try {
    const url = new URL(
      input.startsWith("http") ? input : `http://${input}`
    );
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}
