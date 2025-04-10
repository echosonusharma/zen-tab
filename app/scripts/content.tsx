import { h } from 'preact';
import { render } from 'preact';
import browser from 'webextension-polyfill';

function ContentApp() {
  return (
    <div id="zen-tab-content">
      <h3>ZenTab</h3>
      <p>This is a content script component - injected</p>
    </div>
  );
}

const container = document.createElement('div');
const shadowRoot = container.attachShadow({ mode: 'open' });

const linkElem = document.createElement('link');
linkElem.setAttribute('rel', 'stylesheet');
linkElem.setAttribute('href', browser.runtime.getURL('styles/content.css'));

shadowRoot.appendChild(linkElem);

const contentContainer = document.createElement('div');
shadowRoot.appendChild(contentContainer);

render(<ContentApp />, contentContainer);
document.body.appendChild(container);


// Listen for messages from the background script
// browser.runtime.onMessage.addListener((message) => {
//   if (message.action === 'toggleContent') {
//     const contentElement = shadowRoot.getElementById('zen-tab-content');
//     if (contentElement) {
//       contentElement.style.display = contentElement.style.display === 'none' ? 'block' : 'none';
//     }
//   }
// }); 