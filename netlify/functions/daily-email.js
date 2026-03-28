// ============================================================
// daily-email.js — Scheduled function: runs every morning at 7am UTC
// Fetches all Pro subscribers, generates a personalized reading
// for each via Claude, and sends it via Resend.
// ============================================================

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY      = process.env.RESEND_API_KEY;

const FROM_EMAIL = 'Stellara <hello@stellara-horoscope.com>';

const STYLE_PROMPTS = {
  psychological: `You are Stellara, a depth psychology astrologer who speaks through the lens of Jungian thought. Draw on archetypes, the shadow, and individuation. Tone: reflective, profound, transformative.`,
  spiritual:     `You are Stellara, a soul-centered spiritual guide and intuitive astrologer. Speak to the soul's journey, divine timing, and cosmic connection. Tone: warm, ethereal, expansive.`,
  modern:        `You are Stellara, a modern astrology coach who gives clear, practical, no-nonsense guidance. Make it concrete, contemporary, and immediately useful. Tone: direct, confident, grounded.`,
  classical:     `You are Stellara, a classical astrologer steeped in ancient tradition. Draw on planetary mythology and Hellenistic wisdom. Tone: scholarly, mythic, timeless.`,
};

// ------------------------------------------------------------
// ENTRY POINT
// Runs on cron schedule, OR accepts POST with { testEmail } for manual testing.
// ------------------------------------------------------------
exports.handler = async function (event) {
  try {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Manual test mode: POST with { testEmail: "you@example.com" }
    // Bypasses subscribed check so you can test with your own account
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const emails = body.testEmails || (body.testEmail ? [body.testEmail] : null);
      if (!emails) return { statusCode: 400, body: 'testEmail or testEmails required' };

      const results = await Promise.allSettled(emails.map(async (testEmail) => {
        const res  = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(testEmail)}&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        const data = await res.json();
        if (!Array.isArray(data)) return { email: testEmail, error: JSON.stringify(data) };
        const [user] = data;
        if (!user) return { email: testEmail, error: 'no profile found' };
        await sendDailyEmail(user, today);
        return { email: testEmail, sent: true };
      }));
      return { statusCode: 200, body: JSON.stringify(results.map(r => r.value ?? { error: r.reason?.message })) };
    }

    // Scheduled run — send to all Pro subscribers
    const subscribers = await getSubscribers();
    console.log(`[daily-email] Sending to ${subscribers.length} subscribers`);

    const results = await Promise.allSettled(
      subscribers.map(user => sendDailyEmail(user, today))
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[daily-email] Sent: ${sent}, Failed: ${failed}`);

    return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
  } catch (err) {
    console.error('[daily-email] Fatal error:', err);
    return { statusCode: 500, body: err.message };
  }
};

// ------------------------------------------------------------
// FETCH PRO SUBSCRIBERS WITH SAVED BIRTH INFO
// ------------------------------------------------------------
async function getSubscribers() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.true&name=neq.null&birth_date=neq.null&birth_city=neq.null&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const data = await res.json();
  console.log('[daily-email] getSubscribers raw count:', Array.isArray(data) ? data.length : JSON.stringify(data));
  return Array.isArray(data) ? data.filter(u => u.email && !u.email_opt_out) : [];
}

// ------------------------------------------------------------
// GENERATE + SEND ONE EMAIL
// ------------------------------------------------------------
async function sendDailyEmail(user, today) {
  const { name, email, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, preferred_style } = user;

  // Calculate chart if signs aren't saved
  let sun    = sun_sign;
  let moon   = moon_sign;
  let rising = rising_sign;

  if (!sun || !moon || !rising) {
    try {
      const chartRes = await fetch(`${process.env.URL}/.netlify/functions/calculate-chart`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ birthDate: birth_date, birthTime: birth_time, birthCity: birth_city }),
      });
      if (chartRes.ok) {
        const chart = await chartRes.json();
        sun    = sun    || chart.sun;
        moon   = moon   || chart.moon;
        rising = rising || chart.rising;

        // Save calculated signs back to the profile so we never recalculate
        // (and manual corrections made directly in Supabase are preserved on next run)
        const patch = {};
        if (!sun_sign   && sun)    patch.sun_sign    = sun;
        if (!moon_sign  && moon)   patch.moon_sign   = moon;
        if (!rising_sign && rising) patch.rising_sign = rising;
        if (Object.keys(patch).length) {
          fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
            method:  'PATCH',
            headers: {
              'Content-Type':  'application/json',
              'apikey':         SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Prefer':        'return=minimal',
            },
            body: JSON.stringify(patch),
          }).catch(() => {});
        }
      }
    } catch (_) {}
  }

  // Generate the reading via Claude
  const style = preferred_style || 'psychological';
  const { reading, theme } = await generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style });

  // Build and send the email
  await sendEmail({ user, name, email, sun, moon, rising, reading, theme, today });
}

// ------------------------------------------------------------
// CLAUDE — generate the personalized daily reading
// ------------------------------------------------------------
async function generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style }) {
  const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.psychological;
  const noTimeNote = !birth_time
    ? `Note: ${name} did not provide a birth time so their Rising sign is unknown — acknowledge this briefly and naturally.`
    : '';

  const prompt = `${systemPrompt}

Write ${name} a personalized daily reading for ${today}. This will be delivered as their morning email — make it feel like a meaningful ritual, not a generic horoscope.

${name}'s chart:
Sun: ${sun}
Moon: ${moon}
${rising ? `Rising: ${rising}` : 'Rising: unknown (no birth time provided)'}
Birth city: ${birth_city} (birth location only — do not assume this is where they currently live)
${noTimeNote}

First, on its own line, write:
THEME: [3–5 words that capture today's energy for ${name} — e.g. "Roots before reaching" or "The quiet before clarity"]

Then write exactly 4 paragraphs with no headers or labels:
1. What's alive in the sky today — the Moon's sign and phase, any notable planetary energy (invent plausible but grounded transit themes for today).
2. How today's energy specifically lands in ${name}'s chart — speak to their ${sun} Sun and ${moon} Moon directly.
3. Something specific for ${name} to lean into or be mindful of today — concrete and personal.
4. A closing intention or reflection — one sentence they can carry with them. Something that lingers.

Every sentence should land. Warm, personal, potent. No bullet points. No markdown. No hashtags. Plain paragraphs only.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  const full = data.content?.map(b => b.text || '').join('') || '';

  // Extract THEME line and the rest
  const themeMatch = full.match(/^THEME:\s*(.+)$/m);
  const theme   = themeMatch ? themeMatch[1].trim() : '';
  const reading = full.replace(/^THEME:.*$/m, '').trim();
  return { reading, theme };
}

// ------------------------------------------------------------
// RESEND — send the HTML email
// ------------------------------------------------------------
async function sendEmail({ user, name, email, sun, moon, rising, reading, theme, today }) {
  // Strip any markdown headers/bold/italic that Claude might sneak in
  const cleanReading = reading
    .replace(/^#{1,6}\s+/gm, '')   // remove # headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // remove **bold**
    .replace(/\*(.*?)\*/g, '$1');    // remove *italic*
  const paragraphs = cleanReading.split('\n\n').filter(Boolean);
  const bodyHtml = paragraphs.map(p => `<p style="margin:0 0 20px 0;line-height:1.8;">${p.trim()}</p>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>Your Daily Reading — Stellara</title>
  <style>
    :root { color-scheme: dark; }
    body, table, td { background-color: #0d1b32 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#0d1b32;font-family:'Georgia',serif;" bgcolor="#0d1b32">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b32;padding:40px 20px;" bgcolor="#0d1b32">
    <tr><td align="center" bgcolor="#0d1b32">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;" bgcolor="#0d1b32">
          <div style="font-size:24px;color:#7ea8d4;margin-bottom:8px;">✦</div>
          <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7ea8d4;font-family:'Helvetica Neue',sans-serif;">Stellara</div>
        </td></tr>

        <!-- Date -->
        <tr><td style="text-align:center;padding-bottom:8px;" bgcolor="#0d1b32">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#7ea8d4;font-family:'Helvetica Neue',sans-serif;">${today}</div>
        </td></tr>

        <!-- Title -->
        <tr><td style="text-align:center;padding-bottom:32px;" bgcolor="#0d1b32">
          <h1 style="margin:0;font-size:26px;font-weight:400;color:#f5f8ff;letter-spacing:0.01em;">Your Daily Reading</h1>
          <p style="margin:8px 0 0;font-size:13px;color:#b8c4d8;font-family:'Helvetica Neue',sans-serif;">${name} &nbsp;·&nbsp; ${sun} Sun &nbsp;·&nbsp; ${moon} Moon${rising ? ` &nbsp;·&nbsp; ${rising} Rising` : ''}</p>
          ${theme ? `<p style="margin:18px 0 0;font-size:15px;font-style:italic;color:#7ea8d4;font-family:'Georgia',serif;letter-spacing:0.02em;">"${theme}"</p>` : ''}
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding-bottom:32px;" bgcolor="#0d1b32">
          <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(126,168,212,0.3),transparent);"></div>
        </td></tr>

        <!-- Reading -->
        <tr><td style="background:#132440;border:1px solid rgba(126,168,212,0.15);border-radius:12px;padding:32px 36px;" bgcolor="#132440">
          <div style="font-size:16px;color:#dce4f0;font-family:'Georgia',serif;">
            ${bodyHtml}
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="text-align:center;padding-top:32px;" bgcolor="#0d1b32">
          <a href="https://stellara-horoscope.com" style="display:inline-block;padding:12px 32px;background:#1a3256;border:1px solid rgba(126,168,212,0.35);border-radius:10px;color:#dce4f0;font-family:'Helvetica Neue',sans-serif;font-size:13px;letter-spacing:0.1em;text-decoration:none;text-transform:uppercase;">Open Stellara</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:32px;" bgcolor="#0d1b32">
          <p style="margin:0;font-size:11px;color:#b8c4d8;opacity:0.5;font-family:'Helvetica Neue',sans-serif;line-height:1.8;">
            You're receiving this because you're a Stellara Pro subscriber.<br/>
            <a href="https://stellara-horoscope.com" style="color:#7ea8d4;opacity:0.8;">Open Stellara</a>
            &nbsp;·&nbsp;
            <a href="https://stellara-horoscope.com/.netlify/functions/unsubscribe?id=${user.id}" style="color:#7ea8d4;opacity:0.8;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      email,
      subject: `Your reading for ${today}, ${name} ✦`,
      html,
    }),
  });
}
