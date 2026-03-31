// ============================================================
// generate-weekly-spread.js
// Internal function — generates personalized weekly spread
// content for a user via Claude and upserts into Supabase.
//
// Called by:
//   - weekly-spread-scheduler.js  (Monday mornings)
//   - get-weekly-spread.js        (cache miss for a user)
//   - stripe-webhook.js           (on Pro signup, fire-and-forget)
//
// Auth: x-service-key header must match SUPABASE_SERVICE_KEY
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;

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
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[generate-weekly-spread] Error:', err);
    return { statusCode: 500, body: err.message };
  }
};

// ── exported so tests / other functions can import ──────────
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

  // Generate via Claude
  const days = await callClaude(profile, dates);
  if (!days.length) throw new Error('Claude returned no content');

  // Upsert each day into weekly_spreads
  await upsertDays(userId, days);

  return { generated: days.length, dates: days.map(d => d.date) };
}

module.exports.generateAndStore = generateAndStore;

// ── Claude call ──────────────────────────────────────────────
async function callClaude(profile, dates) {
  const { name, sun_sign: sun, moon_sign: moon, rising_sign: rising, birth_city } = profile;

  const dateList = dates.map(d => {
    const dt = new Date(d + 'T12:00:00Z');
    return `${d} (${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })})`;
  }).join('\n');

  const prompt = `You are Stellara, generating a personalized cosmic spread for ${name}.

NATAL CHART:
Sun: ${sun || 'unknown'}
Moon: ${moon || 'unknown'}
Rising: ${rising || 'unknown'}
Birth city: ${birth_city || 'unknown'}

DATES TO GENERATE:
${dateList}

Return ONLY a valid JSON array. No markdown, no code fences, no explanation. Start with [ and end with ].

For each date produce one object in this exact shape:
{
  "date": "YYYY-MM-DD",
  "planet": "dominant planet name (e.g. Venus)",
  "glyph": "Unicode astrological glyph for that planet",
  "energy": "high" or "mid" or "low",
  "summary": "2-3 sentences written to ${name} in second person, personal to their ${sun} Sun / ${moon} Moon and the day's planetary energy",
  "topics": [
    { "key": "exact_key", "name": "Display Name", "glyph": "glyph", "energy": "high|mid|low", "snippet": "one sentence for ${name} about this topic today" },
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

Planet glyphs: Sun ☉  Moon ☽  Mercury ☿  Venus ♀  Mars ♂  Jupiter ♃  Saturn ♄  Uranus ♅  Neptune ♆  Pluto ♇  Chiron ⚷

Rules:
- Each day must have a different dominant planet (never the same planet two days in a row)
- Vary energy levels across the week — include low and mid days, not all high
- Summaries must reference ${name}'s specific ${sun} Sun and ${moon} Moon — never generic
- Topics must vary across days — don't repeat the same 3 topics every day`;

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
    console.error('[generate-weekly-spread] Failed to parse Claude JSON. Raw:', raw.slice(0, 500));
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

  await fetch(`${SUPABASE_URL}/rest/v1/weekly_spreads`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}
