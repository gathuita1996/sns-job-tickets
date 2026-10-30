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

## Update 35

- **Stock In** is a drop-down entry: click the item box, pick the item, enter the quantity (the price fills in from the catalogue). "Add another item" adds a line. The long list is gone.
- **ONU / XPON router log**: items ticked as *Field device* in the Item Master ask "New installation or Replacement?" when issued from Stock Out. A replacement must name the customer, chosen from the customers in the system. Stock > "ONU / Router log" lists them and flags customers replaced more than once.
- **Field Visits** (Sales & Marketing staff, and an admin tab): record places visited for marketing and site surveys; see visited, most visited, need to visit and need to revisit, with suggested next places and a route by area.
- **Data & Backup** (admin): back up everything to one Excel file on this computer, export to Excel, import a customer list, or restore a backup. A banner reminds the admin when the last backup is more than 7 days old.
- "Pigtails" is removed from the item list.

To apply: run `supabase/update-35-migration.sql` in the Supabase SQL editor FIRST (safe to run twice), then push the code. A fresh database is built with `supabase/schema.sql` (the same file as `job-card-rebuild.sql`), then `job-card-restore-stock-history.sql` once the first admin exists.

Logic tests: `npm test`.

## Update 36

- **Customers (admin):** rows are numbered, there is an **Edit** icon next to View, Print and Delete (it opens the same form the sales team uses), and the Status column is gone. The package is called **Package installed** everywhere (it used to say "Package requested" / "Interested package").
- **Settings** (team access code, commission rate) now open from your own profile: click your name at the top right, then the **Settings** tab. There is no Settings tab on the dashboard any more.
- **Employee numbers:** Team tab > **Assign employee numbers** gives every team member without one a number: SNS001 to the Director, SNS002 to the admin who presses the button, everyone else a random number from SNS003. Numbers already given never change, so it is safe to press again when someone new joins. An admin can also type a number into someone's profile (format SNS001, unique). Only an admin can change a number.

To apply: run `supabase/update-36-migration.sql` in the Supabase SQL editor first (after update 35), then deploy the code. In the app, make sure the Director is set (Team tab > Make Director), then press Assign employee numbers.

Removed from the package: the old `employee-number-and-service-fix-migration.sql`. It made employee numbers compulsory, which no longer suits the new sign-up flow.

## Update 37

- **Customer-list import** now reads only **Name** and **Phone**; every other column in the file is ignored, and location, package and the rest are filled in inside the system afterwards. (The earlier version also tried to fill a `status` column on customers, which the database no longer has, and failed with "Could not find the 'status' column".) Imported customers are recorded by the admin who imports them and never earn commission. The template is just Name and Phone.
- **Import and restore cope with columns the database does not have:** the missing column is skipped and reported on screen, instead of the whole job failing. Columns needed to link records (or required for a customer) are never skipped silently.

## Update 38

- **Log a service works again.** The database requires every expense to have a category; a purchase picks one from a list but a service has none, so every service was refused ("Failed to submit service request"). Services now get the category **Service**, both in the app and as a database default. The database part can be applied on its own, with no deploy: run `supabase/update-38-migration.sql`.
- **Locations added:** Mvindeni, Diani Market, Kalipso, Nyumba Tatu, Mkwakwani (Darad was already listed). They appear in the customer, job and complaint forms and in transport from/to.
- **Packages added:** Swahili 25 Unlimited (KSh 3,350) and Swahili 30 Unlimited (KSh 2,850), in speed order before "Not sure yet". The price is shown next to the name in the package list; only the package name is saved on the customer.

## Update 39

- **Site surveys record a GPS location.** When a member picks **Site Survey** as the job type, a "GPS location at the site" section appears as the **last input** of the form. It is **required** when filing: the member taps *Record GPS location* while standing at the site and the phone supplies the position (it cannot be typed in). The coordinates, accuracy and time are shown with an *Open in Maps* link, and the survey cannot be filed until a location is recorded. A rough fix (over 100 m) is flagged so it can be retaken outdoors.
- Admins handing a survey to someone are not asked for a location (they are not at the site). Editing an existing survey shows the saved location and lets it be recorded again, but does not force it, so older surveys stay editable from the office. The location appears in the job's detail/print view with a link to the map.
- The database enforces it too: a member cannot file a site survey without a location even by bypassing the app. Run `supabase/update-39-migration.sql` before deploying (safe to re-run).

## Update 40

**To apply:** (1) run `supabase/update-40-migration.sql` in the Supabase SQL editor first (safe to run again), (2) make sure the Director is set (Team tab > Make Director), because only the Director can approve leave, (3) deploy the code. A fresh install needs only `job-card-rebuild.sql`, which now contains this update.

- **Complaints removed from the member portal**, completely: no Complaints card, no Report a complaint form, nothing loaded for members. Old complaint records stay in the database and in backups. (The separate mobile app still has its own complaints screens.)
- **Profile pictures** for everyone (My profile > Add picture). Pictures are cropped square and shrunk to about 30 KB before upload and show in the header, the Team list and the staff page. Only the owner can change theirs; an admin can remove one.
- **Employee number** is read-only in everyone's own profile (it is given by the admin). **Bank details** (bank name, account number, optional account name and branch) sit in their own table: only the owner and admins can read them. They are not included in backups, on purpose.
- **Packages:** Swahili 8 Unlimited at KSh 1,500 added, and Swahili 30 Unlimited is now KSh 3,850 (this matches the website). New customers still start on 10 Mbps.
- **Backup banner is shared.** The last backup date now lives in the database, so when any admin presses Back up now the banner disappears for every admin (it updates live, without a reload). It shows who made the last backup.
- **Retrieved routers** (new tab for admins; a card for Technical members): date, customer (from the system or typed), router and serial/MAC, **reason** (Failed to pay with the amount owed, Customer requested, or Other with an explanation), condition, accessories, who retrieved it. Admins then mark what happened: In store, Under repair, Re-issued or Written off, with a note. Technical members can record and see their own entries; only admins change the status or delete.
- **Who recorded a customer.** In Customers: a **By staff member** view (click a person to see everything they recorded), a Recorded by filter, a pencil in each row to change the person, tick boxes to hand many customers to one person at once, and Recorded by on the edit form. The customer-list import can record under a chosen person, or read a "Recorded by" column in the Excel file (names, usernames or employee numbers; names that are not found are listed, never guessed). **Imported customers never earn commission**, even after they are handed to someone: they carry an Imported flag that the commission figures, reports and member totals all respect. The update also stops members from changing commission status or who recorded a customer.
- **Leave** (My profile > Leave, for every staff member): 21 days a year, the leave year starting 1 August (2026 is Aug 2026 to Jul 2027), at most 3 days in a calendar month, approved by the Director only. The member sees days used, waiting and left, applies with a live check that explains any refusal in words, and can cancel pending leave (or approved leave that has not started). Sundays never count; Saturdays count (a switch in Leave > Policy & holidays); public holidays the Director adds do not count, and one button adds the Kenyan public holidays for the leave year (fixed days, Good Friday, Easter Monday and the Sunday-to-Monday rule; Eid and announced days are added by hand). A request cannot cross 1 August (send two). The **Leave** tab for admins shows requests (only the Director sees Approve and Reject; rejecting needs a reason the member sees), who else is away on those dates, everyone's balance, who is away now and soon, and lets the Director record leave, adjust days, and change the policy. The Director's own leave is approved automatically. **The rules are enforced in the database**, so they hold even if someone bypasses the app.
- **Opening leave balances:** Gideon 6 days and Alex 5 days (leave year 2026) are applied by the SQL when each name matches exactly one person. If either is not applied, the SQL says so, and the Director sets it from Leave > Balances > Adjust days.
- **Staff page** (Team tab: click a name or Details): picture, contact, employee number, personal details, bank details, leave balance and history, customers recorded, recent jobs, and counts of purchases, visits and routers.
- **Closed a gap found on the way:** members could change their own Director, Team Lead and department fields by calling the database directly. Only admins can now.
- Backup and restore include the new data. Restoring leave records and public holidays needs the Director; a leave record the rules refuse is skipped and reported.

## Update 41

**To apply:** (1) run `supabase/update-41-migration.sql` in the Supabase SQL editor (after update 40; safe to run again), (2) deploy the code. A fresh install needs only `job-card-rebuild.sql`, which now contains updates 40 and 41.

- **Staff** (the old Team tab): click **anywhere in a person's row** to open their page. **Promote, Make Director, Department and Make Team Lead** moved onto that page, under **Role & access**. Promote and Make Director ask for confirmation first (the Director one names who stops being Director). The list gets a search box once there are more than six people.
- **Leave** moved onto the Staff page, as a button right after **Assign employee numbers**, with the count of requests waiting.
- **Field Visits** moved into **All Jobs**, as a button just before **File a job**. The search box, filters and buttons in that row were made compact so they sit on **one row** on a desktop screen (screens narrower than about 1130 px wrap onto two rows).
- **Data & Backup** moved into the profile window (click your name): **My profile, Leave, Data & Backup, Settings**. The backup reminder opens it.
- **Retrieved Routers** moved to the **Stock** page, right after **Need Reorder**, and now **adds to stock**. Pick the router from the stock list when recording it (Technical members see the router items too). Recording one adds a Stock In of 1, labelled "Retrieved from <customer>" at KSh 0; correcting the record corrects the stock; **Written off** takes it out with a Stock Out (and changing your mind brings it back); deleting the record removes its stock rows. The stock list shows how many returned routers are in the store, for example "5 (↩ 1)". Re-issuing a router to a new customer is still an ordinary Stock Out, so it shows in the ONU / Router log. The router items need **Field device** ticked in the Item Master. The database does this, so technicians still cannot read or change stock themselves.
- **Expenses/Purchases summary:** This week and This month cards (paid, approved and to be paid, waiting for approval), and a Weekly/Monthly explorer with arrows showing the totals by category and **who spent what**. An expense counts on its purchase date (or its request date until it is bought); rejected requests are left out.
- **Transport:** new design, with **Daily report** and **Monthly report** buttons. A report opens as a **full page** (not a pop-up): the total, trips, paid and not yet paid, **Who spent what**, day by day (monthly), and every trip, with **Print** and **Download Excel**. Marking someone as paid stays on the Transport tab. The Commission report is unchanged.
- **Team became Staff** in the tab, hints and messages.
- Backup and restore carry the stock links, so restoring does not add a second Stock In.

