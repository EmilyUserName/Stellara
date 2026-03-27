exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { userId, email } = JSON.parse(event.body || '{}');
  if (!userId || !email) return { statusCode: 400, body: 'userId and email required' };
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId   = process.env.ASTRO_PRICE_ID;
  if (!priceId) return { statusCode: 500, body: 'ASTRO_PRICE_ID not configured' };
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'mode':                    'payment',
      'payment_method_types[]':  'card',
      'line_items[0][price]':    priceId,
      'line_items[0][quantity]': '1',
      'success_url':             'https://stellara-horoscope.com/?astro=true',
      'cancel_url':              'https://stellara-horoscope.com/',
      'customer_email':          email,
      'client_reference_id':     userId,
      'metadata[user_id]':       userId,
      'metadata[product]':       'astrocartography',
    }).toString(),
  });
  const session = await response.json();
  if (!session.url) return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create checkout session' }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: session.url }) };
};
