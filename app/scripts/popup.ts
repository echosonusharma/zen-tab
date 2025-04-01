import browser from "webextension-polyfill";

console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', () => {
  const contentElement = document.getElementById('content');
  if (contentElement) {
    contentElement.textContent = 'sam altman sucks!';
  }
  
  browser.storage.local.get("data").then((result) => {
    console.log("Data from storage:", result.data);
  });
});
