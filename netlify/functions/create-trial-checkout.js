// ============================================================
// create-trial-checkout.js
// GET /api/create-trial-checkout?email=xxx
// Creates a Stripe checkout session for a trial user and
// redirects directly to it — used in conversion emails so
// subscribers can subscribe in one click.
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY;
const PRO_PRICE_ID         = process.env.PRO_SUBSCRIPTION_PRICE_ID;
const SITE_URL             = 'https://stellara-horoscope.com';

exports.handler = async function (event) {
  const email = event.queryStringParameters?.email;

  if (!email) {
    return { statusCode: 302, headers: { Location: SITE_URL }, body: '' };
  }

  // Look up the user's profile to get their ID
  let userId = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length) userId = rows[0].id;
  } catch (e) {
    console.error('[create-trial-checkout] Supabase lookup error:', e.message);
  }

  // Create a Stripe checkout session
  const params = new URLSearchParams({
    mode:                      'subscription',
    'payment_method_types[]':  'card',
    'line_items[0][price]':    PRO_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url:               `${SITE_URL}/?subscribed=true`,
    cancel_url:                SITE_URL,
    customer_email:            email,
  });

  if (userId) {
    params.set('client_reference_id', userId);
    params.set('metadata[user_id]', userId);
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();

  if (!session.url) {
    console.error('[create-trial-checkout] Stripe error:', JSON.stringify(session).slice(0, 200));
    return { statusCode: 302, headers: { Location: SITE_URL }, body: '' };
  }

  return { statusCode: 302, headers: { Location: session.url }, body: '' };
};
