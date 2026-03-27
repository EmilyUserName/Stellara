// ============================================================
// feedback.js — Emails user feedback to the Stellara inbox
// ============================================================
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'Stellara <daily@stellara-horoscope.com>';
const TO_EMAIL       = 'emilyabigaildavidson@gmail.com'; // feedback recipient

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { name, email, text } = JSON.parse(event.body || '{}');
  if (!text) return { statusCode: 400, body: 'text is required' };

  const from = [name, email].filter(Boolean).join(' — ') || 'Anonymous';
  const html = `
    <p style="font-family:sans-serif;font-size:15px;color:#333;">
      <strong>From:</strong> ${from}
    </p>
    <p style="font-family:sans-serif;font-size:15px;color:#333;white-space:pre-wrap;">${text.replace(/</g,'&lt;')}</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      TO_EMAIL,
      subject: `Stellara feedback from ${name || email || 'a user'}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[feedback] Resend error:', err);
    return { statusCode: 500, body: 'Failed to send feedback' };
  }

  console.log('[feedback] Sent from', from);
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
