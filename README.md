# openSearch

Private, local-first search engine, context memory, and local AI assistant for your desktop.

OpenSearch indexes user-selected folders, extracts content from text and PDF documents, creates semantic vector embeddings using open-weight models, and enables hybrid search (semantic vector + lexical keyword). It features an in-app local LLM manager to download and run models (like SmolLM2, Llama 3.2, Qwen 2.5) directly through Ollama with zero cloud dependencies.

## Key Features

- **Hybrid Local Search**: Combines dense semantic vector embeddings (`Xenova/all-MiniLM-L6-v2`) with BM25-style lexical keyword search.
- **In-App LLM Model Manager**: Download, configure, switch, and delete lightweight LLM models (SmolLM2 360M/1.7B, Llama 3.2 1B, Qwen 2.5) with real-time download progress directly inside the UI.
- **Grounded Document Q&A**: "Ask local AI" answers questions strictly using verified retrieved passages from your indexed documents with explicit citations.
- **Full PDF Extraction**: Native PDF text parsing using `pdf-parse` alongside standard code and markdown files.
- **Privacy First**: 100% on-device inference and local storage. No telemetry, no cloud API keys, no tracking.
- **Modern Desktop Shell**: Built with Electron, React, TypeScript, and Vite.

## Supported Formats

- Documents: `.pdf`, `.md`, `.mdx`, `.txt`, `.log`
- Code: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.sh`, `.sql`
- Config/Data: `.json`, `.yml`, `.yaml`, `.toml`, `.ini`, `.html`, `.css`, `.scss`

## Getting Started

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com/) (installed and running locally for the "Ask AI" assistant feature)

### Installation & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build desktop packages
npm run build

# Package for macOS (DMG)
npm run package:mac

# Package for Linux (AppImage)
npm run package:linux
```

## License

MIT
