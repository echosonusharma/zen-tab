import { h, Fragment } from "preact";
import { render } from "preact";
import browser from "webextension-polyfill";
import { useEffect, useState, useRef } from "preact/hooks";
import { Store, broadcastMsgToServiceWorker } from "./utils";
import { ExtensionMessage, StoreType, TabData } from "./types";

const defaultFavUrl = browser.runtime.getURL("images/tab.png");

const tabsStore: Store = new Store("tabs", StoreType.LOCAL);
const searchTabStore: Store = new Store("searchTab", StoreType.LOCAL);

browser.runtime.onMessage.addListener(async (message: unknown, _sender: browser.Runtime.MessageSender) => {
  const msg = message as ExtensionMessage;
  console.log(msg);
  if (msg?.action === "closeSearchTab") {
    handleClose();
  }
});

function TabComponent(tab: browser.Tabs.Tab) {
  return (
    <Fragment>
      <img src={tab.favIconUrl || defaultFavUrl} alt="favicon" className="tab-favicon" />
      <span className="tab-title">{tab.title}</span>
    </Fragment>
  );
}

function ContentApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<browser.Tabs.Tab[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<browser.Tabs.Tab[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();

    const fetchTabs = async () => {
      try {
        const tabsData = (await tabsStore.get()) as TabData;
        console.log(tabsData);
        if (!tabsData) {
          return;
        }
        const windowId = (await broadcastMsgToServiceWorker({ action: "getCurrentWindowId" })) as number;
        const windowTabs = tabsData[windowId] || [];
        console.log(windowId);
        setTabs(windowTabs);
        setFilteredTabs(windowTabs);
      } catch (error) {
        console.error("Error fetching tabs:", error);
      }
    };

    fetchTabs();
  }, []);

  useEffect(() => {
    // Filter tabs based on search query
    if (searchQuery.trim() === "") {
      setFilteredTabs(tabs);
    } else {
      const filtered = tabs.filter((tab) => tab.title?.toLowerCase().includes(searchQuery.toLowerCase()));
      setFilteredTabs(filtered);
    }
  }, [searchQuery, tabs]);

  const handleSearch = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setSearchQuery(target.value);
  };

  const handleTabClick = async (tab: browser.Tabs.Tab) => {
    console.log("click", tab);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('Enter pressed');
    }
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
        <ul className="search-results">
          {filteredTabs.map((tab) => (
            <li key={tab.id} onClick={() => handleTabClick(tab)} className="tab-item">
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
  const container = document.querySelector("div[data-zen-tab-container]");
  if (container) {
    container.remove();
  }
}

(async function () {
  const searchTabInjection = (await searchTabStore.get()) as boolean;

  if (!searchTabInjection) {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-zen-tab-container", "true");
  const shadowRoot = container.attachShadow({ mode: "open" });

  const linkElem = document.createElement("link");
  linkElem.setAttribute("rel", "stylesheet");
  linkElem.setAttribute("href", browser.runtime.getURL("styles/content.css"));

  shadowRoot.appendChild(linkElem);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<ContentApp />, contentContainer);
  document.body.appendChild(container);
})();
