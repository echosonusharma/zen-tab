import browser from "webextension-polyfill";

export enum StoreType {
  LOCAL = 'local',
  SESSION = 'session'
}

// meh
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

  /**
   * Clear the stored data
   * @returns true if successful, false otherwise
   */
  public async clear(): Promise<boolean> {
    try {
      await this.storageEngine.remove(this.keyName);
      return true;
    } catch (error) {
      console.error(`Error clearing data for key ${this.keyName}:`, error);
      return false;
    }
  }

  /**
   * Get data as array from storage
   * @returns The stored array or undefined if not found or not an array
   */
  private async getDataAsArr<T>(): Promise<T[] | undefined> {
    const data = await this.get<T[]>();
    if (!data || !Array.isArray(data)) {
      return undefined;
    }
    return data;
  }

  /**
   * Remove an item from the array at specified index
   * @param index The index to remove from
   * @returns true if successful, false otherwise
   */
  public async removeFromArr(index: number): Promise<boolean> {
    if (index < 0) {
      return false;
    }

    const data = await this.getDataAsArr();
    if (!data || index >= data.length) {
      return false;
    }

    data.splice(index, 1);
    return await this.set(data);
  }

  /**
   * Add an item to the array at specified index
   * @param index The index to add at
   * @param item The item to add
   * @returns true if successful, false otherwise
   */
  public async addToArr<T>(index: number, item: T): Promise<boolean> {
    if (index < 0) {
      return false;
    }

    const data = await this.getDataAsArr<T>();
    if (!data || index > data.length) {
      return false;
    }

    data.splice(index, 0, item);
    return await this.set(data);
  }

  /**
   * Push an item to the end of the array
   * @param item The item to push
   * @returns true if successful, false otherwise
   */
  public async push<T>(item: T): Promise<boolean> {
    const data = await this.getDataAsArr<T>();
    if (!data) {
      return await this.set([item]);
    }

    data.push(item);
    return await this.set(data);
  }

  /**
   * Remove an item from the array by value
   * @param value The value to remove
   * @returns true if successful, false otherwise
   */
  public async removeByValue<T>(value: T): Promise<boolean> {
    const data = await this.getDataAsArr<T>();
    if (!data) {
      return false;
    }

    const index = data.indexOf(value);
    if (index === -1) {
      return false;
    }

    return await this.removeFromArr(index);
  }

  /**
   * Check if the stored data exists
   * @returns true if data exists, false otherwise
   */
  public async exists(): Promise<boolean> {
    const data = await this.get();
    return data !== undefined;
  }

  /**
   * Get the length of the stored array
   * @returns The length of the array or 0 if not an array
   */
  public async length(): Promise<number> {
    const data = await this.getDataAsArr();
    return data ? data.length : 0;
  }
}
