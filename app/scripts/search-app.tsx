import { h, Fragment } from "preact";
import type * as preact from "preact";
import { memo } from "preact/compat";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef, useMemo } from "preact/hooks";
import { broadcastMsgToServiceWorker, looksLikeDomain } from "./utils";
import { SearchableTab, CommandDefinition, BookmarkItem } from "./types";
import { SearchIcon, CommandIcon, HistoryIcon, WindowIcon } from "./icons";

// command prefix will be ! and second char is the type of command
// commands can only be 2 chars
const COMMAND_PREFIX = "!";

const COMMANDS: CommandDefinition[] = [
  {
    key: "s",
    label: "Search",
    description: "Search the web or navigate to a domain",
    execute: (keyword: string) => {
      broadcastMsgToServiceWorker({
        action: "executeCommand",
        data: { commandKey: "s", keyword },
      }).catch(console.error);
    },
  },
  {
    key: "b",
    label: "Bookmarks",
    description: "Search through your bookmarks",
    execute: () => {
      // Bookmark selection is handled directly by the UI (not by a keyword execute)
    },
  },
];

const COMMAND_MAP = new Map<string, CommandDefinition>(
  COMMANDS.map((cmd) => [cmd.key, cmd])
);

const faviconCache = new Map<string, string>();
const faviconInFlight = new Map<string, Promise<string>>();

async function getFavicon(iconUrl: string | undefined): Promise<string> {
  if (!iconUrl || iconUrl.startsWith("data:")) return iconUrl || "";
  const cached = faviconCache.get(iconUrl);
  if (cached !== undefined) return cached;
  const pending = faviconInFlight.get(iconUrl);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const result = await broadcastMsgToServiceWorker({
        action: "fetchFavicon",
        data: { iconUrl }
      });
      const resolved = (result as string) || iconUrl;
      faviconCache.set(iconUrl, resolved);
      return resolved;
    } catch {
      faviconCache.set(iconUrl, iconUrl);
      return iconUrl;
    } finally {
      faviconInFlight.delete(iconUrl);
    }
  })();
  faviconInFlight.set(iconUrl, promise);
  return promise;
}

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function FaviconImg({ favIconUrl, className = "tab-favicon" }: { favIconUrl?: string; className?: string }) {
  const fallbackIconUrl = browser.runtime.getURL("images/tabaru-icon.svg");
  const cachedIcon = favIconUrl ? faviconCache.get(favIconUrl) : undefined;
  const [iconUrl, setIconUrl] = useState(cachedIcon ?? fallbackIconUrl);

  useEffect(() => {
    if (!favIconUrl) {
      setIconUrl(fallbackIconUrl);
      return;
    }
    const cached = faviconCache.get(favIconUrl);
    if (cached !== undefined) {
      setIconUrl(cached);
      return;
    }
    let cancelled = false;
    getFavicon(favIconUrl).then((url) => {
      if (!cancelled && url) setIconUrl(url);
    });
    return () => { cancelled = true; };
  }, [favIconUrl]);

  return (
    <img
      src={iconUrl}
      onError={() => iconUrl !== fallbackIconUrl && setIconUrl(fallbackIconUrl)}
      alt=""
      className={className}
    />
  );
}

const TabComponent = memo(function TabComponent({ tab }: { tab: SearchableTab }) {
  const isRecentlyClosed = tab.source === "recent";

  return (
    <Fragment>
      <FaviconImg favIconUrl={tab.favIconUrl} />
      <div className="tab-info">
        <span className="tab-title">{tab.title}</span>
        <span className="tab-url">{extractDomain(tab.url)}</span>
      </div>
      {isRecentlyClosed && (
        <div className="history-badge" title="Recently closed tab">
          <HistoryIcon />
          <span>Recently Closed</span>
        </div>
      )}
      {tab.source === "open" && !tab.inCurrentWindow && (
        <div className="window-badge" title="In another window">
          <WindowIcon />
          <span>Other Window</span>
        </div>
      )}
    </Fragment>
  );
});

function KeyboardHints({ mode }: { mode: "command" | "suggest" | "normal" }) {
  return (
    <div className="keyboard-hint">
      {mode === "command" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> history</span>
          <span><kbd>↵</kbd> execute</span>
          <span><kbd>esc</kbd> close</span>
        </Fragment>
      )}
      {mode === "suggest" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> pick command</span>
          <span><kbd>space</kbd> or <kbd>↵</kbd> select</span>
        </Fragment>
      )}
      {mode === "normal" && (
        <Fragment>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span><kbd>!</kbd> commands</span>
        </Fragment>
      )}
    </div>
  );
}

function useSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<SearchableTab[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<SearchableTab[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [bookmarkResults, setBookmarkResults] = useState<BookmarkItem[]>([]);

  const activeCommand = useMemo(() => {
    const sq = searchQuery.trim();
    if (!sq.startsWith(COMMAND_PREFIX)) {
      return null;
    }

    if (sq.length < 3) {
      return null;
    }

    const cmdChar = sq[1];
    if (sq[2] !== " ") {
      return null;
    }

    const cmd = COMMAND_MAP.get(cmdChar);
    if (cmd) {
      return { command: cmd, keyword: sq.slice(3) };
    }

    return null;
  }, [searchQuery]);

  const isCommandMode = activeCommand !== null;
  const isBookmarkMode = activeCommand?.command.key === "b";
  const isSuggestingCommands = !isCommandMode && searchQuery.startsWith(COMMAND_PREFIX);

  const commandSuggestions = useMemo(() => {
    if (!isSuggestingCommands) {
      return [];
    }

    const filter = searchQuery.trim().slice(1).toLowerCase();
    return COMMANDS.filter(c => c.key.startsWith(filter) || c.label.toLowerCase().includes(filter));
  }, [isSuggestingCommands, searchQuery]);

  useEffect(() => {
    broadcastMsgToServiceWorker({ action: "getAllTabs" })
      .then((res) => setTabs(res as SearchableTab[]))
      .catch((e) => console.error("Error fetching tabs:", e));
  }, []);

  useEffect(() => {
    if (isCommandMode || isSuggestingCommands) {
      setFilteredTabs([]);
      setSelectedIndex(isBookmarkMode ? 0 : isCommandMode ? -1 : 0);
      return;
    }

    if (searchQuery.trim() === "") {
      setFilteredTabs(tabs);
      setSelectedIndex(0);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      broadcastMsgToServiceWorker({
        action: "orderTabsBySearchKeyword",
        data: { searchKeyword: searchQuery, tabs },
      })
        .then((res) => { if (!cancelled) setFilteredTabs(res as SearchableTab[]); })
        .catch((e) => console.error("Search error:", e));
    }, 50);
    setSelectedIndex(0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchQuery, tabs, isCommandMode, isSuggestingCommands, isBookmarkMode]);

  useEffect(() => {
    if (!activeCommand || activeCommand.command.key === "b") {
      setRecentCommands([]);
      return;
    }
    broadcastMsgToServiceWorker({
      action: "getRecentCommands",
      data: { commandKey: activeCommand.command.key },
    })
      .then((res) => setRecentCommands((res as string[]) ?? []))
      .catch(() => setRecentCommands([]));
  }, [activeCommand?.command.key]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isBookmarkMode) {
      setBookmarkResults([]);
      return;
    }

    let cancelled = false;
    const keyword = activeCommand?.keyword ?? "";
    const handle = setTimeout(() => {
      broadcastMsgToServiceWorker({
        action: "searchBookmarks",
        data: { searchKeyword: keyword },
      })
        .then((res) => { if (!cancelled) setBookmarkResults(groupBookmarksByFolder((res as BookmarkItem[]) ?? [])); })
        .catch(() => { if (!cancelled) setBookmarkResults([]); });
    }, 50);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [isBookmarkMode, activeCommand?.keyword]);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    searchQuery, setSearchQuery,
    tabs, filteredTabs,
    selectedIndex, setSelectedIndex,
    activeCommand, isCommandMode,
    isBookmarkMode,
    isSuggestingCommands, commandSuggestions,
    recentCommands,
    bookmarkResults,
  };
}

function CommandModeBody({
  activeCommand,
  recentCommands,
  selectedIndex,
  resultsRef,
  onSelectRecent,
}: {
  activeCommand: { command: CommandDefinition; keyword: string };
  recentCommands: string[];
  selectedIndex: number;
  resultsRef: preact.RefObject<HTMLUListElement>;
  onSelectRecent: (keyword: string) => void;
}) {
  const keyword = activeCommand.keyword.trim();
  const hasContent = keyword || recentCommands.length > 0;

  if (!hasContent) {
    return (
      <div className="command-panel">
        <div className="command-panel-icon"><CommandIcon /></div>
        <div className="command-panel-info">
          <span className="command-panel-desc">{activeCommand.command.description}</span>
        </div>
        <span className="command-panel-hint">Type a keyword to continue</span>
      </div>
    );
  }

  return (
    <Fragment>
      {keyword && (
        <div className={`command-preview${selectedIndex >= 0 ? " command-preview-dimmed" : ""}`}>
          <div className="command-panel-icon"><CommandIcon /></div>
          <div className="command-preview-text">
            <span className="command-preview-action">
              {looksLikeDomain(keyword) ? "Navigate to" : "Search the web for"}
            </span>
            <span className="command-preview-keyword">{keyword}</span>
          </div>
          <kbd className="command-preview-enter">↵</kbd>
        </div>
      )}
      {recentCommands.length > 0 && (
        <Fragment>
          <div className="tab-count">Recent</div>
          <ul className="search-results" ref={resultsRef}>
            {recentCommands.map((kw, index) => (
              <li
                key={kw}
                onClick={() => onSelectRecent(kw)}
                className={`tab-item${index === selectedIndex ? " selected" : ""}`}
              >
                <div className="command-recent-icon"><HistoryIcon /></div>
                <div className="tab-info">
                  <span className="tab-title">{kw}</span>
                </div>
              </li>
            ))}
          </ul>
        </Fragment>
      )}
    </Fragment>
  );
}

const FOLDER_HUES = [8, 42, 82, 140, 190, 215, 260, 310, 340];

function hueForFolder(parentId: string | undefined): number {
  if (!parentId) return FOLDER_HUES[0];
  let hash = 0;
  for (let i = 0; i < parentId.length; i++) {
    hash = (hash * 31 + parentId.charCodeAt(i)) | 0;
  }
  return FOLDER_HUES[Math.abs(hash) % FOLDER_HUES.length];
}

function groupBookmarksByFolder(bookmarks: BookmarkItem[]): BookmarkItem[] {
  const groups = new Map<string, BookmarkItem[]>();
  for (const bm of bookmarks) {
    const key = bm.parentId ?? "__none__";
    const bucket = groups.get(key);
    if (bucket) bucket.push(bm);
    else groups.set(key, [bm]);
  }
  const result: BookmarkItem[] = [];
  for (const bucket of groups.values()) result.push(...bucket);
  return result;
}

function BookmarkModeBody({
  bookmarks,
  selectedIndex,
  resultsRef,
  onSelect,
}: {
  bookmarks: BookmarkItem[];
  selectedIndex: number;
  resultsRef: preact.RefObject<HTMLUListElement>;
  onSelect: (bookmark: BookmarkItem) => void;
}) {
  if (bookmarks.length === 0) {
    return <div className="no-results">No matching bookmarks found</div>;
  }

  const rows: Array<
    | { kind: "header"; key: string; title: string; hue: number; count: number }
    | { kind: "item"; key: string; bookmark: BookmarkItem; hue: number }
  > = [];
  let i = 0;
  while (i < bookmarks.length) {
    const first = bookmarks[i];
    const parentKey = first.parentId ?? "__none__";
    const hue = hueForFolder(first.parentId);
    let end = i + 1;
    while (end < bookmarks.length && (bookmarks[end].parentId ?? "__none__") === parentKey) end++;
    rows.push({
      kind: "header",
      key: `h:${parentKey}:${i}`,
      title: first.parentTitle || "Bookmarks",
      hue,
      count: end - i,
    });
    for (let j = i; j < end; j++) {
      rows.push({ kind: "item", key: bookmarks[j].id, bookmark: bookmarks[j], hue });
    }
    i = end;
  }

  return (
    <Fragment>
      <div className="tab-count">
        {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
      </div>
      <ul className="search-results bookmark-list" ref={resultsRef}>
        {(() => {
          let itemIndex = -1;
          return rows.map((row) => {
            if (row.kind === "header") {
              return (
                <li
                  key={row.key}
                  className="bookmark-folder-header"
                  style={{ "--folder-hue": row.hue } as preact.JSX.CSSProperties}
                >
                  <span className="bookmark-folder-dot" />
                  <span className="bookmark-folder-name">{row.title}</span>
                  <span className="bookmark-folder-count">{row.count}</span>
                </li>
              );
            }
            itemIndex++;
            const isSelected = itemIndex === selectedIndex;
            return (
              <li
                key={row.key}
                onClick={() => onSelect(row.bookmark)}
                className={`tab-item bookmark-item${isSelected ? " selected" : ""}`}
                style={{ "--folder-hue": row.hue } as preact.JSX.CSSProperties}
              >
                <FaviconImg favIconUrl={row.bookmark.favIconUrl} />
                <div className="tab-info">
                  <span className="tab-title">{row.bookmark.title || row.bookmark.url}</span>
                  <span className="tab-url">{extractDomain(row.bookmark.url)}</span>
                </div>
              </li>
            );
          });
        })()}
      </ul>
    </Fragment>
  );
}

export function SearchApp({ onClose }: { onClose?: () => void }) {
  const {
    searchQuery, setSearchQuery,
    filteredTabs,
    selectedIndex, setSelectedIndex,
    activeCommand, isCommandMode,
    isBookmarkMode,
    isSuggestingCommands, commandSuggestions,
    recentCommands,
    bookmarkResults,
  } = useSearch();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => searchInputRef.current?.focus(), []);

  useEffect(() => {
    if (!resultsRef.current) return;
    if (isBookmarkMode) {
      if (bookmarkResults.length > 0 && selectedIndex >= 0) {
        const el = resultsRef.current.querySelectorAll<HTMLElement>(".bookmark-item")[selectedIndex];
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else if (isCommandMode && selectedIndex >= 0) {
      const el = resultsRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (!isCommandMode) {
      const totalItems = isSuggestingCommands ? commandSuggestions.length : filteredTabs.length;
      if (totalItems > 0) {
        const el = resultsRef.current.children[selectedIndex] as HTMLElement;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredTabs.length, commandSuggestions.length, bookmarkResults.length, isSuggestingCommands, isCommandMode, isBookmarkMode]);

  const selectCommand = (cmd: CommandDefinition) => {
    setSearchQuery(`${COMMAND_PREFIX}${cmd.key} `);
    setSelectedIndex(0);
  };

  const selectRecentQuery = (keyword: string) => {
    setSearchQuery(`${COMMAND_PREFIX}${activeCommand!.command.key} ${keyword}`);
  };

  const executeCommand = (cmdKey: string, keyword: string) => {
    broadcastMsgToServiceWorker({
      action: "recordCommand",
      data: { commandKey: cmdKey, keyword },
    }).catch(console.error);
    activeCommand!.command.execute(keyword);
    if (onClose) onClose();
  };

  const openBookmark = (bookmark: BookmarkItem) => {
    broadcastMsgToServiceWorker({
      action: "openBookmark",
      data: { url: bookmark.url },
    }).catch(console.error);
    if (onClose) onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const maxIndex = isBookmarkMode
      ? bookmarkResults.length - 1
      : isCommandMode
      ? recentCommands.length - 1
      : isSuggestingCommands
      ? commandSuggestions.length - 1
      : filteredTabs.length - 1;

    switch (e.key) {
      case "Escape":
        if (onClose) onClose();
        return;
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, isCommandMode && !isBookmarkMode ? -1 : 0));
        break;
      case "Enter":
        if (isBookmarkMode) {
          const bookmark = bookmarkResults[selectedIndex];
          if (bookmark) openBookmark(bookmark);
        } else if (isCommandMode) {
          if (selectedIndex >= 0 && recentCommands[selectedIndex]) {
            executeCommand(activeCommand!.command.key, recentCommands[selectedIndex]);
          } else {
            const keyword = activeCommand!.keyword.trim();
            if (keyword) executeCommand(activeCommand!.command.key, keyword);
          }
        } else if (isSuggestingCommands) {
          if (commandSuggestions.length > 0) selectCommand(commandSuggestions[selectedIndex]);
        } else if (filteredTabs[selectedIndex]) {
          const tab = filteredTabs[selectedIndex];
          if (onClose) onClose();
          if (tab.source === "recent") {
            broadcastMsgToServiceWorker({ action: "restoreRecentlyClosed", data: { sessionId: tab.sessionId } });
          } else {
            broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId: tab.id!, windowId: tab.windowId } });
          }
        }
        break;
      case " ":
        if (isSuggestingCommands && commandSuggestions.length > 0) {
          e.preventDefault();
          selectCommand(commandSuggestions[selectedIndex]);
        }
        break;
    }
    e.stopPropagation();
  };

  const mode = isCommandMode ? "command" : isSuggestingCommands ? "suggest" : "normal";

  return (
    <div id="tabaru-content">
      <div className="header">
        {isCommandMode ? <CommandIcon className="search-icon" /> : <SearchIcon className="search-icon" />}
        <input
          ref={searchInputRef}
          type="text"
          className={`search-input${isCommandMode ? " command-active" : ""}`}
          placeholder="Search tabs, or type ! for commands..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
        />
        <button className="close-button" onClick={() => onClose && onClose()}>×</button>
      </div>

      <div className="body">
        {isBookmarkMode ? (
          <BookmarkModeBody
            bookmarks={bookmarkResults}
            selectedIndex={selectedIndex}
            resultsRef={resultsRef}
            onSelect={openBookmark}
          />
        ) : isCommandMode ? (
          <CommandModeBody
            activeCommand={activeCommand!}
            recentCommands={recentCommands}
            selectedIndex={selectedIndex}
            resultsRef={resultsRef}
            onSelectRecent={selectRecentQuery}
          />
        ) : isSuggestingCommands ? (
          <Fragment>
            <div className="tab-count">Available Commands</div>
            <ul className="search-results" ref={resultsRef}>
              {commandSuggestions.map((cmd, index) => (
                <li
                  key={cmd.key}
                  onClick={() => selectCommand(cmd)}
                  className={`tab-item command-suggestion-item ${index === selectedIndex ? "selected" : ""}`}
                >
                  <div className="command-panel-icon" style={{ marginRight: '8px', background: 'rgba(168, 130, 255, 0.15)', color: 'rgba(168, 130, 255, 0.9)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CommandIcon />
                  </div>
                  <div className="tab-info">
                    <span className="tab-url">{cmd.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Fragment>
        ) : (
          <Fragment>
            {filteredTabs.length > 0 ? (
              <Fragment>
                <div className="tab-count">
                  {filteredTabs.length} result{filteredTabs.length !== 1 ? "s" : ""}
                </div>
                <ul className="search-results" ref={resultsRef}>
                  {filteredTabs.map((tab, index) => (
                    <li
                      key={tab.resultId}
                      onClick={() => {
                        if (onClose) onClose();
                        if (tab.source === "recent") {
                          broadcastMsgToServiceWorker({ action: "restoreRecentlyClosed", data: { sessionId: tab.sessionId } });
                        } else {
                          broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId: tab.id!, windowId: tab.windowId } });
                        }
                      }}
                      className={[
                        "tab-item",
                        index === selectedIndex ? "selected" : "",
                        tab.source === "open" && tab.active ? "active-tab" : "",
                        tab.source === "recent" ? "recent-tab" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <TabComponent tab={tab} />
                    </li>
                  ))}
                </ul>
              </Fragment>
            ) : (
              <div className="no-results">No matching tabs found</div>
            )}
          </Fragment>
        )}
      </div>

      <KeyboardHints mode={mode} />
    </div>
  );
}
