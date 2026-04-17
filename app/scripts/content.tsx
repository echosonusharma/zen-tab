import { h, render } from "preact";
import browser from "webextension-polyfill";
import { Store } from "./utils";
import { ExtensionMessage, StoreType } from "./types";
import { SearchApp } from "./search-app";

// Wrap everything in an IIFE to prevent "already declared" errors when the content script is re-injected on each shortcut press.
(async function () {
  const CONTAINER_SELECTOR = "div[data-tabaru-container]";
  const abortController = new AbortController();
  const { signal } = abortController;

  // Lifecycle Handlers

  function visibilityListener() {
    if (document.visibilityState !== "visible") {
      handleClose();
    }
  }

  function messageListener(message: unknown, _sender: browser.Runtime.MessageSender) {
    const msg = message as ExtensionMessage;
    if (msg?.action === "closeSearchTab") {
      handleClose();
    }
  }

  function globalKeyCaptureListener(e: KeyboardEvent) {
    const currentContainer = document.querySelector(CONTAINER_SELECTOR);
    if (!currentContainer) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleClose();
      return;
    }

    const isFromContainer = e.composedPath().includes(currentContainer);
    if (!isFromContainer) {
      e.stopPropagation();
    }
  }

  function handleClose() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container) {
      browser.runtime.onMessage.removeListener(messageListener);
      abortController.abort();
      container.remove();
    }
  }

  // Entry Point

  browser.runtime.onMessage.addListener(messageListener);
  document.addEventListener("visibilitychange", visibilityListener, { signal });
  window.addEventListener("keydown", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keyup", globalKeyCaptureListener, { capture: true, signal });
  window.addEventListener("keypress", globalKeyCaptureListener, { capture: true, signal });

  const existingContainer = document.querySelector(CONTAINER_SELECTOR);
  if (existingContainer) {
    handleClose();
    return;
  }

  const searchTabStore: Store<boolean> = new Store("searchTab", StoreType.LOCAL);
  const searchTabEnabled = (await searchTabStore.get()) as boolean;
  if (!searchTabEnabled) {
    return;
  }

  const container = document.createElement("div");
  container.setAttribute("data-tabaru-container", "true");

  // Prevent keyboard events originating from inside the container from bubbling out to the host document
  const stopBubbling = (e: Event) => e.stopPropagation();
  container.addEventListener("keydown", stopBubbling, { signal });
  container.addEventListener("keyup", stopBubbling, { signal });
  container.addEventListener("keypress", stopBubbling, { signal });

  const shadowRoot = container.attachShadow({ mode: "open" });

  // Load styles from external CSS file and wait for it
  const cssUrl = browser.runtime.getURL("styles/content.css");

  try {
    const response = await fetch(cssUrl);
    const cssText = await response.text();
    const styleTag = document.createElement("style");
    styleTag.textContent = cssText;
    shadowRoot.appendChild(styleTag);
  } catch (err) {
    console.error("Failed to load Tabaru CSS", err);
  }

  // Add backdrop for click-outside-to-close
  const backdrop = document.createElement("div");
  backdrop.className = "tabaru-backdrop";
  backdrop.addEventListener("click", handleClose, { signal });
  shadowRoot.appendChild(backdrop);

  const contentContainer = document.createElement("div");
  shadowRoot.appendChild(contentContainer);

  render(<SearchApp onClose={handleClose} />, contentContainer);
  document.body.appendChild(container);
})();
