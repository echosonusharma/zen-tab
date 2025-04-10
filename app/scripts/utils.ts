import browser from "webextension-polyfill";

export enum StoreType {
  LOCAL = 'local',
  SESSION = 'session'
}

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
