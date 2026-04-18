import browser from "webextension-polyfill";
import { ExtensionMessage, StoreType, TabGroupColor, TabGroupRule } from "./types";

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

export const TAB_GROUP_COLORS: TabGroupColor[] = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export const TAB_GROUP_COLOR_HEX: Record<TabGroupColor, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#e65590',
  purple: '#8430ce',
  cyan: '#007b83',
  orange: '#fa903e',
};

type PatternProtocol = "*" | "http" | "https";
type PatternHostKind = "any" | "exact" | "subdomain-wildcard";
type PatternPathKind = "any" | "exact" | "prefix";

export interface ParsedPattern {
  protocol: PatternProtocol;
  host: string;
  hostKind: PatternHostKind;
  path: string;
  pathKind: PatternPathKind;
}

export interface UrlPatternValidationResult {
  isValid: boolean;
  error?: string;
  parsed?: ParsedPattern;
}

function hasInvalidHostLabel(label: string): boolean {
  if (!label) return true;
  for (const char of label) {
    const isLowerAlpha = char >= "a" && char <= "z";
    const isUpperAlpha = char >= "A" && char <= "Z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLowerAlpha && !isUpperAlpha && !isDigit && char !== "-") {
      return true;
    }
  }
  return false;
}

function validateHost(host: string): { isValid: boolean; error?: string; hostKind?: PatternHostKind; normalizedHost?: string } {
  if (!host) {
    return { isValid: false, error: "Host is required." };
  }

  if (host === "*") {
    return { isValid: true, hostKind: "any", normalizedHost: host };
  }

  let normalizedHost = host.toLowerCase();
  let hostKind: PatternHostKind = "exact";

  if (normalizedHost.startsWith("*.")) {
    hostKind = "subdomain-wildcard";
    normalizedHost = normalizedHost.slice(2);

    if (!normalizedHost) {
      return { isValid: false, error: "Wildcard hosts must include a base domain, for example *.springer.com." };
    }
  }

  if (normalizedHost.includes("*")) {
    return { isValid: false, error: "Host wildcards are only supported as a leading *." };
  }

  const labels = normalizedHost.split(".");
  if (labels.some(hasInvalidHostLabel)) {
    return { isValid: false, error: "Host contains an invalid domain label." };
  }

  return { isValid: true, hostKind, normalizedHost };
}

function validatePath(path: string): { isValid: boolean; error?: string; pathKind?: PatternPathKind; normalizedPath?: string } {
  if (!path) {
    return { isValid: false, error: "Path is required. Use /* to match an entire site." };
  }

  if (path[0] !== "/") {
    return { isValid: false, error: "Path must start with /." };
  }

  if (path === "/*") {
    return { isValid: true, pathKind: "any", normalizedPath: path };
  }

  const starIndex = path.indexOf("*");
  if (starIndex === -1) {
    return { isValid: true, pathKind: "exact", normalizedPath: path };
  }

  if (!path.endsWith("/*")) {
    return { isValid: false, error: "Path wildcards are only supported as a trailing /* suffix." };
  }

  if (path.slice(0, -2).includes("*")) {
    return { isValid: false, error: "Only one trailing path wildcard is supported." };
  }

  return { isValid: true, pathKind: "prefix", normalizedPath: path };
}

export function parseUrlPattern(pattern: string): UrlPatternValidationResult {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return { isValid: false, error: "Pattern is required." };
  }

  const protoEnd = trimmedPattern.indexOf("://");
  if (protoEnd === -1) {
    return { isValid: false, error: "Pattern must include a protocol such as https:// or *://." };
  }

  const protocolValue = trimmedPattern.slice(0, protoEnd).toLowerCase();
  if (protocolValue !== "*" && protocolValue !== "http" && protocolValue !== "https") {
    return { isValid: false, error: "Protocol must be http, https, or *." };
  }

  const rest = trimmedPattern.slice(protoEnd + 3);
  const pathStart = rest.indexOf("/");
  if (pathStart === -1) {
    return { isValid: false, error: "Pattern must include a path. Use /* to match all paths." };
  }

  const host = rest.slice(0, pathStart);
  const path = rest.slice(pathStart);

  const hostValidation = validateHost(host);
  if (!hostValidation.isValid) {
    return { isValid: false, error: hostValidation.error };
  }

  const pathValidation = validatePath(path);
  if (!pathValidation.isValid) {
    return { isValid: false, error: pathValidation.error };
  }

  return {
    isValid: true,
    parsed: {
      protocol: protocolValue,
      host: hostValidation.normalizedHost!,
      hostKind: hostValidation.hostKind!,
      path: pathValidation.normalizedPath!,
      pathKind: pathValidation.pathKind!,
    },
  };
}

export function validateUrlPattern(pattern: string): boolean {
  return parseUrlPattern(pattern).isValid;
}

export function getUrlPatternValidationError(pattern: string): string {
  const result = parseUrlPattern(pattern);
  return result.error || "";
}

export function normalizeUrlPattern(pattern: string): string {
  const result = parseUrlPattern(pattern);
  if (!result.isValid || !result.parsed) {
    return pattern.trim();
  }

  const parsed = result.parsed;
  const host = parsed.hostKind === "subdomain-wildcard" ? `*.${parsed.host}` : parsed.host;
  return `${parsed.protocol}://${host}${parsed.path}`;
}

function matchesHost(hostname: string, parsed: ParsedPattern): boolean {
  if (parsed.hostKind === "any") {
    return true;
  }

  if (parsed.hostKind === "exact") {
    return hostname === parsed.host;
  }

  return hostname === parsed.host || hostname.endsWith(`.${parsed.host}`);
}

function matchesPath(pathname: string, parsed: ParsedPattern): boolean {
  if (parsed.pathKind === "any") {
    return true;
  }

  if (parsed.pathKind === "exact") {
    return pathname === parsed.path;
  }

  const prefix = parsed.path.slice(0, -2);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchesUrlPattern(url: string, pattern: string): boolean {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed) {
    return false;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    return false;
  }

  const urlProtocol = urlObj.protocol.slice(0, -1).toLowerCase();
  const urlHost = urlObj.hostname.toLowerCase();
  const urlPath = urlObj.pathname;

  if (parsedResult.parsed.protocol !== "*" && parsedResult.parsed.protocol !== urlProtocol) {
    return false;
  }

  return matchesHost(urlHost, parsedResult.parsed) && matchesPath(urlPath, parsedResult.parsed);
}

export function extractDomainFromPattern(pattern: string): string {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed || parsedResult.parsed.hostKind === "any") {
    return "tabs";
  }

  const host = parsedResult.parsed.host;
  const parts = host.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

export function describeUrlPattern(pattern: string): string {
  const parsedResult = parseUrlPattern(pattern);
  if (!parsedResult.isValid || !parsedResult.parsed) {
    return "Use protocol://host/path with optional leading *., *://, and trailing /*.";
  }

  const { protocol, host, hostKind, path, pathKind } = parsedResult.parsed;
  const schemeLabel = protocol === "*" ? "http and https" : protocol;
  const hostLabel =
    hostKind === "any"
      ? "any host"
      : hostKind === "subdomain-wildcard"
        ? `${host} and its subdomains`
        : host;
  const pathLabel =
    pathKind === "any"
      ? "every path"
      : pathKind === "prefix"
        ? `${path.slice(0, -2)} and anything below it`
        : `exactly ${path}`;

  return `Matches ${schemeLabel} on ${hostLabel} for ${pathLabel}.`;
}

export function normalizeTabGroupRule(rule: TabGroupRule): TabGroupRule {
  const now = Date.now();
  const normalizedPattern = normalizeUrlPattern(rule.pattern);
  const normalizedTitle = rule.title?.trim();

  return {
    ...rule,
    pattern: normalizedPattern,
    title: normalizedTitle || undefined,
    color: rule.color,
    collapsed: !!rule.collapsed,
    enabled: rule.enabled !== false,
    createdAt: rule.createdAt ?? now,
    updatedAt: rule.updatedAt ?? now,
  };
}

export function normalizeTabGroupRules(rules: TabGroupRule[] | undefined | null): TabGroupRule[] {
  return (rules || []).map(normalizeTabGroupRule);
}

export function randomTabGroupColor(): TabGroupColor {
  return TAB_GROUP_COLORS[Math.floor(Math.random() * TAB_GROUP_COLORS.length)];
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
