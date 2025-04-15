import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType } from "./types";

export class Store {
  public keyName: string;
  public type: StoreType;
  private storageEngine: browser.Storage.StorageArea;

  constructor(keyName: string, type: StoreType = StoreType.LOCAL) {
    this.keyName = keyName;
    this.type = type;
    this.storageEngine = type === StoreType.LOCAL ? browser.storage.local : browser.storage.session;
  }

  /**
   * Get data from storage
   * @returns The stored data or undefined if not found
   */
  public async get<T>(): Promise<T | undefined> {
    try {
      const data = await this.storageEngine.get(this.keyName);
      return data[this.keyName] as T;
    } catch (error) {
      console.error(`Error getting data for key ${this.keyName}:`, error);
      return undefined;
    }
  }

  /**
   * Set data in storage
   * @param data The data to store
   * @returns true if successful, false otherwise
   */
  public async set<T>(data: T): Promise<boolean> {
    try {
      await this.storageEngine.set({ [this.keyName]: data });
      return true;
    } catch (error) {
      console.error(`Error setting data for key ${this.keyName}:`, error);
      return false;
    }
  }
}

export function logger(message: string, ...args: any[]): void {
  console.log("\x1b[95m%s\x1b[0m", "ZenTab:", message, ...args);
}

export async function broadcastMsgToServiceWorker(data: ExtensionMessage): Promise<any> {
  try {
    return await browser.runtime.sendMessage(data);
  } catch (err) {
    console.warn("Service worker not available:", err);
    return null;
  }
}

export async function sendMessageToContentScript(tabId: number, data: ExtensionMessage): Promise<any> {
  try {
    return await browser.tabs.sendMessage(tabId, data);
  } catch (err) {
    console.error("Error sending message to content script:", err);
    return null;
  }
}
