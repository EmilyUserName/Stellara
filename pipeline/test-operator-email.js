#!/usr/bin/env node
// ============================================================
// test-operator-email.js
// Sends a real operator email preview using live Claude content,
// but without rendering card images (placeholder shown instead).
// Run: node pipeline/test-operator-email.js
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const OPERATOR_EMAIL    = process.env.OPERATOR_EMAIL || process.env.SUMMARY_EMAIL;

if (!ANTHROPIC_API_KEY || !RESEND_API_KEY || !OPERATOR_EMAIL) {
  console.error('Missing env vars. Run with:');
  console.error('  ANTHROPIC_API_KEY=... RESEND_API_KEY=... OPERATOR_EMAIL=stellara.app.horoscope@gmail.com node pipeline/test-operator-email.js');
  process.exit(1);
}

const SIGNS      = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const SIGN_NAMES = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const SIGN_GLYPHS= ['♈︎','♉︎','♊︎','♋︎','♌︎','♍︎','♎︎','♏︎','♐︎','♑︎','♒︎','♓︎'];
const SIGN_TAGS  = ['#aries','#taurus','#gemini','#cancer','#leo','#virgo','#libra','#scorpio','#sagittarius','#capricorn','#aquarius','#pisces'];

async function generateContent(today) {
  const dateLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const prompt = `Today is ${dateLabel}.

Generate TikTok card content for all 12 zodiac signs.

For each sign:
- reading: 2–3 evocative sentences grounded in today's planetary energy, no sign name in the text
- watchFor: 4–6 word phrase (energy or situation to be aware of)
- leanInto: 4–6 word phrase (quality or energy to embrace)
- powerMove: 4–6 word phrase (one concrete action or intention)

Also generate:
- astroContext: 2–3 sentences summarising today's key transits for an astrologer choosing which sign to post
- transitNote: 3–6 words for the email subject line (e.g. "Full Moon in Scorpio")

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

  console.log('Calling Claude...');
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

  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.map(b => b.text || '').join('') || '';
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
}

function buildCaption(sign, glyph, reading, tag) {
  const hook = reading.split(/[.!?]/)[0].trim();
  return `${glyph} ${SIGN_NAMES[SIGNS.indexOf(sign)]}, the stars have a message for you today...\n\n${hook}.\n\n✨ Get your full personalized birth chart → stellara-horoscope.com\n\n${tag} #dailyhoroscope #horoscopetok #astrologytok #astrology #zodiac #spiritualtok`;
}

function buildEmail(today, content) {
  const dayLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const signSections = SIGNS.map((sign, i) => {
    const d       = content.signs[sign];
    const caption = buildCaption(sign, SIGN_GLYPHS[i], d.reading, SIGN_TAGS[i]);

    return `
    <div style="margin-bottom:48px;border-bottom:1px solid #e8edf2;padding-bottom:48px;">
      <h2 style="font-family:sans-serif;font-size:22px;font-weight:700;color:#0D1E3A;margin:0 0 16px;">
        ${SIGN_GLYPHS[i]} ${SIGN_NAMES[i]}
      </h2>
      <div style="width:100%;max-width:400px;height:120px;background:#D6E4F0;border:2px dashed #8fa8c8;border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
        <span style="font-family:sans-serif;font-size:13px;color:#5a7a9a;">📷 1080×1920 card image will appear here</span>
      </div>
      <p style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#1a2a3a;line-height:1.6;margin:0 0 16px;">
        ${d.reading}
      </p>
      <div style="background:#f7f9fb;border:1px solid #dde4ec;border-radius:8px;padding:16px 16px 16px;margin-bottom:12px;">
        <div style="font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.15em;color:#8fa8c8;text-transform:uppercase;margin-bottom:8px;">Watch for · Lean into · Power move</div>
        <div style="font-family:sans-serif;font-size:14px;color:#2a3a4a;line-height:2;">
          <span style="color:#C8A96E;font-weight:600;">WATCH FOR</span> &nbsp;${d.watchFor}<br>
          <span style="color:#C8A96E;font-weight:600;">LEAN INTO</span> &nbsp;${d.leanInto}<br>
          <span style="color:#C8A96E;font-weight:600;">POWER MOVE</span> &nbsp;${d.powerMove}
        </div>
      </div>
      <div style="background:#f7f9fb;border:1px solid #dde4ec;border-radius:8px;padding:16px;font-family:monospace;font-size:13px;color:#2a3a4a;line-height:1.7;white-space:pre-wrap;">${caption}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0D1E3A;padding:28px 32px;text-align:center;">
    <div style="font-family:sans-serif;font-size:11px;letter-spacing:0.3em;color:#C8A96E;text-transform:uppercase;margin-bottom:6px;">Stellara ✦</div>
    <div style="font-family:sans-serif;font-size:22px;font-weight:700;color:#f0f4f8;">Your content pack is ready</div>
    <div style="font-family:sans-serif;font-size:13px;color:rgba(240,244,248,0.6);margin-top:6px;">${dayLabel}</div>
    <div style="font-family:sans-serif;font-size:11px;color:#C8A96E;margin-top:8px;opacity:0.8;">⚠ Preview — card images are placeholders</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <div style="background:#fdfaf3;border:1px solid #e8d9b0;border-radius:8px;padding:18px 20px;margin-bottom:32px;">
      <div style="font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:0.2em;color:#C8A96E;text-transform:uppercase;margin-bottom:8px;">Today's sky</div>
      <p style="font-family:Georgia,serif;font-size:14px;color:#2a3a1a;line-height:1.65;margin:0;">${content.astroContext}</p>
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
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Generating content for ${today}...`);

  const content = await generateContent(today);
  console.log(`Transit note: ${content.transitNote}`);
  console.log('Astro context:', content.astroContext);

  const html    = buildEmail(today, content);
  const dayLabel = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const subject = `✦ [PREVIEW] Your Stellara content pack — ${dayLabel} — ${content.transitNote}`;

  console.log(`Sending preview to ${OPERATOR_EMAIL}...`);
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body:    JSON.stringify({
      from: 'Stellara <noreply@stellara-horoscope.com>',
      to:   [OPERATOR_EMAIL],
      subject, html,
    }),
  });

  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  console.log(`✓ Sent! Email id: ${result.id}`);
  console.log(`Check ${OPERATOR_EMAIL}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
