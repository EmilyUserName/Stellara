# Stellara — Tech Stack

## Frontend
- **HTML/CSS/JavaScript** — vanilla, no frameworks
- `index.html` — structure, markup, modals (auth, upgrade, reset password)
- `style.css` — all styling
- `app.js` — UI logic, form handling, API calls, result rendering, topic/style selection
- `astrology.js` — client-side sign utilities (fallback only)

## Backend — Netlify Functions
All serverless, deployed automatically on push to `main`.

| Function | Route | Purpose |
|---|---|---|
| `horoscope.js` | `/api/horoscope` | Proxies reading requests to Anthropic API |
| `calculate-chart.js` | `/api/calculate-chart` | Calculates sun, moon, rising server-side using Jean Meeus algorithms + timezone-aware geocoding |
| `geocode.js` | `/api/geocode` | Converts birth city → lat/lon via Nominatim |
| `create-checkout.js` | `/api/create-checkout` | Creates Stripe checkout session |
| `stripe-webhook.js` | `/stripe-webhook` | Handles Stripe events, updates Supabase subscription status |

## AI
- **Anthropic Claude API** (`claude-sonnet-4-5`)
  - Generates personalized readings across 13 topics and 4 reading styles
  - Called via `/api/horoscope`
  - max_tokens: 900

## Astronomy
- **Jean Meeus algorithms** (pure JS, no library)
  - Sun longitude: accurate to ~0.01° (Ch. 25)
  - Moon longitude: accurate to ~0.3° (Ch. 47, 15-term series)
  - Ascendant: LST-based formula with obliquity correction
- **Nominatim** (OpenStreetMap) — birth city geocoding
- **timeapi.io** — IANA timezone lookup from lat/lon (DST-aware UTC conversion)

## Auth & Database
- **Supabase**
  - Auth: email/password sign up, sign in, password reset
  - Database: `profiles` table stores name, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, subscribed, stripe_customer_id, stripe_subscription_id
  - Row Level Security enabled
  - Custom SMTP via Resend (bypasses Supabase free-tier email rate limit)

## Payments
- **Stripe**
  - Subscription: $12/month (Pro plan)
  - Live price ID: `price_1TDtN8EZ8ha2qxjvTEzyBUxC`
  - Webhook: `checkout.session.completed` → sets `subscribed: true` in Supabase
  - Webhook: `customer.subscription.deleted` → sets `subscribed: false`

## Email
- **Resend** — transactional email provider
  - Used for Supabase auth emails (confirmation, password reset)
  - Will power daily digest emails when that feature ships

## Domain & Hosting
- **stellara-horoscope.com** — registered via Cloudflare, DNS pointed to Netlify
- **Netlify** — hosting + CI/CD
  - Auto-deploys on push to `main` branch
  - Environment variables: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `SECRETS_SCAN_ENABLED`

## PWA
- `manifest.json` + `sw.js` + `icon.svg` — installable on iOS and Android via "Add to Home Screen"

## Features
- **Free tier** — Full birth chart reading (sun + moon + rising) with today's transits
- **Pro tier ($12/mo)** — 13 reading topics, 4 reading styles, daily email digest (coming soon)
- 13 topics: Full Chart, Love, Career, Finances, Health, This Month, Communication, Inner World, Energy & Timing, Travel, Spiritual Path, Compatibility, Shadow Work
- 4 styles: Psychological, Spiritual, Modern & Direct, Classical
