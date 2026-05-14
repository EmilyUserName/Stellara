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

  const { name, email, password, birthDate, birthTime, birthCity } = body;

  if (!name?.trim() || !email?.trim() || !birthDate || !birthCity?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name, email, birth date, and birth city are required.' }) };
  }
  if (!password || password.length < 6) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password must be at least 6 characters.' }) };
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

    // Profile exists but no trial yet — set password and start trial
    userId = profile.id;
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
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
        password,
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

    // Upsert profile row (handles trigger-created rows and retries)
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
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
  const subject = `${name}, your 7-day Pro access is live ✦`;

  const features = [
    ['15 topic readings', 'Love, career, money, purpose, and more — each one written for your exact chart.'],
    ['Daily morning reading', 'A personalized forecast in your inbox every morning, calibrated to the day\'s sky.'],
    ['Your chart vs. today\'s sky', 'Toggle between what your natal chart says and what\'s happening right now.'],
    ['4 reading styles', 'Choose psychological depth, spiritual guidance, modern coaching, or classical tradition.'],
    ['Reading preferences', 'Dial in how deep, how direct, and how long your readings go.'],
  ];

  const featureRows = features.map(([title, desc]) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid rgba(143,168,200,0.15);" bgcolor="#0e1e40">
      <div style="font-size:13px;font-weight:700;color:#c8a96e;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.04em;margin-bottom:5px;">${title}</div>
      <div style="font-size:15px;line-height:1.75;color:#c8d8ea;font-family:Georgia,'Times New Roman',serif;">${desc}</div>
    </td></tr>`).join('');

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

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Hi ${name},</p>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.85;color:#dce8f8;font-family:Georgia,'Times New Roman',serif;">Your 7-day free trial is active — and you have full Pro access right now. Everything is unlocked. Log in and explore.</p>
    </td></tr>

    <tr><td style="padding:24px;background:#102349;border-radius:12px;margin-bottom:32px;" bgcolor="#102349">
      <p style="margin:0 0 20px;font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:#9fb5cc;font-family:Helvetica,Arial,sans-serif;">What's included in your trial</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${featureRows}
      </table>
    </td></tr>

    <tr><td style="padding:32px 0;text-align:center;" bgcolor="#0e1e40">
      <a href="${SITE_URL}" style="display:inline-block;padding:16px 44px;background:linear-gradient(135deg,#c8a96e,#a07840);border-radius:10px;color:#0e1e40;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        Open Stellara Now →
      </a>
    </td></tr>

    <tr><td style="padding-bottom:32px;" bgcolor="#0e1e40">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(200,169,110,0.18),transparent);"></div>
    </td></tr>

    <tr><td style="padding-bottom:28px;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:15px;line-height:1.85;color:#8fa8c8;font-family:Georgia,'Times New Roman',serif;">Your first personalized morning reading arrives tomorrow. After your 7 days, you can continue with a Pro subscription — or simply come back to explore on your own terms.</p>
    </td></tr>

    <tr><td style="text-align:center;" bgcolor="#0e1e40">
      <p style="margin:0;font-size:11px;color:#6a82a0;font-family:Helvetica,Arial,sans-serif;line-height:2;">
        You signed up for a 7-day free trial at Stellara.<br/>
        <a href="${SITE_URL}" style="color:#6a82a0;text-decoration:none;">stellara-horoscope.com</a>
        &nbsp;·&nbsp;
        <a href="${SITE_URL}/.netlify/functions/unsubscribe?id=${userId}" style="color:#6a82a0;text-decoration:none;">Unsubscribe</a>
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
