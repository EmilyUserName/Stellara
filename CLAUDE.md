# Stellara — CLAUDE.md

Project reference for AI-assisted development. Covers architecture, constraints, patterns, and known pitfalls.

---

## Project Overview

Stellara is a personalized astrology web app. Users enter their birth data, get a natal chart (sun, moon, rising), and receive AI-generated readings across 13 topics in 4 styles. Pro subscribers ($7/mo) get all topics/styles plus a daily personalized email digest.

Live site: **stellara-horoscope.com**
Stack: Vanilla JS frontend + Netlify Functions backend + Supabase + Stripe + Resend + Anthropic Claude API

---

## File Structure

```
index.html          — All markup, modals (auth, upgrade, reset password)
style.css           — All styling (dark theme, CSS variables)
app.js              — UI logic, API calls, result rendering, reading flow
auth.js             — Supabase auth, session, profile loading, subscription gate
astrology.js        — Client-side sign utilities (fallback only, not authoritative)
manifest.json       — PWA manifest
sw.js               — Service worker (offline/install support)

netlify/functions/
  horoscope.js                       — Proxies reading requests to Claude
  calculate-chart.js                 — Computes sun/moon/rising server-side
  geocode.js                         — Birth city → lat/lon via Nominatim
  daily-horoscopes.js                — Generic daily horoscopes for all 12 signs (cached in Supabase)
  daily-email.js                     — Scheduled: sends personalized morning digest to Pro subscribers
  get-weekly-spread.js               — Returns weekly spread from cache, triggers generation on first poll
  generate-weekly-spread.js          — Synchronous generation (used by scheduler on Mondays)
  generate-weekly-spread-background.js — Background function for on-demand generation (15 min limit)
  weekly-spread-scheduler.js         — Scheduled: fires every Monday, triggers background generation
  solar-return.js                    — Generates Solar Return reading for a given year + location
  astrocartography.js                — Calculates astrocartography lines
  astrocartography-interpret.js      — AI interpretation of astrocartography lines
  stripe-webhook.js                  — Handles Stripe events → updates Supabase subscribed flag
  create-checkout.js / create-*      — Stripe checkout session creation endpoints
  customer-portal.js                 — Stripe customer portal redirect
  email-reading.js                   — Sends a single reading to user via email on demand
```

---

## Critical Constraints

### Netlify Function Timeouts
- **Synchronous functions**: Hard ~26s limit regardless of `netlify.toml` setting.
- **Safe Claude max_tokens for sync functions**: ≤ 1000 tokens (~15–20s). 2500 always times out.
- **Background functions** (`*-background.js`): Up to 15 minutes. Use for any Claude call that needs >1000 tokens or complex multi-step generation.
- The timeout in `netlify.toml` only affects billing/queueing — the hard platform cap is ~26s.

### PostgREST NULL Handling
- `not.eq.value` in PostgREST does **not** match NULL rows (standard SQL behavior).
- Always use `or=(field.is.null,field.not.eq.value)` to mean "field is not set to value today."
- Example (daily email idempotency): `?id=eq.${id}&or=(last_email_date.is.null,last_email_date.not.eq.${todayISO})`

### Concurrent Netlify Runs
- Scheduled functions can run as multiple concurrent instances.
- Use atomic PATCH claims in Supabase before doing any destructive or side-effectful work (e.g., sending emails).
- Claim pattern: PATCH the row with a filter that only matches if not already claimed, check the returned array length — 0 = already claimed by another run, skip.

---

## Environment Variables

Set in Netlify dashboard (never commit):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API access |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `RESEND_API_KEY` | Resend email sending |
| `URL` | Netlify site URL (auto-set by Netlify, used for internal function-to-function calls) |

---

## Database — Supabase

**Table: `profiles`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Supabase auth user ID |
| `email` | text | |
| `name` | text | Display name |
| `birth_date` | text | YYYY-MM-DD |
| `birth_time` | text | HH:MM (optional) |
| `birth_city` | text | Free text, geocoded on chart calc |
| `sun_sign` | text | Cached after first chart calc |
| `moon_sign` | text | Cached after first chart calc |
| `rising_sign` | text | NOT cached — always recalculated (formula may change) |
| `subscribed` | boolean | Set by Stripe webhook |
| `stripe_customer_id` | text | |
| `stripe_subscription_id` | text | |
| `preferred_style` | text | psychological / spiritual / modern / classical |
| `email_opt_out` | boolean | User unsubscribed from daily emails |
| `last_email_date` | text | YYYY-MM-DD, idempotency key for daily email |
| `solar_return_year` | int | Non-null = has purchased solar return access |

**Table: `daily_horoscopes`**

Caches generic daily horoscopes. Key: `date` (YYYY-MM-DD). Columns for each of 12 signs.

**Table: `weekly_spreads`**

Caches weekly card spreads. Keyed by `week_start` date.

---

## Astronomy

Rising sign uses the `astronomy-engine` npm library (Jean Meeus-based). Sun/moon use a pure-JS implementation in `calculate-chart.js`. Timezone lookup uses timeapi.io (primary) with Open-Meteo as fallback.

Sun/moon signs are cached in `profiles` after first calculation. Rising is **never cached** — always recalculated fresh so any formula fix is immediately reflected.

---

## AI Reading Architecture

All Claude calls go through `horoscope.js` (proxied from frontend) or direct fetch inside Netlify functions.

- **Model**: `claude-sonnet-4-6`
- **Max tokens**: 900–1000 for sync functions, up to 2500 for background functions
- Every Claude API call must:
  1. Check `res.ok` before parsing JSON
  2. Throw a descriptive error on failure (status + error message from response body)
  3. Be wrapped in try-catch so errors surface to the caller

Reading styles gate: `psychological` is free; `spiritual`, `modern`, `classical` require Pro subscription.

---

## Daily Email

**Schedule**: `0 10 * * *` UTC = 6am EDT / 7am EST
**File**: `netlify/functions/daily-email.js`

Flow:
1. Fetch all `subscribed=true` profiles
2. Filter: must have email, name, birth_date, birth_city; exclude email_opt_out; exclude already-emailed today
3. For each user: atomic claim via PATCH, calculate chart (or use cached sun/moon), generate reading via Claude, send via Resend, stamp `last_email_date`
4. `last_email_date` is stamped **after** confirmed Resend delivery — not before. This means failed sends can retry the same day.

**Testing**: POST with `{ "testEmail": "you@example.com" }` to send a test email to a specific address (bypasses idempotency).

---

## Weekly Spread

Generated every Monday by `weekly-spread-scheduler.js` → calls `generate-weekly-spread-background.js`.
On-demand (first user load of the week): `get-weekly-spread.js` triggers background generation if no cached spread exists — passes `?generate=true` only on the **first poll** (attempt 0), then polls without re-triggering.

---

## CSS Design Tokens (style.css)

```css
--bg:           #0b1628   (page background)
--surface:      #142c5c   (card surface)
--gold:         #c8a96e   (accent, stars, highlights)
--silver:       #8fa8c8   (secondary text, muted)
--silver-light: #c8d8ea   (body text on dark backgrounds)
--accent:       #5a6b8c   (very muted — avoid for text on dark bg, use for borders only)
```

`--accent` (`#5a6b8c`) is too low-contrast on `--bg` or `--surface` for readable text. Use `--silver` or `--silver-light` for any text that needs to be legible.

---

## Known Pitfalls

- **`--accent` for text**: `#5a6b8c` is nearly invisible on `#0b1628`/`#0e1e40`/`#142c5c`. Use `--silver` (`#8fa8c8`) or `--silver-light` instead.
- **iOS emoji**: Unicode chars like ♐, ☀ render as color emoji on Apple devices. Append `\uFE0E` (variation selector-15) to force text rendering, or avoid characters with emoji variants.
- **Semi-transparent overlays**: `rgba` backgrounds on same-hue base colors may vanish. Use solid hex colors for card surfaces.
- **Promise.allSettled counting**: Fulfilled = resolved, not necessarily "work done." A function that returns early (`return false`) still counts as fulfilled. Check `r.value === true` to count actual sends vs. skips.
- **Supabase `not.eq` and NULLs**: `not.eq.value` skips NULL rows in SQL. Use the `or=` pattern.
- **Netlify catch-up runs**: After deploying a schedule change, Netlify may fire a catch-up run immediately. This is normal and harmless if idempotency is in place.

---

## Deployment

Push to `main` → Netlify auto-deploys. No build step needed (vanilla JS, no bundler).

To reset a stuck `last_email_date` in Supabase:
```sql
UPDATE profiles SET last_email_date = NULL WHERE last_email_date = 'YYYY-MM-DD';
```
