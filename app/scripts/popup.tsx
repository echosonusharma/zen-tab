import { h } from 'preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Store } from "./utils";
import { StoreType } from './types';
import '../styles/popup.css';

const audioCaptureStore: Store = new Store("audioCapture", StoreType.LOCAL);
const searchTabStore: Store = new Store("searchTab", StoreType.LOCAL);

function Popup() {
  const [audioCapture, setAudioCapture] = useState(false);
  const [searchTab, setSearchTab] = useState(false);

  useEffect(() => {
    const setData = async () => {
      const currAudioCaptureVal = await audioCaptureStore.get() as boolean;
      const currSearchTabVal = await searchTabStore.get() as boolean;

      setAudioCapture(currAudioCaptureVal);
      setSearchTab(currSearchTabVal);
    };

    setData();
  }, []);

  const handleAudioCaptureChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked;
    setAudioCapture(newValue);
    await audioCaptureStore.set(newValue);
  };

  const handleSearchTabChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.checked;
    setSearchTab(newValue);
    await searchTabStore.set(newValue);
  };

  return (
    <div class="app">
      <div class="toggle-container">
        <div class="toggle-wrapper">
          <span class="toggle-label">Audio Capture</span>
          <label class="toggle">
            <input
              type="checkbox"
              checked={audioCapture}
              onChange={handleAudioCaptureChange}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
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
    </div>
  );
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app);
}