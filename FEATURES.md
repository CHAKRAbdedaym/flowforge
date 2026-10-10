# FlowForge — Feature checklist

**Rules**
- `[x]` = implemented **and** covered by an automated test **and** checked manually. The proof is written
  after the item (`test:` file, `e2e:` spec, `manual:` what was checked).
- `[ ]` = not done yet. Nothing is ticked on intent.
- Priority: **P0** must work (never cut) · **P1** important (AI, time travel, Demo Mode, versions) ·
  **P2** everything else (cut first if time is short).
- `(Ph N)` = phase in which the item is planned.

---

## Foundation
- [x] P0 `npm install` then `npm start` runs backend + built frontend on port 5679 (Ph 0) — e2e: `web/e2e/phase0-auth-shell.spec.ts` (runs the built app); manual: fresh install, first start builds in 12 s, second start skips the build, clear messages for busy port / invalid `.env`
- [x] P0 `npm run dev` with hot reload (Ph 0) — manual: Vite on :5173 proxies `/api`, `/webhook`, `/ws`; SPA deep links; server restarts on file change
- [x] P0 `npm test` (typecheck + unit/API tests, offline) (Ph 0) — 48 tests (shared 9, server 39)
- [x] P0 SQLite driver: better-sqlite3 12.9.0 (prebuilt binaries for Node 20/22/24) with automatic fallback to built-in `node:sqlite` on Node ≥ 22.13 (Ph 0) — test: `server/tests/driver.test.ts`; full server suite passes on Node 20.18 (better-sqlite3) and Node 22.22 (fallback). Not yet tried on Node 24/26.
- [x] P0 SQLite database with ordered migrations, created automatically in `./data` (Ph 0) — test: `server/tests/db.test.ts` (idempotent, failed migration rolls back fully)
- [x] P0 Dark app shell with sidebar navigation, n8n-like look (Ph 0) — e2e: every sidebar page, 404 page, collapsible sidebar remembered; manual: screenshots reviewed
- [x] P0 WebSocket connection with session auth + connection indicator (Ph 0) — test: `server/tests/ws.test.ts` (401 without session, rooms, garbage input); e2e: indicator shows Live
- [x] P2 Simple login: owner setup on first run, login, logout, session cookie (Ph 0) — test: `server/tests/auth.test.ts` (validation, single owner, brute-force limit, forged cookie); e2e: setup → sign out → wrong password → deep-link redirect
- [x] P2 `npm run user:reset` to recover a lost owner password (Ph 0) — test: `db.test.ts` (deleteAll cascades sessions); manual: asks to type RESET, `-- --yes` skips it, setup screen returns
- [x] P2 Playwright smoke tests `npm run test:e2e` (Ph 0) — 3 specs pass (`PW_CHANNEL=chrome` uses the installed Chrome)

## Engine (all P0)
- [ ] P0 Node registry auto-loads one-file nodes and validates their schema (Ph 1)
- [ ] P0 Items data model `{json, binary}` arrays, multiple inputs / outputs per node (Ph 1)
- [ ] P0 Paired items (`$('X').item` lineage) (Ph 1)
- [ ] P0 Branch execution order (depth-first, top-to-bottom like n8n v1) (Ph 1)
- [ ] P0 Multi-input waiting + run with missing inputs when a branch is not taken (Ph 1)
- [ ] P0 Loops (node runs multiple times, run index, loop guard) (Ph 1)
- [ ] P0 Expressions `{{ }}`: `$json`, `$binary`, `$input`, `$('X')`, `$node["X"].json`, `$items()`, `$prevNode`, `$runIndex`, `$itemIndex` (Ph 1)
- [ ] P0 Expressions: `$now`, `$today`, `DateTime` (Luxon), `$workflow`, `$execution`, `$env`, `$vars` (Ph 1)
- [ ] P0 Expression helpers: `$jmespath`, `$if`, `$ifEmpty`, `$min`, `$max` + data transformation functions (Ph 1)
- [ ] P0 Expression sandbox (AST guard + timeout) with clear error messages (Ph 1)
- [ ] P0 Node setting: Retry on fail (max tries, wait between tries) (Ph 1)
- [ ] P0 Node setting: On error → stop / continue / continue using error output (Ph 1)
- [ ] P0 Node setting: Always output data (Ph 1)
- [ ] P0 Node setting: Execute once (Ph 1)
- [ ] P0 Node setting: Disabled (pass-through) (Ph 1)
- [ ] P0 Pinned data (manual runs only) (Ph 1)
- [ ] P0 Execute single node / partial execution reusing previous data (Ph 1)
- [ ] P0 Execution timeout + cancel (Ph 1)
- [ ] P0 Execution queue with concurrency limit (Ph 1)
- [ ] P0 Binary data stored on disk, preview + download (Ph 1)
- [ ] P0 Executions persisted with per-node run data (Ph 1)
- [ ] P0 Crash recovery: running executions marked `crashed` on boot (Ph 1)
- [ ] P0 Error workflow (Error Trigger receives failed execution info) (Ph 3)
- [ ] P0 Sub-workflows (Execute Workflow + Execute Workflow Trigger) (Ph 3)

## Editor + live visualization (all P0)
- [ ] P0 Canvas: drag/drop nodes, connect, delete, pan/zoom (Ph 2)
- [ ] P0 Multi-select, copy/paste (n8n-style JSON on the clipboard) (Ph 2)
- [ ] P0 Minimap (Ph 2)
- [ ] P0 Undo / redo (Ph 2)
- [ ] P0 Auto-layout (Ph 2)
- [ ] P0 Cmd/Ctrl+K command palette (Ph 2)
- [ ] P0 Sticky notes (markdown, colors, resize) (Ph 2)
- [ ] P0 Node creator panel with search (Ph 2)
- [ ] P0 Node panel: INPUT / PARAMETERS / OUTPUT with Table + JSON (+ Schema) views (Ph 2)
- [ ] P0 Parameter forms generated from the node schema (Ph 2)
- [ ] P0 Expression editor: Fixed/Expression toggle, autocomplete, live preview, drag field from INPUT (Ph 2)
- [ ] P0 Node settings tab (retry, on error, always output, execute once, notes) (Ph 2)
- [ ] P0 Save / open workflows, unsaved-changes guard, rename (Ph 2)
- [ ] P0 Pin / unpin data from the output panel (Ph 2)
- [ ] P0 Live execution over WebSocket: running nodes glow, success/error state, item counts (Ph 2)
- [ ] P0 Particles on edges + data preview on hover (Ph 2, polished Ph 8)
- [ ] P0 Activate / deactivate workflow with visible status and activation errors (Ph 3)

## Triggers
- [ ] P0 Manual Trigger (Ph 1)
- [ ] P0 Webhook: all HTTP methods, path params (Ph 3)
- [ ] P0 Webhook: separate test URL (`/webhook-test`, listen 120 s) and production URL (`/webhook`) (Ph 3)
- [ ] P0 Webhook response mode: Immediately (Ph 3)
- [ ] P0 Webhook response mode: When last node finishes (Ph 3)
- [ ] P0 Webhook response mode: Using Respond to Webhook node (Ph 3)
- [ ] P0 Webhook: JSON / form / multipart (binary) / raw bodies; optional basic/header auth (Ph 3)
- [ ] P0 Schedule Trigger: interval rules (seconds → months) (Ph 3)
- [ ] P0 Schedule Trigger: cron expression + timezone (Ph 3)
- [ ] P0 Form Trigger (see Integrations → Form) (Ph 3B)
- [ ] P0 Telegram Trigger, long polling, no public URL needed (Ph 5)
- [ ] P0 Error Trigger (Ph 3)
- [ ] P0 Execute Workflow Trigger (Ph 3)
- [ ] P2 Chat Trigger: hosted chat page + in-editor chat panel (Ph 5)
- [ ] P2 Local File Trigger (restricted to `./data/files`) (Ph 3)
- [ ] P2 RSS Feed Trigger (Ph 3)
- [ ] P2 HTTP polling trigger with dedupe (Ph 3)
- [ ] P2 Test mode "Listen for test event" for every trigger type (Ph 3/5)

## Flow nodes
- [ ] P0 IF (Ph 1)
- [ ] P0 Switch (rules + expression mode, fallback output) (Ph 1)
- [ ] P0 Merge: append, combine by matching fields, by position, all combinations, choose branch (Ph 1)
- [ ] P0 No Operation (Ph 1)
- [ ] P0 Sticky Note (Ph 2)
- [ ] P2 Filter (kept / discarded) (Ph 1)
- [ ] P2 Loop Over Items (Ph 1)
- [ ] P2 Stop and Error (Ph 1)
- [ ] P2 Wait: interval, specific time, webhook resume, form resume; persisted across restart (Ph 3)
- [ ] P2 Execute Workflow (database / JSON source, once / per item, wait or not) (Ph 3)

## Data nodes
- [ ] P0 Set / Edit Fields (manual mapping + JSON mode) (Ph 1)
- [ ] P0 Code (sandboxed JS, QuickJS; all items / each item) (Ph 1)
- [ ] P2 Limit (Ph 1)
- [ ] P2 Sort (Ph 1)
- [ ] P2 Aggregate (Ph 4)
- [ ] P2 Split Out (Ph 4)
- [ ] P2 Remove Duplicates (Ph 4)
- [ ] P2 Summarize (Ph 4)
- [ ] P2 Compare Datasets (4 outputs) (Ph 4)
- [ ] P2 Date & Time (Ph 4)
- [ ] P2 Crypto (hash, HMAC, random, UUID) (Ph 4)
- [ ] P2 HTML Extract (CSS selectors) + generate HTML template (Ph 4)
- [ ] P2 XML ↔ JSON (Ph 4)
- [ ] P2 Markdown ↔ HTML (Ph 4)
- [ ] P2 Convert to File (CSV, JSON, text, HTML) (Ph 4)
- [ ] P2 Extract from File (CSV, JSON, text) (Ph 4)
- [ ] P2 Read/Write Files from Disk (restricted to `./data/files`) (Ph 4)
- [ ] P2 Execute Command — **disabled by default**, enabled only via Settings toggle (Ph 4)

## Network nodes
- [ ] P0 HTTP Request: all methods, headers, query, body types (JSON, form, multipart, raw, binary) (Ph 4)
- [ ] P0 HTTP Request: auth none / basic / bearer / API key (header or query) (Ph 4)
- [ ] P0 HTTP Request: pagination, timeout, full response, response format (Ph 4)
- [ ] P0 Respond to Webhook (all items, first item, JSON, text, binary, redirect, no data; status + headers) (Ph 3)
- [ ] P2 HTTP Request: import cURL (Ph 4)
- [ ] P2 GraphQL (Ph 4)

## Credentials
- [ ] P0 Credentials manager: AES-256-GCM encrypted storage (Ph 3B)
- [ ] P0 Test button per credential type (Ph 3B)
- [ ] P0 `.env` fallback when no credential is selected (Ph 3B)
- [ ] P0 Missing key ⇒ clear error in the UI with "Open Credentials" action, never a crash (Ph 3B)

## Required integrations (all P0)
### 1. Send Email (SMTP)
- [ ] P0 SMTP credential (Gmail App Password / Brevo) with Test button (`transporter.verify`) (Ph 3B)
- [ ] P0 Send Email node: to/cc/bcc, subject, text + HTML, attachments from binary (Ph 3B)
- [ ] P0 Nice responsive HTML email template (Ph 3B)
### 2. HTML Form Generator
- [ ] P0 Visual form builder (field types, required, options, reorder, live preview) (Ph 3B)
- [ ] P0 Public page `/form/:id` (+ `/form-test/:id`) (Ph 3B)
- [ ] P0 QR code of the form URL (LAN IP / PUBLIC_URL) (Ph 3B)
- [ ] P0 Server-side validation with errors shown on the form (Ph 3B)
- [ ] P0 Submission triggers the workflow (Ph 3B)
### 3. Telegram
- [ ] P0 Telegram credential (bot token) with Test button (`getMe`) (Ph 5)
- [ ] P0 Telegram: send message (text, Markdown/HTML parse mode) (Ph 5)
- [ ] P0 Telegram Trigger (long polling via shared TelegramHub) (Ph 5)
### 4. Discord
- [ ] P0 Discord webhook credential with Test button (Ph 5)
- [ ] P0 Discord: message with rich embeds (title, description, color, fields, footer, image, timestamp) (Ph 5)
### 5. Open-Meteo
- [ ] P0 Weather node: current + daily forecast by coordinates (Ph 5)
- [ ] P0 Geocoding by city name (no key needed) (Ph 5)
### 6. Google Gemini
- [ ] P0 Gemini credential (API key) with Test button (Ph 5)
- [ ] P0 Gemini chat node (prompt, system instruction, model choice) (Ph 5)

## AI (P1)
- [ ] P1 AI Agent with Gemini chat model sub-node (Ph 6)
- [ ] P1 Simple Memory sub-node (per session) (Ph 6)
- [ ] P1 Tools: HTTP Request, Code, Calculator, Weather (Ph 6)
- [ ] P1 AI Workflow Builder: plain English → validated workflow JSON (Ph 6)
- [ ] P1 Builder: animated drawing on the canvas (Ph 6)
- [ ] P1 Builder: offline fallback to the closest template, clearly labelled (Ph 6)

## Product
- [ ] P1 Version history (snapshot per save, restore) (Ph 7)
- [ ] P2 Workflows list: tags, search, duplicate, delete (Ph 7)
- [ ] P2 Import / export workflow JSON (Ph 7)
- [ ] P2 Executions list with filters + per-node input/output detail (Ph 7)
- [ ] P2 Retry a failed execution (Ph 7)
- [ ] P2 Variables (`$vars`) page (Ph 7)
- [ ] P2 Settings page (timezone, timeout, concurrency, pruning, `$env` access, Execute Command toggle) (Ph 7)
- [ ] P2 Templates gallery (Ph 7)
- [ ] P2 Dashboard with charts (executions per day, success rate, durations, top workflows) (Ph 7)

## Wow
- [ ] P1 Time-travel debugger (scrub steps, inspect data, re-run from a node) (Ph 8)
- [ ] P1 Demo Mode button; simulated output ONLY in Demo Mode, always with orange SIMULATED badge (Ph 8)

## Deliverables
- [ ] P0 README.md (install, run, features, troubleshooting) (Ph 8)
- [ ] P0 README: Teacher demo script (exact 5-minute click sequence) (Ph 8)
- [ ] P0 README: Cloudflare quick tunnel fallback (`cloudflared tunnel --url http://localhost:5679`) (Ph 8)
- [ ] P0 README: Fedora firewall command to reach the app from a phone (Ph 8)
- [ ] P0 `.env.example` (Ph 0, completed in Ph 5)
- [ ] P0 API_SETUP.md for the 6 integrations (links, steps, free limits, `.env` name + Credentials UI field, how to verify) (Ph 5)
- [ ] P0 `npm run check`: real call per integration, OK / FAIL / SKIP with reason (Ph 5)
- [ ] P0 `/examples`: 8 importable workflows (Ph 8)
