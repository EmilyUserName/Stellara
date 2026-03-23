// ============================================================
// calculate-chart.js — Server-side astronomical chart calculation
// Uses Jean Meeus "Astronomical Algorithms" for accuracy.
// ============================================================

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
               'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

// ------------------------------------------------------------
// JULIAN DAY NUMBER
// ------------------------------------------------------------
function toJD(date) {
  let Y = date.getUTCFullYear();
  let M = date.getUTCMonth() + 1;
  const D = date.getUTCDate()
            + date.getUTCHours()   / 24
            + date.getUTCMinutes() / 1440
            + date.getUTCSeconds() / 86400;
  if (M <= 2) { Y--; M += 12; }
  const A = Math.trunc(Y / 100);
  const B = 2 - A + Math.trunc(A / 4);
  return Math.trunc(365.25 * (Y + 4716)) + Math.trunc(30.6001 * (M + 1)) + D + B - 1524.5;
}

// ------------------------------------------------------------
// SUN LONGITUDE — Meeus Ch. 25 (accurate to ~0.01°)
// ------------------------------------------------------------
function sunLongitude(jd) {
  const T    = (jd - 2451545.0) / 36525;
  const d2r  = Math.PI / 180;
  const L0   = (280.46646 + 36000.76983 * T) % 360;
  const M    = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360 + 360) % 360;
  const Mrad = M * d2r;
  const C    = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
             + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
             +  0.000289                 * Math.sin(3 * Mrad);
  const omega = 125.04 - 1934.136 * T;
  const lon   = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * d2r);
  return ((lon % 360) + 360) % 360;
}

// ------------------------------------------------------------
// MOON LONGITUDE — Meeus Ch. 47 (accurate to ~0.3°)
// ------------------------------------------------------------
function moonLongitude(jd) {
  const T   = (jd - 2451545.0) / 36525;
  const d2r = Math.PI / 180;
  const L1  = (218.3165 + 481267.8813 * T) % 360;
  const M   = (357.5291 +  35999.0503 * T) % 360;
  const M1  = (134.9634 + 477198.8676 * T) % 360;
  const D   = (297.8502 + 445267.1115 * T) % 360;
  const F   = ( 93.2721 + 483202.0175 * T) % 360;
  const lon = L1
    + 6.289  * Math.sin(M1             * d2r)
    - 1.274  * Math.sin((2*D - M1)     * d2r)
    + 0.658  * Math.sin(2*D            * d2r)
    - 0.214  * Math.sin(2*M1           * d2r)
    - 0.186  * Math.sin(M              * d2r)
    - 0.114  * Math.sin(2*F            * d2r)
    + 0.059  * Math.sin((2*D - 2*M1)   * d2r)
    + 0.057  * Math.sin((2*D - M - M1) * d2r)
    + 0.053  * Math.sin((2*D + M1)     * d2r)
    + 0.046  * Math.sin((2*D - M)      * d2r)
    + 0.041  * Math.sin((M1 - M)       * d2r)
    - 0.035  * Math.sin(D              * d2r)
    - 0.031  * Math.sin((M1 + M)       * d2r)
    - 0.015  * Math.sin((2*F - 2*D)    * d2r)
    + 0.011  * Math.sin((2*D - 2*M)    * d2r);
  return ((lon % 360) + 360) % 360;
}

// ------------------------------------------------------------
// ASCENDANT — standard formula using Local Sidereal Time
// ------------------------------------------------------------
function ascendant(jd, lat, lon) {
  const T      = (jd - 2451545.0) / 36525;
  const d2r    = Math.PI / 180;
  const gmst   = ((280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) % 360 + 360) % 360;
  const lst    = ((gmst + lon) % 360 + 360) % 360;
  const lstRad = lst * d2r;
  const eps    = (23.439291111 - 0.013004167 * T) * d2r;
  const latRad = lat * d2r;
  const y      = -Math.cos(lstRad);
  const x      =  Math.sin(lstRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps);
  let   asc    = Math.atan2(y, x) / d2r;
  if (asc < 0) asc += 360;
  return asc;
}

// ------------------------------------------------------------
// TIMEZONE — get IANA timezone from lat/lon, then convert local
// birth time to UTC using Node's Intl API (handles DST correctly)
// ------------------------------------------------------------
async function getTimeZone(lat, lon) {
  const res  = await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lon}`);
  const data = await res.json();
  return data.timeZone; // e.g. "America/New_York"
}

function localToUTC(birthDate, birthTime, timeZone) {
  const [wantH, wantM] = birthTime.split(':').map(Number);

  // Treat birth date+time as if it were UTC to get a reference instant
  const approxUTC = new Date(`${birthDate}T${birthTime}:00Z`);

  // See what that UTC instant looks like in the local timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false
  }).formatToParts(approxUTC).reduce((a, p) => { a[p.type] = p.value; return a; }, {});

  const h = parseInt(parts.hour) % 24;
  const m = parseInt(parts.minute);

  // Difference between wanted local time and what we got
  let diffMin = (wantH * 60 + wantM) - (h * 60 + m);
  if (diffMin < -720) diffMin += 1440;
  if (diffMin >  720) diffMin -= 1440;

  return new Date(approxUTC.getTime() + diffMin * 60000);
}

// ------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { birthDate, birthTime, birthCity } = JSON.parse(event.body);

  // 1. Geocode city
  const geoRes  = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(birthCity)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'Stellara/1.0 (stellara-horoscope.com)' } }
  );
  const geoData = await geoRes.json();
  if (!geoData.length) return { statusCode: 404, body: JSON.stringify({ error: 'City not found' }) };

  const lat = parseFloat(geoData[0].lat);
  const lon = parseFloat(geoData[0].lon);

  // 2. Get timezone & convert birth time to UTC
  let birthUTC;
  if (birthTime) {
    try {
      const tz = await getTimeZone(lat, lon);
      birthUTC = localToUTC(birthDate, birthTime, tz);
    } catch (_) {
      // Fallback: approximate from longitude
      const offsetH = lon / 15;
      const [h, m]  = birthTime.split(':').map(Number);
      birthUTC = new Date(`${birthDate}T${birthTime}:00Z`);
      birthUTC.setUTCMinutes(birthUTC.getUTCMinutes() - offsetH * 60);
    }
  } else {
    birthUTC = new Date(`${birthDate}T12:00:00Z`);
  }

  // 3. Calculate chart
  const jd      = toJD(birthUTC);
  const sunLon  = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const ascLon  = birthTime ? ascendant(jd, lat, lon) : null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sun:    SIGNS[Math.floor(sunLon  / 30)],
      moon:   SIGNS[Math.floor(moonLon / 30)],
      rising: ascLon !== null ? SIGNS[Math.floor(ascLon / 30)] : null,
    }),
  };
};
