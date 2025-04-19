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
      logger(`Error getting data for key ${this.keyName}:`, error);
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
      logger(`Error setting data for key ${this.keyName}:`, error);
      return false;
    }
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

/**
 * Removes diacritical marks (accents) from a string.
 *
 * @param {string} inputStr - The input string to normalize.
 * @returns {string} - The normalized string.
 *
 * @example
 * normalizeString('âé'); // returns 'ae'
 */
export function normalizeString(inputStr: string): string {
  return String(inputStr)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
