import { h } from 'preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { Store } from "./utils";
import { StoreType } from './types';
import '../styles/popup.css';

const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);

const SHORTCUTS = [
  { label: "Search Tabs", key: "Alt + Q" },
  { label: "Next Tab", key: "Alt + X" },
  { label: "Prev Tab", key: "Alt + Z" },
];

function Popup() {
  const [searchTab, setSearchTab] = useState(false);

  useEffect(() => {
    const setData = async () => {
      const currSearchTabVal = await searchTabStore.get() as boolean;
      setSearchTab(currSearchTabVal);
    };

    setData();
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked;
    setSearchTab(newValue);
    await searchTabStore.set(newValue);
  };

  const openShortcutSettings = () => {
    browser.tabs.create({ url: "chrome://extensions/shortcuts" });
  };

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
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span class="shortcut-label">{s.label}</span>
              <kbd class="shortcut-key">{s.key}</kbd>
            </li>
          ))}
        </ul>
        <button class="shortcut-hint" onClick={openShortcutSettings}>
          ⚠ Shortcuts not working? Click to customize
        </button>
      </div>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app);
}