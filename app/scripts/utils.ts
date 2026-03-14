import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType } from "./types";

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
  console.log("\x1b[95m%s\x1b[0m", "ZenTab:", ...args);
}

export async function broadcastMsgToServiceWorker(data: ExtensionMessage): Promise<any> {
  try {
    return await browser.runtime.sendMessage(data);
  } catch (err) {
    logger("Service worker not available:", err);
    return null;
  }
}

export async function sendMessageToContentScript(tabId: number, data: ExtensionMessage): Promise<any> {
  try {
    return await browser.tabs.sendMessage(tabId, data);
  } catch (err) {
    logger("Error sending message to content script:", err);
    return null;
  }
}
