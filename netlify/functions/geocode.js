exports.handler = async function (event) {
  const city = event.queryStringParameters?.city;
  if (!city) return { statusCode: 400, body: 'Missing city' };

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'Stellara/1.0 (stellara-horoscope.com)' } }
  );

  const data = await res.json();
  if (!data.length) return { statusCode: 404, body: 'City not found' };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }),
  };
};
