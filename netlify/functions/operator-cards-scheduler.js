// ============================================================
// operator-cards-scheduler.js
// Scheduled daily at 9:00 UTC (5am ET) — fires the background
// card renderer one hour before user-facing emails go out.
// ============================================================

const SITE_URL = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ status: 'operator-cards-scheduler alive' }) };
  }

  console.log('[operator-cards-scheduler] Triggering background card generation');

  // Fire-and-forget — background function runs for up to 15 min
  fetch(`${SITE_URL}/.netlify/functions/operator-cards-background`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ triggered: 'scheduler' }),
  }).catch(err => console.error('[operator-cards-scheduler] trigger error:', err.message));

  return { statusCode: 200, body: JSON.stringify({ triggered: true }) };
};
