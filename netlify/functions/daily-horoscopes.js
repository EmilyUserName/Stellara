// ============================================================
// daily-horoscopes.js
// Returns today's generic horoscopes for all 12 signs.
// Generates via Claude on first request of the day, then caches
// in Supabase so every subsequent request is instant and free.
// ============================================================

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;

const SIGNS = ['aries','taurus','gemini','cancer','leo','virgo',
               'libra','scorpio','sagittarius','capricorn','aquarius','pisces'];

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const today = new Date().toISOString().slice(0, 10); // "2026-03-27"

  // 1. Try to return cached horoscopes for today
  const cached = await getCached(today);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify(cached) };
  }

  // 2. Not cached — generate via Claude
  const generated = await generateHoroscopes(today);
  if (!generated) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to generate horoscopes' }) };
  }

  // 3. Cache in Supabase (fire-and-forget — don't block the response)
  cacheHoroscopes(today, generated).catch(err =>
    console.error('[daily-horoscopes] cache error:', err)
  );

  return { statusCode: 200, headers, body: JSON.stringify(generated) };
};

// ── Supabase helpers ──────────────────────────────────────────

async function getCached(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/daily_horoscopes?date=eq.${date}&select=*`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function cacheHoroscopes(date, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/daily_horoscopes`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ date, ...data }),
  });
}

// ── Claude generation ─────────────────────────────────────────

async function generateHoroscopes(date) {
  const dateLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const prompt = `Today is ${dateLabel}.

Write a short, evocative daily horoscope for each of the 12 zodiac signs. Each should be 2–3 sentences. Speak to today's cosmic energy — make it feel current, not generic. Warm, specific, honest. No hashtags. No sign names in the text.

Return ONLY valid JSON in this exact format, nothing else:
{
  "aries": "...",
  "taurus": "...",
  "gemini": "...",
  "cancer": "...",
  "leo": "...",
  "virgo": "...",
  "libra": "...",
  "scorpio": "...",
  "sagittarius": "...",
  "capricorn": "...",
  "aquarius": "...",
  "pisces": "..."
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.map(b => b.text || '').join('') || '';

  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    // Validate all 12 signs are present
    if (SIGNS.every(s => json[s])) return json;
    console.error('[daily-horoscopes] Missing signs in response');
    return null;
  } catch (e) {
    console.error('[daily-horoscopes] JSON parse error:', e.message, text.slice(0, 200));
    return null;
  }
}
