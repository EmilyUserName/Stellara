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
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(fields),
  });
}

exports.handler = async function (event) {
  const sig    = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!verifySignature(event.body, sig, secret)) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const stripeEvent = JSON.parse(event.body);

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const userId  = session.client_reference_id;
    await updateProfile(userId, {
      subscribed:             true,
      stripe_customer_id:     session.customer,
      stripe_subscription_id: session.subscription,
    });
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
};
