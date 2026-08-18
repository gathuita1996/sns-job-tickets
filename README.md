# Swahili Net Solution — Job Cards

A job card system for field visits: members file job cards, admins see and
manage everyone's, and either can generate a print-ready PDF. Built with
React + Vite, a Supabase Postgres database, and deployed on Netlify.

This replaces the earlier Claude-artifact version (which stored data in
Claude's own storage) with a real, independently hosted web app anyone on
your team can reach at its own URL.

---

## What you'll need

- A free [Supabase](https://supabase.com) account (the database + login system)
- A free [Netlify](https://netlify.com) account (hosting)
- A free [GitHub](https://github.com) account (recommended, for auto-deploys — optional, see the drag-and-drop alternative in Part 3)
- [Node.js](https://nodejs.org) 18+ installed on your computer, only if you want to run it locally before deploying (optional but recommended for testing)

Total setup time: roughly 20–30 minutes.

---

## Part 1 — Set up Supabase (the database)

1. Go to [supabase.com](https://supabase.com), sign up or log in, and click
   **New project**. Pick any name (e.g. "sns-job-cards"), set a database
   password (save it somewhere — you likely won't need it again, but keep
   it), and choose a region close to Kenya if offered (e.g. an EU or South
   Africa region will be faster than US).
2. Wait ~2 minutes for the project to finish provisioning.
3. In the left sidebar, open the **SQL Editor**, click **New query**, then
   open `supabase/schema.sql` from this project, copy its entire contents,
   paste it in, and click **Run**. This creates both tables, all the
   security rules, and the automatic behaviors (job numbering, first-signup-
   becomes-admin, etc.). You should see "Success. No rows returned."
4. Go to **Project Settings → API** (gear icon, bottom of sidebar). You'll
   need two values from this page in Part 2:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon / public** key — on newer projects this may be labeled **Publishable key** instead (starts with `sb_publishable_...` rather than the older `eyJ...` format). Either works identically with this app.
5. Go to **Authentication → URL Configuration**. Under **Redirect URLs**,
   add:
   - `http://localhost:5173` (for local testing)
   - your future Netlify URL, e.g. `https://your-site-name.netlify.app`
     (you can come back and add this after Part 3 once you know the URL)

   This step is what makes the "forgot password" email link work — without
   it, Supabase will reject the redirect.
6. Optional but recommended for an internal team tool — go to
   **Authentication → Providers → Email** and consider turning **off**
   "Confirm email". With it on (the default), everyone must click a link in
   their email before they can log in, which is safer but adds friction for
   an internal tool where you already trust who's signing up. With it off,
   signup logs people in immediately. Either works with this app — it
   handles both cases.
7. Optional, for the live-sync feature (everyone's screen updates
   automatically when a job card changes) — go to **Database → Replication**
   and toggle on replication for the `jobs` table. If you skip this, the
   app still works perfectly; people just see new/changed jobs after their
   next action instead of instantly.

That's the entire backend. No servers to manage.

---

## Part 2 — Run it locally and test

This step is optional but strongly recommended before deploying, so you can
catch anything project-specific (like your Supabase settings) before your
whole team is using it.

1. Open a terminal in this project folder and run:
   ```
   npm install
   ```
2. Copy the example environment file and fill in your two Supabase values
   from Part 1, step 4:
   ```
   cp .env.example .env.local
   ```
   Then edit `.env.local` so it looks like:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
   Open the URL it prints (usually `http://localhost:5173`).

### Testing checklist

Work through this in order — the first signup is special (it becomes admin),
so testing order matters:

1. **Sign up as yourself first.** Fill in the signup form and submit. If you
   left "Confirm email" on in Supabase, check your inbox and click the
   confirmation link before logging in. This first account is automatically
   the **admin** — you won't see a role picker anywhere; it's automatic.
2. **Log in.** You should land on the Admin Portal (Overview / All Jobs /
   Team tabs).
3. **Open an incognito window** (or a different browser) and sign up a
   second account — this one becomes a regular **Member**. Log in there and
   confirm you land on the Member Portal instead.
4. **File a job card** as the Member. Confirm it appears, with a job ID like
   `JC-0001`.
5. **Switch back to the Admin window** and check the **All Jobs** tab — the
   job you just filed should appear (refresh if you skipped the realtime
   step above). Confirm the **Overview** tab's stats and chart updated too.
6. **Promote your Member test account to admin** from the **Team** tab, and
   confirm the "Promote" button disappears and a role badge shows up next to
   their name. (They'll see admin features after their next login/refresh.)
7. **Print a job card**: open a job, click "Print / Save as PDF", and
   confirm your browser's print dialog shows a clean, formatted card. Try
   the batch print too (select a few jobs in All Jobs, then "Print
   selected").
8. **Test "Forgot password"** from the login screen with one of your test
   emails, and confirm the email arrives and the reset link logs you
   straight into your dashboard after setting a new password.
9. **Edit and delete** a job card from both the Member and Admin side to
   confirm both work.

If anything misbehaves, the browser console (F12 → Console tab) will
usually show the Supabase error message, which is the fastest way to
diagnose it.

---

## Part 3 — Deploy to Netlify

### Option A — GitHub-connected (recommended)

This gives you automatic redeploys every time you push a change — the
standard way to run a real site.

1. Create a new, empty repository on GitHub (don't initialize it with a
   README).
2. In this project folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. In Netlify, click **Add new project → Import an existing project**, choose
   GitHub, authorize it, and pick your new repository.
4. Netlify should auto-detect the build settings from `netlify.toml`
   (build command `npm run build`, publish directory `dist`) — leave them
   as detected.
5. Before deploying, click **Add environment variables** (or find this
   later under **Project configuration → Environment variables**) and add the
   same two values from your `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **Deploy**. After a minute or two you'll get a live URL like
   `https://your-site-name.netlify.app`.
7. Go back to Supabase → **Authentication → URL Configuration** and add
   this real URL to **Redirect URLs** (Part 1, step 5) if you haven't
   already.
8. Optional: under **Project configuration → Domain management** in Netlify,
   you can add a custom domain, or just rename the free `netlify.app`
   subdomain to something friendlier.

From now on, any `git push` to `main` automatically redeploys the site.

### Option B — Drag and drop (fastest, no GitHub needed)

Good for a quick first deploy; you'll need to repeat the build step
manually for future updates.

1. Build the app locally with your real Supabase values already in
   `.env.local` (see Part 2, steps 1–2):
   ```
   npm run build
   ```
   This creates a `dist` folder with the finished site baked in.
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the
   `dist` folder onto the page.
3. Netlify gives you a live URL immediately.
4. Add that URL to Supabase's Redirect URLs list (Part 1, step 5).

---

## Sharing it with your team

Once deployed, just send everyone the Netlify URL — no file to email
around. Anyone can sign up; the first person becomes admin, everyone after
that is a Member until an admin promotes them from the Team tab.

---

## About that "nicer confirmation message"

Supabase's default signup/reset emails are plain and clearly
Supabase-branded. You can customize them under **Authentication → Email
Templates** in your Supabase project — edit the subject line and HTML body
for "Confirm signup" and "Reset password" to add your own wording or
styling. For a fully custom sender address (e.g. `noreply@swahilinet.co.ke`
instead of Supabase's default), you'd connect your own SMTP provider under
**Project Settings → Auth → SMTP Settings** — happy to help wire that up
once you've got one picked out.

---

## What changed from the artifact version

- **Real backend.** Data lives in a proper Postgres database with row-level
  security, not client-side storage — this is what makes independent
  hosting possible.
- **Real login.** Email + password via Supabase Auth, with server-side
  password hashing and rate-limiting (stronger than the previous
  browser-side PBKDF2 approach), sessions that persist across visits, and
  working "forgot password" (not possible in the artifact version).
- **No more admin code.** The first account created becomes admin
  automatically; admins promote teammates from the Team tab instead of
  everyone sharing a hardcoded access code.
- **Race-condition-free job IDs.** `JC-0001` style numbering is now
  generated by the database itself, so two people filing at the same
  moment can never collide.
- **Optional live sync.** Other people's changes can appear without a
  manual refresh (see Part 1, step 7).

## Project structure

```
src/
  App.jsx                  Auth state, data fetching, all handlers
  lib/
    supabaseClient.js      Supabase connection
    mappers.js             DB row <-> app object field mapping
    helpers.js             Formatting, constants
  components/
    Auth.jsx                Login / signup / forgot / reset password
    Header.jsx, shared.jsx  Layout & reusable UI pieces
    JobForm.jsx, JobsTable.jsx, PrintViews.jsx, TeamList.jsx
    MemberDashboard.jsx, AdminDashboard.jsx
supabase/
  schema.sql                Run this once in the Supabase SQL Editor
```
