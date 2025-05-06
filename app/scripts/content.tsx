import { h, Fragment } from "preact";
import { render } from "preact";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef } from "preact/hooks";
import { Store, broadcastMsgToServiceWorker, logger } from "./utils";
import { ExtensionMessage, StoreType } from "./types";
import { generateKeywordsForTabs, evaluateSearch } from "./search";

var mainContainerSelector = "div[data-zen-tab-container]";

function TabComponent(tab: browser.Tabs.Tab) {
  const defaultFavUrl = browser.runtime.getURL("images/tab.png");
  let imgUrl = defaultFavUrl;

  if (tab.favIconUrl) {
    try {
      const favURL = new URL(tab.favIconUrl);
      const invalidProtocols = ["chrome:", "about:"];
      const isInvalid = invalidProtocols.includes(favURL.protocol) || ["localhost"].includes(favURL.hostname);
      if (!isInvalid) {
        imgUrl = tab.favIconUrl;
      }
    } catch (e) {
      logger("Invalid URL format, fallback to default");
      imgUrl = defaultFavUrl;
    }
  } else {
    imgUrl = tab.favIconUrl as string;
  }

  return (
    <Fragment>
      <img src={imgUrl || defaultFavUrl} alt="favicon" className="tab-favicon" />
      <span className="tab-title">{tab.title}</span>
    </Fragment>
  );
}

function ContentApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<browser.Tabs.Tab[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<browser.Tabs.Tab[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();

    const fetchTabs = async () => {
      try {
        const tabs = (await broadcastMsgToServiceWorker({ action: "getCurrentWindowTabs" })) as browser.Tabs.Tab[];
        setTabs(tabs);
        generateKeywordsForTabs(tabs);
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
      const sortedBySearchTabs = evaluateSearch(searchQuery);
      setFilteredTabs(sortedBySearchTabs);
    }
    // Reset selected index when filtered results change
    setSelectedIndex(0);
  }, [searchQuery, tabs]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && filteredTabs.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredTabs]);

  const handleSearch = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setSearchQuery(target.value);
    e.stopPropagation();
  };

  const handleTabClick = async (tab: browser.Tabs.Tab) => {
    const tabId = tab.id as number;
    await broadcastMsgToServiceWorker({ action: "switchToTab", data: { tabId } });
    handleClose();
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (filteredTabs.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredTabs.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        const selectedTab = filteredTabs[selectedIndex];
        if (selectedTab) {
          await handleTabClick(selectedTab);
        }
        break;
    }

    e.stopPropagation();
  };

  return (
    <div id="zen-tab-content">
      <div className="header">
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder="Search Tabs"
          value={searchQuery}
          onInput={handleSearch}
          onKeyDown={handleKeyDown}
        />
        <button className="close-button" onClick={handleClose}>
          ×
        </button>
      </div>
      {filteredTabs.length > 0 ? (
        <ul className="search-results" ref={resultsRef}>
          {filteredTabs.map((tab, index) => (
            <li
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`tab-item ${index === selectedIndex ? "selected" : ""}`}
            >
              {TabComponent(tab)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="no-results">No tabs found</div>
      )}
    </div>
  );
}

function handleClose() {
  const container = document.querySelector(mainContainerSelector);
  if (container) {
    container.remove();
  }
}

(async function () {
  const zenContainer = document.querySelector(mainContainerSelector);
  if (zenContainer) {
    return;
  }

  const searchTabStore: Store = new Store("searchTab", StoreType.LOCAL);

  browser.runtime.onMessage.addListener(async (message: unknown, _sender: browser.Runtime.MessageSender) => {
    const msg = message as ExtensionMessage;
    if (msg?.action === "closeSearchTab") {
      handleClose();
    }
  });

  // auto close when not visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      handleClose();
    }
  });

  const searchTabInjection = (await searchTabStore.get()) as boolean;
  if (!searchTabInjection) {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-zen-tab-container", "true");
  const shadowRoot = container.attachShadow({ mode: "open" });

  // meh~
  const style = document.createElement("style");
  style.textContent = `
    #zen-tab-content {
      width: 600px !important;
      height: 400px !important;
      background: #1e1e1e !important;
      padding: 30px !important;
      border-radius: 12px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: center !important;
      z-index: 9999999999 !important;
      color: #f5f5f5 !important;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
      box-sizing: border-box !important;
    }

    #zen-tab-content .header {
      width: 95% !important;
      display: flex !important;
      align-items: center !important;
      margin-bottom: 20px !important;
      position: relative !important;
      box-sizing: border-box !important;
    }

    #zen-tab-content .search-input {
      width: 100% !important;
      padding: 15px 20px !important;
      font-size: 16px !important;
      border: none !important;
      border-radius: 8px !important;
      outline: none !important;
      background: #2d2d2d !important;
      color: #f5f5f5 !important;
      transition: all 0.3s ease !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important;
      box-sizing: border-box !important;
    }

    #zen-tab-content .close-button {
      position: absolute !important;
      right: 10px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      background: none !important;
      border: none !important;
      color: #888 !important;
      font-size: 24px !important;
      cursor: pointer !important;
      width: 30px !important;
      height: 30px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 50% !important;
      transition: all 0.2s ease !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    #zen-tab-content .close-button:hover {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #f5f5f5 !important;
    }

    #zen-tab-content .search-input:focus {
      background: #3a3a3a !important;
      box-shadow: 0 0 0 2px #a89f1e !important;
    }

    #zen-tab-content .search-input::placeholder {
      color: #888 !important;
    }

    #zen-tab-content .search-results {
      width: 95% !important;
      padding: 0 !important;
      margin: 0 !important;
      list-style: none !important;
      max-height: 300px !important;
      overflow-y: auto !important;
      background: #2d2d2d !important;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2) !important;
      box-sizing: border-box !important;
    }

    #zen-tab-content .search-results::-webkit-scrollbar {
      width: 8px !important;
    }

    #zen-tab-content .search-results::-webkit-scrollbar-track {
      background: #2d2d2d !important;
      border-radius: 4px !important;
    }

    #zen-tab-content .search-results::-webkit-scrollbar-thumb {
      background: #4a4a4a !important;
      border-radius: 4px !important;
    }

    #zen-tab-content .search-results::-webkit-scrollbar-thumb:hover {
      background: #5a5a5a !important;
    }

    #zen-tab-content .search-results li {
      padding: 15px 20px !important;
      border-bottom: 1px solid #3a3a3a !important;
      cursor: pointer !important;
      transition: background-color 0.2s ease !important;
      color: #f5f5f5 !important;
      display: flex !important;
      align-items: center !important;
      margin: 0 !important;
      background: transparent !important;
    }

    #zen-tab-content .search-results li:last-child {
      border-bottom: none !important;
    }

    #zen-tab-content .search-results li:hover {
      background-color: #4a4a4a !important;
    }

    #zen-tab-content .search-results li.selected {
      background-color: #4a4a4a !important;
    }

    #zen-tab-content .search-results li:hover {
      background-color: #3a3a3a !important;
    }

    #zen-tab-content .tab-favicon {
      width: 16px !important;
      height: 16px !important;
      margin-right: 12px !important;
      object-fit: contain !important;
    }

    #zen-tab-content .tab-title {
      flex: 1 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      font-size: 14px !important;
      line-height: 1.4 !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    #zen-tab-content .no-results {
      text-align: center !important;
      color: #888 !important;
      padding: 20px !important;
      font-size: 14px !important;
      margin: 0 !important;
    }

  `;
  shadowRoot.appendChild(style);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<ContentApp />, contentContainer);
  document.body.appendChild(container);
})();
