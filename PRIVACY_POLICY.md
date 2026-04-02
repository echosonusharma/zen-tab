# Privacy Policy for Tabaru

## Overview

Tabaru is an open-source, offline-first browser extension designed for fast tab management. The author is an independent developer and is not affiliated with any company.

Because privacy and performance are top priorities, **Tabaru does not collect, transmit, share, or sell any of your personal data.** 

There are **no remote backend servers**, **no analytics**, and **no tracking**. Everything happens strictly locally on your own machine.

## Permissions Explained

To function effectively, Tabaru requires a few specific permissions when you install it. We only request what is absolutely necessary:

- **`tabs` & `activeTab`**: Required to fetch the titles, URLs, and favicons of your open tabs. This allows the extension to index and display your open tabs in the search menu.
- **`storage`**: Used to save your settings locally within your browser (e.g., caching favicons to save memory, or remembering your UI settings). This data never leaves your device.
- **`scripting`**: Required to temporarily inject the fuzzy-search UI (the search bar modal) into the pages you visit when you press the requested shortcut keys.
- **`idle`**: Used to safely synchronize the internal background list of your open tabs when your device or browser falls asleep and wakes back up.
- **`host_permissions` (`<all_urls>`)**: This is necessary to allow the extension to inject the search UI on any web page you are currently viewing and to retrieve website favicons to display next to the tab entries.

## Third-Party Services and Remote Calls

**Tabaru makes no background network calls to any external servers.** 
The only network activity naturally initiated by the extension is directly fetching the official favicons (icons) of the websites you already have open, so they can be shown accurately in the search interface.

## Provided "As Is"

This extension is provided entirely free of charge as an open-source project. The software is provided "as is", without warranty of any kind, express or implied. I am not responsible for any data loss or browser issues. Please review the `LICENSE` file in the repository for more details.

## Contact & Code Source

Since this is an open-source project, you can verify this policy by inspecting the source code yourself. The best way to report issues, ask questions, or audit the code is through the project's GitHub repository.
