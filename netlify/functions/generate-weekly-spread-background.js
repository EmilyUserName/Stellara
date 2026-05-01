// ============================================================
// generate-weekly-spread-background.js
// Netlify Background Function — runs up to 15 minutes.
// Generates personalized weekly spread for a user via Claude
// and upserts into Supabase.
//
// Invoked by get-weekly-spread.js on cache miss.
// Returns 202 immediately (Netlify Background Function).
//
// Auth: x-service-key header must match SUPABASE_SERVICE_KEY
// ============================================================

const Astronomy = require('astronomy-engine');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;

const SKY_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                   'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const PHASE_NAMES = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                     'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];

function getSkyForDate(dateStr) {
  try {
    const time = Astronomy.MakeTime(new Date(dateStr + 'T12:00:00Z'));
    function bodySign(name) {
      try {
        const vec = Astronomy.GeoVector(name, time, true);
        const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
        return SKY_SIGNS[Math.floor(lon / 30)];
      } catch { return null; }
    }
    const phase = PHASE_NAMES[Math.floor(Astronomy.MoonPhase(time) / 45)];
    return {
      sun: bodySign('Sun'), moon: bodySign('Moon'), moonPhase: phase,
      mercury: bodySign('Mercury'), venus: bodySign('Venus'),
      mars: bodySign('Mars'), jupiter: bodySign('Jupiter'), saturn: bodySign('Saturn'),
    };
  } catch (e) {
    console.error('[weekly-spread-bg] sky error for', dateStr, e.message);
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Internal-only: verify caller knows the service key
  if (event.headers['x-service-key'] !== SUPABASE_SERVICE_KEY) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { userId, dates } = body;
  if (!userId || !Array.isArray(dates) || !dates.length) {
    return { statusCode: 400, body: 'userId and dates[] required' };
  }

  try {
    const result = await generateAndStore(userId, dates);
    console.log('[generate-weekly-spread-background] Done:', result);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[generate-weekly-spread-background] Error:', err);
    return { statusCode: 500, body: err.message };
  }
};

async function generateAndStore(userId, dates) {
  // Fetch user profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const profile  = Array.isArray(profiles) ? profiles[0] : null;

  if (!profile?.name || !profile?.birth_date) {
    throw new Error('User profile incomplete — cannot generate spread');
  }

  // Fetch natal planets
  let natalPlanets = {};
  if (profile.birth_date && profile.birth_city) {
    try {
      const chartRes = await fetch(
        `${process.env.URL}/.netlify/functions/calculate-chart`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ birthDate: profile.birth_date, birthTime: profile.birth_time || null, birthCity: profile.birth_city }),
        }
      );
      if (chartRes.ok) natalPlanets = await chartRes.json();
    } catch (_) {}
  }

  // Generate via Claude
  const days = await callClaude(profile, dates, natalPlanets);
  if (!days.length) throw new Error('Claude returned no content');

  // Upsert each day into weekly_spreads
  await upsertDays(userId, days);

  return { generated: days.length, dates: days.map(d => d.date) };
}

// ── Claude call ──────────────────────────────────────────────
async function callClaude(profile, dates, natalPlanets = {}) {
  const { name, sun_sign: sun, moon_sign: moon, rising_sign: rising, birth_city } = profile;
  const { mercury, venus, mars, jupiter, saturn, midheaven, northNode, southNode } = natalPlanets;

  // Compute actual sky for each date — no fabrication
  const dateLines = dates.map(d => {
    const dt  = new Date(d + 'T12:00:00Z');
    const sky = getSkyForDate(d);
    const label = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (!sky) return `${d} (${label}): sky data unavailable`;
    return `${d} (${label}):\n  Sun: ${sky.sun} | Moon: ${sky.moon} (${sky.moonPhase}) | Mercury: ${sky.mercury || '?'} | Venus: ${sky.venus || '?'} | Mars: ${sky.mars || '?'} | Jupiter: ${sky.jupiter || '?'} | Saturn: ${sky.saturn || '?'}`;
  }).join('\n\n');

  const natalLines = [
    `Sun: ${sun || 'unknown'}`,
    `Moon: ${moon || 'unknown'}`,
    `Rising: ${rising || 'unknown'}`,
    midheaven  ? `Midheaven (MC): ${midheaven}` : '',
    northNode  ? `North Node: ${northNode}` : '',
    southNode  ? `South Node: ${southNode}` : '',
    mercury    ? `Mercury: ${mercury}` : '',
    venus      ? `Venus: ${venus}` : '',
    mars       ? `Mars: ${mars}` : '',
    jupiter    ? `Jupiter: ${jupiter}` : '',
    saturn     ? `Saturn: ${saturn}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are Stellara, generating a personalized cosmic spread for ${name}.

NATAL CHART (birth placements — do not confuse with current transits):
${natalLines}
Birth city: ${birth_city || 'unknown'}

ACTUAL SKY FOR EACH DATE — use these exact positions. Do NOT invent or contradict them:
${dateLines}

Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Start with [ and end with ].

For each date produce one object in this exact shape:
{
  "date": "YYYY-MM-DD",
  "planet": "the planet whose sign placement is most personally activated for ${name} that day",
  "glyph": "Unicode astrological glyph for that planet",
  "energy": "high" or "mid" or "low",
  "summary": "2-3 sentences written to ${name} in second person, referencing their natal chart AND the actual planetary positions shown above for that date",
  "topics": [
    { "key": "exact_key", "name": "Display Name", "glyph": "glyph", "energy": "high|mid|low", "snippet": "one sentence for ${name} about this topic, grounded in the real sky positions for that date" },
    { "key": "exact_key", "name": "Display Name", "glyph": "glyph", "energy": "high|mid|low", "snippet": "one sentence" },
    { "key": "exact_key", "name": "Display Name", "glyph": "glyph", "energy": "high|mid|low", "snippet": "one sentence" }
  ]
}

Topic keys (use exactly these strings — pick the 3 most activated per day):
daily → Today's Sky (☉)
love → Love (♀)
career → Career (♄)
finances → Finances (♃)
health → Health (♁)
thisMonth → This Month (☽)
communication → Communication (☿)
innerWorld → Inner World (♆)
energy → Energy & Timing (♂)
travel → Travel (♐)
spiritual → Spiritual Path (♆)
compatibility → Compatibility (♀)
shadow → Shadow Work (♇)

Planet glyphs: Sun ☉  Moon ☽  Mercury ☿  Venus ♀  Mars ♂  Jupiter ♃  Saturn ♄  Uranus ♅  Neptune ♆  Pluto ♇

Rules:
- Dominant planet chosen from the actual sky data — which planet's placement most activates ${name}'s natal chart that day
- Energy levels should reflect the real sky — not forced variety
- Summaries must reference ${name}'s natal placements AND the real planetary positions for that date
- Topics chosen based on which planets are most active per the sky data`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Claude API error ${res.status}: ${errData?.error?.message || 'unknown'}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[generate-weekly-spread-background] Claude error', res.status, errText.slice(0, 300));
    return [];
  }
  const data = await res.json();
  const raw  = (data.content?.map(b => b.text || '').join('') || '').trim();

  // Parse JSON — try direct parse first, then extract from surrounding text
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    console.error('[generate-weekly-spread-background] Failed to parse Claude JSON. Raw:', raw.slice(0, 500));
    return [];
  }
}

// ── Supabase upsert ──────────────────────────────────────────
async function upsertDays(userId, days) {
  const rows = days
    .filter(d => d.date && d.planet)
    .map(d => ({
      user_id:  userId,
      day_date: d.date,
      planet:   d.planet,
      glyph:    d.glyph   || '✦',
      energy:   d.energy  || 'mid',
      summary:  d.summary || '',
      topics:   Array.isArray(d.topics) ? d.topics : [],
    }));

  if (!rows.length) return;

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/weekly_spreads`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    console.error('[generate-weekly-spread-background] Supabase upsert error:', upsertRes.status, errText);
  }
}
