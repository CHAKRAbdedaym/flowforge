# API setup: keys and logins for the integrations

Every integration works in two ways. Pick one:

| Where | When to use it |
|---|---|
| **Credentials page** in FlowForge (encrypted, with a Test button) | Recommended. Several accounts possible, chosen per node. |
| **`.env` file** in the project folder | Fallback when no credential is saved. Handy for a quick demo. |

FlowForge looks for a credential in this order: the one **selected on the node** → the **default** credential
of that type → the **`.env`** variables → otherwise the node fails with a clear "credentials are missing"
error and an **Open Credentials** button.

Secrets are stored encrypted (AES-256-GCM) in `data/flowforge.db`. The key is in `data/.encryption_key`
(or `FLOWFORGE_ENCRYPTION_KEY` in `.env`). **Back up that file with the database**: without it, saved
credentials cannot be read and must be typed again. Secrets are never shown again after saving, and never
written to executions or logs.

Sections: [Email (SMTP)](#email-smtp) · [Form](#form) · [Webhook authentication](#webhook-authentication)
· [HTTP Request authentication](#http-request-authentication) · Telegram, Discord, Gemini and weather arrive in Phase 5.

---

## Email (SMTP)

Used by the **Send Email** node. You need an SMTP server: the two free options below take about 3 minutes.

### Option A: Gmail with an App Password (free)

Google does not accept your normal password from apps. You create a separate 16-letter **App Password**.

1. Turn on 2-Step Verification (required by Google for App Passwords):
   <https://myaccount.google.com/signinoptions/two-step-verification>
2. Open the App Passwords page: <https://myaccount.google.com/apppasswords>
3. Type a name (for example `FlowForge`) and click **Create**.
4. Copy the 16 letters shown (for example `abcd efgh ijkl mnop`). They are shown **only once**.
   The spaces do not matter: FlowForge removes them.

| Field | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` |
| SSL/TLS | **on** (or port `587` with SSL/TLS **off**) |
| User | your full Gmail address, e.g. `you@gmail.com` |
| Password | the 16-letter App Password |

Good to know:

- **Free limit:** about 500 recipients per day for a personal Gmail account (Google can change it).
- Gmail always sends **from your own address**. A different "From" is replaced by your address.
- **No "App passwords" page?** It is hidden when 2-Step Verification is off, when the account only uses
  security keys, with Advanced Protection, or on a **school / work account** whose administrator disabled
  it. Use a personal Gmail account, or Brevo below.
- Google help: <https://support.google.com/accounts/answer/185833>

### Option B: Brevo (free, 300 emails per day)

1. Create a free account: <https://www.brevo.com/>
2. Open **SMTP & API**: <https://app.brevo.com/settings/keys/smtp>
3. Note the **Login** shown on that page and click **Generate a new SMTP key**. Copy the key (shown once).
4. Add the address you want to send from under **Senders** and confirm it by email:
   <https://app.brevo.com/senders/list>

| Field | Value |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| SSL/TLS | **off** (the connection is upgraded with STARTTLS) |
| User | the **Login** shown on the SMTP & API page |
| Password | the **SMTP key** (not your Brevo password, not the API key) |
| Default Sender (From) | the sender address you confirmed, e.g. `Shop <you@example.com>` |

### Where to paste it

**Credentials page (recommended)**

1. FlowForge → **Credentials** → **Add credential** → **SMTP**.
2. Click the **Gmail** or **Brevo** quick-setup button: host, port and SSL/TLS are filled in.
3. Fill in **User** and **Password** (and **Default Sender** for Brevo).
4. Click **Test**: you must see *Connected to … and signed in as …*.
5. Click **Save**. The first SMTP credential is the default: every Send Email node uses it automatically.

**Or the `.env` file** (copy `.env.example` to `.env` in the project folder, then restart FlowForge)

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=abcdefghijklmnop
# Optional: sender used when the node's "From Email" is empty (default: SMTP_USER)
SMTP_FROM=FlowForge <you@gmail.com>
```

`SMTP_SECURE` can be left out: it is `true` for port 465 and `false` for any other port.

### How to verify

```bash
npm run check:email                       # sends a test email to yourself
npm run check:email -- friend@example.com # or to another address
npm run check:email -- --credential "Gmail account"   # a specific saved credential
```

It prints `OK` twice (connection + email sent), or `FAIL` with the reason:

| Message | What to do |
|---|---|
| `SMTP credentials are missing` | No credential saved and no `SMTP_HOST` in `.env`. |
| `SMTP authentication failed` | Wrong user or password. Gmail: use the App Password, not your normal password. |
| `Timed out while talking to the SMTP server` | Wrong host/port, or the network blocks SMTP (common on school Wi-Fi): try a phone hotspot. |
| `TLS problem` | Port 465 needs SSL/TLS **on**, port 587 needs it **off**. |
| `The server rejected the sender or a recipient` | Brevo: the From address is not a confirmed sender. |

The same check runs when you click **Test** on the Credentials page.

---

## Form

The **Form Trigger** needs **no key**. It publishes a web form and starts the workflow on each submission.

- **Test URL** `/form-test/…`: works for one submission after clicking **Listen for test event** (5 minutes).
- **Production URL** `/form/…`: works while the workflow is **Active**.
- The node shows a **QR code** of the URL (generated locally). Click it for a large version with
  **Copy** and **Download PNG**.

Opening the form on a **phone**: the phone must reach your computer.

1. Same Wi-Fi: scan the QR code. The URL uses your computer's network address (`http://192.168.x.x:5679/…`).
2. If the page does not load, the firewall of the computer blocks port 5679, or the Wi-Fi isolates devices
   (frequent on school networks). See **"Open FlowForge from a phone"** in the [README](README.md): firewall
   command for your system, or a Cloudflare tunnel that works on any network.

Optional settings in `.env`:

```ini
# Submissions per minute per visitor (anti-spam) and maximum upload size
FORM_RATE_LIMIT_PER_MINUTE=30
FORM_MAX_UPLOAD_MB=10
```

Spam protection is built in: an invisible "honeypot" field (bots fill it, their submission is dropped),
the rate limit above, and server-side validation of every field.

---

## Webhook authentication

The **Webhook** node can require a login. Choose **Basic Auth** or **Header Auth** in the node, then pick or
create the credential right there (**Credential to connect with → Create new credential…**).

| Credential | Fields | Caller must send |
|---|---|---|
| Basic Auth | User, Password | `curl -u user:password http://…/webhook/path` |
| Header Auth | Header Name (e.g. `X-API-Key`), Header Value | `curl -H "X-API-Key: value" http://…/webhook/path` |

Without the credential the workflow cannot be activated ("Basic Auth credentials are missing").

---

## HTTP Request authentication

The **HTTP Request** and **GraphQL** nodes can sign in to any API. Choose the kind of login in
**Authentication**, then pick or create the credential right in the node. The secret is stored encrypted and
is never written into the workflow, the execution data or an error message.

| Authentication | Credential | Fields | What is sent |
|---|---|---|---|
| Basic Auth | Basic Auth | User, Password | `Authorization: Basic …` |
| Bearer Token | Bearer Auth | Bearer Token (without the word "Bearer") | `Authorization: Bearer <token>` |
| API Key in a Header | Header Auth | Header Name (e.g. `X-API-Key`), Header Value | `<name>: <value>` |
| API Key in the URL | Query Auth | Parameter Name (e.g. `api_key`), Value | `?<name>=<value>` |

Tips:

- **Import cURL**: paste a command from API docs. A token or `-u user:password` found in it is saved as a
  credential (untick the box in the dialog to keep it as a plain header instead).
- A `401` answer with a credential shows **Open Credentials** in the error, to fix the value on the spot.
- No key at hand? These public APIs need none: `https://api.github.com/repos/n8n-io/n8n` (JSON),
  `https://countries.trevorblades.com/` (GraphQL).

