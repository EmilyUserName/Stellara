// ============================================================
// unsubscribe.js — Handles email unsubscribe link clicks
// Sets email_opt_out = true for the user in Supabase.
// Returns a styled HTML confirmation page.
// ============================================================

exports.handler = async function (event) {
  const id = event.queryStringParameters?.id;

  if (!id) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: page('Something went wrong', 'This unsubscribe link is invalid. Please contact us if you need help.'),
    };
  }

  await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ email_opt_out: true }),
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: page(
      "You've been unsubscribed",
      "You won't receive daily readings anymore. Your account is still active — you can read your chart any time you'd like."
    ),
  };
};

function page(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Stellara</title>
  <style>
    body { font-family: Georgia, serif; background: #0d1b32; color: #dce4f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 20px; box-sizing: border-box; }
    .card { max-width: 420px; }
    .symbol { font-size: 2rem; color: #7ea8d4; margin-bottom: 20px; }
    h1 { font-size: 1.6rem; font-weight: 400; color: #f5f8ff; margin-bottom: 14px; }
    p { color: #b8c4d8; line-height: 1.8; margin-bottom: 28px; font-size: 1rem; }
    a { display: inline-block; padding: 11px 28px; border: 1px solid rgba(126,168,212,0.35); border-radius: 10px; color: #dce4f0; text-decoration: none; font-family: Helvetica Neue, sans-serif; font-size: 0.85rem; letter-spacing: 0.1em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="symbol">✦</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://stellara-horoscope.com">Return to Stellara</a>
  </div>
</body>
</html>`;
}
