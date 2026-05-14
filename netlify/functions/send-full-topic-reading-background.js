// ============================================================
// send-full-topic-reading-background.js — Netlify Background Function
// Generates a full expanded reading for a specific topic and
// emails it to a Pro subscriber who requested it from the app.
//
// POST { userId, topic }
// Auth: verifies userId has active Pro subscription via Supabase.
// Returns 202 immediately; email arrives in ~2 minutes.
// ============================================================

const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL             = process.env.URL || 'https://stellara-horoscope.com';
const FROM_EMAIL           = 'Stellara <hello@stellara-horoscope.com>';

const STYLE_PROMPTS = {
  psychological: `You are Stellara, a depth psychology astrologer who speaks through the lens of Jungian thought. Draw on archetypes, the shadow, and individuation. Tone: reflective, profound, transformative.`,
  spiritual:     `You are Stellara, a soul-centered spiritual guide and intuitive astrologer. Speak to the soul's journey, divine timing, and cosmic connection. Tone: warm, ethereal, expansive.`,
  modern:        `You are Stellara, a modern astrology coach who gives clear, practical, no-nonsense guidance. Make it concrete, contemporary, and immediately useful. Tone: direct, confident, grounded.`,
  classical:     `You are Stellara, a classical astrologer steeped in ancient tradition. Draw on planetary mythology and Hellenistic wisdom. Tone: scholarly, mythic, timeless.`,
};

const TOPIC_META = {
  love:          { label: 'Love & Romance',            focus: 'relationships, Venus placement, attachment style, what they need from a partner, patterns they repeat in love, growth edges in intimacy, how they give and receive love' },
  career:        { label: 'Career & Calling',          focus: 'vocation and ambition, Saturn themes, Sun in career context, natural strengths and working style, specific paths where they are built to thrive, what success actually looks and feels like for them' },
  finances:      { label: 'Finances & Values',         focus: 'money psychology, Venus themes, the connection between self-worth and earning, scarcity vs. abundance patterns, what money represents at a deeper level, practical alignment between values and finances' },
  health:        { label: 'Health & Wellbeing',        focus: 'body intelligence, what drains vs. restores, how stress shows up physically, emotional and physical rhythms, Mars and 6th house themes, sustainable practices that align with their chart' },
  communication: { label: 'Communication',             focus: 'Mercury placement, how they think and process, their communication style, how they come across to others, the gap between intention and impact, written and verbal strengths, listening patterns' },
  innerWorld:    { label: 'Inner World',               focus: 'Moon placement, emotional patterns and needs, the inner child, what emotional safety looks and feels like for them, unconscious drives, what lives beneath the surface' },
  shadow:        { label: 'Shadow Work',               focus: 'what is disowned, projected, or suppressed, the gold hidden in the shadow, where avoidance and resistance show up, Pluto themes, integration work and the path toward wholeness' },
  spiritual:     { label: 'Spiritual Path',            focus: 'Neptune and 12th house themes, relationship with the unseen, spiritual gifts and pitfalls, connection to something larger than themselves, contemplative practices that align with their chart' },
  energy:        { label: 'Energy & Timing',           focus: 'natural energy rhythms, Mars and Sun cycles, when to push vs. rest, how they do their best work, their relationship with time and momentum, structuring life to work with their chart' },
  soulPurpose:   { label: 'Soul Purpose',              focus: 'North Node direction, what the soul came here to learn and become, South Node comfort zone and karmic past, evolutionary themes, the deeper purpose underneath everything they do' },
  wound:         { label: 'Wound & Wisdom',            focus: 'Chiron placement, the core wound and how it shows up in daily life, the gift hidden in the pain, the healing trajectory, what wisdom this wound is slowly building toward' },
  power:         { label: 'Power & Transformation',   focus: 'Pluto and 8th house themes, where deep change is being demanded, how they relate to power, death and rebirth cycles in their life, what needs to be released for evolution' },
  creativity:    { label: 'Creativity & Joy',          focus: '5th house themes, Venus and Sun in creative context, what play and joy actually look like in this chart, creative blocks and breakthroughs, where flow lives, how to keep the creative channel open' },
  friendship:    { label: 'Friendship',                focus: '11th house themes, how they show up in groups, what they need from community, patterns in friendship, the kind of tribe that feeds vs. drains them, their chosen family' },
  chart:         { label: 'Life Path',                 focus: 'the full natal portrait — identity and essential character, emotional world, relational patterns, vocation and purpose, shadow and evolution, and the integrating theme that ties the whole chart together' },
};

function sliderInstructions(depth = 50, tone = 50, length = 50) {
  const parts = [];
  if (depth < 35)      parts.push('Write at a beginner-friendly level — plain language, minimal jargon, explain astrological concepts simply.');
  else if (depth > 65) parts.push('Write at an advanced level — use precise astrological terminology, house placements, aspects, and technical depth.');
  if (tone < 35)       parts.push('Be especially warm, nurturing, and gentle in tone — hold the reader with care.');
  else if (tone > 65)  parts.push('Be direct and unfiltered — honest, confident, no softening.');
  return parts.length ? '\n\nReading style adjustments: ' + parts.join(' ') : '';
}

function parseSections(text) {
  const sections = [];
  let currentLabel = null;
  let currentLines = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 2 && /^[A-Z][A-Z\s&,\-']+$/.test(trimmed)) {
      if (currentLabel !== null) {
        const content = currentLines.join('\n').trim();
        if (content) sections.push({ label: currentLabel, content });
      }
      currentLabel = trimmed;
      currentLines = [];
    } else if (currentLabel !== null) {
      currentLines.push(line);
    }
  }
  if (currentLabel !== null) {
    const content = currentLines.join('\n').trim();
    if (content) sections.push({ label: currentLabel, content });
  }
  return sections;
}

// ------------------------------------------------------------
// ENTRY POINT
// ------------------------------------------------------------
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { userId, topic } = body;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'userId required' }) };

  const topicMeta = TOPIC_META[topic] || TOPIC_META.chart;

  try {
    // Fetch profile
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,subscribed,preferred_style,reading_depth,reading_tone,reading_length`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const profiles = await profileRes.json();
    const profile  = profiles?.[0];

    if (!profile)           return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
    if (!profile.subscribed) return { statusCode: 403, body: JSON.stringify({ error: 'Pro subscription required' }) };

    const { name, email, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign,
            preferred_style, reading_depth = 50, reading_tone = 50, reading_length = 50 } = profile;

    // Calculate chart
    let sun = sun_sign, moon = moon_sign, rising = rising_sign;
    let natalPlanets = {};
    if (birth_date && birth_city) {
      try {
        const chartRes = await fetch(`${SITE_URL}/.netlify/functions/calculate-chart`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ birthDate: birth_date, birthTime: birth_time, birthCity: birth_city }),
        });
        if (chartRes.ok) {
          const chart = await chartRes.json();
          sun          = sun   || chart.sun;
          moon         = moon  || chart.moon;
          rising       = rising || chart.rising;
          natalPlanets = chart;
        }
      } catch (_) {}
    }

    // Get today's sky
    let skyToday = {};
    try {
      const skyRes = await fetch(`${SITE_URL}/.netlify/functions/get-sky`);
      if (skyRes.ok) skyToday = await skyRes.json();
    } catch (_) {}

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Generate reading
    const reading = await generateExpandedReading({
      name, sun, moon, rising, natalPlanets, skyToday, today,
      style: preferred_style, topicMeta,
      reading_depth, reading_tone, reading_length,
    });

    // Send email
    await sendEmail({ profile, name, email, sun, moon, rising, today, topicMeta, reading });

    return { statusCode: 202, body: JSON.stringify({ sent: true }) };

  } catch (err) {
    console.error('[send-full-topic-reading] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// ------------------------------------------------------------
// GENERATE READING
// ------------------------------------------------------------
async function generateExpandedReading({ name, sun, moon, rising, natalPlanets, skyToday, today, style, topicMeta, reading_depth, reading_tone, reading_length }) {
  const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.psychological;
  const { mercury, venus, mars, jupiter, saturn, northNode, southNode, midheaven } = natalPlanets;

  const natalLines = [
    `Sun: ${sun || 'unknown'}`,
    `Moon: ${moon || 'unknown'}`,
    rising     ? `Rising (Ascendant): ${rising}` : 'Rising: unknown',
    midheaven  ? `Midheaven (MC): ${midheaven}` : '',
    northNode  ? `North Node: ${northNode}` : '',
    southNode  ? `South Node: ${southNode}` : '',
    mercury    ? `Mercury: ${mercury}` : '',
    venus      ? `Venus: ${venus}` : '',
    mars       ? `Mars: ${mars}` : '',
    jupiter    ? `Jupiter: ${jupiter}` : '',
    saturn     ? `Saturn: ${saturn}` : '',
  ].filter(Boolean).join('\n');

  const skyLines = skyToday?.moon
    ? `Sun: ${skyToday.sun || 'unknown'}
Moon: ${skyToday.moon}
Mercury: ${skyToday.mercury || 'unknown'}
Venus: ${skyToday.venus || 'unknown'}
Mars: ${skyToday.mars || 'unknown'}
Jupiter: ${skyToday.jupiter || 'unknown'}
Saturn: ${skyToday.saturn || 'unknown'}
(Real calculated positions — use exactly as given.)`
    : '(Sky data unavailable — focus on natal chart depth.)';

  const prompt = `${stylePrompt}

You are writing ${name}'s full expanded ${topicMeta.label} reading. This is a deep, thorough exploration — not a summary. Write with genuine insight, specificity, and care. Every sentence should earn its place.

${name}'s natal chart:
${natalLines}

TODAY'S SKY (${today}):
${skyLines}

FOCUS FOR THIS READING: ${topicMeta.focus}

Structure the reading as exactly 4 sections with ALL-CAPS titles on their own lines, followed immediately by the text. No bullet points. No markdown. Plain paragraphs only. Write in second person (you/your). Be specific to ${name}'s actual placements — this should feel written only for them.

Each section should be 2–3 paragraphs. Open with natal chart depth. Weave in today's sky where it's genuinely relevant. Close the final section with one thing ${name} can sit with or act on.${sliderInstructions(reading_depth, reading_tone, reading_length)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.content?.map(b => b.text || '').join('') || '';
}

// ------------------------------------------------------------
// SEND EMAIL
// ------------------------------------------------------------
async function sendEmail({ profile, name, email, sun, moon, rising, today, topicMeta, reading }) {
  const placementLine = [
    sun                && `${sun} Sun`,
    moon               && `${moon} Moon`,
    rising             && `${rising} Rising`,
  ].filter(Boolean).join(' · ');

  const sections = parseSections(reading);
  const hasStructure = sections.length >= 2;

  const renderSection = ({ label, content }) => {
    const paras = content
      .split(/\n\n+/)
      .filter(Boolean)
      .map(p => `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.88;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">${p.trim()}</p>`)
      .join('');
    return `
    <tr><td style="padding-bottom:36px;" bgcolor="#0e1e40">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(200,169,110,0.2);">${label}</div>
      ${paras}
    </td></tr>`;
  };

  const fallbackParas = reading
    .split(/\n\n+/)
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.88;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">${p.trim()}</p>`)
    .join('');

  const bodyContent = hasStructure
    ? sections.map(renderSection).join('')
    : `<tr><td style="padding-bottom:36px;" bgcolor="#0e1e40">${fallbackParas}</td></tr>`;

  const subject = `Your full ${topicMeta.label} reading, ${name} ✦`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>${subject}</title>
  <style>:root{color-scheme:dark;} body,table,td{background-color:#0e1e40!important;}</style>
</head>
<body style="margin:0;padding:0;background:#0e1e40;" bgcolor="#0e1e40">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1e40;padding:48px 20px;" bgcolor="#0e1e40">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0e1e40">
    <div style="font-size:26px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
    <div style="font-size:36px;font-weight:800;color:#f8faff;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:8px;line-height:1;">stellara</div>
    <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;">Your Personal Cosmos</div>
  </td></tr>

  <tr><td style="text-align:center;padding-bottom:28px;" bgcolor="#0e1e40">
    <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;margin-bottom:12px;">Full Reading</div>
    <div style="font-size:28px;font-weight:400;color:#f4f0e8;font-family:Georgia,'Times New Roman',serif;margin-bottom:10px;line-height:1.2;">${topicMeta.label}</div>
    <div style="font-size:12px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.06em;">${placementLine}</div>
    <div style="font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;margin-top:6px;opacity:0.7;">${today}</div>
  </td></tr>

  <tr><td style="padding-bottom:36px;" bgcolor="#0e1e40">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.4),transparent);"></div>
  </td></tr>

  ${bodyContent}

  <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.2),transparent);"></div>
  </td></tr>

  <tr><td style="text-align:center;padding-bottom:24px;" bgcolor="#0e1e40">
    <a href="${SITE_URL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,rgba(143,168,200,0.22),rgba(90,130,180,0.12));border:1px solid rgba(143,168,200,0.58);border-radius:10px;color:#edf1fb;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
      → Open Stellara
    </a>
  </td></tr>

  <tr><td style="text-align:center;" bgcolor="#0e1e40">
    <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:2.2;">
      You're receiving this as a Stellara Pro subscriber.<br/>
      <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}/.netlify/functions/unsubscribe?id=${profile.id}" style="color:#8fa8c8;text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body:    JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    throw new Error(`Resend error ${sendRes.status}: ${errText}`);
  }
}
