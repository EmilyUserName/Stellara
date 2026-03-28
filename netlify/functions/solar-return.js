// ============================================================
// solar-return.js
// Generates a personalized Solar Return reading via Claude.
// Accepts year + returnLocation so the user can choose any year
// and any location (where they were / will be on their birthday).
// No caching — each call generates fresh so year/location always
// reflects the user's current request.
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;

const STYLE_PROMPTS = {
  psychological: `You are Stellara, a depth psychology astrologer who speaks through the lens of Jungian thought. Draw on archetypes, the shadow, and individuation. Tone: reflective, profound, transformative.`,
  spiritual:     `You are Stellara, a soul-centered spiritual guide and intuitive astrologer. Speak to the soul's journey, divine timing, and cosmic connection. Tone: warm, ethereal, expansive.`,
  modern:        `You are Stellara, a modern astrology coach who gives clear, practical, no-nonsense guidance. Make it concrete, contemporary, and immediately useful. Tone: direct, confident, grounded.`,
  classical:     `You are Stellara, a classical astrologer steeped in ancient tradition. Draw on planetary mythology and Hellenistic wisdom. Tone: scholarly, mythic, timeless.`,
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { userId, year, returnLocation } = JSON.parse(event.body || '{}');
  if (!userId) return { statusCode: 400, body: 'userId required' };
  if (!year)   return { statusCode: 400, body: 'year required' };

  // Fetch profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,sun_sign,moon_sign,rising_sign,birth_city,birth_date,solar_return_year,preferred_style`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const profile  = profiles?.[0];

  if (!profile) return { statusCode: 404, body: 'Profile not found' };

  // Check they've purchased Solar Return (any year value = purchased)
  if (!profile.solar_return_year) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Solar Return not purchased' }) };
  }

  // Generate reading fresh each time (year and location can vary)
  const reading = await generateReading(profile, parseInt(year), returnLocation);
  if (!reading) return { statusCode: 502, body: 'Failed to generate reading' };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading, year: parseInt(year) }),
  };
};

async function generateReading(profile, year, returnLocation) {
  const { name, sun_sign, moon_sign, rising_sign, birth_city, birth_date, preferred_style } = profile;
  const style = STYLE_PROMPTS[preferred_style] || STYLE_PROMPTS.psychological;

  const birthYear  = birth_date ? parseInt(birth_date.slice(0, 4)) : null;
  const age        = birthYear ? year - birthYear : null;
  const ageContext = age ? `${name} is turning ${age} this Solar Return year.` : '';

  const locationLine = returnLocation
    ? `Solar Return location (where ${name} will be on their birthday): ${returnLocation}`
    : `Birth city (used as Solar Return location): ${birth_city || 'unknown'}`;

  const prompt = `${style}

You are writing ${name}'s Solar Return reading for ${year} — their annual cosmic forecast for the year ahead, beginning at their birthday.

${name}'s natal chart:
Sun: ${sun_sign}
Moon: ${moon_sign || 'unknown'}
${rising_sign ? `Rising: ${rising_sign}` : 'Rising: unknown'}
Birth city: ${birth_city || 'unknown'}
${locationLine}
${ageContext}

A Solar Return marks the Sun's return to its exact natal degree — a new personal year begins. The location where a person is on their birthday shapes the Solar Return chart significantly. Write a rich, personal annual forecast in 5 sections. Use the section titles below exactly as written, each on its own line followed by the text. No bullet points. No extra headers inside sections.

THE YEAR AHEAD
What is the overarching theme of this Solar Return year? What chapter is ${name} entering? Speak to the big picture — the soul's curriculum for this year. 2–3 paragraphs.

LOVE & RELATIONSHIPS
What is the year's energy around connection, intimacy, and partnership for ${name}? What do the planets invite them to cultivate, release, or explore in their closest bonds? 1–2 paragraphs.

WORK & PURPOSE
What does this year hold for ${name}'s career, creative work, and sense of purpose? Where are they being called to step up, redirect, or deepen? 1–2 paragraphs.

INNER WORK
What psychological or spiritual territory does this year ask ${name} to move through? What shadow, pattern, or gift is ready to surface? 1–2 paragraphs.

A WORD TO CARRY
A closing reflection — one or two sentences ${name} can return to throughout the year. Something true, specific, and lasting.

Be evocative, personal, and honest. Every sentence should land.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1800,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[solar-return] Claude error:', JSON.stringify(data));
    return null;
  }
  return data.content?.map(b => b.text || '').join('') || null;
}
