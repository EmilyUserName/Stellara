# Stellara — Tech Stack

## Frontend
- **HTML/CSS/JavaScript** — vanilla, no frameworks
- `index.html` — structure and markup
- `style.css` — all styling
- `app.js` — UI logic, form handling, API calls, result rendering
- `astrology.js` — sun/moon/rising sign calculations (runs in the browser)

## Backend
- **Netlify Functions** (serverless) — `netlify/functions/horoscope.js`
  - Receives POST requests from the frontend
  - Forwards prompts to the Anthropic API
  - Keeps the API key server-side and out of the browser

## AI
- **Anthropic Claude API** (`claude-sonnet-4-5`)
  - Generates personalized birth chart readings and daily transit interpretations
  - Called via the `/api/horoscope` serverless function

## Domain
- **stellara-horoscope.com** — registered via Cloudflare Registrar, DNS pointed to Netlify

## Hosting & Deployment
- **Netlify** — [stellara-stars.netlify.app](https://stellara-stars.netlify.app)
  - Connected to GitHub for continuous deployment (push to `main` → auto-deploy)
  - Environment variable: `ANTHROPIC_API_KEY` (set in Netlify dashboard)
  - Redirects: `/api/*` → `/.netlify/functions/:splat`
