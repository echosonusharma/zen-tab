import { h } from 'preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { Store, openShortcutSettings } from "./utils";
import { StoreType } from './types';
import '../styles/popup.css';

const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);

function Popup() {
  const [searchTab, setSearchTab] = useState(false);
  const [shortcuts, setShortcuts] = useState<browser.Commands.Command[]>([]);

  useEffect(() => {
    const setData = async () => {
      const currSearchTabVal = await searchTabStore.get() as boolean;
      setSearchTab(currSearchTabVal);

      const cmds = await browser.commands.getAll();
      setShortcuts(cmds.filter(c => c.name && c.name !== '_execute_action' && c.name !== '_execute_browser_action'));
    };

    setData();
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked;
    setSearchTab(newValue);
    await searchTabStore.set(newValue);
  };

  const hasMissingShortcuts = shortcuts.some(s => !s.shortcut);

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