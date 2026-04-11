// ============================================================
// weekly-spread-scheduler.js
// Scheduled every Monday 7am UTC — pre-generates weekly spread
// content for all active Pro subscribers.
//
// Generates Mon through the following Wednesday (10 days) so
// that users viewing the spread on Friday/Sat/Sun always have
// their ±3 lookahead pre-cached.
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL             = process.env.URL || 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  // Only run scheduled invocations (POST from Netlify) or GET for diagnostics
  if (event.httpMethod === 'GET') {
    const subs = await getSubscribers();
    return {
      statusCode: 200,
      body: JSON.stringify({ subscriberCount: subs.length }),
    };
  }

  try {
    // Calculate the 10-day window: this Monday through following Wednesday
    const now    = new Date();
    const monday = getMondayOf(now);
    const dates  = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const subscribers = await getSubscribers();
    console.log(`[weekly-spread-scheduler] Generating for ${subscribers.length} subscribers, dates: ${dates[0]} → ${dates[dates.length - 1]}`);

    const results = await Promise.allSettled(
      subscribers.map(user => generateForUser(user.id, dates))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed    = results.filter(r => r.status === 'rejected').length;
    console.log(`[weekly-spread-scheduler] Done: ${succeeded} succeeded, ${failed} failed`);

    return { statusCode: 200, body: JSON.stringify({ succeeded, failed, dates }) };
  } catch (err) {
    console.error('[weekly-spread-scheduler] Fatal:', err);
    return { statusCode: 500, body: err.message };
  }
};

// ── Fetch all Pro subscribers with birth data ────────────────
async function getSubscribers() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?subscribed=eq.true&select=id,name,birth_date`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const data = await res.json();
  return (Array.isArray(data) ? data : []).filter(u => u.name && u.birth_date);
}

// ── Call generate-weekly-spread for one user ─────────────────
async function generateForUser(userId, dates) {
  const res = await fetch(`${SITE_URL}/.netlify/functions/generate-weekly-spread-background`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-service-key': SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({ userId, dates }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Generation failed for ${userId}: ${res.status} ${body}`);
  }
  return res.json();
}

// ── Get the Monday of the week containing a given date ───────
function getMondayOf(date) {
  const d   = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = (day === 0) ? -6 : 1 - day; // go back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}
