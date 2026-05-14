// ============================================================
// daily-email.js — Scheduled function: runs every morning at 10am UTC
// Sends personalized readings to Pro subscribers and active trial users.
// Also sends "trial ended" emails on day 8.
// ============================================================

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const SITE_URL            = 'https://stellara-horoscope.com';

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
    const todayISO = now.toISOString().slice(0, 10);

    // Diagnostic GET
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
    const postBody = JSON.parse(event.body || '{}');
    if (event.httpMethod === 'POST' && (postBody.testEmail || postBody.testEmails)) {
      const emails   = postBody.testEmails || [postBody.testEmail];
      const skyToday = await getTodaySky();
      const results  = await Promise.allSettled(emails.map(async (testEmail) => {
        const res  = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(testEmail)}&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out,trial_start,reading_depth,reading_tone,reading_length`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        const data = await res.json();
        if (!Array.isArray(data)) return { email: testEmail, error: JSON.stringify(data) };
        const [user] = data;
        if (!user) return { email: testEmail, error: 'no profile found' };
        const trialDay = user.trial_start ? daysSince(user.trial_start) : 0;
        await sendDailyEmail(user, today, todayISO, skyToday, /* skipIdempotency */ true, trialDay);
        return { email: testEmail, sent: true };
      }));
      return { statusCode: 200, body: JSON.stringify(results.map(r => r.value ?? { error: r.reason?.message })) };
    }

    // Scheduled run
    const skyToday = await getTodaySky();

    const [proSubscribers, trialUsers, trialEndedUsers] = await Promise.all([
      getProSubscribers(todayISO),
      getTrialUsers(todayISO),
      getTrialEndedUsers(todayISO),
    ]);

    console.log(`[daily-email] Pro: ${proSubscribers.length}, Trial active: ${trialUsers.length}, Trial ended: ${trialEndedUsers.length} (sky: Moon in ${skyToday.moon})`);

    // Send daily readings to Pro subscribers and active trial users
    const readingUsers = [
      ...proSubscribers.map(u => ({ ...u, _trialDay: 0 })),
      ...trialUsers.map(u => ({ ...u, _trialDay: daysSince(u.trial_start) })),
    ];

    const readingResults = await Promise.allSettled(
      readingUsers.map(u => sendDailyEmail(u, today, todayISO, skyToday, false, u._trialDay))
    );

    readingResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[daily-email] FAILED for ${readingUsers[i].email} (${readingUsers[i].name}): ${r.reason?.message || r.reason}`);
      }
    });

    // Send "trial ended" emails
    const endedResults = await Promise.allSettled(
      trialEndedUsers.map(u => sendTrialEndedEmail(u, todayISO))
    );

    endedResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[daily-email] Trial-ended FAILED for ${trialEndedUsers[i].email}: ${r.reason?.message || r.reason}`);
      }
    });

    const sent    = readingResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const skipped = readingResults.filter(r => r.status === 'fulfilled' && r.value !== true).length;
    const failed  = readingResults.filter(r => r.status === 'rejected').length;
    const ended   = endedResults.filter(r => r.status === 'fulfilled' && r.value === true).length;

    console.log(`[daily-email] Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}, Trial-ended: ${ended}`);
    return { statusCode: 200, body: JSON.stringify({ sent, failed, ended }) };

  } catch (err) {
    console.error('[daily-email] Fatal error:', err);
    return { statusCode: 500, body: err.message };
  }
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function daysSince(dateStr) {
  const start = new Date(dateStr + 'T00:00:00Z');
  const now   = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.round((now - start) / 86400000);
}

function offsetDate(todayISO, days) {
  const d = new Date(todayISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getTodaySky() {
  try {
    const res = await fetch(`${process.env.URL}/.netlify/functions/get-sky`);
    if (!res.ok) return {};
    return await res.json();
  } catch (_) { return {}; }
}

// ------------------------------------------------------------
// FETCH USERS
// ------------------------------------------------------------

async function getProSubscribers(todayISO) {
  console.log('[daily-email] SUPABASE_URL set:', !!SUPABASE_URL);
  console.log('[daily-email] SUPABASE_SERVICE_KEY set:', !!SUPABASE_SERVICE_KEY);
  const url = `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.true&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,rising_sign,preferred_style,email_opt_out,last_email_date,reading_depth,reading_tone,reading_length`;
  console.log('[daily-email] fetching pro subscribers:', url);
  const res  = await fetch(url, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  console.log('[daily-email] Supabase status:', res.status);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(u =>
    u.email && !u.email_opt_out && u.name && u.birth_date && u.birth_city &&
    u.last_email_date !== todayISO
  );
}

async function getTrialUsers(todayISO) {
  const sevenDaysAgo = offsetDate(todayISO, -7);
  const url = `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.false&trial_start=gte.${sevenDaysAgo}&trial_start=lt.${todayISO}&select=id,name,email,birth_date,birth_time,birth_city,sun_sign,moon_sign,preferred_style,email_opt_out,last_email_date,trial_start,reading_depth,reading_tone,reading_length`;
  const res  = await fetch(url, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(u =>
    u.email && !u.email_opt_out && u.name && u.birth_date && u.birth_city &&
    u.last_email_date !== todayISO
  );
}

async function getTrialEndedUsers(todayISO) {
  const eightDaysAgo = offsetDate(todayISO, -8);
  const url = `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.false&trial_start=eq.${eightDaysAgo}&select=id,name,email,last_email_date,trial_start`;
  const res  = await fetch(url, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(u =>
    u.email && u.last_email_date !== todayISO
  );
}

// ------------------------------------------------------------
// GENERATE + SEND DAILY READING
// ------------------------------------------------------------

async function sendDailyEmail(user, today, todayISO, skyToday, skipIdempotency, trialDay = 0) {
  const { name, email, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, preferred_style,
          reading_depth, reading_tone, reading_length } = user;

  if (!skipIdempotency) {
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&or=(last_email_date.is.null,last_email_date.not.eq.${todayISO})`,
      {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({ last_email_date: todayISO }),
      }
    );
    const claimed = await claimRes.json();
    if (!Array.isArray(claimed) || claimed.length === 0) {
      console.log(`[daily-email] Skipping ${email} — already claimed.`);
      return false;
    }
  }

  let sun = sun_sign, moon = moon_sign, rising = null;
  let natalMercury = null, natalVenus = null, natalMars = null;
  let natalJupiter = null, natalSaturn = null, natalMC = null;
  let northNode = null, southNode = null;

  if (!sun || !moon || birth_time) {
    try {
      const chartRes = await fetch(`${process.env.URL}/.netlify/functions/calculate-chart`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ birthDate: birth_date, birthTime: birth_time, birthCity: birth_city }),
      });
      if (chartRes.ok) {
        const chart  = await chartRes.json();
        sun          = sun   || chart.sun;
        moon         = moon  || chart.moon;
        rising       = chart.rising     || null;
        natalMercury = chart.mercury    || null;
        natalVenus   = chart.venus      || null;
        natalMars    = chart.mars       || null;
        natalJupiter = chart.jupiter    || null;
        natalSaturn  = chart.saturn     || null;
        natalMC      = chart.midheaven  || null;
        northNode    = chart.northNode  || null;
        southNode    = chart.southNode  || null;

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

  try {
    const style = preferred_style || 'psychological';
    const natalPlanets = { natalMercury, natalVenus, natalMars, natalJupiter, natalSaturn, natalMC, northNode, southNode };
    const content = await generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style, skyToday, natalPlanets, reading_depth, reading_tone, reading_length });
    await sendEmail({ user, name, email, sun, moon, rising, today, todayISO, skipIdempotency, trialDay, ...content });
    return true;
  } catch (err) {
    console.error(`[daily-email] Error for ${email} — rolling back claim. Reason: ${err.message}`);
    if (!skipIdempotency) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({ last_email_date: null }),
      }).catch(() => {});
    }
    throw err;
  }
}

// ------------------------------------------------------------
// SEND TRIAL ENDED EMAIL (day 8)
// ------------------------------------------------------------

async function sendTrialEndedEmail(user, todayISO) {
  const { id, name, email } = user;

  // Atomic claim
  const claimRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&or=(last_email_date.is.null,last_email_date.not.eq.${todayISO})`,
    {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({ last_email_date: todayISO }),
    }
  );
  const claimed = await claimRes.json();
  if (!Array.isArray(claimed) || claimed.length === 0) return false;

  const subject = `Your Stellara trial has ended, ${name}`;
  const checkoutUrl = `${SITE_URL}/api/create-trial-checkout?email=${encodeURIComponent(email)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>${subject}</title>
  <style>:root { color-scheme: dark; } body, table, td { background-color: #0e1e40 !important; }</style>
</head>
<body style="margin:0;padding:0;background:#0e1e40;" bgcolor="#0e1e40">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1e40;padding:48px 20px;" bgcolor="#0e1e40">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0e1e40">
      <div style="font-size:28px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
      <div style="font-size:38px;font-weight:800;color:#f8faff;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:8px;line-height:1;">stellara</div>
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;">Your Personal Cosmos</div>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">${name},</p>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Your 7-day trial has ended. The sky is still moving — your chart still has something to say every morning. It's just waiting for you to continue.</p>
      <p style="margin:0;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Keep your personalized morning reading coming — $12/month, cancel anytime.</p>
    </td></tr>

    <tr><td style="text-align:center;padding-bottom:32px;" bgcolor="#0e1e40">
      <a href="${checkoutUrl}" style="display:inline-block;padding:16px 44px;background:linear-gradient(135deg,rgba(200,169,110,0.25),rgba(180,149,90,0.15));border:1px solid rgba(200,169,110,0.7);border-radius:10px;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.16em;text-decoration:none;text-transform:uppercase;font-weight:600;">
        ✦ &nbsp;Continue for $12/month
      </a>
    </td></tr>

    <tr><td style="text-align:center;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/.netlify/functions/unsubscribe?id=${id}" style="color:#8fa8c8;text-decoration:none;">Unsubscribe</a>
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
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_email_date: null }),
    }).catch(() => {});
    throw new Error(`Resend error ${sendRes.status}: ${errText}`);
  }

  fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ last_email_date: todayISO }),
  }).catch(() => {});

  return true;
}

// ------------------------------------------------------------
// WHOLE SIGN HOUSE CALCULATION
// ------------------------------------------------------------

const TRANSIT_SIGN_NAMES = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                             'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

const HOUSE_KEYWORDS = {
   1: 'self, identity, body, new beginnings',
   2: 'money, possessions, values, self-worth',
   3: 'communication, learning, local life, siblings',
   4: 'home, roots, family, private self',
   5: 'creativity, romance, play, joy',
   6: 'health, daily work, routines, service',
   7: 'partnerships, one-on-one relationships, contracts',
   8: 'transformation, shared resources, depth, intimacy',
   9: 'beliefs, travel, higher learning, expansion',
  10: 'career, public life, reputation, legacy',
  11: 'community, friendships, hopes, collective causes',
  12: 'solitude, hidden matters, spirituality, the unconscious',
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function planetHouse(transitSign, risingSign) {
  const t = TRANSIT_SIGN_NAMES.indexOf(transitSign);
  const r = TRANSIT_SIGN_NAMES.indexOf(risingSign);
  if (t === -1 || r === -1) return null;
  return ((t - r + 12) % 12) + 1;
}

function buildHouseBlock(skyToday, rising) {
  if (!rising || !skyToday) return null;
  const planets = [
    { name: 'Sun',     sign: skyToday.sun },
    { name: 'Moon',    sign: skyToday.moon },
    { name: 'Mercury', sign: skyToday.mercury },
    { name: 'Venus',   sign: skyToday.venus },
    { name: 'Mars',    sign: skyToday.mars },
    { name: 'Jupiter', sign: skyToday.jupiter },
    { name: 'Saturn',  sign: skyToday.saturn },
    { name: 'Neptune', sign: skyToday.neptune },
    { name: 'Pluto',   sign: skyToday.pluto },
  ];
  const lines = planets
    .filter(p => p.sign)
    .map(p => {
      const h = planetHouse(p.sign, rising);
      return h ? `${p.name}: ${p.sign} → ${ordinal(h)} house (${HOUSE_KEYWORDS[h]})` : null;
    })
    .filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

// ------------------------------------------------------------
// CLAUDE — generate the morning digest
// ------------------------------------------------------------

function sliderInstructions(depth = 50, tone = 50, length = 50) {
  const parts = [];
  if (depth < 35)       parts.push('Write at a beginner-friendly level — plain language, no jargon, explain astrological concepts simply.');
  else if (depth > 65)  parts.push('Write at an advanced level — use precise astrological terminology, house placements, aspects, and technical depth.');
  if (tone < 35)        parts.push('Be especially warm, nurturing, and gentle in tone — hold the reader with care.');
  else if (tone > 65)   parts.push('Be direct and unfiltered — honest, confident, no softening.');
  if (length < 35)      parts.push('Keep each section brief — 1 tight sentence max.');
  else if (length > 65) parts.push('Go deep and thorough — give the full picture, do not cut ideas short.');
  return parts.length ? '\n\nReading style adjustments: ' + parts.join(' ') : '';
}

async function generateReading({ name, sun, moon, rising, birth_city, birth_time, today, style, skyToday, natalPlanets = {}, reading_depth = 50, reading_tone = 50, reading_length = 50 }) {
  const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.psychological;
  const { natalMercury, natalVenus, natalMars, natalJupiter, natalSaturn, natalMC, northNode, southNode } = natalPlanets;

  const lunaLine = skyToday?.newMoonSign
    ? `Lunar phase: ${skyToday.moonPhase || 'unknown'} — this lunation's new moon was exact in ${skyToday.newMoonSign}${skyToday.newMoonDate ? ' on ' + skyToday.newMoonDate : ''}`
    : `Lunar phase: ${skyToday?.moonPhase || 'unknown'}`;

  const skyLines = skyToday && skyToday.moon ? `Sun: ${skyToday.sun || 'unknown'}
Moon: ${skyToday.moon} (current transit)
${lunaLine}
Mercury: ${skyToday.mercury || 'unknown'}
Venus: ${skyToday.venus || 'unknown'}
Mars: ${skyToday.mars || 'unknown'}
Jupiter: ${skyToday.jupiter || 'unknown'}
Saturn: ${skyToday.saturn || 'unknown'}
Neptune: ${skyToday.neptune || 'unknown'}
Pluto: ${skyToday.pluto || 'unknown'}
(These are real calculated positions — use them exactly. Do not contradict or invent different placements.)`
    : `(Sky data unavailable — speak to general planetary themes without naming specific positions.)`;

  const prompt = `${systemPrompt}

You are writing ${name}'s morning Stellara digest for ${today}.

${name}'s natal chart (birth placements — fixed, not today's sky):
Sun: ${sun}
Moon: ${moon}
${rising ? `Rising (Ascendant): ${rising}` : 'Rising: unknown'}
${natalMC       ? `Midheaven (MC): ${natalMC}` : ''}
${northNode     ? `North Node: ${northNode}` : ''}
${southNode     ? `South Node: ${southNode}` : ''}
${natalMercury  ? `Mercury: ${natalMercury}` : ''}
${natalVenus    ? `Venus: ${natalVenus}` : ''}
${natalMars     ? `Mars: ${natalMars}` : ''}
${natalJupiter  ? `Jupiter: ${natalJupiter}` : ''}
${natalSaturn   ? `Saturn: ${natalSaturn}` : ''}
Birth city: ${birth_city}

TODAY'S ACTUAL SKY:
${skyLines}
${rising && buildHouseBlock(skyToday, rising) ? `
TODAY'S TRANSITS BY HOUSE (Whole Sign, ${rising} Rising):
${buildHouseBlock(skyToday, rising)}
Use these house placements to ground the reading in ${name}'s specific life areas — weave them in naturally, don't list them mechanically.` : ''}

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

  const finalPrompt = prompt + sliderInstructions(reading_depth, reading_tone, reading_length);

  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

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
      messages:   [{ role: 'user', content: finalPrompt }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[daily-email] Claude API error:', res.status, JSON.stringify(data));
    throw new Error(`Claude API error ${res.status}: ${data?.error?.message || 'unknown'}`);
  }

  const full = (data.content?.map(b => b.text || '').join('') || '').trim();
  if (!full) throw new Error('Claude returned empty content');

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
// RESEND — send the morning digest
// ------------------------------------------------------------
async function sendEmail({ user, name, email, sun, moon, rising, today, todayISO, skipIdempotency, trialDay = 0, subject, paragraph, quote, watch, lean, power }) {
  const clean = s => (s || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();

  const safeSubject   = clean(subject)    || `Your Stellara reading for today, ${name} ✦`;
  const safeParagraph = clean(paragraph);
  const safeQuote     = clean(quote);
  const safeWatch     = clean(watch);
  const safeLean      = clean(lean);
  const safePower     = clean(power);

  const checkoutUrl = `${SITE_URL}/api/create-trial-checkout?email=${encodeURIComponent(email)}`;

  // Footer copy varies between Pro subscribers and trial users
  const footerLine = trialDay > 0
    ? `Day ${trialDay} of 7 — your free Stellara trial`
    : `You're receiving this as a Stellara Pro subscriber.`;

  // Conversion block — shown on trial days 6 and 7
  const conversionBlock = trialDay >= 6 ? `
    <tr><td style="padding-top:28px;" bgcolor="#0e1e40">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#102349;border:1px solid rgba(200,169,110,0.3);border-radius:14px;padding:28px 30px;">
        <tr><td style="text-align:center;" bgcolor="#102349">
          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;margin-bottom:12px;">
            ${trialDay === 7 ? 'This is your last trial reading' : 'Your trial ends tomorrow'}
          </div>
          <p style="margin:0 0 20px;font-size:15px;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;line-height:1.7;">Keep your personalized morning reading — $12/month, cancel anytime.</p>
          <a href="${checkoutUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,rgba(200,169,110,0.25),rgba(180,149,90,0.15));border:1px solid rgba(200,169,110,0.7);border-radius:10px;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;font-weight:600;">
            ✦ &nbsp;Continue for $12/month
          </a>
        </td></tr>
      </table>
    </td></tr>` : '';

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
    body, table, td { background-color: #0e1e40 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#0e1e40;" bgcolor="#0e1e40">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1e40;padding:48px 20px;" bgcolor="#0e1e40">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0e1e40">
      <div style="font-size:28px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
      <div style="font-size:38px;font-weight:800;color:#f8faff;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:8px;line-height:1;">stellara</div>
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;">Your Personal Cosmos</div>
    </td></tr>

    <tr><td style="text-align:center;padding-bottom:28px;" bgcolor="#0e1e40">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;margin-bottom:10px;">${today}</div>
      <div style="font-size:12px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.06em;">
        ${sun} Sun &nbsp;·&nbsp; ${moon} Moon${rising ? ` &nbsp;·&nbsp; ${rising} Rising` : ''}
      </div>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;text-align:left;">${safeParagraph}</p>
    </td></tr>

    <tr><td style="padding:28px 24px;background:#102349;border-left:3px solid #c8a96e;border-radius:0 10px 10px 0;margin-bottom:32px;" bgcolor="#102349">
      <p style="margin:0;font-size:16px;line-height:1.7;color:#c8a96e;font-family:Georgia,'Times New Roman',serif;font-style:italic;text-align:center;">&ldquo;${safeQuote}&rdquo;</p>
    </td></tr>

    <tr><td style="padding-bottom:28px;" bgcolor="#0e1e40"></td></tr>

    <tr><td style="background:#102349;border:1px solid rgba(90,107,140,0.15);border-radius:14px;padding:28px 30px;" bgcolor="#102349">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:18px;">
          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Watch for</div>
          <div style="font-size:15px;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">${safeWatch}</div>
        </td></tr>
        <tr><td style="padding-bottom:18px;border-top:1px solid rgba(90,107,140,0.1);padding-top:18px;">
          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Lean into</div>
          <div style="font-size:18px;color:#f5f8ff;font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:0.02em;">${safeLean}</div>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(90,107,140,0.1);padding-top:18px;">
          <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;margin-bottom:6px;">Your power move today</div>
          <div style="font-size:15px;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;line-height:1.6;">${safePower}</div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="text-align:center;padding-top:36px;" bgcolor="#0e1e40">
      <a href="${SITE_URL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,rgba(143,168,200,0.22),rgba(90,130,180,0.12));border:1px solid rgba(143,168,200,0.58);border-radius:10px;color:#edf1fb;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        → Open Stellara for your full reading
      </a>
    </td></tr>

    <tr><td style="text-align:center;padding-top:20px;" bgcolor="#0e1e40">
      <a href="${SITE_URL}" style="display:inline-block;padding:11px 28px;background:transparent;border:1px solid rgba(200,169,110,0.35);border-radius:10px;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        ✦ Share Stellara with a Friend
      </a>
    </td></tr>

    ${conversionBlock}

    <tr><td style="text-align:center;padding-top:36px;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        ${footerLine}<br/>
        <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/.netlify/functions/unsubscribe?id=${user.id}" style="color:#8fa8c8;text-decoration:none;">Unsubscribe</a>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject: safeSubject, html }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    throw new Error(`Resend error ${sendRes.status}: ${errText}`);
  }

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
    }).catch(err => console.error('[daily-email] Failed to stamp last_email_date:', err));
  }
}
