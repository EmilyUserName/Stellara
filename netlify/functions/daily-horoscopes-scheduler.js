// ============================================================
// daily-horoscopes-scheduler.js
// Scheduled daily at 8:00 UTC — warms the daily_horoscopes
// cache before users visit the site.
// ============================================================

const SITE_URL = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ status: 'daily-horoscopes-scheduler alive' }) };
  }

  console.log('[daily-horoscopes-scheduler] Warming horoscope cache');

  try {
    const res = await fetch(`${SITE_URL}/.netlify/functions/daily-horoscopes`, {
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    const cached = res.ok && data?.aries;
    console.log(`[daily-horoscopes-scheduler] ${cached ? 'Cache warmed' : 'Generation triggered — may still be running'}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, cached }) };
  } catch (err) {
    console.error('[daily-horoscopes-scheduler] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
