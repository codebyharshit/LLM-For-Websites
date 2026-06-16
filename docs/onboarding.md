# Customer Onboarding Runbook (v1)

Goal: a new business is answering its customers from its own content via the embedded
widget in < 15 minutes, with no code beyond the snippet.

## 1. Create the tenant (admin)
```
pnpm --filter @supportrag/db db:create-tenant -- --name="Acme Bikes" --email=owner@acme.com
```
Outputs `{ tenantId, userId, botId, publicToken }`. Send the owner a magic-link login
(`POST /auth/request-link { email }` → they click the link).

## 2. Ingest their content
In the dashboard **Sources** (or via API):
- Add the help-center URL (crawled same-origin, depth 2) or a sitemap URL.
- Watch status go `pending → syncing → synced` with page/chunk counts.
- Re-add or **Resync** if they publish new content.

## 3. Configure the bot
Dashboard **Bot**: set persona, greeting, languages, theme color.
Dashboard **Rules**: add `policy` rules (override context), `guard_block` topics
(refused), `guard_escalate` topics (routed to a human).

## 4. Embed the widget
Dashboard **Bot → Embed snippet**, copy:
```html
<script src="https://cdn.../widget.js" data-bot-token="pk_..." data-api-url="https://api..."></script>
```
Paste before `</body>`. The bubble appears; questions stream grounded, cited answers;
misses refuse honestly and capture a lead.

## 5. Verify
- Ask a known question → grounded, cited answer.
- Ask an out-of-domain question → honest refusal + "talk to a human".
- Dashboard **Conversations** shows the transcript + retrieved-chunk trace + feedback.
- Dashboard **Analytics** shows per-turn cost and p50/p95 latency.

## Fair-use metering & billing (v1, no Stripe)
- Usage per tenant is read from `GET /analytics` (turns, cost) and the `messages` log.
- Apply the plan's monthly turn cap manually; warn near the cap.
- Invoice monthly off the analytics totals (manual). Stripe/metered billing is out of
  scope for v1 (see OUT OF SCOPE in `IMPLEMENTATION_PLAN.md`).

## GDPR / offboarding
- Hard-delete a tenant and all its data: `deleteTenant(tenantId)` (cascades across all
  tenant tables). Wire to an admin script when needed.
