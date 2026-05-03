// ============================================================
// daily-horoscopes-scheduler.js
// Scheduled daily at 8:00 UTC — triggers background generation
// so the cache is ready before users arrive.
// ============================================================

const SITE_URL = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ status: 'daily-horoscopes-scheduler alive' }) };
  }

  console.log('[daily-horoscopes-scheduler] Triggering background horoscope generation');

  try {
    const res = await fetch(
      `${SITE_URL}/.netlify/functions/daily-horoscopes-background`,
      { method: 'POST', signal: AbortSignal.timeout(25000) }
    );
    // Background functions return 202 immediately — treat 200 or 202 as success
    const ok = res.status === 202 || res.ok;
    console.log(`[daily-horoscopes-scheduler] Background function ${ok ? 'triggered' : 'failed'} (status ${res.status})`);
    return { statusCode: 200, body: JSON.stringify({ ok }) };
  } catch (err) {
    console.error('[daily-horoscopes-scheduler] Error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
