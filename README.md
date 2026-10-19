# OpenSearch

Private, local-first search engine, context memory, and local AI assistant for your desktop.

OpenSearch indexes user-selected folders, extracts content from text and PDF documents, creates semantic vector embeddings using open-weight models, and enables hybrid search (semantic vector + lexical keyword). It features an in-app local LLM manager to download and run models (like SmolLM2, Llama 3.2, Qwen 2.5) directly through Ollama with zero cloud dependencies.

---

## 📥 Downloads (v0.1.0)

Prebuilt binaries are available for **macOS**, **Windows**, and **Linux** directly on [GitHub Releases](https://github.com/aashutoshkumarbhardwaj/openSearch/releases):

| Operating System | Download File | Description |
| :--- | :--- | :--- |
| 🍏 **macOS (Apple)** | [**OpenSearch-0.1.0-arm64.dmg**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/OpenSearch-0.1.0-arm64.dmg) | macOS Disk Image Installer |
| 🍏 **macOS (Zip)** | [**OpenSearch-0.1.0-arm64-mac.zip**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/OpenSearch-0.1.0-arm64-mac.zip) | Portable macOS App Zip |
| 🪟 **Windows (Exe)** | [**OpenSearch.0.1.0.exe**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/OpenSearch.0.1.0.exe) | Portable Windows Executable |
| 🪟 **Windows (Zip)** | [**OpenSearch-0.1.0-win.zip**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/OpenSearch-0.1.0-win.zip) | Windows Distribution Archive |
| 🐧 **Linux (AppImage)** | [**OpenSearch-0.1.0.AppImage**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/OpenSearch-0.1.0.AppImage) | Standalone Linux Executable |
| 🐧 **Linux (Tarball)** | [**opensearch-0.1.0.tar.gz**](https://github.com/aashutoshkumarbhardwaj/openSearch/releases/download/v0.1.0/opensearch-0.1.0.tar.gz) | Linux Distribution Archive |

---

## Key Features

- **Hybrid Local Search**: Combines dense semantic vector embeddings (`Xenova/all-MiniLM-L6-v2`) with BM25-style lexical keyword search.
- **Universal Project Intelligence**: Synthesizes project overviews, next actions, decisions, open questions, and potential risks with grounded evidence citations.
- **Decision & Task Memory**: Automatic extraction of architectural decisions and actionable tasks with confidence scores and source excerpts.
- **Target Scope Selection**: Focuses semantic analysis specifically on selected files or folders with on-the-fly parsing.
- **Assessment Action Plan & Interactive Notepad**: Parses specs and rubrics into structured phases, extracts deliverable deadlines, provides interactive `[x]` tick marks, and persists notes.
- **Interactive Calendar & Milestone Timeline**: A full monthly calendar with day schedule inspection, one-click task completion tick marks, and velocity roadmap lanes (Overdue, Due Today, This Week, Upcoming 30 Days).
- **Searchable Clipboard Memory**: Automatically captures and categorizes copied code, commands, and notes while proactively filtering out sensitive API keys and secrets.
- **Daily Memory Briefing**: Generates morning project briefings with velocity scoring, intent setting, and local text-to-speech audio readout.
- **In-App LLM Model Manager**: Download, configure, switch, and delete lightweight LLM models (SmolLM2 360M/1.7B, Llama 3.2 1B, Qwen 2.5) with real-time download progress directly inside the UI.
- **Full PDF Extraction**: Native PDF text parsing using `pdf-parse` alongside standard code and markdown files.
- **Privacy First**: 100% on-device inference and local storage. No telemetry, no cloud API keys, no tracking.

---

## Supported Formats

- **Documents**: `.pdf`, `.md`, `.mdx`, `.txt`, `.log`
- **Code**: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.sh`, `.sql`
- **Config/Data**: `.json`, `.yml`, `.yaml`, `.toml`, `.ini`, `.html`, `.css`, `.scss`

---

## Getting Started

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com/) (optional, for local LLM text generation)

### Installation & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Packaging for Desktop

```bash
# Build desktop packages
npm run build

# Package for macOS (DMG & Zip)
npm run package:mac

# Package for Windows (Portable Exe & Zip)
npm run package:win

# Package for Linux (AppImage & Tarball)
npm run package:linux
```

---

## License

MIT
