// ============================================================
// full-chart-email-background.js — Netlify Background Function
// Generates a rich 6-section natal birth chart reading via
// multiple sequential Claude calls (~7000 tokens total) and
// sends it as a beautifully formatted email via Resend.
//
// POST { secret, name, email, birthDate, birthTime, birthCity }
// Protected by ADMIN_SECRET env var.
// Returns 202 immediately; email arrives within ~2 minutes.
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const ADMIN_SECRET      = process.env.ADMIN_SECRET;
const SITE_URL          = process.env.URL || 'https://stellara-horoscope.com';
const FROM_EMAIL        = 'Stellara <hello@stellara-horoscope.com>';

const SYSTEM_PROMPT = `You are Stellara, a depth-oriented astrology interpreter. Your readings draw on Jungian psychology, archetypal symbolism, and modern psychological astrology. Write with precision, warmth, and genuine insight. Every sentence must earn its place — no padding, no filler. Speak directly to this person's specific placements. No bullet points. No headers within your response. No markdown formatting. Plain prose paragraphs only, separated by blank lines. Write in second person (you/your). Be specific, personal, and honest — including about challenges.`;

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

async function calculateChart(birthDate, birthTime, birthCity) {
  const res = await fetch(`${SITE_URL}/.netlify/functions/calculate-chart`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ birthDate, birthTime, birthCity }),
  });
  if (!res.ok) throw new Error(`Chart calculation failed: ${res.status}`);
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { secret, name, email, birthDate, birthTime, birthCity } = body;

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (!name?.trim() || !email?.trim() || !birthDate || !birthCity?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name, email, birthDate, birthCity required' }) };
  }

  try {
    // ── 1. Calculate chart ────────────────────────────────────
    const chart = await calculateChart(birthDate, birthTime, birthCity);
    const { sun, moon, rising, northNode, southNode, midheaven, mercury, venus, mars, jupiter, saturn } = chart;

    const placements = [
      sun      && `Sun in ${sun}`,
      moon     && `Moon in ${moon}`,
      rising   && `Rising (Ascendant) in ${rising}`,
      mercury  && `Mercury in ${mercury}`,
      venus    && `Venus in ${venus}`,
      mars     && `Mars in ${mars}`,
      jupiter  && `Jupiter in ${jupiter}`,
      saturn   && `Saturn in ${saturn}`,
      northNode && `North Node in ${northNode}`,
      southNode && `South Node in ${southNode}`,
      midheaven && `Midheaven (MC) in ${midheaven}`,
    ].filter(Boolean).join('\n');

    const birthInfo = `Name: ${name}
Date of birth: ${birthDate}${birthTime ? `\nTime of birth: ${birthTime}` : ''}
City of birth: ${birthCity}

Natal chart placements:
${placements}`;

    const noTimeNote = !birthTime
      ? `\n\nNote: no birth time was provided, so the Rising sign and Midheaven could not be calculated. Acknowledge this briefly and naturally where relevant — don't dwell on it.`
      : '';

    // ── 2. Generate 6 sections sequentially ──────────────────

    console.log(`[full-chart-email] Starting generation for ${name} (${email})`);

    const s1 = await claude(`${birthInfo}

Write THE ARCHITECTURE OF YOU — a rich, 4-paragraph synthesis of ${name}'s Sun in ${sun}, Moon in ${moon}${rising ? `, and Rising in ${rising}` : ''}. This is the opening section of their natal chart reading. Explore how these three placements combine to form a unified psyche — the outer self, the inner world, and the instinctive mask they wear. Draw on Jungian concepts of the Persona, the Shadow, and the Self where relevant. Make it feel genuinely illuminating and specific to their exact combination — not generic descriptions of individual signs, but a real synthesis of who this particular combination creates. 4 substantial paragraphs.${noTimeNote}`);

    const s2 = await claude(`${birthInfo}

Write YOUR EMOTIONAL WORLD — a rich, 3-paragraph deep-dive into ${name}'s Moon in ${moon}. This section explores their inner emotional life: how they feel, how they process experience, what they need to feel safe and nourished, how they relate to memory and the past, and the emotional inheritance patterns from their family of origin that this Moon carries. Be psychologically honest — include the gifts and the shadow of this Moon placement. Speak to the unconscious emotional needs this placement creates and how they might manifest in daily life and relationships. 3 substantial paragraphs.`);

    const s3 = await claude(`${birthInfo}

Write LOVE, DESIRE & CONNECTION — a rich, 3-paragraph section on ${name}'s approach to love and relationships. Lead with their Venus in ${venus || 'unknown sign'}: what they value, how they love, what draws them, and what they need to feel genuinely seen in partnership. Then bring in Mars in ${mars || 'unknown sign'}: the nature of their desire, how they pursue what they want, and how their drive and assertiveness operate in intimate contexts. Close with how these two planetary energies interact — where they align, where they create tension, and what kind of partnership would truly fulfill this chart. Be specific and honest. 3 substantial paragraphs.`);

    const s4 = await claude(`${birthInfo}

Write WORK, PURPOSE & LEGACY — a rich, 4-paragraph section on ${name}'s path through the world. Cover: Saturn in ${saturn || 'unknown sign'} (the discipline they're being asked to develop, what structure means for them, where they'll face resistance and what it's building); Jupiter in ${jupiter || 'unknown sign'} (where expansion and luck flow most naturally, what kind of growth comes with less effort); ${midheaven ? `Midheaven in ${midheaven} (their public path and the legacy they're building in the eyes of the world);` : ''} and North Node in ${northNode || 'unknown sign'} with South Node in ${southNode || 'unknown sign'} (the soul's evolutionary direction — what they're moving toward and what familiar patterns they're releasing). Synthesize these into a coherent picture of their life's work. 4 substantial paragraphs.`);

    const s5 = await claude(`${birthInfo}

Write MIND, SHADOW & GIFTS — a rich, 3-paragraph section. Begin with Mercury in ${mercury || 'unknown sign'}: how ${name} thinks, processes information, communicates, and makes decisions — the particular quality of their intelligence and where it serves them best. Then move into their shadow material: based on the full chart, what are the recurring patterns, blind spots, or unconscious tendencies that are most likely to create difficulty? What does this chart's particular configuration make challenging? Be honest and specific — this is where the reading earns its depth. Close with their greatest latent gifts: what this chart, taken as a whole, suggests they are uniquely capable of. 3 substantial paragraphs.`);

    const s6 = await claude(`${birthInfo}

Write A WORD TO CARRY — a personal, poetic closing of 2 paragraphs that speaks directly to ${name} as a whole person, integrating everything the chart reveals. This is not a summary — it's a final word that lands with weight. Speak to the central tension or invitation of this chart: the thing this particular combination of placements seems to be asking them to do, become, or integrate in this lifetime. Make it feel like something worth saving. 2 rich, unhurried paragraphs.`, 900);

    console.log(`[full-chart-email] All sections generated for ${name}. Sending email...`);

    // ── 3. Build and send email ───────────────────────────────
    await sendChartEmail({ name, email, birthDate, birthTime, birthCity, chart, sections: { s1, s2, s3, s4, s5, s6 } });

    console.log(`[full-chart-email] Email sent to ${email}`);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('[full-chart-email] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function formatDate(dateStr) {
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
    <td style="padding:8px 12px;font-size:12px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;border-bottom:1px solid rgba(143,168,200,0.08);width:40%;">${label}</td>
    <td style="padding:8px 12px;font-size:13px;color:#dce8f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;border-bottom:1px solid rgba(143,168,200,0.08);">${value}</td>
  </tr>`;
}

async function sendChartEmail({ name, email, birthDate, birthTime, birthCity, chart, sections }) {
  const { sun, moon, rising, northNode, southNode, midheaven, mercury, venus, mars, jupiter, saturn } = chart;
  const { s1, s2, s3, s4, s5, s6 } = sections;

  const placementLine = [
    sun    ? `${sun} Sun`    : null,
    moon   ? `${moon} Moon`  : null,
    rising ? `${rising} Rising` : null,
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  const planetTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:0;">
      ${renderPlanetRow('Sun',       sun)}
      ${renderPlanetRow('Moon',      moon)}
      ${renderPlanetRow('Rising',    rising || 'Unknown (no birth time)')}
      ${renderPlanetRow('Mercury',   mercury)}
      ${renderPlanetRow('Venus',     venus)}
      ${renderPlanetRow('Mars',      mars)}
      ${renderPlanetRow('Jupiter',   jupiter)}
      ${renderPlanetRow('Saturn',    saturn)}
      ${renderPlanetRow('North Node', northNode)}
      ${renderPlanetRow('South Node', southNode)}
      ${renderPlanetRow('Midheaven', midheaven || 'Unknown (no birth time)')}
    </table>`;

  const readingBody = [
    renderSection('The Architecture of You', s1),
    renderSection('Your Emotional World',    s2),
    renderSection('Love, Desire & Connection', s3),
    renderSection('Work, Purpose & Legacy',  s4),
    renderSection('Mind, Shadow & Gifts',    s5),
    renderSection('A Word to Carry',         s6),
  ].join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>Your Natal Birth Chart — ${name}</title>
  <style>:root{color-scheme:dark;} body,table,td{background-color:#0b1628 !important;}</style>
</head>
<body style="margin:0;padding:0;background:#0b1628;" bgcolor="#0b1628">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1628;padding:48px 20px;" bgcolor="#0b1628">
<tr><td align="center" bgcolor="#0b1628">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

  <!-- Brand header -->
  <tr><td style="text-align:center;padding-bottom:40px;" bgcolor="#0b1628">
    <div style="font-size:22px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Stellara</div>
  </td></tr>

  <!-- Title block -->
  <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0b1628">
    <h1 style="margin:0 0 10px;font-size:30px;font-weight:400;color:#f4f0e8;font-family:Georgia,'Times New Roman',serif;letter-spacing:0.01em;">Your Natal Birth Chart</h1>
    <div style="font-size:15px;color:#c8d8ea;font-family:Georgia,'Times New Roman',serif;margin-bottom:8px;">${name}</div>
    <div style="font-size:12px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:0.08em;">${placementLine}</div>
  </td></tr>

  <!-- Gold divider -->
  <tr><td style="padding-bottom:36px;" bgcolor="#0b1628">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.5),transparent);"></div>
  </td></tr>

  <!-- Planetary positions card -->
  <tr><td style="padding-bottom:36px;" bgcolor="#0b1628">
    <div style="background:#0d1e3a;border:1px solid rgba(200,169,110,0.18);border-radius:12px;overflow:hidden;">
      <div style="padding:16px 20px 12px;background:rgba(200,169,110,0.06);border-bottom:1px solid rgba(200,169,110,0.15);">
        <div style="font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Natal Placements</div>
        <div style="font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:4px;">${formatDate(birthDate)}${birthTime ? ` · ${birthTime}` : ''} · ${birthCity}</div>
      </div>
      <div style="padding:8px 0;">${planetTable}</div>
    </div>
  </td></tr>

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
    <div style="font-size:13px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-bottom:18px;line-height:1.7;">Continue your journey — get a personalized reading every morning,<br/>written for your chart and what's in the sky today.</div>
    <a href="${SITE_URL}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,rgba(200,169,110,0.2),rgba(180,149,90,0.1));border:1px solid rgba(200,169,110,0.55);border-radius:12px;color:#c8a96e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.18em;text-decoration:none;text-transform:uppercase;">Open Stellara →</a>
    <div style="margin-top:10px;font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;opacity:0.7;">First week free · $12/mo after · Cancel anytime</div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;padding-top:24px;border-top:1px solid rgba(143,168,200,0.1);" bgcolor="#0b1628">
    <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;line-height:2;opacity:0.6;">
      Your natal birth chart reading from Stellara<br/>
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
      subject: `Your Natal Birth Chart — ${name} ✦`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}
