// ============================================================
// email-reading.js
// Sends a user's natal chart or solar return reading to their email.
// POST { userId, readingType, readingText, year }
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const FROM_EMAIL           = 'Stellara <hello@stellara-horoscope.com>';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { userId, readingType, readingText, year, topicName } = JSON.parse(event.body || '{}');
  if (!userId || !readingType || !readingText) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // Fetch user profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,email,sun_sign,moon_sign,rising_sign`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();
  const profile  = profiles?.[0];
  if (!profile || !profile.email) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'User not found' }) };
  }

  const { name, email, sun_sign, moon_sign, rising_sign } = profile;

  const isSolar   = readingType === 'solar';
  const isTopic   = !isSolar && topicName && topicName !== 'Birth Chart';
  const title     = isSolar ? `Solar Return ${year}` : isTopic ? topicName : 'Your Natal Birth Chart';
  const subtitle  = isSolar ? `${year} Personal Year Reading` : isTopic ? 'Personalized Reading' : 'Full Chart Reading';
  const sections  = isSolar
    ? ['THE YEAR AHEAD', 'THE SKY THIS YEAR', 'LOVE & RELATIONSHIPS', 'WORK & PURPOSE', 'MONEY & RESOURCES', 'BODY & WELLBEING', 'INNER WORK', 'A WORD TO CARRY']
    : ['CORE IDENTITY', 'EMOTIONAL WORLD', 'LOVE & RELATIONSHIPS', 'WORK & PURPOSE', 'GIFTS & EDGES', 'A WORD TO CARRY'];

  let bodyHtml = '';

  if (isTopic) {
    // Topic readings use ---TRANSITS--- delimiter or are plain paragraphs — render directly
    const parts = readingText.split('---TRANSITS---');
    bodyHtml = parts.map(part => part.trim()).filter(Boolean).map(part =>
      part.split('\n\n').filter(Boolean)
        .map(p => `<p style="margin:0 0 16px 0;line-height:1.8;font-size:15px;color:#dce4f0;font-family:'Georgia',serif;">${p.trim()}</p>`)
        .join('')
    ).join('<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(126,168,212,0.2),transparent);margin:24px 0;"></div>');
  } else {
    // Natal/solar: parse named sections
    let remaining = readingText.trim();
    sections.forEach((section, i) => {
      const next  = sections[i + 1];
      const start = remaining.indexOf(section);
      if (start === -1) return;
      const end     = next ? remaining.indexOf(next, start + section.length) : remaining.length;
      const content = remaining.slice(start + section.length, end).trim();
      const paras   = content.split('\n\n').filter(Boolean).map(p =>
        `<p style="margin:0 0 14px 0;line-height:1.8;">${p.trim()}</p>`
      ).join('');
      bodyHtml += `
        <div style="margin-bottom:28px;">
          <div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7ea8d4;font-weight:600;margin-bottom:10px;font-family:'Helvetica Neue',sans-serif;">${section}</div>
          <div style="font-size:15px;color:#dce4f0;font-family:'Georgia',serif;">${paras}</div>
        </div>`;
    });

    // Fallback: no sections found
    if (!bodyHtml) {
      bodyHtml = readingText.trim().split('\n\n').filter(Boolean)
        .map(p => `<p style="margin:0 0 16px 0;line-height:1.8;font-size:15px;color:#dce4f0;font-family:'Georgia',serif;">${p.trim()}</p>`)
        .join('');
    }
  }

  const placementLine = [
    sun_sign   ? `${sun_sign} Sun`     : null,
    moon_sign  ? `${moon_sign} Moon`   : null,
    rising_sign ? `${rising_sign} Rising` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>${title} — Stellara</title>
  <style>:root{color-scheme:dark;}body,table,td{background-color:#0d1b32!important;}</style>
</head>
<body style="margin:0;padding:0;background:#0d1b32;font-family:'Georgia',serif;" bgcolor="#0d1b32">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b32;padding:40px 20px;" bgcolor="#0d1b32">
    <tr><td align="center" bgcolor="#0d1b32">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;" bgcolor="#0d1b32">
          <div style="font-size:24px;color:#7ea8d4;margin-bottom:8px;">✦</div>
          <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#7ea8d4;font-family:'Helvetica Neue',sans-serif;">Stellara</div>
        </td></tr>

        <!-- Title -->
        <tr><td style="text-align:center;padding-bottom:32px;" bgcolor="#0d1b32">
          <h1 style="margin:0;font-size:26px;font-weight:400;color:#f5f8ff;letter-spacing:0.01em;">${title}</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#b8c4d8;font-family:'Helvetica Neue',sans-serif;">${name}${placementLine ? ` &nbsp;·&nbsp; ${placementLine}` : ''}</p>
          <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7ea8d4;font-family:'Helvetica Neue',sans-serif;opacity:0.8;">${subtitle}</p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding-bottom:32px;" bgcolor="#0d1b32">
          <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(126,168,212,0.3),transparent);"></div>
        </td></tr>

        <!-- Reading body -->
        <tr><td style="background:#132440;border:1px solid rgba(126,168,212,0.15);border-radius:12px;padding:32px 36px;" bgcolor="#132440">
          ${bodyHtml}
        </td></tr>

        <!-- CTA -->
        <tr><td style="text-align:center;padding-top:32px;" bgcolor="#0d1b32">
          <a href="https://stellara-horoscope.com" style="display:inline-block;padding:12px 32px;background:#1a3256;border:1px solid rgba(126,168,212,0.35);border-radius:10px;color:#dce4f0;font-family:'Helvetica Neue',sans-serif;font-size:13px;letter-spacing:0.1em;text-decoration:none;text-transform:uppercase;">Open Stellara</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:24px;" bgcolor="#0d1b32">
          <p style="margin:0;font-size:11px;color:#b8c4d8;opacity:0.5;font-family:'Helvetica Neue',sans-serif;line-height:1.8;">
            Sent from <a href="https://stellara-horoscope.com" style="color:#7ea8d4;opacity:0.8;">stellara-horoscope.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = isSolar
    ? `Your Solar Return ${year} — ${name} ✦`
    : isTopic
      ? `Your ${topicName} — ${name} ✦`
      : `Your Natal Birth Chart — ${name} ✦`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body:    JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('[email-reading] Resend error:', err);
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to send email' }) };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent: true }) };
};
