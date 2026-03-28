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

  const body = JSON.parse(event.body || '{}');
  const { userId, returnLocation } = body;
  const year = body.year || new Date().getFullYear();
  if (!userId) return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'userId required' }) };

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
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Solar Return not purchased' }) };
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

A Solar Return marks the Sun's return to its exact natal degree — a new personal year begins. The location where a person celebrates their birthday shifts the Solar Return chart, often dramatically. This is a comprehensive annual forecast — make it feel like a real reading, not a summary. Write 8 sections using the titles below exactly as written, each on its own line, followed by the text. No bullet points. No markdown. Plain paragraphs only. Every sentence should land.

THE YEAR AHEAD
The overarching theme and energy of ${name}'s ${year} Solar Return year. What chapter is beginning? What is the soul's curriculum this year? Be bold and specific. 2 paragraphs.

THE SKY THIS YEAR
The most significant planetary themes active in ${year} and how they land personally for someone with ${name}'s chart. 1–2 paragraphs.

LOVE & RELATIONSHIPS
The year's energy around connection, intimacy, and partnership for ${name}. What is being asked of them? 1–2 paragraphs.

WORK & PURPOSE
What this year holds for ${name}'s career, creative work, and sense of direction. Where is the momentum, where is the friction? 1–2 paragraphs.

MONEY & RESOURCES
The year's energy around finances and material life. Is this a year to invest, consolidate, or simplify? 1 paragraph.

BODY & WELLBEING
What this year asks of ${name} physically and energetically. What rhythms or areas deserve attention? 1 paragraph.

INNER WORK
The psychological territory this year is asking ${name} to move through. What pattern is ready to be seen, and what awaits on the other side? 1–2 paragraphs.

A WORD TO CARRY
A closing reflection — 2 sentences ${name} can return to throughout the year. Make it true, specific, and lasting.

Be evocative, personal, and honest. Every sentence should earn its place.`;

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
