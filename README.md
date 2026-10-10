# FlowForge

A visual workflow automation tool inspired by [n8n](https://n8n.io): triggers, nodes, expressions, live execution
view, credentials and integrations, all running locally on Node.js + SQLite.

> **Status:** under construction, built in phases. See [FEATURES.md](FEATURES.md) for what is done and
> tested. The full README (teacher demo script, Cloudflare tunnel, troubleshooting) arrives in Phase 8.

## Requirements

- Node.js **20.11 or newer** (Node 22 LTS recommended)
- npm (comes with Node)

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:5679** and create the owner account.

The first `npm start` builds the app (15–30 seconds). Later starts are instant unless the source code
changed. Data is stored in `./data`. Configuration is optional: copy `.env.example` to `.env` to change the
port or the public URL.

## Troubleshooting

- **"No SQLite driver could be loaded"** at startup: during `npm install`, `better-sqlite3` downloads a
  prebuilt binary from github.com, and on a slow or filtered connection that download can fail. Run
  `npm install` again on a better network, or use Node 22.13 or newer: FlowForge then falls back
  automatically to Node's built-in SQLite.
- **Port 5679 already in use**: set `PORT=5680` in `.env`.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Build if needed, then run FlowForge on port 5679 |
| `npm run dev` | Development mode with hot reload: open http://localhost:5173 |
| `npm test` | Type checks + automated tests (offline) |
| `npm run test:e2e` | Browser tests. Use your installed Chrome with `PW_CHANNEL=chrome npm run test:e2e`, or download Playwright's browser once with `npx playwright install chromium` |
| `npm run user:reset` | Forgot the password? Deletes user accounts so you can create a new owner (workflows are kept) |
