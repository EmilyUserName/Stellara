// ============================================================
// daily-horoscopes.js
// Fast sync function — reads from Supabase cache only.
// On cache miss, fires daily-horoscopes-background to generate,
// and returns 503 so the frontend knows to retry in a few seconds.
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL             = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const today = new Date().toISOString().slice(0, 10);

  try {
    const cached = await getCached(today);
    if (cached) {
      return { statusCode: 200, headers, body: JSON.stringify(cached) };
    }

    // Not cached yet — trigger background generation (fire and forget)
    fetch(`${SITE_URL}/.netlify/functions/daily-horoscopes-background`, { method: 'POST' })
      .catch(e => console.error('[daily-horoscopes] bg trigger error:', e.message));

    console.log('[daily-horoscopes] Cache miss — background generation triggered');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ status: 'generating' }),
    };
  } catch (err) {
    console.error('[daily-horoscopes] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

async function getCached(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/daily_horoscopes?date=eq.${date}&select=*`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
