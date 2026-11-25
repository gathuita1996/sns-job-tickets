# The 5:31 pm late-payment email (Updates 52 and 53)

Every evening, one minute after the **5:30 pm** closing hour, the server checks whether any **transport** or **expense / purchase** payment is still unpaid. If something is, the **Director gets one short email**. If everything has been paid, nothing is sent. It does this on **every day of the week, Sundays and public holidays included** (since Update 53).

You do not have to set this up to use updates 52 and 53. Until you do, no email is sent and nothing else is affected, and you can set it up on any day.

**Time needed:** about 15 minutes (plus a little more if you verify your own domain with Resend).

---

## What the email says

**Subject**

```
Late payments: KSh 4,700 unpaid after closing
```

**Message**

```
Hello Naibei,

These payments are still unpaid after the 5:30 pm closing time:

- Transport: KSh 1,200 (2 staff members)
- Expenses / purchases: KSh 3,500 (1 request)

Open Job Cards to pay: https://snsjobcard.netlify.app

Swahili Net Solution
```

The names and amounts change every time; the words do not. A line appears only for the kinds that are really owed. If someone presses **Run now** before 5:30 pm to try it out (Step 4), the subject starts with **[Test]** and the message says it is a test run, so nobody mistakes it for a real alert.

## What counts as "still unpaid"

It is the same money you see in the app, over **all** days, not only today:

- **Transport:** a job's transport amount that has not been marked paid (the "unpaid" figure on the **Transport** tab). The number in brackets is how many staff members are owed.
- **Expenses / purchases:** the rows that have a **Mark as Paid** button on the Expenses screen: a purchase whose receipt has been attached and is waiting for payment, and an approved service that has not been paid. The number in brackets is how many requests.
- **Not counted:** requests still waiting for approval, rejected ones, approved purchases that have not been bought yet (no receipt), anything already paid, and anything the Director paid in advance with **Approve and pay**.

Money that has been waiting since an earlier day is still unpaid, so it appears in every evening's email until it is marked paid. The first email after you start may therefore include older amounts that were paid in cash but never marked as paid in the app; mark them as paid once and they disappear.

## When it is sent

- At **5:31 pm Nairobi time, every day of the week**. **Sundays and public holidays are not skipped**: a technician can be called out on any day, so a payment can be late on any day. The public holidays the Director adds under **Staff → Leave → Policy & holidays** are only for counting leave; they do not stop this email.
- Netlify reads schedules in UTC, and Nairobi is three hours ahead all year, so the schedule is **14:31 UTC**. Netlify starts the function at that minute and the email then takes a few seconds to arrive. Netlify does not promise the exact second, so "5:31 pm" means the 5:31 minute, not 5:31:00.
- Only the **live (published) site** runs it on its schedule. A deploy preview or a branch deploy does not.
- The same email is never sent twice in one minute, even if Netlify or the network repeats the request.

---

## Before you start

1. **The site is deployed from GitHub** (README, Part 3, Option A). The email runs as a Netlify Function, which Netlify builds for you. A drag-and-drop of the `dist` folder has no functions.
2. **The Director is set in the app and has an email address.** Open **Staff**, click the person, press **Make Director** (only an admin can). The email goes to the address on the Director's account (the one they signed up with). To send somewhere else, or to more than one person, use `ALERT_EMAIL_TO` in Step 2.
3. **`SUPABASE_SERVICE_ROLE_KEY` is already set in Netlify** if you did Step 4 of WHATSAPP-SETUP.md. If not, add it in Step 2 below. The email uses it to read what is unpaid, because nobody is logged in when it runs.

---

## Step 1. Resend (the service that sends the email)

1. Go to **resend.com** and create a free account. Use the email address that should receive the test emails (the Director's, if you can): see the note under point 3.
2. **API Keys → Create API Key.** Name it `sns-late-payments`, give it **Sending access**, and press **Add**. Copy the key (it starts with `re_`) **now**; Resend shows it once. This is `RESEND_API_KEY`. Treat it like a password.
3. **Recommended: your own sender address.** **Domains → Add Domain**, type your domain, add the DNS records Resend shows at the place that manages your domain, and press **Verify**. Then you can send from, for example, `Swahili Net Job Cards <alerts@yourdomain>` (`ALERT_EMAIL_FROM`, Step 2).
   - Without a verified domain, Resend only lets you send from its test address and **only to the email address your Resend account was opened with** (the error says *You can only send testing emails to your own email address*). That is enough if the Director's email is the one the Resend account was opened with.

At the time of writing the free plan allows 100 emails a day and 3,000 a month. This sends at most one a day.

---

## Step 2. Settings in Netlify

**Netlify → your site → Project configuration → Environment variables → Add a variable.** Keep the default scopes. For the secret one, tick **Contains secret values**.

| Name | What it is | Secret |
| --- | --- | --- |
| `RESEND_API_KEY` | The key from Step 1. | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Only if it is not there yet: Supabase → Project settings → API keys → the `service_role` key (or the "secret" key that starts `sb_secret_`). It bypasses the database's security rules, so it lives **only here**. | yes |
| `ALERT_EMAIL_FROM` | Optional. The sender, for example `Swahili Net Job Cards <alerts@yourdomain>`. Without it the test sender `Swahili Net Solution <onboarding@resend.dev>` is used. | |
| `ALERT_EMAIL_TO` | Optional. One or more addresses, separated by commas, instead of the Director's address from the app. The greeting then says just "Hello,". | |
| `ALERT_APP_URL` | Optional. The address of your site, for the link at the bottom of the email, for example `https://snsjobcard.netlify.app`. Without it Netlify's own address for the site is used when it has one, otherwise the link line is left out. | |

**You do not need `SUPABASE_URL`.** The email reuses the `VITE_SUPABASE_URL` you already have.

**Then redeploy** (Deploys → Trigger deploy → Deploy site). Netlify hands new variables to functions only at deploy time.

---

## Step 3. Make sure Netlify has picked the function up

After the deploy, open **Netlify → your site → Functions** (Netlify moves its menus around from time to time; if you do not see it, look under **Logs**). You should see **late-payments-alert**, marked as scheduled. If it is not there, the site was not deployed from GitHub, or the deploy failed; read the deploy log.

---

## Step 4. Try it

1. Make sure something is unpaid: file a job that has a transport amount and do not mark it paid (or leave a purchase with a receipt waiting for payment).
2. On the **Functions** page, open **late-payments-alert** and press **Run now**.
3. Within a minute the Director's inbox gets the email (look in the spam folder the first time). Before 5:30 pm it is marked **[Test]**.
4. Open the function's log. A good run says, for example, *late-payments-alert: email sent to 1 address: KSh 4,700 unpaid (transport KSh 1,200, expenses KSh 3,500). Resend id ...*
5. Mark the test amounts as paid again. If you run it with nothing unpaid, the log says *nothing is unpaid, so no email* and no email is sent. That is correct.

---

## If the email does not arrive

Open the function's log. Each problem says what to do:

| The log says | What to do |
| --- | --- |
| *The late-payment email is not set up. Add ... under Netlify* | A setting from Step 2 is missing. Add it and redeploy. |
| *ALERT_EMAIL_TO has something that is not an email address* | Fix the address (a comma between addresses, nothing else). |
| *The Director has no email address in the app* | Someone must be made Director (Staff → the person → Make Director), and their profile must have an email address. Or set `ALERT_EMAIL_TO`. |
| *Resend answered 403: You can only send testing emails to your own email address* | The domain is not verified in Resend. Verify it (Step 1, point 3) and set `ALERT_EMAIL_FROM`, or send to the email address your Resend account was opened with. |
| *Resend answered 401 / 400 ...* | The key is wrong, was removed in Resend, or is a key without Sending access. Make a new one and replace `RESEND_API_KEY`. |
| *Could not read jobs / expenses: the database answered 401* | `SUPABASE_SERVICE_ROLE_KEY` is wrong. Copy it again from Supabase. |
| *nothing is unpaid, so no email* | Everything has been paid. Nothing to do. |
| No log line at all at 5:31 pm | Only the live (published) site runs it on its schedule. Check the function still shows its schedule in Step 3. |

A passing problem (the database or Resend not answering for a moment) is tried again by itself, up to three times, and the email is never sent twice.

---

## Changing it later

- **The time:** change the schedule in `netlify/functions/late-payments-alert.mjs` **and** `ALERT_CRON` in `netlify/lib/lateAlert.mjs` (and the 5:30 / 5:31 wording there). A test fails if the two schedules differ or no longer say 5:31 pm in Nairobi. Netlify reads the schedule in UTC.
- **The words:** `buildEmail` in `netlify/lib/lateAlert.mjs`. The test compares it with the message in this guide, so change both.
- **Who gets it:** `ALERT_EMAIL_TO`, or the Director's email in the app.
