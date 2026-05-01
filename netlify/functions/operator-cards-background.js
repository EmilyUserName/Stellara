// ============================================================
// operator-cards-background.js — Netlify Background Function
// Runs every morning at 5am ET (9am UTC), before user emails.
//
// Flow:
//   1. Get today's sky positions (astronomy-engine)
//   2. Call Claude once → 12-sign structured card data + astro context
//   3. Launch Puppeteer, render 12 PNG cards (1080x1920)
//   4. Upload each PNG to Supabase Storage (stellara-cards bucket)
//   5. Send operator email to Emily with all 12 cards + captions
// ============================================================

const Astronomy = require('astronomy-engine');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const OPERATOR_EMAIL      = process.env.OPERATOR_EMAIL; // stellara.app.horoscope@gmail.com

const FROM_EMAIL = 'Stellara <noreply@stellara-horoscope.com>';

const SIGNS       = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const SIGN_NAMES  = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
// ︎ forces text (not emoji) rendering for zodiac glyphs
const SIGN_GLYPHS = ['♈︎','♉︎','♊︎','♋︎','♌︎','♍︎','♎︎','♏︎','♐︎','♑︎','♒︎','♓︎'];
const SIGN_DATES  = ['Mar 21 – Apr 19','Apr 20 – May 20','May 21 – Jun 20','Jun 21 – Jul 22','Jul 23 – Aug 22','Aug 23 – Sep 22','Sep 23 – Oct 22','Oct 23 – Nov 21','Nov 22 – Dec 21','Dec 22 – Jan 19','Jan 20 – Feb 18','Feb 19 – Mar 20'];
const SIGN_TAGS   = ['#aries','#taurus','#gemini','#cancer','#leo','#virgo','#libra','#scorpio','#sagittarius','#capricorn','#aquarius','#pisces'];

// Element-based background tints — subtle, cohesive
const SIGN_BG = {
  aries: '#D8E0EC', taurus: '#D4E0DA', gemini: '#D6E4F0', cancer: '#CCE0EE',
  leo: '#D8E0EC', virgo: '#D4E0DA', libra: '#D6E4F0', scorpio: '#CCE0EE',
  sagittarius: '#D8E0EC', capricorn: '#D4E0DA', aquarius: '#D6E4F0', pisces: '#CCE0EE',
};

// ── Sky positions ────────────────────────────────────────────

function getTodaySky() {
  try {
    const time = Astronomy.MakeTime(new Date());
    const SKY_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
    function bodySign(name) {
      try {
        const vec = Astronomy.GeoVector(name, time, true);
        const lon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
        return SKY_SIGNS[Math.floor(lon / 30)];
      } catch { return null; }
    }
    const phases = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
    return {
      sun: bodySign('Sun'), moon: bodySign('Moon'),
      moonPhase: phases[Math.floor(Astronomy.MoonPhase(time) / 45)],
      mercury: bodySign('Mercury'), venus: bodySign('Venus'),
      mars: bodySign('Mars'), jupiter: bodySign('Jupiter'), saturn: bodySign('Saturn'),
    };
  } catch (e) {
    console.error('[operator-cards] sky error:', e.message);
    return null;
  }
}

// ── Claude generation ────────────────────────────────────────

async function generateCardContent(today, sky) {
  const dateLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const skyBlock = sky ? `
TODAY'S ACTUAL SKY — base all readings on these real positions:
Sun: ${sky.sun} | Moon: ${sky.moon} (${sky.moonPhase})
Mercury: ${sky.mercury} | Venus: ${sky.venus} | Mars: ${sky.mars}
Jupiter: ${sky.jupiter} | Saturn: ${sky.saturn}` : '';

  const prompt = `Today is ${dateLabel}.
${skyBlock}

Generate TikTok card content for all 12 zodiac signs, grounded in the real planetary positions above.

For each sign:
- reading: 2–3 evocative sentences, specific to today's sky, no sign name in the text
- watchFor: 4–6 word phrase (energy or situation to be aware of)
- leanInto: 4–6 word phrase (quality or energy to embrace)
- powerMove: 4–6 word phrase (one concrete action or intention)

Also generate:
- astroContext: 2–3 sentences summarising today's key transits for an astrologer choosing which sign to post
- transitNote: 3–6 words for the email subject line (e.g. "Full Moon in Scorpio", "Mercury enters Taurus")

Return ONLY valid JSON, nothing else:
{
  "astroContext": "...",
  "transitNote": "...",
  "signs": {
    "aries":       { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "taurus":      { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "gemini":      { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "cancer":      { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "leo":         { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "virgo":       { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "libra":       { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "scorpio":     { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "sagittarius": { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "capricorn":   { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "aquarius":    { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." },
    "pisces":      { "reading": "...", "watchFor": "...", "leanInto": "...", "powerMove": "..." }
  }
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.map(b => b.text || '').join('') || '';

  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  if (!SIGNS.every(s => json.signs?.[s]?.reading)) {
    throw new Error('Claude response missing signs');
  }
  return json;
}

// ── Card HTML template ───────────────────────────────────────
// Rendered once, DOM updated per sign via page.evaluate()

const CARD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&family=DM+Serif+Display:ital@1&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1080px; height: 1920px;
  background: #D6E4F0;
  position: relative; overflow: hidden;
}
/* Noise texture overlay */
body::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  z-index: 0;
}
/* Watermark glyph */
.watermark {
  position: absolute;
  font-size: 700px;
  color: #0D1E3A;
  opacity: 0.06;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  line-height: 1;
  z-index: 1;
  font-variant-emoji: text;
  user-select: none;
}
/* Borders */
.border-outer {
  position: absolute; inset: 0;
  border: 2.5px solid #0D1E3A;
  z-index: 10; pointer-events: none;
}
.border-inner {
  position: absolute; inset: 18px;
  border: 2px solid #0D1E3A;
  z-index: 10; pointer-events: none;
}
/* Corner dots */
.dot {
  position: absolute;
  width: 8px; height: 8px;
  background: #0D1E3A;
  border-radius: 50%;
  z-index: 11;
}
/* Content */
.content {
  position: relative; z-index: 5;
  padding: 52px 64px 220px;
  height: 100%;
  display: flex; flex-direction: column;
}
.header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.brand {
  font-family: 'Barlow', sans-serif;
  font-weight: 600; font-size: 34px;
  color: #0D1E3A; letter-spacing: 0.45em;
  text-transform: uppercase;
}
.header-date {
  font-family: 'Barlow', sans-serif;
  font-weight: 400; font-size: 30px;
  color: rgba(13,30,58,0.4);
}
.header-rule {
  height: 2px; background: #0D1E3A;
  margin-bottom: 28px;
}
.sign-glyph {
  font-size: 130px; line-height: 1;
  color: #0D1E3A;
  margin-bottom: 4px;
  font-variant-emoji: text;
}
.sign-name {
  font-family: 'Barlow', sans-serif;
  font-weight: 800; font-size: 100px;
  color: #0D1E3A; text-transform: uppercase;
  line-height: 1; letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.sign-dates {
  font-family: 'Barlow', sans-serif;
  font-weight: 400; font-size: 30px;
  color: rgba(13,30,58,0.5);
  margin-bottom: 20px;
}
.rule-gold {
  height: 1.5px; background: #C8A96E;
  margin-bottom: 22px;
}
.reading {
  font-family: 'DM Serif Display', Georgia, serif;
  font-style: italic; font-size: 54px;
  color: #0D1E3A; line-height: 1.38;
  flex: 1;
}
.rule-silver {
  height: 1px; background: rgba(13,30,58,0.2);
  margin-top: 24px; margin-bottom: 22px;
}
.meta-row {
  display: flex; align-items: baseline;
  gap: 18px; margin-bottom: 20px;
}
.meta-label {
  font-family: 'Barlow', sans-serif;
  font-weight: 700; font-size: 20px;
  color: #C8A96E; letter-spacing: 0.4em;
  text-transform: uppercase;
  flex-shrink: 0; min-width: 210px;
}
.meta-value {
  font-family: 'Barlow', sans-serif;
  font-weight: 400; font-size: 34px;
  color: rgba(13,30,58,0.7);
}
.footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 20px;
}
.footer-url {
  font-family: 'Barlow', sans-serif;
  font-weight: 600; font-size: 24px;
  color: rgba(13,30,58,0.4); letter-spacing: 0.04em;
}
.footer-mark { font-size: 24px; color: #C8A96E; }
</style>
</head>
<body id="card-body">
  <div id="watermark" class="watermark"></div>
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="dot" style="top:14px;left:14px;"></div>
  <div class="dot" style="top:14px;right:14px;"></div>
  <div class="dot" style="bottom:14px;left:14px;"></div>
  <div class="dot" style="bottom:14px;right:14px;"></div>
  <div class="content">
    <div class="header">
      <span class="brand">STELLARA</span>
      <span id="header-date" class="header-date"></span>
    </div>
    <div class="header-rule"></div>
    <div id="sign-glyph" class="sign-glyph"></div>
    <div id="sign-name" class="sign-name"></div>
    <div id="sign-dates" class="sign-dates"></div>
    <div class="rule-gold"></div>
    <div id="reading" class="reading"></div>
    <div class="rule-silver"></div>
    <div class="meta-row">
      <span class="meta-label">WATCH FOR</span>
      <span id="watch-for" class="meta-value"></span>
    </div>
    <div class="meta-row">
      <span class="meta-label">LEAN INTO</span>
      <span id="lean-into" class="meta-value"></span>
    </div>
    <div class="meta-row">
      <span class="meta-label">POWER MOVE</span>
      <span id="power-move" class="meta-value"></span>
    </div>
    <div class="footer">
      <span class="footer-url">stellara-horoscope.com</span>
      <span class="footer-mark">✦</span>
    </div>
  </div>
</body>
</html>`;

// ── Puppeteer rendering ──────────────────────────────────────

async function renderCards(cardData, dateDisplay) {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');

  const browser = await puppeteer.launch({
    args:            chromium.args,
    defaultViewport: { width: 1080, height: 1920 },
    executablePath:  await chromium.executablePath(),
    headless:        true,
  });

  const page = await browser.newPage();
  await page.setContent(CARD_HTML, { waitUntil: 'networkidle2', timeout: 30000 });

  const pngs = {};

  for (let i = 0; i < SIGNS.length; i++) {
    const sign = SIGNS[i];
    const d    = cardData.signs[sign];

    await page.evaluate((updates) => {
      document.getElementById('card-body').style.backgroundColor = updates.bg;
      document.getElementById('watermark').textContent    = updates.glyph;
      document.getElementById('header-date').textContent  = updates.dateDisplay;
      document.getElementById('sign-glyph').textContent   = updates.glyph;
      document.getElementById('sign-name').textContent    = updates.name;
      document.getElementById('sign-dates').textContent   = updates.dates;
      document.getElementById('reading').textContent      = updates.reading;
      document.getElementById('watch-for').textContent    = updates.watchFor;
      document.getElementById('lean-into').textContent    = updates.leanInto;
      document.getElementById('power-move').textContent   = updates.powerMove;
    }, {
      bg:          SIGN_BG[sign],
      glyph:       SIGN_GLYPHS[i],
      dateDisplay,
      name:        SIGN_NAMES[i],
      dates:       SIGN_DATES[i],
      reading:     d.reading,
      watchFor:    d.watchFor,
      leanInto:    d.leanInto,
      powerMove:   d.powerMove,
    });

    pngs[sign] = await page.screenshot({ type: 'png' });
    console.log(`[operator-cards] rendered ${sign}`);
  }

  await browser.close();
  return pngs;
}

// ── Supabase Storage ─────────────────────────────────────────

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey':        SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({ id: 'stellara-cards', name: 'stellara-cards', public: true }),
  });
  // 400 with "already exists" is fine
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (!body.message?.includes('already exists')) {
      console.warn('[operator-cards] bucket create response:', res.status, body.message);
    }
  }
}

async function uploadCard(sign, today, pngBuffer) {
  const filename = `stellara_${sign}_${today}.png`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/stellara-cards/${filename}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey':        SUPABASE_SERVICE_KEY,
      'Content-Type':  'image/png',
      'x-upsert':      'true',
    },
    body: pngBuffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed for ${sign}: ${res.status} ${err}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/stellara-cards/${filename}`;
}

// ── Operator email ───────────────────────────────────────────

function buildCaption(sign, glyph, reading, tag) {
  const hook = reading.split(/[.!?]/)[0].trim();
  return `${glyph} ${SIGN_NAMES[SIGNS.indexOf(sign)]}, the stars have a message for you today...\n\n${hook}.\n\n✨ Get your full personalized birth chart → stellara-horoscope.com\n\n${tag} #dailyhoroscope #horoscopetok #astrologytok #astrology #zodiac #spiritualtok`;
}

function buildOperatorEmail(today, transitNote, astroContext, signsData, imageUrls) {
  const dayLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const signSections = SIGNS.map((sign, i) => {
    const d       = signsData[sign];
    const caption = buildCaption(sign, SIGN_GLYPHS[i], d.reading, SIGN_TAGS[i]);
    const imgUrl  = imageUrls[sign];

    return `
    <div style="margin-bottom:48px;border-bottom:1px solid #e8edf2;padding-bottom:48px;">
      <h2 style="font-family:sans-serif;font-size:22px;font-weight:700;color:#0D1E3A;margin:0 0 16px;">
        ${SIGN_GLYPHS[i]} ${SIGN_NAMES[i]}
      </h2>
      ${imgUrl ? `<img src="${imgUrl}" alt="${SIGN_NAMES[i]} card" style="width:100%;max-width:400px;display:block;border-radius:6px;margin-bottom:16px;">` : ''}
      <p style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#1a2a3a;line-height:1.6;margin:0 0 16px;">
        ${d.reading}
      </p>
      <div style="background:#f7f9fb;border:1px solid #dde4ec;border-radius:8px;padding:16px;font-family:monospace;font-size:13px;color:#2a3a4a;line-height:1.7;white-space:pre-wrap;">${caption}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

  <tr><td style="background:#0D1E3A;padding:28px 32px;text-align:center;">
    <div style="font-family:sans-serif;font-size:11px;letter-spacing:0.3em;color:#C8A96E;text-transform:uppercase;margin-bottom:6px;">Stellara ✦</div>
    <div style="font-family:sans-serif;font-size:22px;font-weight:700;color:#f0f4f8;">Your content pack is ready</div>
    <div style="font-family:sans-serif;font-size:13px;color:rgba(240,244,248,0.6);margin-top:6px;">${dayLabel}</div>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <div style="background:#fdfaf3;border:1px solid #e8d9b0;border-radius:8px;padding:18px 20px;margin-bottom:32px;">
      <div style="font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.2em;color:#C8A96E;text-transform:uppercase;margin-bottom:8px;">Today's sky</div>
      <p style="font-family:Georgia,serif;font-size:14px;color:#2a3a1a;line-height:1.65;margin:0;">${astroContext}</p>
    </div>
    ${signSections}
  </td></tr>

  <tr><td style="background:#f7f9fb;padding:20px 32px;text-align:center;border-top:1px solid #e8edf2;">
    <p style="font-family:sans-serif;font-size:11px;color:#8fa8c8;margin:0;">Stellara Content Pipeline · stellara-horoscope.com</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  return { html, subject: `✦ Your Stellara content pack — ${dayLabel} — ${transitNote}` };
}

async function sendOperatorEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [OPERATOR_EMAIL], subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Entry point ──────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ status: 'operator-cards background function alive' }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateDisplay = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  try {
    console.log(`[operator-cards] Starting — ${today}`);

    // 1. Sky + Claude
    const sky     = getTodaySky();
    const content = await generateCardContent(today, sky);
    console.log(`[operator-cards] Claude done — transitNote: ${content.transitNote}`);

    // 2. Render PNGs
    const pngs = await renderCards(content, dateDisplay);
    console.log('[operator-cards] All 12 cards rendered');

    // 3. Upload to Supabase Storage
    await ensureBucket();
    const imageUrls = {};
    for (const sign of SIGNS) {
      imageUrls[sign] = await uploadCard(sign, today, pngs[sign]);
    }
    console.log('[operator-cards] All 12 cards uploaded');

    // 4. Send operator email
    const { html, subject } = buildOperatorEmail(today, content.transitNote, content.astroContext, content.signs, imageUrls);
    const result = await sendOperatorEmail(subject, html);
    console.log(`[operator-cards] Email sent — id: ${result.id}`);

    return { statusCode: 200, body: JSON.stringify({ ok: true, today, emailId: result.id }) };
  } catch (err) {
    console.error('[operator-cards] Fatal error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
