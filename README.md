<p align="center">
  <img src="app/images/tabaru-icon.svg" width="128" height="128" alt="Tabaru Icon">
</p>

<h1 align="center">Tabaru</h1>

<p align="center">
  <b>Tabaru</b> is a lightweight browser extension for efficient tab management. It provides quick navigation and fuzzy search capabilities to help manage multiple open tabs.
</p>

## Features

- Fast tab switching and navigation.
- Fuzzy search for locating specific tabs across windows.
- Keyboard-centric interface.
- Cross-browser support (Chrome, Firefox, Edge, Opera).

> **Compatibility Note:** Tabaru is most suitable for Chromium-based browsers (Chrome, Edge, Brave, Opera). While Firefox is supported, you may encounter minor issues.


## Suggested Keyboard Shortcuts

- Open Search Modal: `Alt+Q`
- Next Tab: `Alt+X`
- Previous Tab: `Alt+Z`

*Note: You can customize these shortcuts in your browser's extension settings.*

## Installation and Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Run the extension in development mode with hot-reloading:

```bash
npm run dev chrome
npm run dev firefox
npm run dev edge
npm run dev opera
```

Each command writes its unpacked extension files to `dist/<browser>`, for example `dist/firefox` or `dist/edge`.

## Build

Compile the extension for production:

```bash
npm run build chrome
npm run build firefox
npm run build edge
npm run build opera
```

Production builds are also written to `dist/<browser>` so each browser keeps a separate on-disk build directory.

## Release

Trigger the automated versioning and release process:

```bash
npm run release
```

## Acknowledgements

- Built with [WebExtension Toolbox](https://github.com/webextension-toolbox/webextension-toolbox)
- Icons created with help of [App Icon Maker](https://appiconmaker.co/)
- Inspired by the [Shortkeys Extension](https://github.com/crittermike/shortkeys)

## Privacy

Please see our [Privacy Policy](PRIVACY_POLICY.md) for details on permissions and data handling.
