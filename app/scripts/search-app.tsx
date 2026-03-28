import { h, Fragment } from "preact";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef } from "preact/hooks";
import { broadcastMsgToServiceWorker } from "./utils";
import { TabInfo } from "./types";

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

function TabComponent({ tab, isActive }: { tab: TabInfo; isActive: boolean }) {
  const [iconUrl, setIconUrl] = useState(tab.favIconUrl || browser.runtime.getURL("images/tabaru-icon.svg"));

  useEffect(() => {
    getFavicon(tab.favIconUrl).then((url) => {
      if (url) setIconUrl(url);
    });
  }, [tab.favIconUrl]);

  return (
    <Fragment>
      <img
        src={iconUrl}
        onError={(e) => {
          if (iconUrl !== browser.runtime.getURL("images/tabaru-icon.svg")) {
            setIconUrl(browser.runtime.getURL("images/tabaru-icon.svg"));
          }
        }}
        alt=""
        className="tab-favicon"
      />
      <div className="tab-info">
        <span className="tab-title">{tab.title}</span>
        <span className="tab-url">{extractDomain(tab.url)}</span>
      </div>
    </Fragment>
  );
}

interface SearchAppProps {
  onClose?: () => void;
}

export function SearchApp({ onClose }: SearchAppProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<TabInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();

    const fetchTabs = async () => {
      try {
        const tabs = (await broadcastMsgToServiceWorker({ action: "getCurrentWindowTabs" })) as TabInfo[];
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
        .then((res) => setFilteredTabs(res as TabInfo[]))
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

  const handleTabClick = (tab: TabInfo) => {
    const tabId = tab.id as number;
    if (onClose) onClose();
    broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId } }).catch(console.error);
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
            {filteredTabs.length} tab{filteredTabs.length !== 1 ? "s" : ""}
          </div>
          <ul className="search-results" ref={resultsRef}>
            {filteredTabs.map((tab, index) => (
              <li
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={[
                  "tab-item",
                  index === selectedIndex ? "selected" : "",
                  tab.active ? "active-tab" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <TabComponent tab={tab} isActive={!!tab.active} />
              </li>
            ))}
          </ul>
        </Fragment>
      ) : (
        <div className="no-results">No tabs found</div>
      )}

      <div className="keyboard-hint">
        <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  );
}
