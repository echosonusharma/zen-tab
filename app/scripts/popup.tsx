import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { Store, openShortcutSettings } from "./utils";
import { StoreType } from './types';
import '../styles/popup.css';
import '../styles/content.css';
import { SearchApp } from "./search-app";

const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
const searchFallbackStore: Store<number> = new Store("searchFallback", StoreType.SESSION);
const FALLBACK_TIMEOUT = 2500;

function Popup() {
  const [searchTab, setSearchTab] = useState(false);
  const [shortcuts, setShortcuts] = useState<browser.Commands.Command[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const setData = async () => {
      try {
        const fallbackTimestamp = await searchFallbackStore.get() as number;
        if (fallbackTimestamp && Date.now() - fallbackTimestamp < FALLBACK_TIMEOUT) {
          setIsSearchMode(true);
          document.body.style.width = '560px';
          document.body.style.minHeight = '145px';

          const style = document.createElement('style');
          style.innerText = `
            html, body {
              box-sizing: border-box !important;
              height: fit-content !important;
              margin: 0 !important;
            }
            body {
              overflow: hidden !important;
              padding: 0 !important;
            }
            #zen-tab-content {
              border: none !important;
              position: relative !important;
              top: 0 !important;
              left: 0 !important;
              transform: none !important;
              height: auto !important;
              min-height: 100% !important;
              max-height: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              width: 100% !important;
            }
          `;
          document.head.appendChild(style);

          await searchFallbackStore.set(0);
          return;
        }

        const currSearchTabVal = await searchTabStore.get() as boolean;
        setSearchTab(currSearchTabVal);

        const cmds = await browser.commands.getAll();
        setShortcuts(cmds.filter(c => c.name && c.name !== '_execute_action' && c.name !== '_execute_browser_action'));
      } catch (error) {
        console.error("Popup setup failed", error);
      } finally {
        setIsLoading(false);
      }
    };

    setData();
  }, []);

  useEffect(() => {
    if (!isSearchMode) return;
    
    const port = browser.runtime.connect({ name: "popupSearchMode" });

    const handleCommand = (command: string) => {
      if (command === "open_and_close_search") {
        window.close();
      }
    };

    browser.commands.onCommand.addListener(handleCommand);

    return () => {
      port.disconnect();
      browser.commands.onCommand.removeListener(handleCommand);
    };
  }, [isSearchMode]);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked;
    setSearchTab(newValue);
    await searchTabStore.set(newValue);
  };

  const hasMissingShortcuts = shortcuts.some(s => !s.shortcut);

  if (isLoading) {
    return null;
  }

  if (isSearchMode) {
    return <SearchApp onClose={() => window.close()} />;
  }

  return (
    <div class="app">
      <div class="toggle-container">
        <div class="toggle-wrapper">
          <span class="toggle-label">Search Tab</span>
          <label class="toggle">
            <input
              type="checkbox"
              checked={searchTab}
              onChange={handleSearchTabChange}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="shortcuts-section">
        <span class="section-title">Shortcuts</span>
        <ul class="shortcuts-list">
          {shortcuts.map((s) => (
            <li key={s.name}>
              <span class="shortcut-label">{s.description || s.name}</span>
              <kbd class={s.shortcut ? "shortcut-key" : "shortcut-key missing"}>
                {s.shortcut || "Unassigned"}
              </kbd>
            </li>
          ))}
        </ul>
        <button class={hasMissingShortcuts ? "shortcut-hint error" : "shortcut-hint"} onClick={openShortcutSettings}>
          {hasMissingShortcuts ? "⚠ Shortcuts missing! Click to assign" : "⚠ Edit Shortcuts"}
        </button>
      </div>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app as Element);
}