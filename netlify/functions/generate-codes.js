// ============================================================
// generate-codes.js — Admin endpoint to generate redemption codes
// POST { secret, product, count }
// Protected by ADMIN_SECRET env var (set in Netlify dashboard)
// product: "natal" | "solar_return"
// count: 1–50 (default 1)
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET         = process.env.ADMIN_SECRET;

function generateCode() {
  // Avoids visually ambiguous chars: 0/O, 1/I
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg   = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ETSY-${seg()}-${seg()}`;
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { secret, product, count = 1 } = body;

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!['natal', 'solar_return'].includes(product)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'product must be "natal" or "solar_return"' }) };
  }

  const n     = Math.min(Math.max(parseInt(count) || 1, 1), 50);
  const rows  = Array.from({ length: n }, () => ({
    code:       generateCode(),
    product,
    created_at: new Date().toISOString(),
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/redemption_codes`, {
    method:  'POST',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=representation',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[generate-codes] DB insert failed:', res.status, err.slice(0, 300));
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB insert failed', detail: err.slice(0, 200) }) };
  }

  const inserted = await res.json();
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ codes: inserted.map(r => r.code) }),
  };
};
