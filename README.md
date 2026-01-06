# DeadNetGuard 🛡️

**The internet is dying. AI slop is killing it. We're fighting back.**

DeadNetGuard is a Chrome extension that blocks AI-generated garbage content from your YouTube feed. No more robot voices reading Reddit threads. No more AI-animated "history" channels. No more algorithmically-generated brain rot.

![DeadNetGuard Logo](assets/DNG.png)

## Features

- **Instant Blocking** - One click to block any channel from your feed
- **YouTube Shorts Support** - Auto-skips blocked channels on Shorts
- **Community Blocklist** - Crowdsourced database of known AI slop channels
- **Privacy First** - No tracking, no data collection, runs locally

## Installation

### From Source
```bash
cd extension
npm install
npm run build
```

Then load the `extension/dist` folder as an unpacked extension in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder

### From Chrome Web Store
*Coming soon*

## Usage

1. Browse YouTube normally
2. See a 🛡️ button on video thumbnails
3. Click to block AI slop channels
4. On Shorts: blocked channels are auto-skipped

## Tech Stack

- **Extension**: React + TypeScript + Vite + CRXJS
- **Styling**: Tailwind CSS
- **State**: Zustand

## Project Structure

```
deadnetguard/
├── extension/          # Chrome Extension source
│   ├── src/
│   │   ├── content/    # YouTube DOM manipulation
│   │   ├── background/ # Service worker
│   │   └── ...
│   └── dist/           # Built extension
├── website/            # Landing page (deadnetguard.com)
└── assets/             # Logos and images
```

## Contributing

Found an AI slop channel? Want to help improve detection? PRs welcome.

## The Mission

The Dead Internet Theory isn't just a conspiracy anymore. Bots creating content for bots, algorithms feeding algorithms, while real human creativity drowns in an ocean of AI slop.

**This is just the beginning.** YouTube today. The entire internet tomorrow.

## Links

- **Website**: [deadnetguard.com](https://deadnetguard.com)
- **Chrome Web Store**: *Coming soon*

---

*Built with rage against the machine* 🤖⛔
