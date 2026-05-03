// ============================================================
// start-trial.js
// Creates a trial account (no Stripe, no password) and sends
// a welcome email. Called by the /trial signup page.
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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { name, email, birthDate, birthTime, birthCity } = body;

  if (!name?.trim() || !email?.trim() || !birthDate || !birthCity?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name, email, birth date, and birth city are required.' }) };
  }

  const emailLower = email.toLowerCase().trim();
  const today = new Date().toISOString().slice(0, 10);

  // Check if profile already exists
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(emailLower)}&select=id,subscribed,trial_start`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const existing = await existRes.json();

  let userId;

  if (Array.isArray(existing) && existing.length > 0) {
    const profile = existing[0];

    if (profile.subscribed) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'already_subscribed', message: "You're already a Stellara Pro subscriber — sign in to access your account." }) };
    }
    if (profile.trial_start) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'trial_active', message: "Your trial is already running — check your inbox each morning for your readings." }) };
    }

    // Profile exists but no trial yet — start it
    userId = profile.id;
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        trial_start: today,
        name: name.trim(),
        birth_date: birthDate,
        birth_time: birthTime || null,
        birth_city: birthCity.trim(),
      }),
    });
  } else {
    // Create a new Supabase auth user (email_confirm:true skips the confirmation email)
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailLower,
        email_confirm: true,
        user_metadata: { name: name.trim() },
      }),
    });
    const authData = await authRes.json();

    if (!authRes.ok || !authData.id) {
      console.error('[start-trial] Auth user creation failed:', JSON.stringify(authData).slice(0, 300));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not create account. Please try again.' }) };
    }
    userId = authData.id;

    // Insert profile row
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        email: emailLower,
        name: name.trim(),
        birth_date: birthDate,
        birth_time: birthTime || null,
        birth_city: birthCity.trim(),
        trial_start: today,
        subscribed: false,
      }),
    });

    if (!profileRes.ok) {
      const err = await profileRes.text();
      console.error('[start-trial] Profile insert failed:', profileRes.status, err.slice(0, 200));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not save your details. Please try again.' }) };
    }
  }

  // Send welcome email
  try {
    await sendWelcomeEmail({ name: name.trim(), email: emailLower, userId });
  } catch (err) {
    console.error('[start-trial] Welcome email failed:', err.message);
    // Don't block — account was created successfully
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};

async function sendWelcomeEmail({ name, email, userId }) {
  const subject = `Welcome to Stellara, ${name} — your first reading arrives tomorrow ✦`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="dark"/>
  <title>${subject}</title>
  <style>:root { color-scheme: dark; } body, table, td { background-color: #0e1e40 !important; }</style>
</head>
<body style="margin:0;padding:0;background:#0e1e40;" bgcolor="#0e1e40">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1e40;padding:48px 20px;" bgcolor="#0e1e40">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

    <tr><td style="text-align:center;padding-bottom:36px;" bgcolor="#0e1e40">
      <div style="font-size:28px;color:#c8a96e;margin-bottom:10px;line-height:1;">✦</div>
      <div style="font-size:38px;font-weight:800;color:#f8faff;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:8px;line-height:1;">stellara</div>
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;">Your Personal Cosmos</div>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.35),transparent);"></div>
    </td></tr>

    <tr><td style="padding-bottom:28px;" bgcolor="#0e1e40">
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Hi ${name},</p>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Your 7-day trial has started. Each morning, a personalized reading will land in this inbox — written for your exact birth chart, your planets, and what's actually in the sky that day.</p>
      <p style="margin:0;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Your first reading arrives tomorrow morning.</p>
    </td></tr>

    <tr><td style="padding:28px 24px;background:#102349;border-left:3px solid #c8a96e;border-radius:0 10px 10px 0;margin-bottom:32px;" bgcolor="#102349">
      <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;">Each morning you'll receive</p>
      <p style="margin:0;font-size:15px;line-height:1.9;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">
        A personalized reading for your chart &amp; the day's sky<br/>
        A quote written for your exact planetary moment<br/>
        One thing to watch for, and your power move
      </p>
    </td></tr>

    <tr><td style="padding-top:32px;text-align:center;" bgcolor="#0e1e40">
      <a href="${SITE_URL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,rgba(143,168,200,0.22),rgba(90,130,180,0.12));border:1px solid rgba(143,168,200,0.58);border-radius:10px;color:#edf1fb;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        → Explore Stellara
      </a>
    </td></tr>

    <tr><td style="text-align:center;padding-top:36px;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:11px;color:#8fa8c8;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        You signed up for a 7-day free trial at Stellara.<br/>
        <a href="${SITE_URL}" style="color:#8fa8c8;text-decoration:none;">stellara-horoscope.com</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/.netlify/functions/unsubscribe?id=${userId}" style="color:#8fa8c8;text-decoration:none;">Unsubscribe</a>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}
