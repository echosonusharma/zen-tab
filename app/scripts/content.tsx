import { h, Fragment } from "preact";
import { render } from "preact";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef } from "preact/hooks";
import { broadcastMsgToServiceWorker, Store } from "./utils";
import { ExtensionMessage, StoreType, TabInfo } from "./types";
import { getFavicon } from "./favicon-cache";

// Wrap everything in an IIFE to prevent "already declared" errors
// when the content script is re-injected on each shortcut press.
(async function () {
  const CONTAINER_SELECTOR = "div[data-zen-tab-container]";

  // Components

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
    const [iconUrl, setIconUrl] = useState(tab.favIconUrl || browser.runtime.getURL("images/zentab-icon.svg"));

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
            if (iconUrl !== browser.runtime.getURL("images/zentab-icon.svg")) {
              setIconUrl(browser.runtime.getURL("images/zentab-icon.svg"));
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

  function ContentApp() {
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

    const handleTabClick = async (tab: TabInfo) => {
      const tabId = tab.id as number;
      await broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId } });
      handleClose();
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          handleClose();
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
              await handleTabClick(selectedTab);
            }
          }
          break;
      }

      e.stopPropagation();
    };

    return (
      <div id="zen-tab-content">
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
          <button className="close-button" onClick={handleClose}>
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

  // Lifecycle Handlers

  function visibilityListener() {
    if (document.visibilityState !== "visible") {
      handleClose();
    }
  }

  function messageListener(message: unknown, _sender: browser.Runtime.MessageSender) {
    const msg = message as ExtensionMessage;
    if (msg?.action === "closeSearchTab") {
      handleClose();
    }
  }

  function globalKeyCaptureListener(e: KeyboardEvent) {
    const currentContainer = document.querySelector(CONTAINER_SELECTOR);
    if (!currentContainer) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleClose();
      return;
    }

    const isFromContainer = e.composedPath().includes(currentContainer);
    if (!isFromContainer) {
      e.stopPropagation();
    }
  }

  function handleClose() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container) {
      document.removeEventListener("visibilitychange", visibilityListener);
      browser.runtime.onMessage.removeListener(messageListener);
      window.removeEventListener("keydown", globalKeyCaptureListener, true);
      window.removeEventListener("keyup", globalKeyCaptureListener, true);
      window.removeEventListener("keypress", globalKeyCaptureListener, true);
      container.remove();
    }
  }

  // Entry Point

  browser.runtime.onMessage.addListener(messageListener);
  document.addEventListener("visibilitychange", visibilityListener);
  window.addEventListener("keydown", globalKeyCaptureListener, true);
  window.addEventListener("keyup", globalKeyCaptureListener, true);
  window.addEventListener("keypress", globalKeyCaptureListener, true);

  const existingContainer = document.querySelector(CONTAINER_SELECTOR);
  if (existingContainer) {
    handleClose();
    return;
  }

  const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
  const searchTabEnabled = (await searchTabStore.get()) as boolean;
  if (!searchTabEnabled) {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-zen-tab-container", "true");

  // Prevent keyboard events originating from inside the container from bubbling out to the host document
  const stopBubbling = (e: Event) => e.stopPropagation();
  container.addEventListener("keydown", stopBubbling);
  container.addEventListener("keyup", stopBubbling);
  container.addEventListener("keypress", stopBubbling);

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Load styles from external CSS file and wait for it
  const cssUrl = browser.runtime.getURL("styles/content.css");

  try {
    const response = await fetch(cssUrl);
    const cssText = await response.text();
    const styleTag = document.createElement("style");
    styleTag.textContent = cssText;
    shadowRoot.appendChild(styleTag);
  } catch (err) {
    console.error("Failed to load ZenTab CSS", err);
  }

  // Add backdrop for click-outside-to-close
  const backdrop = document.createElement("div");
  backdrop.className = "zen-tab-backdrop";
  backdrop.addEventListener("click", handleClose);
  shadowRoot.appendChild(backdrop);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<ContentApp />, contentContainer);
  document.body.appendChild(container);
})();
