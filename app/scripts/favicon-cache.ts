import browser from "webextension-polyfill";

const CACHE_KEY = "favicon_cache";
const TTL = 24 * 60 * 60 * 1000;
let memoryCache: Record<string, any> | null = null;

/**
 * Caches the content of a favicon URL to local storage.
 * @param iconUrl The URL of the favicon image to cache.
 * @returns A data URL (Base64) of the cached icon, or the original URL if fetching fails.
 */
export async function getFavicon(iconUrl: string | undefined): Promise<string> {
  if (!iconUrl || iconUrl.startsWith("data:")) return iconUrl || "";

  if (!memoryCache) {
    const result = await browser.storage.local.get(CACHE_KEY);
    memoryCache = result[CACHE_KEY] || {};
  }

  const entry = memoryCache![iconUrl];
  const now = Date.now();

  if (entry && now - entry.timestamp < TTL) {
    return entry.data;
  }

  try {
    const res = await fetch(iconUrl);
    if (!res.ok) throw new Error("Fetch failed");
    
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    memoryCache![iconUrl] = { data: dataUrl, timestamp: now };
    await browser.storage.local.set({ [CACHE_KEY]: memoryCache });
    
    return dataUrl;
  } catch {
    return entry?.data || iconUrl;
  }
}
