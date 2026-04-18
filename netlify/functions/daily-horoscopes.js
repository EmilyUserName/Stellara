// ============================================================
// daily-horoscopes.js
// Returns today's generic horoscopes for all 12 signs.
// Generates via Claude on first request of the day, then caches
// in Supabase so every subsequent request is instant and free.
// ============================================================

const Astronomy = require('astronomy-engine');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;

const SIGNS = ['aries','taurus','gemini','cancer','leo','virgo',
               'libra','scorpio','sagittarius','capricorn','aquarius','pisces'];

const SIGN_NAMES = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

function getTodaySky() {
  try {
    const time = Astronomy.MakeTime(new Date());
    function bodySign(name) {
      try {
        const vec = Astronomy.GeoVector(name, time, true);
        const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
        return SIGN_NAMES[Math.floor(lon / 30)];
      } catch { return null; }
    }
    const phaseAngle = Astronomy.MoonPhase(time);
    const phases = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                    'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
    let newMoonSign = null;
    try {
      const nm  = Astronomy.SearchMoonPhase(0, time, -40);
      const vec = Astronomy.GeoVector('Moon', nm, true);
      const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
      newMoonSign = SIGN_NAMES[Math.floor(lon / 30)];
    } catch {}
    return {
      sun: bodySign('Sun'), moon: bodySign('Moon'),
      moonPhase: phases[Math.floor(phaseAngle / 45)],
      newMoonSign,
      mercury: bodySign('Mercury'), venus: bodySign('Venus'),
      mars: bodySign('Mars'), jupiter: bodySign('Jupiter'), saturn: bodySign('Saturn'),
    };
  } catch (e) {
    console.error('[daily-horoscopes] sky error:', e.message);
    return null;
  }
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Try to return cached horoscopes for today
    const cached = await getCached(today);
    if (cached) {
      return { statusCode: 200, headers, body: JSON.stringify(cached) };
    }

    // 2. Not cached — generate via Claude (with real sky data)
    const sky = getTodaySky();
    const generated = await generateHoroscopes(today, sky);
    if (!generated) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to generate horoscopes' }) };
    }

    // 3. Cache in Supabase (fire-and-forget — don't block the response)
    cacheHoroscopes(today, generated).catch(err =>
      console.error('[daily-horoscopes] cache error:', err)
    );

    return { statusCode: 200, headers, body: JSON.stringify(generated) };
  } catch (err) {
    console.error('[daily-horoscopes] Unhandled error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
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

async function generateHoroscopes(date, sky) {
  const dateLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const lunaLine = sky?.newMoonSign
    ? `Lunar phase: ${sky.moonPhase} — this lunation's new moon was exact in ${sky.newMoonSign}`
    : `Lunar phase: ${sky?.moonPhase || 'unknown'}`;

  const skyBlock = sky ? `
TODAY'S ACTUAL SKY — base every horoscope on these real positions. Do NOT invent or contradict them:
Sun: ${sky.sun}
Moon: ${sky.moon} (current transit)
${lunaLine}
Mercury: ${sky.mercury || 'unknown'}
Venus: ${sky.venus || 'unknown'}
Mars: ${sky.mars || 'unknown'}
Jupiter: ${sky.jupiter || 'unknown'}
Saturn: ${sky.saturn || 'unknown'}
` : '';

  const prompt = `Today is ${dateLabel}.
${skyBlock}
Write a short, evocative daily horoscope for each of the 12 zodiac signs based on the real planetary positions above. Each should be 2–3 sentences. Ground the energy in what's actually in the sky — make it feel specific to today, not generic. Warm, honest. No hashtags. No sign names in the text.

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
      max_tokens: 900,
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
