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
- [x] P0 Node registry auto-loads one-file nodes and validates their schema (Ph 1) — test: `nodes.test.ts` (registry), served at `GET /api/node-types` (`api-engine.test.ts`)
- [x] P0 Items data model `{json, binary}` arrays, multiple inputs / outputs per node (Ph 1) — test: `engine.test.ts`
- [x] P0 Paired items (`$('X').item` lineage) (Ph 1) — test: `engine.test.ts` (through IF, Sort, disabled node), `expressions.test.ts`
- [x] P0 Branch execution order (depth-first, top-to-bottom like n8n v1) (Ph 1) — test: `engine.test.ts`; manual: fixture 02
- [x] P0 Multi-input waiting + run with missing inputs when a branch is not taken (Ph 1) — test: `engine.test.ts`; manual: fixture 03
- [x] P0 Loops (node runs multiple times, run index, loop guard) (Ph 1) — test: `engine.test.ts`; manual: fixture 04
- [x] P0 Expressions `{{ }}`: `$json`, `$binary`, `$input`, `$('X')`, `$node["X"].json`, `$items()`, `$prevNode`, `$runIndex`, `$itemIndex` (Ph 1) — test: `expressions.test.ts`
- [x] P0 Expressions: `$now`, `$today`, `DateTime` (Luxon), `$workflow`, `$execution`, `$env`, `$vars` (Ph 1) — test: `expressions.test.ts` (`$vars` values come from the Variables page in Ph 7; secrets are hidden from `$env`)
- [x] P0 Expression helpers: `$jmespath`, `$if`, `$ifEmpty`, `$min`, `$max` + data transformation functions (Ph 1) — test: `expressions.test.ts` (~45 string/array/number/object functions)
- [x] P0 Expression sandbox (AST guard + separate realm + timeout) with clear error messages (Ph 1) — test: `expressions.test.ts` (17 escape attempts incl. constructor, `__proto__`, process, require, computed keys, bridge errors, prototype pollution); manual: preview API
- [x] P0 Node setting: Retry on fail (max tries, wait between tries) (Ph 1) — test: `engine.test.ts`
- [x] P0 Node setting: On error → stop / continue / continue using error output (Ph 1) — test: `engine.test.ts` (whole node and per item), `nodes.test.ts` (Code per item); manual: fixture 05
- [x] P0 Node setting: Always output data (Ph 1) — test: `engine.test.ts`
- [x] P0 Node setting: Execute once (Ph 1) — test: `engine.test.ts`
- [x] P0 Node setting: Disabled (pass-through) (Ph 1) — test: `engine.test.ts`
- [x] P0 Pinned data used by the engine (manual runs only) (Ph 1) — test: `engine.test.ts` (pin/unpin buttons come with the editor, Ph 2)
- [x] P0 Execute single node / partial execution reusing previous data (Ph 1) — test: `engine.test.ts`; manual: `?destinationNode=`
- [x] P0 Execution timeout + cancel (Ph 1) — test: `engine.test.ts`, `api-engine.test.ts`; manual: endless Code loop timed out at 2 s / stopped
- [x] P0 Execution queue with concurrency limit, manual runs first (Ph 1) — test: `api-engine.test.ts`
- [x] P0 Binary data stored on disk + download API with safe headers (Ph 1) — test: `nodes.test.ts`, `api-engine.test.ts`
- [ ] P0 Binary data preview in the output panel (Ph 2)
- [x] P0 Executions persisted with per-node run data + event log (Ph 1) — test: `api-engine.test.ts`; manual: `GET /api/executions`
- [x] P0 Crash recovery: running executions marked `crashed` on boot (Ph 1) — test: `api-engine.test.ts`
- [x] P0 Live execution events over WebSocket (`execution.*`, `node.started/finished` with preview, `edge.data`) (Ph 1) — test: `api-engine.test.ts` (order, seq, previews)
- [x] P0 Expression preview API for the editor (`POST /api/expressions/preview`) (Ph 1) — test: `api-engine.test.ts`; manual: curl
- [x] P2 Dev endpoint `POST /api/dev/run` to run a workflow JSON with curl (disable with `FLOWFORGE_DEV_API=false`) (Ph 1) — test: `api-engine.test.ts` (8 fixtures)
- [x] P0 Error workflow (Error Trigger receives failed execution info, n8n payload) (Ph 3) — test: `server/tests/triggers.test.ts`
- [x] P0 Sub-workflows (Execute Workflow + Execute Workflow Trigger, parent link, depth limit 10) (Ph 3) — test: `server/tests/triggers.test.ts`

## Editor + live visualization (all P0)
- [x] P0 Canvas: drag/drop nodes, connect, delete, pan/zoom (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Multi-select, copy/paste (n8n-style JSON on the clipboard) (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Minimap (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Undo / redo (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Auto-layout (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Cmd/Ctrl+K command palette (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Sticky notes (markdown, colors, resize) (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Node creator panel with search (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Node panel: INPUT / PARAMETERS / OUTPUT with Table + JSON (+ Schema) views (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Parameter forms generated from the node schema (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Expression editor: Fixed/Expression toggle, autocomplete, live preview, drag field from INPUT (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Node settings tab (retry, on error, always output, execute once, notes) (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Save / open workflows, unsaved-changes guard, rename (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Pin / unpin data from the output panel (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Live execution over WebSocket: running nodes glow, success/error state, item counts (Ph 2) — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Particles on edges + item-count labels + execution log panel (Ph 2) — data preview on hover / polish in Ph 8 — e2e: `web/e2e/editor-*.spec.ts`; unit: `web/tests/*.test.ts`
- [x] P0 Activate / deactivate workflow with visible status and activation errors (editor + workflows list) (Ph 3) — test: `server/tests/triggers.test.ts` (lifecycle, boot, no leaks); e2e: `web/e2e/editor-triggers.spec.ts`

- [x] P2 Workflows list: create, open, rename, delete (Ph 2) — e2e: `editor-canvas.spec.ts` (tags/search/duplicate in Ph 7)
- [x] P0 Fallback JSON editor for unknown parameter types (Ph 2) — e2e: `editor-triggers.spec.ts` (Wait node form fields)
- [ ] P0 Error card "Open Credentials" button (Ph 2) — implemented, tested with real credential nodes in Ph 3B

## Triggers
- [x] P0 Manual Trigger (Ph 1) — test: `engine.test.ts`
- [x] P0 Webhook: all HTTP methods, path params (static before dynamic) (Ph 3) — test: `server/tests/webhook.test.ts`
- [x] P0 Webhook: separate test URL (`/webhook-test`, listen 120 s, single shot) and production URL (`/webhook`) (Ph 3) — test: `server/tests/webhook.test.ts`; e2e: editor-triggers
- [x] P0 Webhook response mode: Immediately (custom code / body / headers) (Ph 3) — test: `server/tests/webhook.test.ts`; manual: curl guide A
- [x] P0 Webhook response mode: When last node finishes (first JSON / all / binary / no body; 500 on error) (Ph 3) — test: `server/tests/webhook.test.ts`; manual: curl guide B
- [x] P0 Webhook response mode: Using Respond to Webhook node (clear 500 if none runs) (Ph 3) — test: `server/tests/webhook.test.ts`; manual: curl guide C
- [x] P0 Webhook: JSON / form / multipart (binary) / raw bodies; basic/header auth; CORS; path conflicts refused (Ph 3) — test: `server/tests/webhook.test.ts`
- [x] P0 Schedule Trigger: interval rules (seconds → months) (Ph 3) — test: `server/tests/triggers.test.ts`; manual: curl guide E
- [x] P0 Schedule Trigger: cron expression (with seconds) + workflow timezone (Ph 3) — test: `server/tests/triggers.test.ts`
- [ ] P0 Form Trigger (see Integrations → Form) (Ph 3B)
- [ ] P0 Telegram Trigger, long polling, no public URL needed (Ph 5)
- [x] P0 Error Trigger (Ph 3) — test: `server/tests/triggers.test.ts`
- [x] P0 Execute Workflow Trigger (Ph 3) — test: `server/tests/triggers.test.ts`
- [ ] P2 Chat Trigger: hosted chat page + in-editor chat panel (Ph 5)
- [x] P2 Local File Trigger (add/change/delete, ignore patterns, restricted to `./data/files`) (Ph 3) — test: `server/tests/triggers.test.ts`
- [x] P2 RSS Feed Trigger (Ph 3) — test: `server/tests/triggers.test.ts` (local feed server)
- [x] P2 HTTP polling trigger with dedupe (key field or SHA-256, LRU 5000, baseline on first run) (Ph 3) — test: `server/tests/triggers.test.ts`
- [ ] P2 Test mode "Listen for test event" for every trigger type (Ph 3/5) — done and tested for webhook, schedule, RSS / HTTP poll, file trigger (`triggers.test.ts`, e2e); Telegram and Chat come in Ph 5

- [x] P0 Public routes are safe: rate limit per IP, body size limit (413), path length limit, malformed URLs → 4xx, never crash (Ph 3) — test: `server/tests/webhook.test.ts`
- [x] P2 Workflow settings dialog: error workflow, timezone, execution timeout, save production runs (Ph 3) — e2e: `editor-triggers.spec.ts`

## Flow nodes
- [x] P0 IF (Ph 1) — test: `engine.test.ts`, `conditions.test.ts` (shared condition engine, strict/loose types)
- [x] P0 Switch (rules + expression mode, fallback output) (Ph 1) — test: `nodes.test.ts`; manual: fixture 07
- [x] P0 Merge: append, combine by matching fields (5 join modes), by position, all combinations, choose branch (Ph 1) — test: `engine.test.ts`; manual: fixtures 03, 06
- [x] P0 No Operation (Ph 1) — test: `engine.test.ts`
- [x] P0 Sticky Note (Ph 2) — e2e: `editor-canvas.spec.ts`
- [x] P2 Filter (kept / discarded) (Ph 1) — test: `nodes.test.ts`
- [x] P2 Loop Over Items (Ph 1) — test: `engine.test.ts`; manual: fixture 04
- [x] P2 Stop and Error (Ph 1) — test: `nodes.test.ts`; manual: fixture 08
- [x] P2 Wait: interval, specific time, webhook resume, form resume (server-side validation); persisted across restart (Ph 3) — test: `server/tests/triggers.test.ts` (incl. stop → restart → resume); e2e: editor-triggers; manual: curl guide F, G
- [x] P2 Execute Workflow (database / JSON source, once / per item, wait or not) (Ph 3) — test: `server/tests/triggers.test.ts`

## Data nodes
- [x] P0 Set / Edit Fields (manual mapping + JSON mode) (Ph 1) — test: `nodes.test.ts`
- [x] P0 Code (sandboxed JS, QuickJS in worker threads; all items / each item; time + memory limits) (Ph 1) — test: `nodes.test.ts` (no require/process/fetch, endless loop, memory bomb, cancel, line numbers). Known gap: Luxon `DateTime` is not available inside Code (QuickJS has no Intl)
- [x] P2 Limit (Ph 1) — test: `nodes.test.ts`
- [x] P2 Sort (Ph 1) — test: `nodes.test.ts`
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
- [x] P0 Respond to Webhook (all items, first item, JSON, text, binary, redirect, no data; status + headers) (Ph 3) — test: `server/tests/webhook.test.ts`
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
