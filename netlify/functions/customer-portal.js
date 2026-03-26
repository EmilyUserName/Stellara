// ============================================================
// customer-portal.js — Creates a Stripe billing portal session
// so subscribers can manage or cancel their subscription.
// ============================================================

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { userId } = JSON.parse(event.body);

  // Look up stripe_customer_id from Supabase
  const profileRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
    {
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const [profile] = await profileRes.json();

  if (!profile?.stripe_customer_id) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'No subscription found for this account.' }),
    };
  }

  // Create Stripe billing portal session
  const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer:   profile.stripe_customer_id,
      return_url: 'https://stellara-horoscope.com',
    }).toString(),
  });

  const portal = await portalRes.json();

  if (!portal.url) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create portal session.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: portal.url }),
  };
};
