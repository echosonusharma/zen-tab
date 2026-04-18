import { h, render } from 'preact';
import { useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import '../styles/popup.css';
import '../styles/content.css';
import '../styles/fallback.css';
import { SearchApp } from "./search-app";

function Popup() {
  useEffect(() => {
    document.documentElement.classList.add('fallback-mode');
    document.body.classList.add('fallback-mode');

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
  }, []);

  return <SearchApp onClose={() => window.close()} />;
}

const app = document.getElementById('app');
if (app) {
  render(<Popup />, app as Element);
}
