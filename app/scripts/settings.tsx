import { h, render, Fragment, VNode } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { Store, openShortcutSettings } from "./utils";
import { StoreType } from './types';
import '../styles/settings.css';

type SectionId = 'general' | 'shortcuts' | 'about';

const GeneralIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ShortcutsIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 17h8" />
    <path d="M10 13h4" />
  </svg>
);

const AboutIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const NAV_SECTIONS: { id: SectionId; label: string; Icon: () => VNode }[] = [
  { id: 'general', label: 'General', Icon: GeneralIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: ShortcutsIcon },
  { id: 'about', label: 'About', Icon: AboutIcon },
];

const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);

function GeneralSection() {
  const [searchTab, setSearchTab] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    searchTabStore.get().then((val) => {
      setSearchTab(!!val);
      setReady(true);
    });
  }, []);

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const next = target.checked;
    setSearchTab(next);
    await searchTabStore.set(next);
  };

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">General</h1>
        <p class="settings-section-subtitle">Core behavior for tab search and navigation.</p>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <div class="settings-row-text">
            <span class="settings-row-label">Search Tab overlay</span>
            <span class="settings-row-hint">Opens the search modal on the active page instead of the popup.</span>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={searchTab}
              disabled={!ready}
              onChange={handleSearchTabChange}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </Fragment>
  );
}

function ShortcutsSection() {
  const [shortcuts, setShortcuts] = useState<browser.Commands.Command[]>([]);

  useEffect(() => {
    browser.commands.getAll().then((cmds) => {
      setShortcuts(
        cmds.filter((c) => c.name && c.name !== '_execute_action' && c.name !== '_execute_browser_action')
      );
    });
  }, []);

  const hasMissing = shortcuts.some((s) => !s.shortcut);

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">Shortcuts</h1>
        <p class="settings-section-subtitle">Keyboard bindings are managed by your browser.</p>
      </div>

      <div class="settings-group">
        <table class="shortcut-table">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.name}>
                <td>{s.description || s.name}</td>
                <td>
                  <kbd class={s.shortcut ? '' : 'missing'}>{s.shortcut || 'Unassigned'}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="settings-footer-actions">
        <button class="btn primary" onClick={openShortcutSettings}>
          {hasMissing ? 'Assign missing shortcuts' : 'Edit shortcuts in browser'}
        </button>
      </div>
    </Fragment>
  );
}

function AboutSection() {
  const manifest = browser.runtime.getManifest();

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">About</h1>
        <p class="settings-section-subtitle">Tabaru - quick and simple tab management.</p>
      </div>

      <div class="settings-group">
        <ul class="about-list">
          <li><span>Version</span><span>{manifest.version}</span></li>
          <li><span>Author</span><span>{manifest.author as string || 'Sonu Sharma'}</span></li>
          <li>
            <span>Source</span>
            <a href="https://github.com/sonus21/tabaru" target="_blank" rel="noopener noreferrer">github.com/sonus21/tabaru</a>
          </li>
        </ul>
      </div>
    </Fragment>
  );
}

function SettingsApp() {
  const [active, setActive] = useState<SectionId>(() => {
    const hash = window.location.hash.replace('#', '') as SectionId;
    return NAV_SECTIONS.some((s) => s.id === hash) ? hash : 'general';
  });

  useEffect(() => {
    window.location.hash = active;
    document.title = `Tabaru — ${NAV_SECTIONS.find((s) => s.id === active)?.label}`;
  }, [active]);

  const manifest = browser.runtime.getManifest();

  return (
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-brand">
          <img class="settings-brand-icon" src={browser.runtime.getURL("images/tabaru-icon.svg")} alt="" />
          <span class="settings-brand-name">Tabaru</span>
          <span class="settings-brand-version">v{manifest.version}</span>
        </div>
        {NAV_SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            class={active === id ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setActive(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <main class="settings-content">
        {active === 'general' && <GeneralSection />}
        {active === 'shortcuts' && <ShortcutsSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<SettingsApp />, app as Element);
}
