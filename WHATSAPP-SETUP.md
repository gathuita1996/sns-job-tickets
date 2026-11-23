# Sending receipts automatically on WhatsApp (Update 49)

With this switched on, **Send receipt** no longer opens WhatsApp for you to press Send. The server sends the receipt to the customer from the business WhatsApp number, **with the PDF attached**, and the app shows whether it was **sent, delivered and read**.

You do not have to set this up to use update 49. Until you do, the app works as it did in update 48: WhatsApp opens on the customer's number and you press Send there. Nothing breaks, and you can set it up on any day.

**Time needed:** about 45 minutes of your own work, plus Meta's approval of the message template (usually minutes, sometimes up to a day).

---

## Before you start

1. **A phone number for the business WhatsApp.** The customer sees this number as the sender. It must be able to receive an SMS or a voice call once, to prove it is yours.
   - In the setup used here, a number is either on the WhatsApp / WhatsApp Business **phone app** or on the **API**, not both. (Meta has a "coexistence" option that allows both, but it is offered through approved partner companies, not through the direct setup in this guide.) If you want to keep chatting with customers on your phone, use a **separate number** for receipts.
   - **This app does not read customers' replies.** If a customer answers the receipt message, the reply goes to Meta's API and nobody sees it in this app. Tell customers where to write to you (your support number, for example) so that questions do not go unanswered.
2. **A Meta (Facebook) account** that can be the admin of a Meta Business portfolio (business.facebook.com).
3. **The site must be deployed from GitHub** (README, Part 3, Option A). The WhatsApp part runs as two Netlify Functions, which Netlify builds for you. A drag-and-drop of the `dist` folder (Option B) has no functions, so automatic sending would show as "not available here".
4. **`supabase/update-49-migration.sql` has been run** in the Supabase SQL editor (it creates the message log) and update 49 has been deployed.

Meta changes the look and the names of its screens from time to time. The names below are the ones Meta's own documentation uses today; if a screen looks different, look for the same words.

---

## Step 1. The app, the account and the number (Meta)

1. Go to **developers.facebook.com**, log in, **My Apps → Create app**. Choose the use case **Connect with customers through WhatsApp** and link your **Meta Business portfolio** (create one if you have none).
2. Open the app, then **WhatsApp → API Setup**. Meta gives you a test number and a temporary token that lasts 24 hours. **You will not use either.**
3. Under **Add phone number**, add the business number and verify it with the SMS or voice code. Choose a **display name** (for example *Swahili Net Solution*); Meta checks it, and it can take a day.
4. With your number selected on the API Setup page, write down:
   - the **Phone number ID** (a long number, not the phone number itself), and
   - the **WhatsApp Business Account ID**.
5. **Add a payment method** to the WhatsApp Business account (Meta Business settings, billing / payment methods). Without it, Meta refuses to deliver template messages and the app shows "WhatsApp cannot send because of a payment problem" (see *Costs*).
6. **Recommended: verify your business** (Meta Business settings → Security Center → Business verification). It is not needed to start. See *Limits*.

---

## Step 2. A token that does not run out (Meta)

The temporary token from API Setup stops working after a day. Make a long-lived one:

1. Meta **Business settings → Users → System users → Add**. Name it `sns-receipts` and give it the **Admin** role.
2. Select it, **Assign assets**: choose **Apps** → your app → **Manage app** (full control); then **WhatsApp accounts** → your business account → full control. Reload the page and check it shows **Full control**; this can take a few minutes.
3. **Generate token**: pick your app, choose the **longest expiry** offered (**Never**, if there is a Never option), and tick all three permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
4. Copy the token **now**. Meta will not show it again. This is `WHATSAPP_ACCESS_TOKEN` (Step 4). Treat it like a password.

If Meta ever gives your token a date, put a reminder in your calendar a week before it. When a token is refused, the app says "WhatsApp did not accept the access token" and the Set-up check (Step 6) shows it in red.

---

## Step 3. The receipt message template (Meta)

WhatsApp only lets a business start a conversation with a message that Meta has **approved in advance**, with fixed wording and numbered blanks. Create it exactly as below. (The same text and sample values are shown, with Copy buttons, in the app: **Customers → Set up WhatsApp sending**.)

**WhatsApp Manager → Message templates → Create template**

| Setting | Value |
| --- | --- |
| Category | **Utility** |
| Name | `sns_payment_receipt` |
| Language | **English** (`en`) |
| Header | **Media → Document**, and upload any receipt PDF as the sample (download one from a customer's row in the app) |
| Footer | `Swahili Net Solution` |
| Buttons | none |

**Body** (copy it exactly, including the blank line between paragraphs):

```
Hello {{1}}, thank you for your payment of {{2}} (M-Pesa ref {{3}}), received on {{4}}.

Your receipt, invoice no. {{5}}, is attached. Your internet subscription is valid for 30 days and expires on {{6}}.

Thank you.
```

**Sample values** Meta asks for, one for each blank:

| Blank | What the app puts in | Sample |
| --- | --- | --- |
| `{{1}}` | the customer's first name | `Amina` |
| `{{2}}` | the amount paid | `Ksh 2,000.00` |
| `{{3}}` | the M-Pesa code | `UKL41383DB` |
| `{{4}}` | the date and time of the payment | `21 Nov 2026 at 05:50 PM` |
| `{{5}}` | the invoice number | `SNS/26/1008` |
| `{{6}}` | the date the subscription expires | `21 Dec 2026` |

Submit it. Meta usually approves a plain receipt like this within minutes; it can take up to a day. The status shows in WhatsApp Manager, and in the app's Set-up check (Step 6).

- **If Meta files it as Marketing** instead of Utility, edit it and resubmit. Marketing messages cost more and have stricter limits. Do not add offers or promotional lines to the wording.
- The words are fixed. To change them later, the template in Meta **and** the app (`src/lib/whatsappTemplate.js`) must change together. Meta limits how often an approved template can be edited, so decide the wording before you submit.
- The template says "valid for 30 days". The app only sends it when the receipt is for 30 days (which is every receipt the app makes today). For any other length the app refuses to send automatically and offers to open WhatsApp instead.

---

## Step 4. Settings in Netlify

**Netlify → your site → Project configuration → Environment variables → Add a variable.** Keep the default scopes (builds, functions, runtime). For the ones marked *secret*, tick **Contains secret values** (Netlify then never shows them again).

| Name | What it is | Secret |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API keys: the `service_role` key (or the "secret" key that starts `sb_secret_`). It bypasses the database's security rules, so it lives **only here**: never in the app, never in an email. | yes |
| `WHATSAPP_ACCESS_TOKEN` | The token from Step 2. | yes |
| `WHATSAPP_PHONE_NUMBER_ID` | From Step 1. | |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | From Step 1. Used only by the Set-up check, to look up whether the template is approved. | |
| `WHATSAPP_APP_SECRET` | App dashboard → **App settings → Basic → App secret → Show**. Lets the server know that delivery news really comes from WhatsApp. | yes |
| `WHATSAPP_VERIFY_TOKEN` | A long phrase you make up (30 or more letters and numbers, no spaces). You type the same phrase into Meta in Step 5. | yes |

Optional, only if you changed something: `WHATSAPP_TEMPLATE_NAME` (default `sns_payment_receipt`), `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`), `WHATSAPP_API_VERSION` (default `v24.0`).

**You do not need `SUPABASE_URL` or `SUPABASE_ANON_KEY`.** The functions use the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` you already have. If the Set-up check ever says they are missing, add them with the same values and **do not** tick *secret* on them (the anon key is inside the app by design, and Netlify stops a deploy that finds a secret value in the built site).

**Then redeploy** (Deploys → Trigger deploy → Deploy site). Netlify hands new variables to functions only at deploy time.

---

## Step 5. News about delivery (Meta)

This is what lets the app show **Delivered** and **Read**. Receipts are sent without it, but would stay at "Accepted by WhatsApp".

1. App dashboard → **WhatsApp → Configuration → Webhook → Edit.**
2. **Callback URL:** `https://YOUR-SITE.netlify.app/.netlify/functions/whatsapp-webhook` (use your own domain if the site has one).
3. **Verify token:** the same phrase as `WHATSAPP_VERIFY_TOKEN`. Press **Verify and save**. If Meta says it could not verify, the variable is missing or the site was not redeployed after adding it.
4. In **Webhook fields**, find **messages** and press **Subscribe**.
5. Put the app in **Live** mode (the switch at the top of the app dashboard). Meta does not send some webhooks while an app is in Development mode. Meta may ask for a privacy policy page address before it lets you switch.

---

## Step 6. Check it, then send a first receipt

1. In the app, open **Customers**. Above the list there is a line, **WhatsApp sending is not set up** with a **Set up WhatsApp sending** button (**WhatsApp sending is on** with **Check setup** once it works). Press it.
2. The check runs five steps and says in plain words what to fix:
   - **Settings in Netlify**: which of the settings above are missing.
   - **Settings for delivery updates**: the app secret and verify token (amber if missing: receipts still go out).
   - **Message log in the database**: the migration has been run.
   - **WhatsApp number**: Meta knows the number, its name and its quality rating.
   - **Message template**: approved, waiting, rejected or not found.
3. When it is green, add a customer with **your own number** (or use an existing one) and send yourself a receipt. Check that the PDF arrives, that the words are right, and that the ticks go from **Sent** to **Delivered** and **Read** in the customer's list of receipts.

From then on **Send receipt** shows the exact message that will go out, and the button says **Send on WhatsApp**.

---

## What staff will see

- **Send on WhatsApp** → "Sending it to Amina on WhatsApp…" → "It was sent". Under it, a status line: **Accepted by WhatsApp → Sent → Delivered → Read**. It updates by itself while the window is open.
- **The receipt is saved first.** If WhatsApp then refuses (a mistyped number, a number that is not on WhatsApp, the token expired), the screen says so in plain words, the receipt stays recorded and the customer stays Active, and there are two buttons: **Try again** and **Open WhatsApp instead** (the old way).
- **"It is not certain that the WhatsApp message was sent"** means the server did not get an answer in time (a slow network, Netlify's 10-second limit). The message may or may not have gone. Press **Check status** first; only press **Send again anyway** if the status still shows nothing.
- **Open WhatsApp myself instead** under the message lets anyone choose the manual way for one receipt.
- In a customer's opened row, each receipt shows its status. **Resend** asks first if the receipt was already delivered. A resend sends the receipt again and costs another message.
- A message that is still "queued" after two minutes shows **Not confirmed**: the server stopped part-way and WhatsApp never confirmed it. It may not have been sent, so check the customer's WhatsApp before sending it again.
- Only **admins** can send, and only the Director can delete a receipt (as in update 48). The message log (who it went to, the WhatsApp id, the status and any failure reason) is visible to admins and written only by the server.

---

## Costs

- Meta charges for each **delivered** message, by the **country of the number** (Kenyan numbers are billed at Meta's "Rest of Africa" rate) and by **category**. A receipt is a **Utility** message. Messages that fail are not charged. Find the current amounts in Meta's rate card: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>
- A **Resend** is a new message, and costs again.
- Meta bills the WhatsApp Business account's payment method, in the currency chosen when the account was created. Check the account's spending now and then in Meta Business settings.
- On the Netlify side each receipt uses a few seconds of one function call. Check your Netlify plan's function allowance only if you ever send thousands of receipts a month.

## Limits

- **Messages to new people per day:** a new Meta business portfolio can send first messages to **250 different customers in a rolling 24 hours**. **Verifying your business** raises it to 2,000 and it then grows by itself while your messages stay good quality (Meta explains the tiers at <https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits>). A customer who pays twice in a day counts once.
- **In the app:** the same receipt cannot be sent twice within 60 seconds (a double-click sends one message), and one person can start at most 300 sends an hour.
- **File size:** the receipt PDF must be 1 MB or less (a receipt is about 50 KB).

---

## If something goes wrong

The Set-up check (Customers → **Check setup**) usually names the problem. The ones that come up most:

| What you see | What it means and what to do |
| --- | --- |
| **"Automatic WhatsApp sending is not available here"** | The site has no functions: it was deployed by drag and drop, or the update was not deployed yet. Deploy from GitHub (README, Part 3, Option A). |
| **Check says "Missing: …"** | That setting is not in Netlify, is spelt differently, or the site was not redeployed after adding it. |
| **Message log: "could not be read"** | `update-49-migration.sql` has not been run, or `SUPABASE_SERVICE_ROLE_KEY` is the wrong key (it must be the **service_role / secret** key, not the anon one). |
| **"WhatsApp did not accept the access token"** (error 190) | The token expired or was replaced. Make a new one (Step 2), update `WHATSAPP_ACCESS_TOKEN`, redeploy. |
| **"The receipt message template was not found or is not approved yet"** (132001) | The template is still pending, was rejected, or its name or language differs from `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANGUAGE`. |
| **"…does not match the approved template"** (132000, 132012…) | The template in Meta is not the one in Step 3 (a different number of blanks, or different wording). Recreate it exactly. |
| **"This number cannot receive the message"** (131026) | The customer's number is not on WhatsApp, or is mistyped. Fix it with **Edit customer**, or send the receipt another way. |
| **"…not on the list of allowed test numbers"** (131030) | The app is still using Meta's **test** number. Use your own verified number (Step 1). |
| **"…a payment problem on the Meta account"** (131042) | Add or fix the payment method in Meta Business settings. |
| **"Too many messages were sent too quickly"** / **"held back"** (130429, 131049…) | Wait and try again. 131049 means WhatsApp chose not to deliver to that customer for now. |
| **Receipts go out but never show Delivered or Read** | Step 5: the webhook is not verified, **messages** is not subscribed, or the app is not Live. If it still fails, subscribe the app to the account once (see below). |

To subscribe the app to the WhatsApp account by hand (one command, safe to repeat; put your own values in):

```
curl -X POST "https://graph.facebook.com/v24.0/YOUR_BUSINESS_ACCOUNT_ID/subscribed_apps" -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Turning it off, and keeping it safe

- **Turn off:** delete `WHATSAPP_ACCESS_TOKEN` in Netlify and redeploy. The app goes back to the manual way by itself.
- **If a token or key leaks:** in Meta, remove the system user's token (or the system user) and make a new one; in Supabase, reset the service key; then update Netlify and redeploy.
- **Who can send:** for every send the server checks that the person is signed in and is an admin, that the receipt exists and that the person may read it, that the file is a real PDF (1 MB or less) from the receipts folder, and that the number is a plausible WhatsApp number. The access token and the service key never leave Netlify: the app in the browser cannot see them.
- **Backups:** the Excel backup includes the receipts (with their expiry dates) but **not** the message log. The log is a delivery record, not business data; a restore starts with an empty one.
