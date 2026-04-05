import { h, Fragment } from "preact";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef } from "preact/hooks";
import { broadcastMsgToServiceWorker } from "./utils";
import { SearchableTab } from "./types";

async function getFavicon(iconUrl: string | undefined): Promise<string> {
  if (!iconUrl || iconUrl.startsWith("data:")) return iconUrl || "";

  try {
    const result = await broadcastMsgToServiceWorker({
      action: "fetchFavicon",
      data: { iconUrl }
    });
    return result || iconUrl;
  } catch {
    return iconUrl;
  }
}

function SearchIcon() {
  return (
    <svg
      className="search-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
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

function HistoryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function TabComponent({ tab }: { tab: SearchableTab }) {
  const fallbackIconUrl = browser.runtime.getURL("images/tabaru-icon.svg");
  const [iconUrl, setIconUrl] = useState(fallbackIconUrl);
  const isRecentlyClosed = tab.source === "recent";

  useEffect(() => {
    getFavicon(tab.favIconUrl).then((url) => {
      if (url) {
        setIconUrl(url);
      }
    });
  }, [tab.favIconUrl]);

  return (
    <Fragment>
      <img
        src={iconUrl}
        onError={(e) => {
          if (iconUrl !== fallbackIconUrl) {
            setIconUrl(fallbackIconUrl);
          }
        }}
        alt=""
        className="tab-favicon"
      />
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Other Window</span>
        </div>
      )}
    </Fragment>
  );
}

interface SearchAppProps {
  onClose?: () => void;
}

export function SearchApp({ onClose }: SearchAppProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<SearchableTab[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<SearchableTab[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();

    const fetchTabs = async () => {
      try {
        const tabs = (await broadcastMsgToServiceWorker({ action: "getAllTabs" })) as SearchableTab[];
        setTabs(tabs);
      } catch (error) {
        console.error("Error fetching tabs:", error);
      }
    };

    fetchTabs();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredTabs(tabs);
    } else {
      broadcastMsgToServiceWorker({
        action: "orderTabsBySearchKeyword",
        data: { searchKeyword: searchQuery, tabs },
      })
        .then((res) => setFilteredTabs(res as SearchableTab[]))
        .catch((e) => console.error("Search error:", e));
    }
    setSelectedIndex(0);
  }, [searchQuery, tabs]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && filteredTabs.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex, filteredTabs]);

  const handleSearch = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setSearchQuery(target.value);
    e.stopPropagation();
  };

  const handleTabClick = (tab: SearchableTab) => {
    if (onClose) onClose();

    if (tab.source === "recent") {
      broadcastMsgToServiceWorker({
        action: "restoreRecentlyClosed",
        data: { sessionId: tab.sessionId },
      }).catch(console.error);
      return;
    }

    const tabId = tab.id as number;
    const windowId = tab.windowId;
    broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId, windowId } }).catch(console.error);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        if (onClose) onClose();
        return;

      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredTabs.length - 1));
        break;

      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;

      case "Enter":
        if (filteredTabs.length > 0) {
          const selectedTab = filteredTabs[selectedIndex];
          if (selectedTab) {
            handleTabClick(selectedTab);
          }
        }
        break;
    }

    e.stopPropagation();
  };

  return (
    <div id="tabaru-content">
      <div className="header">
        <SearchIcon />
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder="Search tabs..."
          value={searchQuery}
          onInput={handleSearch}
          onKeyDown={handleKeyDown}
        />
        <button className="close-button" onClick={() => onClose && onClose()}>
          ×
        </button>
      </div>

      {filteredTabs.length > 0 ? (
        <Fragment>
          <div className="tab-count">
            {filteredTabs.length} result{filteredTabs.length !== 1 ? "s" : ""}
          </div>
          <ul className="search-results" ref={resultsRef}>
            {filteredTabs.map((tab, index) => (
              <li
                key={tab.resultId}
                onClick={() => handleTabClick(tab)}
                className={[
                  "tab-item",
                  index === selectedIndex ? "selected" : "",
                  tab.source === "open" && tab.active ? "active-tab" : "",
                  tab.source === "recent" ? "recent-tab" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <TabComponent tab={tab} />
              </li>
            ))}
          </ul>
        </Fragment>
      ) : (
        <div className="no-results">No matching tabs found</div>
      )}

      <div className="keyboard-hint">
        <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  );
}
