# DeadNetGuard

![DeadNetGuard Logo](assets/DNG.png)

**The internet is dying. AI slop is killing it. We're fighting back.**

DeadNetGuard is a Chrome extension that blocks AI-generated garbage content from your YouTube feed. No more robot voices reading Reddit threads. No more AI-animated "history" channels. No more algorithmically-generated brain rot.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-gray?style=for-the-badge&logo=googlechrome)](https://deadnetguard.com)
[![License](https://img.shields.io/badge/License-MIT-red?style=for-the-badge)](LICENSE)
[![Website](https://img.shields.io/badge/Website-deadnetguard.com-black?style=for-the-badge)](https://deadnetguard.com)

---

## What is AI Slop?

AI Slop refers to low-effort, AI-generated content designed to game YouTube's algorithm:

- AI voiceovers reading Reddit posts
- Faceless channels churning out hundreds of videos daily
- Stolen content with AI modifications
- Mass-produced "educational" content with no real expertise
- AI-animated "history" or "mystery" channels
- Text-to-speech commentary over gameplay/stock footage

**The Dead Internet Theory isn't just a conspiracy anymore.** Bots creating content for bots, algorithms feeding algorithms, while real human creativity drowns.

---

## Features

### One-Click Blocking
Click the **BLOCK** button next to any channel name to instantly add it to your blocklist. The button appears on hover - no need to open menus or navigate away.

### YouTube Shorts Support
Blocked channels on Shorts are **automatically skipped**. A native-styled block button appears in the action bar for quick blocking.

### Dual Blocklists
- **Personal Blocklist**: Channels you've blocked yourself, stored locally
- **Community Blocklist**: Crowdsourced database of known AI slop channels, synced from our API

### Multiple Display Modes
- **Overlay Mode**: Shows a "BLOCKED" overlay on videos (click to reveal)
- **Hidden Mode**: Completely removes blocked content from your feed

### Privacy First
- No tracking or analytics
- No account required
- Personal blocklist stored locally on your device
- Only channel names are sent when reporting (no personal data)

---

## Installation

### From Chrome Web Store
*Coming soon - currently in review*

### From Source (Developer Mode)

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Build Extension
```bash
# Clone the repository
git clone https://github.com/Hikan-Teki/deadnetguard.git
cd deadnetguard

# Install dependencies and build
cd extension
npm install
npm run build
```

#### Load in Chrome
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. The extension icon should appear in your toolbar

---

## Usage

### Blocking Channels

**On YouTube Home/Search/Recommendations:**
1. Hover over any video thumbnail
2. Look for the red **BLOCK** button next to the channel name
3. Click to instantly block the channel

**On YouTube Shorts:**
1. Look for the 🚫 button in the action bar (like/dislike area)
2. Click to block and auto-skip to the next Short

### Managing Blocklist
1. Click the DeadNetGuard extension icon
2. Go to **BLOCKLIST** tab
3. View your blocked channels
4. Click ✕ to unblock any channel

### Settings
- **Overlay Mode**: Toggle between overlay and hidden mode
- **Auto-Sync**: Enable/disable automatic community blocklist sync

---

## Tech Stack

### Extension
| Technology | Purpose |
|------------|---------|
| React 18 | UI Components |
| TypeScript | Type Safety |
| Vite | Build Tool |
| CRXJS | Chrome Extension Plugin |
| Zustand | State Management |

### Backend API
| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express | Web Framework |
| PostgreSQL | Database |
| Prisma | ORM |
| Zod | Validation |

### Website
| Technology | Purpose |
|------------|---------|
| HTML/CSS | Static Site |
| Custom Font | Bitroad Y2K Pixel |

---

## Project Structure

```
deadnetguard/
├── extension/                 # Chrome Extension
│   ├── src/
│   │   ├── content/          # YouTube DOM manipulation
│   │   │   ├── index.tsx     # Main content script
│   │   │   └── content.css   # Overlay styles
│   │   ├── background/       # Service worker
│   │   ├── App.tsx           # Popup UI
│   │   └── types/            # TypeScript types
│   ├── public/
│   │   └── icons/            # Extension icons
│   ├── manifest.json         # Extension manifest (MV3)
│   └── dist/                 # Built extension (gitignored)
│
├── backend/                   # API Server
│   ├── src/
│   │   ├── routes/           # API endpoints
│   │   └── index.ts          # Server entry
│   └── prisma/
│       └── schema.prisma     # Database schema
│
├── website/                   # Landing page
│   ├── index.html
│   ├── support.html
│   └── admin.html
│
└── assets/                    # Logos and images
```

---

## API Endpoints

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/banlist` | Get community blocklist |
| GET | `/api/banlist/version` | Check for updates |
| GET | `/api/stats` | Public statistics |
| POST | `/api/report` | Report a channel |
| POST | `/api/vote` | Vote on reported channel |

### Rate Limits
- General: 100 requests / 15 minutes
- Report/Vote: 30 requests / 15 minutes

---

## Self-Hosting

Want to run your own backend?

### Requirements
- Node.js 20+
- PostgreSQL 12+
- nginx (recommended)

### Setup
```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
npx prisma migrate deploy

# Build and start
npm run build
npm start
```

### Environment Variables
```env
DATABASE_URL="postgresql://user:password@localhost:5432/deadnetguard"
PORT=3001
NODE_ENV=production
```

---

## Contributing

Contributions are welcome! Here's how you can help:

### Report AI Slop Channels
The easiest way to contribute - just use the extension and block channels you find.

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Bug Reports
Found a bug? [Open an issue](https://github.com/Hikan-Teki/deadnetguard/issues) with:
- Browser version
- Extension version
- Steps to reproduce
- Expected vs actual behavior

---

## Privacy Policy

DeadNetGuard is designed with privacy as a core principle:

- **No Personal Data Collection**: We don't collect emails, names, or any identifying information
- **No Browsing History**: Your YouTube activity stays on your device
- **Local Storage**: Personal blocklist stored in Chrome's local storage
- **Minimal Data Transfer**: Only channel names sent when reporting
- **No Analytics**: No Google Analytics, no tracking pixels, nothing

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## The Mission

> *"The Dead Internet Theory suggests that the internet has been almost entirely taken over by artificial intelligence. While that used to be a conspiracy theory, it's becoming more real every day."*

We're not anti-AI. We're anti-slop. AI can be a tool for creativity, but it's being weaponized to flood platforms with garbage content designed to extract ad revenue through engagement hacking.

**This is just the beginning.** YouTube today. The entire internet tomorrow.

---

## Links

- **Website**: [deadnetguard.com](https://deadnetguard.com)
- **Support**: [deadnetguard.com/support](https://deadnetguard.com/support.html)
- **Issues**: [GitHub Issues](https://github.com/Hikan-Teki/deadnetguard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Hikan-Teki/deadnetguard/discussions)

---

<p align="center">
  <strong>Built with rage against the machine</strong><br>
  <sub>DeadNetGuard - Because someone has to clean up this mess</sub>
</p>
