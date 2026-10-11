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

Besides the visual editor, any workflow JSON can be run with curl. Example workflows are in
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

## Email and forms

- **Credentials** (sidebar): add your SMTP login once (Gmail App Password or Brevo), click **Test**, save.
  It is stored encrypted. Step-by-step guide with links: [API_SETUP.md](API_SETUP.md#email-smtp).
- **Send Email** node: text, HTML or a designed responsive template, attachments from binary data.
- **Form Trigger** node: visual form builder with live preview, 3 themes, a public mobile page and a QR code.
- Ready-made example: **Workflows → Examples → "Contact form → emails"** (the JSON is in [`examples/`](examples)).
- Check your SMTP settings from the terminal: `npm run check:email` (prints OK or FAIL with the reason).

## Data, files and HTTP nodes

- **HTTP Request**: every method, query / headers / body (JSON, form, multipart, raw, file), authentication through
  credentials, pagination, redirects, timeouts, file downloads, and **Import cURL**. **GraphQL** for queries with variables.
- **Data**: Aggregate, Split Out, Remove Duplicates, Summarize, Compare Datasets, Date & Time, Crypto, HTML, XML, Markdown.
- **Files**: Convert to File, Extract from File, Read/Write Files from Disk. File nodes can only use the
  `data/files` folder (change it with `FLOWFORGE_FILES_DIR` in `.env`). Files produced by a node show in the
  **Binary** view of its output, with a download link.
- **Execute Command** runs shell commands on this computer. It is **disabled by default**: switch it on in
  **Settings → Security** only if you need it.

## Open FlowForge from a phone

Forms, webhooks and QR codes use the **public URL** shown at startup (`➜ Network: http://192.168.x.x:5679`).

**1. Same Wi-Fi (simplest).** Connect the phone to the same network as the computer and scan the QR code of
the form. If the page does not load, the computer's firewall is blocking port 5679:

| System | Command |
|---|---|
| Fedora / RHEL | `sudo firewall-cmd --add-port=5679/tcp` (until reboot; add `--permanent` then `sudo firewall-cmd --reload` to keep it) |
| Ubuntu / Debian (ufw) | `sudo ufw allow 5679/tcp` |
| Windows (admin PowerShell) | `netsh advfirewall firewall add rule name="FlowForge" dir=in action=allow protocol=TCP localport=5679` |
| macOS | Click **Allow** when macOS asks whether `node` may accept incoming connections |

**2. Any network: Cloudflare quick tunnel (fallback).** School and guest Wi-Fi often isolate devices from each
other. A tunnel gives a public `https://` address without an account:

```bash
# install once: download "cloudflared" for your system from https://github.com/cloudflare/cloudflared/releases
cloudflared tunnel --url http://localhost:5679
```

Copy the `https://….trycloudflare.com` address it prints into `.env` and restart FlowForge:

```ini
PUBLIC_URL=https://your-words.trycloudflare.com
```

Every form URL and QR code now uses that address. The address changes each time `cloudflared` restarts.

**Wrong address detected?** Set `PUBLIC_URL=http://<your-ip>:5679` in `.env` yourself.

## Troubleshooting

- **"No SQLite driver could be loaded"** at startup: during `npm install`, `better-sqlite3` downloads a
  prebuilt binary from github.com, and on a slow or filtered connection that download can fail. Run
  `npm install` again on a better network, or use Node 22.13 or newer: FlowForge then falls back
  automatically to Node's built-in SQLite.
- **Port 5679 already in use**: set `PORT=5680` in `.env`.
- **"This credential cannot be decrypted"**: `data/.encryption_key` was deleted or replaced. Open the
  credential and type its values again (always back up that file together with `data/flowforge.db`).
- **Emails are not sent**: run `npm run check:email`. The table in [API_SETUP.md](API_SETUP.md#how-to-verify)
  explains each message.
- **The phone cannot open a form**: see [Open FlowForge from a phone](#open-flowforge-from-a-phone).

## Commands

| Command | What it does |
|---|---|
| `npm start` | Build if needed, then run FlowForge on port 5679 |
| `npm run dev` | Development mode with hot reload: open http://localhost:5173 |
| `npm test` | Type checks + automated tests (offline) |
| `npm run test:e2e` | Browser tests. Use your installed Chrome with `PW_CHANNEL=chrome npm run test:e2e`, or download Playwright's browser once with `npx playwright install chromium` |
| `npm run check:email` | Sends a real test email with your SMTP credential (or `.env`) and prints OK / FAIL with the reason. Add `-- someone@example.com` to choose the recipient |
| `npm run user:reset` | Forgot the password? Deletes user accounts so you can create a new owner (workflows are kept) |
