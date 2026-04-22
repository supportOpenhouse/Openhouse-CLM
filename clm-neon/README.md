# Openhouse CLM — Neon Edition

Collaborative contract lifecycle management for Asset Management Agreements.

**Stack:** Next.js 14 · Neon Postgres · Drizzle ORM · NextAuth.js v5 · Anthropic Claude · Puppeteer PDF · Resend email.

## What this is

A shared web app for the Openhouse supply team to draft, review, and approve
Asset Management Agreements. Features:

- **Google Workspace SSO** restricted to `@openhouse.in` accounts (enforced in four places: Google's `hd` hint, NextAuth `signIn` callback, middleware, and API route helpers)
- **Collaborative editing** — multiple people see each other's changes within ~3.5 seconds
- **Inline editing** — click any highlighted value in the contract to edit it
- **AI assistance** — chat to update fields, upload past AMAs/Aadhar/PAN scans to auto-fill
- **Versions with approval workflow** — submit for review, admin approves or rejects with notes
- **Full audit log** — every edit/version/approval recorded with who and when
- **PDF export** — server-rendered via Puppeteer, A4 formatted, print-quality
- **Email notifications** — admins get emailed when a version needs review

All data lives in your Neon Postgres project. No Supabase dependency.

## Deployment — first-time setup

Budget ~30–40 minutes for a first deploy, mostly waiting for things.

### 1. Set up your Neon database (5 min)

If you already use Neon for OHReview, create a **separate project** or at minimum a **separate database within your existing project** for CLM. Don't mix tables.

1. Go to https://neon.tech → your workspace.
2. **Option A (recommended):** New project → name it `openhouse-clm`, pick the Singapore region (`ap-southeast-1`).
3. **Option B:** Add a database called `clm` to your existing project.
4. Go to **Connection Details** → copy both connection strings:
   - **Pooled** (includes `-pooler`) → this is your `DATABASE_URL`
   - **Direct** (no pooler) → this is your `DATABASE_URL_UNPOOLED` (used only by migrations)
5. Keep this tab open — you'll paste these into env vars later.

### 2. Google Cloud OAuth (10 min)

1. Go to https://console.cloud.google.com.
2. Create a new project or select an existing Openhouse-owned one.
3. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** (if your Workspace admin allows — this auto-restricts to `@openhouse.in` on Google's side)
   - If Internal isn't available, pick **External** and add yourself as a test user to start.
   - App name: `Openhouse CLM`. User support email: yours. Developer contact: yours.
   - Scopes: `email`, `profile`, `openid` (the default set is fine).
   - Save.
4. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `Openhouse CLM`
   - Authorized JavaScript origins: `https://clm.openhouse.in`, `http://localhost:3000`
   - Authorized redirect URIs: `https://clm.openhouse.in/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
   - **These exact paths matter** — NextAuth expects `/api/auth/callback/google`.
5. Save the **Client ID** and **Client Secret**.

### 3. Generate NextAuth secret (30 sec)

```bash
openssl rand -base64 32
```

Save the output — this is your `AUTH_SECRET`.

### 4. Anthropic API key (2 min)

1. https://console.anthropic.com → API Keys → Create key
2. Save as `ANTHROPIC_API_KEY`
3. Add $25 of credits — should last months for a 20-person team

### 5. Resend for emails (5 min, optional)

Skip this if you don't want email notifications right now — the app works without it.

1. https://resend.com → sign up
2. Domains → Add `openhouse.in` → follow the DNS setup (SPF/DKIM TXT records)
3. Wait for DNS verification (few minutes to a few hours)
4. API Keys → Create key → save as `RESEND_API_KEY`
5. From address: `noreply@openhouse.in` or `clm@openhouse.in`

### 6. Push database schema to Neon (2 min)

On your local machine:

```bash
# Unzip and install
unzip openhouse-clm-neon.zip && cd clm-neon
npm install

# Set env vars
cp .env.example .env.local
# Edit .env.local — at minimum, set DATABASE_URL_UNPOOLED

# Push schema
npm run db:push
```

You should see output like "14 tables created". That's NextAuth's 4 tables plus our 5 plus indexes.

If you get "role does not exist" errors, make sure `DATABASE_URL_UNPOOLED` points at the direct (non-pooler) URL.

### 7. Deploy to Vercel (5 min)

1. Push this project to a Git repo (GitHub/GitLab/Bitbucket).
2. https://vercel.com/new → Import the repo.
3. Framework preset: Next.js (auto-detected).
4. Environment variables — paste all of these:

   ```
   DATABASE_URL=postgres://...pooler.neon.tech/clm?sslmode=require
   DATABASE_URL_UNPOOLED=postgres://...neon.tech/clm?sslmode=require
   AUTH_SECRET=<from openssl rand>
   AUTH_URL=https://clm.openhouse.in
   AUTH_GOOGLE_ID=<from google cloud>
   AUTH_GOOGLE_SECRET=<from google cloud>
   ANTHROPIC_API_KEY=sk-ant-...
   RESEND_API_KEY=re_...
   EMAIL_FROM=Openhouse CLM <noreply@openhouse.in>
   NEXT_PUBLIC_APP_URL=https://clm.openhouse.in
   NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=openhouse.in
   ```

5. Click Deploy. First build takes 2–4 minutes.
6. In Vercel → Domains → Add `clm.openhouse.in` and point your DNS CNAME at the given Vercel target.
7. Go back to Google Cloud Console → update Authorized redirect URI if needed.

### 8. First sign in

1. Open https://clm.openhouse.in
2. Click **Sign in with Google**
3. Sign in with your `@openhouse.in` account
4. You're now the admin — everyone else who signs in becomes editor
5. Promote teammates from the user menu → **Manage team**

## Development (local)

```bash
cd clm-neon
npm install
cp .env.example .env.local
# Fill in all env vars
npm run db:push     # First time only — creates tables
npm run dev
# Open http://localhost:3000
```

### Local PDF generation

Puppeteer needs Chrome locally. Install Chrome, then set:

```bash
# macOS:
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Linux:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

Add to `.env.local`. On Vercel, this is handled automatically by `@sparticuz/chromium`.

### Drizzle Studio (browse your DB)

```bash
npm run db:studio
```

Opens a local UI at https://local.drizzle.studio where you can browse/edit rows.

## Project structure

```
clm-neon/
├── app/
│   ├── layout.tsx                          # Root layout + fonts
│   ├── globals.css                         # All styles
│   ├── page.tsx                            # Home — agreements list
│   ├── login/page.tsx                      # Google SSO login (NextAuth)
│   ├── agreements/[id]/page.tsx            # Editor (server component)
│   └── api/
│       ├── auth/[...nextauth]/route.ts     # NextAuth handler
│       ├── ai/chat/route.ts                # Claude chat (server)
│       ├── ai/extract/route.ts             # PDF/image extraction
│       ├── pdf/route.ts                    # Puppeteer PDF gen
│       ├── notifications/review-request/   # Resend email
│       └── data/                           # All DB operations
│           ├── me/route.ts                 # Current user
│           ├── users/route.ts              # List users (team)
│           ├── users/[id]/role/route.ts    # Admin role change
│           ├── agreements/route.ts         # GET/POST
│           ├── agreements/[id]/route.ts    # GET/PATCH/DELETE
│           ├── agreements/[id]/versions/   # Version CRUD
│           ├── agreements/[id]/audit/      # Audit log
│           ├── agreements/[id]/presence/   # Live presence
│           └── versions/[id]/route.ts      # Version PATCH/DELETE
├── components/
│   ├── AgreementEditor.tsx                 # Main editor (~1300 lines)
│   ├── ContractPreview.tsx                 # Right-panel contract
│   ├── EditPopover.tsx                     # Floating inline edit
│   ├── Tokenized.tsx                       # ⟦path|display⟧ parser
│   ├── UserBadge.tsx                       # Avatar + dropdown
│   └── TeamSettingsModal.tsx               # Role management
├── drizzle/
│   └── schema.ts                           # Full DB schema
├── lib/
│   ├── contract.ts                         # Clause library, formatters
│   ├── path-meta.ts                        # Field labels
│   ├── db-client.ts                        # Drizzle client
│   ├── db.ts                               # Client-side DB wrapper
│   └── auth-helpers.ts                     # requireUser/requireAdmin
├── auth.ts                                 # NextAuth config
├── middleware.ts                           # Session + domain gate
├── drizzle.config.ts
└── .env.example
```

## How security works

Three layers, all enforcing `@openhouse.in` domain restriction:

1. **Google side**: `hd=openhouse.in` param in the OAuth request restricts who Google shows in the account chooser. If your Workspace consent screen is **Internal**, non-`@openhouse.in` accounts literally cannot initiate sign-in.
2. **NextAuth `signIn` callback** (`auth.ts`): rejects sessions whose email doesn't end in `@openhouse.in` and whose Google `hd` claim doesn't match.
3. **Every API route**: calls `requireUser()` which re-checks the domain on the server, so even if a session cookie leaked, it'd be rejected.

Admin-only actions (approving versions, changing roles) additionally check `user.role === "admin"` before executing.

## Troubleshooting

**"redirect_uri_mismatch" from Google** — Your OAuth client has the wrong redirect URI. It must be exactly `{AUTH_URL}/api/auth/callback/google`. Check the Google Cloud Console Credentials page.

**"AccessDenied" after signing in** — Either the account isn't `@openhouse.in`, or Google's `hd` claim doesn't match (rare; usually means the user isn't actually in the Openhouse Workspace). Triple-check the email you used.

**"Database connection failed"** — Neon scales to zero when idle, so the first request after a pause takes 1–2s to wake up. This is normal. If it persists, confirm your `DATABASE_URL` uses the pooler (`-pooler.neon.tech` in the hostname).

**Migrations fail with "must be superuser"** — You're using the pooler URL for `db:push`. Switch to `DATABASE_URL_UNPOOLED` (direct connection) for DDL operations.

**PDFs time out on Vercel Free** — Puppeteer cold-start is 8–12s. Upgrade to Vercel Pro for longer timeouts, or switch to an external PDF service (Browserless, DocRaptor). The PDF route is isolated in one file for easy swapping.

**No emails being sent** — Either `RESEND_API_KEY` is missing (app silently skips) or the sending domain isn't verified in Resend. Check Vercel logs for the `/api/notifications/review-request` route.

**Team member signed in but can't see agreements** — Profile row wasn't created. Check Drizzle Studio (`npm run db:studio`) → `users` table. If the user is missing, they need to sign out and sign in again. The `events.signIn` hook in `auth.ts` populates this on each login.

**Changes from teammates not appearing** — Polls run every 3.5s and defer for 1.5s after your local keystroke. For true real-time, swap the `setInterval` in `AgreementEditor.tsx` for a Neon-Realtime alternative (e.g. postgres LISTEN/NOTIFY through a streaming API route).

## Future work

- **Neon branching** for schema changes: `git checkout -b feature; neon branch create feature` → apply schema changes in the branch, test, merge.
- **DocuSign integration** — e-signing once approved.
- **Version diff viewer** — side-by-side comparison.
- **Template editor** — admin UI to edit clause library without touching code.
- **Analytics dashboard** — AMAs by status/month/creator, time-to-approval histogram.

## Why Neon + NextAuth instead of Supabase

- You already use Neon for OHReview; consolidating DB infrastructure.
- NextAuth keeps auth in the same Node.js codebase — no separate Supabase Auth service to understand.
- Drizzle ORM gives you typed queries and auto-generated migrations.
- The only trade-off: no database-level row-level security. Security is enforced at the API route layer via `requireUser()` / `requireAdmin()` helpers, which is fine as long as you don't add direct client-to-database access later.

## License

Internal use at Openhouse (Avano Technologies Pvt. Ltd.) only.
