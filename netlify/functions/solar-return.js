// ============================================================
// solar-return.js
// Generates a personalized Solar Return reading via Claude.
// Accepts year + returnLocation so the user can choose any year
// and any location (where they were / will be on their birthday).
// No caching — each call generates fresh so year/location always
// reflects the user's current request.
// ============================================================

const Astronomy = require('astronomy-engine');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;

const SR_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const SR_PHASES = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                   'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];

// Compute the exact solar return moment for a given birth date + target year,
// then return all planetary positions at that instant.
function getSolarReturnSky(birthDate, targetYear) {
  try {
    // Step 1: find natal sun longitude from birth date
    const birthUTC  = new Date(birthDate + 'T12:00:00Z');
    const birthTime = Astronomy.MakeTime(birthUTC);
    const sunVec    = Astronomy.GeoVector('Sun', birthTime, true);
    const natalLon  = ((Astronomy.Ecliptic(sunVec).elon % 360) + 360) % 360;

    // Step 2: find the moment the sun returns to that exact longitude in targetYear
    const searchStart = Astronomy.MakeTime(new Date(`${targetYear}-01-01T00:00:00Z`));
    const returnTime  = Astronomy.SearchSunLongitude(natalLon, searchStart, 400);
    if (!returnTime) return null;

    // Step 3: compute all planets at the solar return moment
    function bodySign(name) {
      try {
        const vec = Astronomy.GeoVector(name, returnTime, true);
        const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
        return SR_SIGNS[Math.floor(lon / 30)];
      } catch { return null; }
    }

    return {
      returnDate: returnTime.date.toISOString().slice(0, 10),
      returnDateFull: returnTime.date.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
      sun:     bodySign('Sun'),  // will match natal sign
      moon:    bodySign('Moon'),
      moonPhase: SR_PHASES[Math.floor(Astronomy.MoonPhase(returnTime) / 45)],
      mercury: bodySign('Mercury'),
      venus:   bodySign('Venus'),
      mars:    bodySign('Mars'),
      jupiter: bodySign('Jupiter'),
      saturn:  bodySign('Saturn'),
      uranus:  bodySign('Uranus'),
      neptune: bodySign('Neptune'),
    };
  } catch (e) {
    console.error('[solar-return] getSolarReturnSky error:', e.message);
    return null;
  }
}

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
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,sun_sign,moon_sign,rising_sign,birth_city,birth_date,birth_time,solar_return_year,preferred_style,reading_depth,reading_tone,reading_length`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const profile  = profiles?.[0];

  if (!profile) return { statusCode: 404, body: 'Profile not found' };

  // Check they've purchased Solar Return (any year value = purchased)
  if (!profile.solar_return_year) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Solar Return not purchased' }) };
  }

  // Fetch natal planets (Mercury through Saturn + MC + nodes)
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

  // Compute actual sky at the exact solar return moment
  const srSky = profile.birth_date ? getSolarReturnSky(profile.birth_date, parseInt(year)) : null;

  // Generate reading fresh each time (year and location can vary)
  const reading = await generateReading(profile, parseInt(year), returnLocation, natalPlanets, srSky);
  if (!reading) return { statusCode: 502, body: 'Failed to generate reading' };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading, year: parseInt(year) }),
  };
};

function sliderInstructions(depth = 50, tone = 50, length = 50) {
  const parts = [];
  if (depth < 35)       parts.push('Write at a beginner-friendly level — plain language, no jargon, explain astrological concepts simply.');
  else if (depth > 65)  parts.push('Write at an advanced level — use precise astrological terminology, house placements, aspects, and technical depth.');
  if (tone < 35)        parts.push('Be especially warm, nurturing, and gentle in tone — hold the reader with care.');
  else if (tone > 65)   parts.push('Be direct and unfiltered — honest, confident, no softening.');
  if (length < 35)      parts.push('Keep each section brief — 1 tight paragraph max.');
  else if (length > 65) parts.push('Go deep and thorough — give the full picture, do not cut ideas short.');
  return parts.length ? '\n\nReading style adjustments: ' + parts.join(' ') : '';
}

async function generateReading(profile, year, returnLocation, natalPlanets = {}, srSky = null) {
  const { name, sun_sign, moon_sign, rising_sign, birth_city, birth_date, preferred_style,
          reading_depth = 50, reading_tone = 50, reading_length = 50 } = profile;
  const style = STYLE_PROMPTS[preferred_style] || STYLE_PROMPTS.psychological;
  const { mercury, venus, mars, jupiter, saturn, midheaven, northNode, southNode } = natalPlanets;

  const birthYear  = birth_date ? parseInt(birth_date.slice(0, 4)) : null;
  const age        = birthYear ? year - birthYear : null;
  const ageContext = age ? `${name} is turning ${age} this Solar Return year.` : '';

  const locationLine = returnLocation
    ? `Solar Return location (where ${name} will be on their birthday): ${returnLocation}`
    : `Birth city (used as Solar Return location): ${birth_city || 'unknown'}`;

  const natalLines = [
    `Sun: ${sun_sign}`,
    `Moon: ${moon_sign || 'unknown'}`,
    rising_sign || natalPlanets.rising ? `Rising (Ascendant): ${rising_sign || natalPlanets.rising}` : 'Rising: unknown',
    midheaven   ? `Midheaven (MC — career/public legacy): ${midheaven}` : '',
    northNode   ? `North Node (soul direction): ${northNode}` : '',
    southNode   ? `South Node (karmic past): ${southNode}` : '',
    mercury     ? `Mercury (mind, communication): ${mercury}` : '',
    venus       ? `Venus (love style, values): ${venus}` : '',
    mars        ? `Mars (drive, energy): ${mars}` : '',
    jupiter     ? `Jupiter (expansion, luck): ${jupiter}` : '',
    saturn      ? `Saturn (discipline, life lessons): ${saturn}` : '',
  ].filter(Boolean).join('\n');

  const srSkyBlock = srSky ? `
ACTUAL SKY AT THE EXACT SOLAR RETURN MOMENT (${srSky.returnDateFull}):
Sun: ${srSky.sun}
Moon: ${srSky.moon} (${srSky.moonPhase})
Mercury: ${srSky.mercury || 'unknown'}
Venus: ${srSky.venus || 'unknown'}
Mars: ${srSky.mars || 'unknown'}
Jupiter: ${srSky.jupiter || 'unknown'}
Saturn: ${srSky.saturn || 'unknown'}
Uranus: ${srSky.uranus || 'unknown'}
Neptune: ${srSky.neptune || 'unknown'}
These are real calculated positions — use them exactly. Do NOT invent or contradict them.` : '';

  const prompt = `${style}

You are writing ${name}'s Solar Return reading for ${year} — their personal forecast for the year ahead, beginning at their birthday.

${name}'s natal chart:
${natalLines}
Birth city: ${birth_city || 'unknown'}
${locationLine}
${ageContext}
${srSkyBlock}

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
      messages:   [{ role: 'user', content: prompt + sliderInstructions(reading_depth, reading_tone, reading_length) }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[solar-return] Claude error:', JSON.stringify(data));
    return null;
  }
  return data.content?.map(b => b.text || '').join('') || null;
}
