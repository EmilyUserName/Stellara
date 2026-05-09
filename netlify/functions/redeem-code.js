// ============================================================
// redeem-code.js — Validates an Etsy redemption code and
// grants 30 days of Stellara Pro access. Sends a magic-link
// sign-in email via Resend so the user can access their account.
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const SITE_URL             = 'https://stellara-horoscope.com';
const FROM_EMAIL           = 'Stellara <hello@stellara-horoscope.com>';

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { code, email } = body;
  if (!code?.trim() || !email?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Code and email are required.' }) };
  }

  const codeCleaned = code.trim().toUpperCase();
  const emailLower  = email.toLowerCase().trim();

  // 1. Look up the code
  const codeRes = await fetch(
    `${SUPABASE_URL}/rest/v1/redemption_codes?code=eq.${encodeURIComponent(codeCleaned)}&select=code,product,redeemed_by`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const codes = await codeRes.json();

  if (!Array.isArray(codes) || codes.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'invalid_code', message: "That code wasn't found. Double-check the code from your Etsy order." }) };
  }
  if (codes[0].redeemed_by) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'already_redeemed', message: 'This code has already been redeemed.' }) };
  }

  const product = codes[0].product;

  // 2. Calculate expiry (30 days from today)
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  const proExpiresAt = expiry.toISOString().slice(0, 10);

  // 3. Find or create user
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(emailLower)}&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const profiles = await profileRes.json();

  let userId;

  if (Array.isArray(profiles) && profiles.length > 0) {
    userId = profiles[0].id;
  } else {
    const authRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey:          SUPABASE_SERVICE_KEY,
        Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ email: emailLower, email_confirm: true }),
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.id) {
      console.error('[redeem-code] Auth user creation failed:', JSON.stringify(authData).slice(0, 300));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not create account. Please try again.' }) };
    }
    userId = authData.id;
  }

  // 4. Set pro_expires_at on the profile (upsert handles new + existing users)
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: userId, email: emailLower, pro_expires_at: proExpiresAt }),
  });
  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    console.error('[redeem-code] Profile upsert failed:', upsertRes.status, err.slice(0, 200));
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not activate your access. Please try again.' }) };
  }

  // 5. Mark code as redeemed
  await fetch(`${SUPABASE_URL}/rest/v1/redemption_codes?code=eq.${encodeURIComponent(codeCleaned)}`, {
    method: 'PATCH',
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
    },
    body: JSON.stringify({ redeemed_by: userId, redeemed_at: new Date().toISOString() }),
  });

  // 6. Generate magic link + send access email
  try {
    const linkRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_SERVICE_KEY,
        Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: emailLower, options: { redirect_to: SITE_URL } }),
    });
    const linkData = await linkRes.json();
    const magicLink = linkData.properties?.action_link || SITE_URL;
    await sendAccessEmail({ email: emailLower, magicLink, proExpiresAt, product });
  } catch (err) {
    console.error('[redeem-code] Email send failed:', err.message);
    // Access was granted — don't block on email failure
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, proExpiresAt }),
  };
};

async function sendAccessEmail({ email, magicLink, proExpiresAt, product }) {
  const productLabel   = product === 'solar_return' ? 'Solar Return Reading' : 'Natal Birth Chart Reading';
  const expiryFormatted = new Date(proExpiresAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Your Stellara Pro access is ready</title>
  <style>:root{color-scheme:dark;} body,table,td{background-color:#0e1e40 !important;}</style>
</head>
<body style="margin:0;padding:0;background:#0e1e40;" bgcolor="#0e1e40">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1e40;padding:48px 20px;">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <tr><td style="text-align:center;padding-bottom:36px;">
      <div style="font-size:28px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
      <div style="font-size:38px;font-weight:800;color:#f8faff;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:8px;line-height:1;">stellara</div>
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;">Your Personal Cosmos</div>
    </td></tr>

    <tr><td style="padding-bottom:32px;">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
    </td></tr>

    <tr><td style="padding-bottom:28px;">
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Your 30-day Stellara Pro access is ready — unlocked with your ${productLabel} purchase.</p>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Each morning you'll receive a personalized horoscope written for your exact birth chart — your planets, your rising sign, what's in the sky today. Delivered to your inbox before you start your day.</p>
      <p style="margin:0;font-size:13px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:1.6;">Your Pro access expires on <strong style="color:#c8d8ea;">${expiryFormatted}</strong>. After that, continue for $12/month — or let it lapse, no charge either way.</p>
    </td></tr>

    <tr><td style="padding:28px 24px;background:#102349;border-left:3px solid #c8a96e;border-radius:0 10px 10px 0;margin-bottom:32px;">
      <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;">Each morning you'll receive</p>
      <p style="margin:0;font-size:15px;line-height:1.9;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">
        A personalized reading for your chart &amp; the day's sky<br/>
        An insight written for your exact planetary moment<br/>
        One thing to watch for — and your power move for the day
      </p>
    </td></tr>

    <tr><td style="padding-top:32px;text-align:center;">
      <a href="${magicLink}" style="display:inline-block;padding:15px 40px;background:linear-gradient(135deg,rgba(200,169,110,0.22),rgba(180,149,90,0.12));border:1px solid rgba(200,169,110,0.6);border-radius:12px;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.18em;text-decoration:none;text-transform:uppercase;">
        Open Stellara →
      </a>
      <p style="margin:14px 0 0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:1.8;">This sign-in link expires in 24 hours.<br/>After that, go to stellara-horoscope.com and use <em>Sign in with email</em>.</p>
    </td></tr>

    <tr><td style="text-align:center;padding-top:36px;border-top:1px solid rgba(143,168,200,0.12);margin-top:36px;">
      <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body:    JSON.stringify({ from: FROM_EMAIL, to: email, subject: 'Your Stellara Pro access is ready ✦', html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}
