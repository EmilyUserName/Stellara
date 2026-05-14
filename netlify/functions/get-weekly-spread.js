// ============================================================
// get-weekly-spread.js
// Client-facing endpoint — returns 7-day spread for the
// authenticated user (today ± 3 days).
//
// If data is missing, triggers background generation and
// returns { pending: true } so the client can retry.
//
// GET /.netlify/functions/get-weekly-spread
// Authorization: Bearer <supabase-jwt>
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL             = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    // ── 1. Authenticate user via Supabase JWT ───────────────
    const jwt = (event.headers.authorization || '').replace('Bearer ', '').trim();
    if (!jwt) return { statusCode: 401, body: 'Missing token' };

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey:        SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${jwt}`,
      },
    });
    if (!authRes.ok) return { statusCode: 401, body: 'Invalid or expired token' };

    const authUser = await authRes.json();
    const userId   = authUser?.id;
    if (!userId) return { statusCode: 401, body: 'Could not identify user' };

    // ── 2. Check Pro subscription ───────────────────────────
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=subscribed,trial_start,pro_expires_at,name,birth_date`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const profiles = await profileRes.json();
    const profile  = Array.isArray(profiles) ? profiles[0] : null;

    const todayISO        = new Date().toISOString().slice(0, 10);
    const hasActiveTrial  = profile?.trial_start && Math.floor((new Date() - new Date(profile.trial_start + 'T00:00:00Z')) / 86400000) < 7;
    const hasEtsyAccess   = profile?.pro_expires_at && profile.pro_expires_at >= todayISO;
    const hasAccess       = profile?.subscribed || hasActiveTrial || hasEtsyAccess;

    if (!hasAccess) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Pro subscription required' }) };
    }
    if (!profile?.birth_date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Birth details required' }) };
    }

    // ── 3. Calculate today ± 3 dates ────────────────────────
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // ── 4. Fetch existing rows (use `in` filter — reliable) ──
    const dateList  = dates.join(',');
    const spreadRes = await fetch(
      `${SUPABASE_URL}/rest/v1/weekly_spreads?user_id=eq.${userId}&day_date=in.(${dateList})&select=day_date,planet,glyph,energy,summary,topics&order=day_date.asc`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const existing      = spreadRes.ok ? await spreadRes.json() : [];
    const existingDates = new Set(
      (Array.isArray(existing) ? existing : []).map(r => r.day_date)
    );

    // ── 5. If any dates missing, trigger generation async ────
    // Only fire generation on the FIRST request (?generate=true).
    // Subsequent polls just check for completion without re-triggering.
    const missingDates = dates.filter(d => !existingDates.has(d));
    if (missingDates.length > 0) {
      const shouldGenerate = event.queryStringParameters?.generate === 'true';
      if (shouldGenerate) {
        // Fire-and-forget to background function — returns immediately, runs up to 15 min
        fetch(`${SITE_URL}/.netlify/functions/generate-weekly-spread-background`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'x-service-key': SUPABASE_SERVICE_KEY,
          },
          body: JSON.stringify({ userId, dates: missingDates }),
        }).catch(err => console.error('[get-weekly-spread] Generation trigger error:', err));
        console.log('[get-weekly-spread] Generation triggered for', missingDates.length, 'dates');
      } else {
        console.log('[get-weekly-spread] Waiting for generation, missing', missingDates.length, 'dates');
      }

      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending: true, message: 'Generating your weekly spread…' }),
      };
    }

    // ── 6. Return the full 7-day payload ─────────────────────
    return buildResponse(dates, Array.isArray(existing) ? existing : []);

  } catch (err) {
    console.error('[get-weekly-spread] Unhandled error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function buildResponse(dates, rows) {
  const byDate   = {};
  rows.forEach(r => { byDate[r.day_date] = r; });

  const todayISO = new Date().toISOString().slice(0, 10);

  const payload = dates.map(d => {
    const row = byDate[d] || {};
    const dt  = new Date(d + 'T12:00:00Z');
    return {
      date:      d,
      dayShort:  dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dayFull:   dt.toLocaleDateString('en-US', { weekday: 'long' }),
      dateLabel: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday:   d === todayISO,
      isPast:    d < todayISO,
      planet:    row.planet  || null,
      glyph:     row.glyph   || '✦',
      energy:    row.energy  || 'mid',
      summary:   row.summary || '',
      topics:    Array.isArray(row.topics) ? row.topics : [],
    };
  });

  return {
    statusCode: 200,
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify(payload),
  };
}
