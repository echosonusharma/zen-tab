# Privacy Policy for Tabaru

## Overview

Tabaru is an open-source, offline-first browser extension for tab management.

Tabaru does not operate a remote backend, does not include analytics or advertising SDKs, and does not intentionally collect, sell, or share personal data with third parties. Data used by the extension is processed locally in your browser to provide the extension's features.

## Data Handling

To work correctly, Tabaru may access information that already exists in your browser, such as:

- open tabs, including tab titles and URLs
- tab groups where supported by the browser
- recently closed sessions and windows
- bookmarks
- your default search engine integration through the browser's search API
- locally stored extension settings and cached UI data

This information is used only to provide the extension's functionality inside your browser. Tabaru is designed so that this data stays local to your device unless your browser itself syncs extension storage as part of the browser account features you enable.

## Permissions Explained

Tabaru requests the following permissions in `app/manifest.json`:

- **`storage`**: Used to save extension settings and other local extension state.
- **`tabs`**: Used to read and manage open tabs, including tab titles, URLs, and tab state needed for search and navigation features.
- **`tabGroups`**: Used in Chromium-based browsers to read and manage tab groups.
- **`sessions`**: Used to access recently closed tabs or windows and related session state.
- **`activeTab`**: Used to interact with the tab you are currently viewing when a feature is triggered by you.
- **`scripting`**: Used to inject extension-controlled UI or scripts into pages when needed for extension features.
- **`idle`**: Used to detect browser or device idle state so Tabaru can keep internal state in sync safely.
- **`search`**: Used to interact with the browser's search capability.
- **`bookmarks`**: Used to read or surface bookmark data as part of navigation and search features.
- **`favicon`**: Used in Chromium-based browsers to access favicon resources for display in the UI.
- **`host_permissions` (`<all_urls>`)**: Required so the extension can run on pages where its features are invoked and access page context across sites.

## Browser-Specific Notes

- On Chromium-based browsers, Tabaru declares `tabGroups` and `favicon` in addition to the shared permissions.
- On Firefox, those Chromium-only permissions are not declared.

Permission names reflect browser APIs and may sound broad, but they are requested to support the extension's tab management, search, bookmarks, session, and page-integration features.

## Network Activity

Tabaru is intended to work without a remote service operated by the developer.

The extension may access website resources that are already part of normal browser usage, such as page URLs and favicon-related resources, in order to present tab information in the UI. Aside from browser-mediated access required for extension features, Tabaru is not intended to send your browsing data to a developer-controlled server.

## Third-Party Sharing

Tabaru does not intentionally sell or share your personal information with third parties.

If your browser provides its own sync, search, bookmark, or session services, any data handling by those browser vendors is governed by their own privacy policies, not by Tabaru.

## Your Choices

You can control Tabaru's access by:

- uninstalling the extension
- disabling the extension in your browser
- clearing extension storage through your browser
- reviewing the source code before use

## Open Source

Tabaru is open source. You can review the code to verify how permissions are used and what data is processed locally.

## Contact

For questions, issues, or audit requests, please use the project's repository or the contact method provided by the developer.
