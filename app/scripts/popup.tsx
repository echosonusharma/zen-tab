import { h } from 'preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import '../styles/popup.css';

interface Tab {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

function Popup() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    browser.tabs.query({}).then((tabs) => {
      setTabs(tabs as Tab[]);
    });
  }, []);

  const filteredTabs = tabs.filter(tab => 
    tab.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tab.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div class="app">
      <header>
        <h1>ZenTab</h1>
        <input
          type="text"
          placeholder="Search tabs..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
        />
      </header>
      <main>
        <div class="tabs-list">
          {filteredTabs.map(tab => (
            <div 
              key={tab.id} 
              class={`tab-item ${tab.active ? 'active' : ''}`}
              onClick={() => browser.tabs.update(tab.id, { active: true })}
            >
              <span class="tab-title">{tab.title}</span>
              <span class="tab-url">{tab.url}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app);
}