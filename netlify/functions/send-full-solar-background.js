// ============================================================
// send-full-solar-background.js — Netlify Background Function
// Generates a rich 6-section Solar Return reading using the exact
// planetary positions at the SR moment + full natal chart, then
// emails it to the requesting Pro subscriber.
//
// POST { userId, year, returnLocation }
// Returns 202 immediately; email arrives in ~2 minutes.
// ============================================================

const Astronomy = require('astronomy-engine');

const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL             = process.env.URL || 'https://stellara-horoscope.com';
const FROM_EMAIL           = 'Stellara <hello@stellara-horoscope.com>';

const SR_SIGNS  = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                   'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const SR_PHASES = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
                   'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];

const SYSTEM_PROMPT = `You are Stellara, a depth-oriented astrology interpreter. Your readings draw on Jungian psychology, archetypal symbolism, and modern psychological astrology. Write with precision, warmth, and genuine insight. Every sentence must earn its place — no padding, no filler. Speak directly to this person's specific placements. No bullet points. No headers within your response. No markdown formatting. Plain prose paragraphs only, separated by blank lines. Write in second person (you/your). Be specific, personal, and honest — including about challenges.`;

function getSolarReturnSky(birthDate, targetYear) {
  try {
    const birthUTC  = new Date(birthDate + 'T12:00:00Z');
    const birthTime = Astronomy.MakeTime(birthUTC);
    const sunVec    = Astronomy.GeoVector('Sun', birthTime, true);
    const natalLon  = ((Astronomy.Ecliptic(sunVec).elon % 360) + 360) % 360;

    const searchStart = Astronomy.MakeTime(new Date(`${targetYear}-01-01T00:00:00Z`));
    const returnTime  = Astronomy.SearchSunLongitude(natalLon, searchStart, 400);
    if (!returnTime) return null;

    function bodySign(name) {
      try {
        const vec = Astronomy.GeoVector(name, returnTime, true);
        const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
        return SR_SIGNS[Math.floor(lon / 30)];
      } catch { return null; }
    }

    return {
      returnDate:     returnTime.date.toISOString().slice(0, 10),
      returnDateFull: returnTime.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      sun:     bodySign('Sun'),
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
    console.error('[send-full-solar] getSolarReturnSky error:', e.message);
    return null;
  }
}

async function claude(prompt, maxTokens = 1200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { userId, year, returnLocation } = body;
  if (!userId || !year) return { statusCode: 400, body: JSON.stringify({ error: 'userId and year required' }) };

  // Fetch and verify user profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,subscribed,pro_expires_at,solar_return_year`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const profile  = profiles?.[0];

  if (!profile) {
    console.error(`[send-full-solar] User not found: ${userId}`);
    return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasActiveTrial = profile.pro_expires_at && profile.pro_expires_at >= today;
  const hasSolarAccess = !!profile.solar_return_year;
  if (!profile.subscribed && !hasActiveTrial && !hasSolarAccess) {
    console.error(`[send-full-solar] No access for ${userId}`);
    return { statusCode: 403, body: JSON.stringify({ error: 'Solar Return access required' }) };
  }

  const { name, email, birth_date: birthDate, birth_time: birthTime, birth_city: birthCity } = profile;
  if (!name || !email || !birthDate) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Incomplete profile' }) };
  }

  try {
    const targetYear = parseInt(year);

    // ── 1. Natal chart ────────────────────────────────────────
    let natal = {};
    if (birthDate && birthCity) {
      try {
        const r = await fetch(`${SITE_URL}/.netlify/functions/calculate-chart`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ birthDate, birthTime: birthTime || null, birthCity }),
        });
        if (r.ok) natal = await r.json();
      } catch (_) {}
    }

    // ── 2. Solar return sky ───────────────────────────────────
    const srSky = getSolarReturnSky(birthDate, targetYear);

    const sun     = natal.sun     || profile.sun_sign    || 'unknown';
    const moon    = natal.moon    || profile.moon_sign   || 'unknown';
    const rising  = natal.rising  || profile.rising_sign || null;
    const { mercury, venus, mars, jupiter, saturn, northNode, southNode, midheaven } = natal;

    const birthYear = parseInt(birthDate.slice(0, 4));
    const age       = targetYear - birthYear;

    const natalBlock = [
      `Sun: ${sun}`,
      `Moon: ${moon}`,
      rising ? `Rising (Ascendant): ${rising}` : 'Rising: unknown (no birth time)',
      midheaven  ? `Midheaven (MC): ${midheaven}` : '',
      northNode  ? `North Node: ${northNode}` : '',
      southNode  ? `South Node: ${southNode}` : '',
      mercury    ? `Mercury: ${mercury}` : '',
      venus      ? `Venus: ${venus}` : '',
      mars       ? `Mars: ${mars}` : '',
      jupiter    ? `Jupiter: ${jupiter}` : '',
      saturn     ? `Saturn: ${saturn}` : '',
    ].filter(Boolean).join('\n');

    const srBlock = srSky ? `
Solar Return date: ${srSky.returnDateFull}
Solar Return planetary positions (exact sky at the return moment):
Sun: ${srSky.sun}
Moon: ${srSky.moon} (${srSky.moonPhase})
Mercury: ${srSky.mercury || 'unknown'}
Venus: ${srSky.venus || 'unknown'}
Mars: ${srSky.mars || 'unknown'}
Jupiter: ${srSky.jupiter || 'unknown'}
Saturn: ${srSky.saturn || 'unknown'}
Uranus: ${srSky.uranus || 'unknown'}
Neptune: ${srSky.neptune || 'unknown'}
These are real calculated positions — use them exactly as given.` : '';

    const locationLine = returnLocation
      ? `Solar Return location: ${returnLocation}`
      : `Birth city used as Solar Return location: ${birthCity || 'unknown'}`;

    const context = `Name: ${name}
Age at this Solar Return: ${age}
${locationLine}

NATAL CHART (permanent birth placements):
${natalBlock}
${srBlock}`;

    // ── 3. Generate 6 sections ────────────────────────────────
    console.log(`[send-full-solar] Starting generation for ${name} (${email}), year ${targetYear}`);

    const s1 = await claude(`${context}

Write THE YEAR'S ARCHITECTURE — the opening section of ${name}'s ${targetYear} Solar Return reading. This is the year's central theme and soul curriculum. What chapter is opening as the Sun returns to its natal degree for the ${age}th time? Draw on the Solar Return Moon (${srSky?.moon || 'unknown'} in ${srSky?.moonPhase || 'unknown phase'}) as the emotional tone of the year, the natal chart's ongoing story, and what ${name} is being asked to step into. Be bold and specific — this is the frame through which everything else in this year will be experienced. 4 substantial paragraphs.`);

    const s2 = await claude(`${context}

Write THE SKY AT YOUR RETURN — a rich, 3-paragraph analysis of the actual planetary positions at the exact moment the Sun returned to its natal degree on ${srSky?.returnDateFull || `${name}'s birthday in ${targetYear}`}. Go planet by planet through the most significant SR placements: the Moon (${srSky?.moon || 'unknown'}, ${srSky?.moonPhase || 'unknown phase'}), Venus (${srSky?.venus || 'unknown'}), Mars (${srSky?.mars || 'unknown'}), Jupiter (${srSky?.jupiter || 'unknown'}), Saturn (${srSky?.saturn || 'unknown'}). Explain what each placement in this specific SR chart means for ${name}'s year — not generic sign descriptions, but how this SR sky speaks to their natal chart specifically. These are real astronomical positions. 3 substantial paragraphs.`);

    const s3 = await claude(`${context}

Write LOVE, CONNECTION & DESIRE — a rich, 3-paragraph section on what ${targetYear} holds for ${name} in love and relationships. Lead with the Solar Return Venus in ${srSky?.venus || 'unknown sign'} and how it activates or challenges their natal Venus in ${venus || 'unknown sign'}. Bring in the Solar Return Mars in ${srSky?.mars || 'unknown sign'} vs natal Mars in ${mars || 'unknown sign'}: what is the energy of pursuit, desire, and assertiveness in relationships this year? Close with a synthesis — what kind of relational movement is this year calling for? What is ready to deepen, shift, or be released? Be specific and honest. 3 substantial paragraphs.`);

    const s4 = await claude(`${context}

Write WORK, PURPOSE & MOMENTUM — a rich, 3-paragraph section on ${name}'s professional and creative life in ${targetYear}. Lead with the Solar Return Jupiter in ${srSky?.jupiter || 'unknown sign'}: where does expansion flow most naturally this year? What doors are open? Then bring in the Solar Return Saturn in ${srSky?.saturn || 'unknown sign'} and how it interacts with natal Saturn in ${saturn || 'unknown sign'}: what is being asked of them in terms of discipline, structure, and long-term building? Close by integrating the natal Midheaven (${midheaven || 'unknown sign'}) with this year's planetary energy — what does this year ask of them in terms of their public path and legacy? 3 substantial paragraphs.`);

    const s5 = await claude(`${context}

Write INNER TERRAIN & TRANSFORMATION — a rich, 3-paragraph section on the psychological and inner work of ${name}'s ${targetYear}. The Solar Return Uranus is in ${srSky?.uranus || 'unknown sign'} and Neptune in ${srSky?.neptune || 'unknown sign'} — what is being disrupted, dissolved, or restructured at a deeper level this year? Go into the shadow territory: what unconscious patterns or avoidances is this year likely to surface? What does this year's particular combination of SR and natal energies make available for integration that wasn't available before? Be psychologically honest and specific — this is the part of the reading that earns its depth. 3 substantial paragraphs.`);

    const s6 = await claude(`${context}

Write A WORD TO CARRY — a personal, poetic closing of 2 paragraphs for ${name}'s ${targetYear}. This is not a summary. It is a final word that lands with weight and can be returned to throughout the year. Speak to the single most important invitation or tension of this Solar Return: the thing this particular year is asking ${name} to become, integrate, or release. Make it true, specific, and worth saving. 2 rich, unhurried paragraphs.`, 900);

    console.log(`[send-full-solar] Generation complete for ${name}. Sending email...`);

    // ── 4. Build and send email ───────────────────────────────
    await sendSolarEmail({ name, email, birthDate, birthCity, returnLocation, targetYear, age, srSky, natal: { sun, moon, rising }, sections: { s1, s2, s3, s4, s5, s6 } });

    console.log(`[send-full-solar] Email sent to ${email}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('[send-full-solar] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderSection(label, text) {
  const paras = text.split('\n\n').filter(p => p.trim()).map(p =>
    `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">${p.trim()}</p>`
  ).join('');
  return `
    <div style="margin-bottom:36px;">
      <div style="font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(200,169,110,0.2);">${label}</div>
      ${paras}
    </div>`;
}

function renderPlanetRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:8px 12px;font-size:12px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;border-bottom:1px solid rgba(143,168,200,0.08);width:45%;">${label}</td>
    <td style="padding:8px 12px;font-size:13px;color:#dce8f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;border-bottom:1px solid rgba(143,168,200,0.08);">${value}</td>
  </tr>`;
}

async function sendSolarEmail({ name, email, birthDate, birthCity, returnLocation, targetYear, age, srSky, natal, sections }) {
  const { sun, moon, rising } = natal;
  const { s1, s2, s3, s4, s5, s6 } = sections;

  const placementLine = [
    sun    ? `${sun} Sun`       : null,
    moon   ? `${moon} Moon`     : null,
    rising ? `${rising} Rising` : null,
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  const srPlacementsTable = srSky ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:0;">
      ${renderPlanetRow('Return Date', srSky.returnDateFull)}
      ${renderPlanetRow('SR Moon', srSky.moon ? `${srSky.moon} (${srSky.moonPhase})` : null)}
      ${renderPlanetRow('SR Mercury', srSky.mercury)}
      ${renderPlanetRow('SR Venus',   srSky.venus)}
      ${renderPlanetRow('SR Mars',    srSky.mars)}
      ${renderPlanetRow('SR Jupiter', srSky.jupiter)}
      ${renderPlanetRow('SR Saturn',  srSky.saturn)}
      ${renderPlanetRow('SR Uranus',  srSky.uranus)}
      ${renderPlanetRow('SR Neptune', srSky.neptune)}
    </table>` : '';

  const readingBody = [
    renderSection("The Year's Architecture",       s1),
    renderSection('The Sky at Your Return',          s2),
    renderSection('Love, Connection & Desire',       s3),
    renderSection('Work, Purpose & Momentum',        s4),
    renderSection('Inner Terrain & Transformation',  s5),
    renderSection('A Word to Carry',                 s6),
  ].join('');

  const locationDisplay = returnLocation || birthCity || 'your birth city';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>Solar Return ${targetYear} — ${name}</title>
  <style>:root{color-scheme:dark;} body,table,td{background-color:#0b1628 !important;}</style>
</head>
<body style="margin:0;padding:0;background:#0b1628;" bgcolor="#0b1628">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1628;padding:48px 20px;" bgcolor="#0b1628">
<tr><td align="center" bgcolor="#0b1628">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <!-- Brand header -->
  <tr><td style="text-align:center;padding-bottom:40px;" bgcolor="#0b1628">
    <div style="font-size:22px;color:#c8a96e;margin-bottom:10px;line-height:1;">☀</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Stellara</div>
  </td></tr>

  <!-- Title block -->
  <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0b1628">
    <h1 style="margin:0 0 10px;font-size:30px;font-weight:400;color:#f4f0e8;font-family:Georgia,'Times New Roman',serif;letter-spacing:0.01em;">Solar Return ${targetYear}</h1>
    <div style="font-size:15px;color:#c8d8ea;font-family:Georgia,'Times New Roman',serif;margin-bottom:8px;">${name} · turning ${age}</div>
    <div style="font-size:12px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:0.08em;">${placementLine}</div>
    <div style="font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:6px;opacity:0.7;">Cast for ${locationDisplay}</div>
  </td></tr>

  <!-- Gold divider -->
  <tr><td style="padding-bottom:36px;" bgcolor="#0b1628">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.5),transparent);"></div>
  </td></tr>

  ${srSky ? `<!-- Solar Return sky card -->
  <tr><td style="padding-bottom:36px;" bgcolor="#0b1628">
    <div style="background:#0d1e3a;border:1px solid rgba(200,169,110,0.18);border-radius:12px;overflow:hidden;">
      <div style="padding:16px 20px 12px;background:rgba(200,169,110,0.06);border-bottom:1px solid rgba(200,169,110,0.15);">
        <div style="font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Solar Return Placements</div>
        <div style="font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:4px;">Exact sky on ${srSky.returnDateFull}</div>
      </div>
      <div style="padding:8px 0;">${srPlacementsTable}</div>
    </div>
  </td></tr>` : ''}

  <!-- Reading sections -->
  <tr><td style="background:#0d1e3a;border:1px solid rgba(143,168,200,0.12);border-radius:16px;padding:40px 44px;" bgcolor="#0d1e3a">
    ${readingBody}
  </td></tr>

  <!-- Gold divider -->
  <tr><td style="padding:36px 0 28px;" bgcolor="#0b1628">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
  </td></tr>

  <!-- CTA -->
  <tr><td style="text-align:center;padding-bottom:16px;" bgcolor="#0b1628">
    <div style="font-size:13px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-bottom:18px;line-height:1.7;">Get a personalized reading every morning —<br/>written for your chart and what's in the sky today.</div>
    <a href="${SITE_URL}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,rgba(200,169,110,0.2),rgba(180,149,90,0.1));border:1px solid rgba(200,169,110,0.55);border-radius:12px;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.18em;text-decoration:none;text-transform:uppercase;">Open Stellara →</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;padding-top:24px;border-top:1px solid rgba(143,168,200,0.1);" bgcolor="#0b1628">
    <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:2;opacity:0.6;">
      Your Solar Return reading from Stellara<br/>
      <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body:    JSON.stringify({
      from:    FROM_EMAIL,
      to:      email,
      subject: `Your Solar Return ${targetYear} — ${name} ✦`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}
