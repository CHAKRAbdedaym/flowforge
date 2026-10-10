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

## Run a workflow without the editor (development)

Until the visual editor exists you can run any workflow JSON with curl. Example workflows are in
`server/tests/fixtures/workflows/`.

```bash
# sign in once (cookie saved in cookies.txt)
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YourPassword1"}' http://localhost:5679/api/auth/login
# run a workflow and print a summary + the last node's output
curl -b cookies.txt -H 'Content-Type: application/json' \
  --data @server/tests/fixtures/workflows/01-hello-world.json http://localhost:5679/api/dev/run
```

Options (query string): `destinationNode=<name>` runs only up to that node, `wait=false` returns the
execution id immediately, `startNode=<trigger>` picks the trigger. Full details: `GET /api/executions/<id>`.

## Webhooks and triggers

- Production URL: `http://<host>:5679/webhook/<path>` — works while the workflow is **active** (toggle in the editor).
- Test URL: `http://<host>:5679/webhook-test/<path>` — works once after **Listen for test event**.
- Example workflows to import with curl: `server/tests/fixtures/workflows/09…14` (response modes, schedule, waits).

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
