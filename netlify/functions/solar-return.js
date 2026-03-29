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

You are writing ${name}'s Solar Return reading for ${year} — their personal forecast for the year ahead, beginning at their birthday.

${name}'s natal chart:
Sun: ${sun_sign}
Moon: ${moon_sign || 'unknown'}
${rising_sign ? `Rising: ${rising_sign}` : 'Rising: unknown'}
Birth city: ${birth_city || 'unknown'}
${locationLine}
${ageContext}

Write exactly 5 sections using the titles below, each title on its own line in ALL CAPS, followed immediately by the text. No bullet points. No markdown. Plain paragraphs only. Be potent and specific — every sentence should earn its place.

THE YEAR AHEAD
The overarching theme of ${name}'s ${year} Solar Return. What chapter is opening? What is the soul's curriculum? Be bold. 2 paragraphs.

THE SKY THIS YEAR
The key planetary energy of ${year} and how it lands in ${name}'s chart specifically. 1 paragraph.

LOVE & WORK
What ${year} holds for ${name} in relationships and in their career or creative work. Where is momentum, where is friction? 1 paragraph each — write them as two distinct paragraphs without sub-headers.

INNER WORK
The psychological territory this year is asking ${name} to move through. What pattern is ready to be seen? 1 paragraph.

A WORD TO CARRY
A closing reflection of 2 sentences ${name} can return to all year. Make it true, specific, and lasting.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
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
