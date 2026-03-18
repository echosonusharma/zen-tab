# ZenTab

ZenTab is a lightweight browser extension for efficient tab management. It provides quick navigation and fuzzy search capabilities to help manage multiple open tabs.

## Features

- Fast tab switching and navigation.
- Fuzzy search for locating specific tabs across windows.
- Keyboard-centric interface.
- Cross-browser support (Chrome, Firefox, Edge, Opera).

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

## Build

Compile the extension for production:

```bash
npm run build chrome
npm run build firefox
npm run build edge
npm run build opera
```

## Release

Trigger the automated versioning and release process:

```bash
npm run release
```

## Acknowledgements

- Built with [WebExtension Toolbox](https://github.com/webextension-toolbox/webextension-toolbox)
- Icons from [Flaticon](https://www.flaticon.com/) and [App Icon Maker](https://appiconmaker.co/)
- Inspired by the [Shortkeys Extension](https://github.com/crittermike/shortkeys)
