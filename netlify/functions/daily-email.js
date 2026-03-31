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
// ------------------------------------------------------------
exports.handler = async function (event) {
  try {
    const now   = new Date();
    const today = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    // ISO date string YYYY-MM-DD for idempotency check
    const todayISO = now.toISOString().slice(0, 10);

    // Diagnostic GET: returns raw Supabase subscriber query result
    if (event.httpMethod === 'GET') {
      const url = `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.true&select=id,name,email,birth_date,birth_city,email_opt_out`;
      const res = await fetch(url, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: res.status, urlUsed: url, rowCount: Array.isArray(data) ? data.length : 'not array', data }),
      };
    }

    // Manual test mode: POST with { testEmail: "you@example.com" }
    // Note: Netlify scheduler also fires as POST with {next_run:...} — only enter test mode if testEmail/testEmails present
    const postBody = JSON.parse(event.body || '{}');
    if (event.httpMethod === 'POST' && (postBody.testEmail || postBody.testEmails)) {
      const emails = postBody.testEmails || [postBody.testEmail];

      // Calculate today's real sky for test sends too
      const skyToday = await getTodaySky();

      const results = await Promise.allSettled(emails.map(async (testEmail) => {
        const res  = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(testEmail)}&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        const data = await res.json();
        if (!Array.isArray(data)) return { email: testEmail, error: JSON.stringify(data) };
        const [user] = data;
        if (!user) return { email: testEmail, error: 'no profile found' };
        await sendDailyEmail(user, today, todayISO, skyToday, /* skipIdempotency */ true);
        return { email: testEmail, sent: true };
      }));
      return { statusCode: 200, body: JSON.stringify(results.map(r => r.value ?? { error: r.reason?.message })) };
    }

    // Scheduled run — calculate today's real sky once, then send to all eligible subscribers
    const skyToday    = await getTodaySky();
    const subscribers = await getSubscribers(todayISO);
    console.log(`[daily-email] Sending to ${subscribers.length} subscribers (sky: Moon in ${skyToday.moon})`);

    const results = await Promise.allSettled(
      subscribers.map(user => sendDailyEmail(user, today, todayISO, skyToday, false))
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
// CALCULATE TODAY'S REAL SKY (moon sign + sun sign)
// Called once per run so all readings share the same accurate sky.
// ------------------------------------------------------------
async function getTodaySky() {
  try {
    const now      = new Date();
    const birthDate = now.toISOString().slice(0, 10);
    const birthTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    const res = await fetch(`${process.env.URL}/.netlify/functions/calculate-chart`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ birthDate, birthTime, birthCity: 'New York, New York, United States' }),
    });
    if (!res.ok) return {};
    const chart = await res.json();
    return { moon: chart.moon || null, sun: chart.sun || null };
  } catch (_) {
    return {};
  }
}

// ------------------------------------------------------------
// FETCH PRO SUBSCRIBERS — skip anyone already emailed today
// ------------------------------------------------------------
async function getSubscribers(todayISO) {
  console.log('[daily-email] SUPABASE_URL set:', !!SUPABASE_URL);
  console.log('[daily-email] SUPABASE_SERVICE_KEY set:', !!SUPABASE_SERVICE_KEY);
  const url = `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.true&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out,last_email_date`;
  console.log('[daily-email] fetching:', url);
  const res = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  console.log('[daily-email] Supabase status:', res.status);
  const data = await res.json();
  console.log('[daily-email] raw response:', JSON.stringify(data).slice(0, 200));
  if (!Array.isArray(data)) return [];
  return data.filter(u =>
    u.email &&
    !u.email_opt_out &&
    u.name &&
    u.birth_date &&
    u.birth_city &&
    u.last_email_date !== todayISO   // skip if already sent today
  );
}

// ------------------------------------------------------------
// GENERATE + SEND ONE EMAIL
// ------------------------------------------------------------
async function sendDailyEmail(user, today, todayISO, skyToday, skipIdempotency) {
  const { name, email, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, preferred_style } = user;

  // Sun and moon are stable — use saved values if present.
  // Rising always recalculated fresh (sensitive to formula changes).
  let sun    = sun_sign;
  let moon   = moon_sign;
  let rising = null;

  if (!sun || !moon || birth_time) {
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
        rising = chart.rising || null;

        // Only cache sun/moon — never cache rising so formula fixes apply immediately
        const patch = {};
        if (!sun_sign  && sun)  patch.sun_sign  = sun;
        if (!moon_sign && moon) patch.moon_sign = moon;
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
  const content = await generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style, skyToday });

  // Send the email
  await sendEmail({ user, name, email, sun, moon, rising, today, ...content });

  // Mark as sent today (idempotency) — fire and forget
  if (!skipIdempotency) {
    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ last_email_date: todayISO }),
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// CLAUDE — generate the new scannable morning digest
// ------------------------------------------------------------
async function generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style, skyToday }) {
  const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.psychological;

  const moonLine = skyToday?.moon
    ? `Today's Moon is in ${skyToday.moon} (real astronomical data — use this exactly, do not contradict it).`
    : `Use a plausible Moon sign for today.`;

  const prompt = `${systemPrompt}

You are writing ${name}'s morning Stellara digest for ${today}.

${name}'s chart:
Sun: ${sun}
Moon: ${moon}
${rising ? `Rising: ${rising}` : 'Rising: unknown'}
Birth city: ${birth_city}

Today's sky:
${moonLine}
Add one or two other plausible planetary themes for today (Mercury, Venus, Mars, Saturn — invent grounded, specific transits).

Write the following sections using EXACTLY these labels on their own lines. No extra text between labels.

SUBJECT:
A short, intriguing, personalized email subject line for ${name}. Never generic. Examples: "Something soft is arriving today, ${name}" / "${name}, Venus has a message for you" / "Today your chart says: slow down." Make it feel like it was written just for them. Max 10 words.

PARAGRAPH:
3–4 sentences written directly to ${name} in second person. Warm, poetic, psychologically intelligent. Reference their actual ${sun} Sun and ${moon} Moon and today's planetary energy. Specific to their chart — not generic. Tone of a wise friend, not a textbook. No em dashes used as list separators.

QUOTE:
One original 1–2 line quote tied directly to today's planetary theme for ${name}. Something they would screenshot and share to Instagram stories. Feels true and timely. Do NOT use a famous quote — write an original one.

WATCH:
One specific thing for ${name} to be aware of today. One line only.

LEAN:
2–4 words or a very short phrase — the energy ${name} should embrace today.

POWER:
One concrete, actionable suggestion for ${name} today. One line only. Specific, not generic.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  const full = (data.content?.map(b => b.text || '').join('') || '').trim();

  // Parse each labelled section
  function extract(label) {
    const re = new RegExp(`^${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'm');
    const m = full.match(re);
    return m ? m[1].trim() : '';
  }

  return {
    subject:   extract('SUBJECT'),
    paragraph: extract('PARAGRAPH'),
    quote:     extract('QUOTE'),
    watch:     extract('WATCH'),
    lean:      extract('LEAN'),
    power:     extract('POWER'),
  };
}

// ------------------------------------------------------------
// RESEND — send the redesigned morning digest email
// ------------------------------------------------------------
async function sendEmail({ user, name, email, sun, moon, rising, today, subject, paragraph, quote, watch, lean, power }) {
  // Clean any stray markdown
  const clean = s => (s || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();

  const safeSubject  = clean(subject)  || `Your Stellara reading for today, ${name} ✦`;
  const safeParagraph = clean(paragraph);
  const safeQuote    = clean(quote);
  const safeWatch    = clean(watch);
  const safeLean     = clean(lean);
  const safePower    = clean(power);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>${safeSubject}</title>
  <style>
    :root { color-scheme: dark; }
    body, table, td { background-color: #0f1e38 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#0f1e38;" bgcolor="#0f1e38">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e38;padding:48px 20px;" bgcolor="#0f1e38">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <!-- Brand -->
    <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0f1e38">
      <div style="font-size:20px;color:#c8a96e;margin-bottom:6px;">✦</div>
      <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#7ea8d4;font-family:Helvetica,Arial,sans-serif;">Stellara</div>
    </td></tr>

    <!-- Date + placements -->
    <tr><td style="text-align:center;padding-bottom:28px;" bgcolor="#0f1e38">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7ea8d4;font-family:Helvetica,Arial,sans-serif;margin-bottom:10px;">${today}</div>
      <div style="font-size:12px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.06em;">
        ${sun} Sun &nbsp;·&nbsp; ${moon} Moon${rising ? ` &nbsp;·&nbsp; ${rising} Rising` : ''}
      </div>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding-bottom:32px;" bgcolor="#0f1e38">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
    </td></tr>

    <!-- Main paragraph -->
    <tr><td style="padding-bottom:32px;" bgcolor="#0f1e38">
      <p style="margin:0;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;text-align:left;">${safeParagraph}</p>
    </td></tr>

    <!-- Quote -->
    <tr><td style="padding:28px 24px;background:#132440;border-left:3px solid #c8a96e;border-radius:0 10px 10px 0;margin-bottom:32px;" bgcolor="#132440">
      <p style="margin:0;font-size:16px;line-height:1.7;color:#c8a96e;font-family:Georgia,'Times New Roman',serif;font-style:italic;text-align:center;">&ldquo;${safeQuote}&rdquo;</p>
    </td></tr>

    <!-- Spacer -->
    <tr><td style="padding-bottom:28px;" bgcolor="#0f1e38"></td></tr>

    <!-- Watch / Lean / Power -->
    <tr><td style="background:#132440;border:1px solid rgba(126,168,212,0.15);border-radius:14px;padding:28px 30px;" bgcolor="#132440">

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-bottom:18px;">
            <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#7ea8d4;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Watch for</div>
            <div style="font-size:15px;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">${safeWatch}</div>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:18px;border-top:1px solid rgba(126,168,212,0.1);padding-top:18px;">
            <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#7ea8d4;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Lean into</div>
            <div style="font-size:18px;color:#f5f8ff;font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:0.02em;">${safeLean}</div>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(126,168,212,0.1);padding-top:18px;">
            <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Your power move today</div>
            <div style="font-size:15px;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">${safePower}</div>
          </td>
        </tr>
      </table>

    </td></tr>

    <!-- CTA -->
    <tr><td style="text-align:center;padding-top:36px;" bgcolor="#0f1e38">
      <a href="https://stellara-horoscope.com" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,rgba(126,168,212,0.2),rgba(126,168,212,0.1));border:1px solid rgba(126,168,212,0.45);border-radius:10px;color:#dce8f8;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        → Open Stellara for your full reading
      </a>
    </td></tr>

    <!-- Footer -->
    <tr><td style="text-align:center;padding-top:36px;" bgcolor="#0f1e38">
      <p style="margin:0;font-size:11px;color:#7ea8d4;opacity:0.45;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        You're receiving this as a Stellara Pro subscriber.<br/>
        <a href="https://stellara-horoscope.com" style="color:#7ea8d4;text-decoration:none;opacity:0.8;">stellara-horoscope.com</a>
        &nbsp;·&nbsp;
        <a href="https://stellara-horoscope.com/.netlify/functions/unsubscribe?id=${user.id}" style="color:#7ea8d4;text-decoration:none;opacity:0.8;">Unsubscribe</a>
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
      subject: safeSubject,
      html,
    }),
  });
}
