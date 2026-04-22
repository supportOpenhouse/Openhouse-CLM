# Openhouse CLM

Collaborative contract lifecycle management for Asset Management Agreements.
Next.js + Supabase + Anthropic Claude + Puppeteer PDF + Resend email notifications.

## What this is

A shared web app for the Openhouse supply team to draft, review, and approve
Asset Management Agreements. Features:

- **Google SSO** restricted to `@openhouse.in` accounts
- **Collaborative editing** — multiple people see each other's changes in near-real-time
- **Inline editing** — click any highlighted value in the contract to edit it
- **AI assistance** — chat to update fields, upload past AMAs/Aadhar/PAN to auto-fill
- **Versions with approval workflow** — submit for review, admin approves or rejects
- **Full audit log** — every edit/version/approval recorded with who and when
- **PDF export** — server-rendered, print-quality, A4 formatted
- **Email notifications** — admins get an email when a version needs review

## Deployment — first time setup

Budget ~30 minutes for a first deploy.

### 1. Create a Supabase project (5 min)

1. Go to https://supabase.com and create a new project. Pick the region closest to India (Singapore / Mumbai).
2. Save the database password somewhere safe.
3. Wait for the project to finish provisioning (~2 min).
4. Open the SQL Editor → paste the contents of `supabase/migrations/0001_initial_schema.sql` → Run.
5. In Settings → API, copy:
   - `Project URL` → you'll set this as `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (keep this secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Enable Google auth in Supabase (10 min)

1. In Google Cloud Console (https://console.cloud.google.com):
   - Create a new project or select an existing Openhouse-owned one.
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: Web application.
   - Authorized JavaScript origins: your Vercel URL (e.g. `https://clm.openhouse.in`) and `http://localhost:3000` for dev.
   - Authorized redirect URIs: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
     (you'll find this exact URL in Supabase → Authentication → Providers → Google.)
   - Save the Client ID and Client Secret.
2. In Supabase → Authentication → Providers → Google:
   - Toggle Google on
   - Paste Client ID and Client Secret
   - In "Authorized domains", add `openhouse.in`
   - Save.
3. In Supabase → Authentication → URL Configuration:
   - Site URL: `https://clm.openhouse.in` (or wherever you'll deploy)
   - Add redirect URL: `https://clm.openhouse.in/auth/callback`
   - Add for local dev: `http://localhost:3000/auth/callback`

### 3. Get Anthropic API key (2 min)

1. https://console.anthropic.com → API Keys → Create key
2. Save it as `ANTHROPIC_API_KEY`
3. Add credits to the account — ₹2000 / $25 should last months for a small team

### 4. Set up Resend for emails (5 min)

1. https://resend.com → sign up
2. Domains → Add `openhouse.in` → follow DNS setup (SPF/DKIM TXT records)
3. Wait for DNS to verify (can take a few minutes to a few hours)
4. API Keys → Create key → save as `RESEND_API_KEY`
5. Use a from address like `noreply@openhouse.in` or `clm@openhouse.in`

If you skip this step, the app still works — review submissions just won't send emails.

### 5. Deploy to Vercel (5 min)

1. Push this project to a Git repo (GitHub/GitLab/Bitbucket).
2. https://vercel.com/new → Import the repo.
3. Framework preset: Next.js (auto-detected)
4. Environment variables — paste all of these:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ANTHROPIC_API_KEY=sk-ant-...
   RESEND_API_KEY=re_...
   EMAIL_FROM=Openhouse CLM <noreply@openhouse.in>
   NEXT_PUBLIC_APP_URL=https://clm.openhouse.in
   NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=openhouse.in
   ```

5. Click Deploy. First deploy takes ~3 minutes.
6. Once deployed, point your `clm.openhouse.in` DNS CNAME to the Vercel URL (in Vercel → Domains → Add).
7. Come back to Supabase → Authentication → URL Configuration and update Site URL + redirect URL to the production URL if you haven't already.

### 6. First sign in

1. Open `https://clm.openhouse.in`.
2. Click "Sign in with Google".
3. Sign in with your `@openhouse.in` account.
4. You're now the admin — everyone else who signs in becomes an editor by default.
5. You can promote other admins from the user menu → Manage team.

## Development (local)

```bash
# Clone and install
git clone <your-repo>
cd clm-next
npm install

# Configure env
cp .env.example .env.local
# Edit .env.local with your Supabase and Anthropic keys

# Run dev server
npm run dev
# Open http://localhost:3000
```

**PDF generation locally** requires Chrome/Chromium. Set `PUPPETEER_EXECUTABLE_PATH`
in `.env.local`:

```
# macOS:
PUPPETEER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# Linux:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

On Vercel this is handled automatically via `@sparticuz/chromium`.

## Project structure

```
clm-next/
├── app/
│   ├── layout.tsx               # Root layout + fonts
│   ├── globals.css              # All the styles
│   ├── page.tsx                 # Home — agreements list
│   ├── login/page.tsx           # Google SSO login
│   ├── auth/callback/route.ts   # OAuth callback
│   ├── agreements/[id]/page.tsx # Editor (server component)
│   └── api/
│       ├── ai/chat/route.ts          # AI chat (server-side Claude)
│       ├── ai/extract/route.ts       # PDF/image extraction
│       ├── pdf/route.ts              # Puppeteer PDF generation
│       └── notifications/review-request/route.ts  # Resend email
├── components/
│   ├── AgreementEditor.tsx      # Main editor (~40% of app)
│   ├── ContractPreview.tsx      # Right-panel rendered contract
│   ├── EditPopover.tsx          # Floating inline-edit popup
│   ├── Tokenized.tsx            # Parses ⟦path|display⟧ tokens
│   ├── UserBadge.tsx            # Avatar + dropdown
│   └── TeamSettingsModal.tsx    # Admin role management
├── lib/
│   ├── supabase-browser.ts      # Client-side Supabase
│   ├── supabase-server.ts       # Server/service-role Supabase
│   ├── contract.ts              # Clause library, templates, formatters
│   ├── path-meta.ts             # Field labels, audit labels
│   └── db.ts                    # Typed CRUD over Supabase
├── supabase/migrations/
│   └── 0001_initial_schema.sql  # Database schema + RLS
├── middleware.ts                # Session refresh + domain gate
└── .env.example                 # All required env vars
```

## Troubleshooting

**"Only @openhouse.in emails are permitted"** — You tried to sign in with a non-openhouse
Google account. This is enforced in three places (client, middleware, database RLS).
Sign out of Google and use your Openhouse account.

**PDFs time out on Vercel** — Puppeteer cold start can take 8–12s. If it consistently
exceeds the 60s limit, upgrade to Vercel Pro (300s max) or switch to an external PDF service.

**"Failed to save version: violates row-level security policy"** — Your user profile
row wasn't created. Check the auth trigger in `handle_new_user()` — it should fire
automatically on first sign-in. If not, insert manually via SQL:
```sql
insert into public.users (id, email, role) values ('<your-auth-uid>', 'you@openhouse.in', 'admin');
```

**No emails being sent** — Either `RESEND_API_KEY` is missing (app silently skips email)
or the sending domain isn't verified in Resend. Check the route logs on Vercel.

**Changes from teammates not appearing** — Polls happen every 3.5s. If you're editing
actively within 1.5s of each keystroke, polling defers briefly to avoid overwriting your
own work. For true real-time, swap `setInterval` in `AgreementEditor.tsx` for Supabase
Realtime subscriptions on the `agreements` table.

## Future work

- **DocuSign integration** — e-signing flow once contracts are approved
- **Supabase Realtime** — replace polling with live subscriptions
- **Version diff viewer** — side-by-side comparison of two versions
- **Template editor** — UI for admins to add/edit clauses without touching code
- **Analytics** — dashboard of AMAs by status, by month, by creator, time-to-approval

## License

Internal use at Openhouse (Avano Technologies Pvt. Ltd.) only.
