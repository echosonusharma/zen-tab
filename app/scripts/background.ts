import browser from "webextension-polyfill";

console.log('Background script loaded');

browser.runtime.onInstalled.addListener(() => {
  console.log('Extension loaded');
});

browser.tabs.query({}).then((d) => {
  console.log(d)
})
