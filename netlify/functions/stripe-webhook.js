const crypto = require('crypto');

function verifySignature(payload, sig, secret) {
  const parts     = sig.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const sigs      = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const signed    = `${timestamp}.${payload}`;
  const expected  = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return sigs.some(s => {
    try { return crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex')); }
    catch { return false; }
  });
}

async function updateProfile(userId, fields) {
  // POST with merge-duplicates = upsert: creates the row if it doesn't exist yet,
  // updates it if it does. Needed because a user may pay before ever saving a profile.
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: userId, ...fields }),
  });
}

exports.handler = async function (event) {
  try {
  const sig    = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig)    return { statusCode: 400, body: 'Missing stripe-signature header' };
  if (!secret) return { statusCode: 500, body: 'STRIPE_WEBHOOK_SECRET not configured' };

  if (!verifySignature(event.body, sig, secret)) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const stripeEvent = JSON.parse(event.body);

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const userId  = session.client_reference_id;
    const product = session.metadata?.product;
    const email   = session.customer_details?.email || session.customer_email || null;

    if (product === 'natal_chart') {
      // One-time natal chart purchase
      await updateProfile(userId, {
        has_natal_chart:    true,
        email,
        stripe_customer_id: session.customer,
      });
    } else {
      // Recurring subscription
      await updateProfile(userId, {
        subscribed:             true,
        email,
        stripe_customer_id:     session.customer,
        stripe_subscription_id: session.subscription,
      });
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const sub    = stripeEvent.data.object;
    const url    = `${process.env.SUPABASE_URL}/rest/v1/profiles?stripe_subscription_id=eq.${sub.id}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey':        process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ subscribed: false, stripe_subscription_id: null }),
    });
  }

  return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[stripe-webhook] crash:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
