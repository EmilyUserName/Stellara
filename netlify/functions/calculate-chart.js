// ============================================================
// calculate-chart.js — Server-side astronomical chart calculation
// Uses Jean Meeus "Astronomical Algorithms" for sun/moon,
// and astronomy-engine (NASA JPL accuracy) for the Ascendant.
// ============================================================
const Astronomy = require('astronomy-engine');

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
// NORTH NODE — Mean Lunar Ascending Node (Meeus Ch. 47)
// Accurate to ~0.5°, sufficient for astrology
// ------------------------------------------------------------
function northNodeLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const omega = 125.0445479
    - 1934.1362608 * T
    +    0.0020754 * T * T
    + T * T * T / 467441
    - T * T * T * T / 60616000;
  return ((omega % 360) + 360) % 360;
}

// ------------------------------------------------------------
// NATAL PLANET SIGN — uses astronomy-engine GeoVector
// Each call is individually try/catched so one failure doesn't
// break the whole chart.
// ------------------------------------------------------------
function natalPlanetSign(bodyName, astroTime) {
  try {
    const vec = Astronomy.GeoVector(bodyName, astroTime, true);
    const ecl = Astronomy.Ecliptic(vec);
    const lon = ((ecl.elon % 360) + 360) % 360;
    return SIGNS[Math.floor(lon / 30)];
  } catch (e) {
    console.error(`[calculate-chart] natal ${bodyName} error:`, e.message);
    return null;
  }
}

// ------------------------------------------------------------
// MIDHEAVEN (MC) — ecliptic longitude culminating on meridian
// Requires birth time + longitude. Returns null if no birth time.
// Formula: MC = atan2(sin(RAMC), cos(RAMC) * cos(ε))
// where RAMC = Local Sidereal Time in degrees
// ------------------------------------------------------------
function midheaven(date, lon) {
  const d2r  = Math.PI / 180;
  const time = Astronomy.MakeTime(date);
  const eps  = Astronomy.e_tilt(time).tobl;
  const gast = Astronomy.SiderealTime(time);
  const lst  = ((gast * 15 + lon) % 360 + 360) % 360;
  const lstR = lst * d2r;
  const mc   = Math.atan2(Math.sin(lstR), Math.cos(lstR) * Math.cos(eps * d2r)) / d2r;
  return ((mc % 360) + 360) % 360;
}

// ------------------------------------------------------------
// ASCENDANT — uses astronomy-engine for accurate sidereal time
// (accounts for nutation/aberration; same precision as Astro.com)
// ------------------------------------------------------------
function ascendant(date, lat, lon) {
  const d2r    = Math.PI / 180;
  const time   = Astronomy.MakeTime(date);
  const eps    = Astronomy.e_tilt(time).tobl;                       // obliquity, degrees
  const gast   = Astronomy.SiderealTime(time);                      // GAST, hours
  const lst    = ((gast * 15 + lon) % 360 + 360) % 360;            // LST, degrees
  const epsR   = eps * d2r;
  const latR   = lat * d2r;

  // sin(altitude) for a point on the ecliptic at longitude lambda (degrees)
  function sinAlt(lambda) {
    const lamR   = lambda * d2r;
    const sinDec = Math.sin(epsR) * Math.sin(lamR);
    const cosDec = Math.sqrt(1 - sinDec * sinDec);
    const ra     = ((Math.atan2(Math.cos(epsR) * Math.sin(lamR), Math.cos(lamR)) / d2r) + 360) % 360;
    const H      = (lst - ra + 360) % 360; // hour angle 0–360°
    return Math.sin(latR) * sinDec + Math.cos(latR) * cosDec * Math.cos(H * d2r);
  }

  // Scan the ecliptic in 1° steps for the Ascendant: where sinAlt goes POSITIVE → NEGATIVE
  // as lambda increases, AND the crossing is on the eastern horizon (H > 180° in 0–360).
  // (The Descendant crossing is the opposite: negative → positive, H < 180°.)
  for (let i = 0; i < 360; i++) {
    if (sinAlt(i) >= 0 && sinAlt(i + 1) < 0) {
      // Binary-refine to ~0.0003° accuracy
      let lo = i, hi = i + 1;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        (sinAlt(lo) * sinAlt(mid) <= 0) ? (hi = mid) : (lo = mid);
      }
      const asc  = (lo + hi) / 2;
      const ascR = asc * d2r;
      const ra   = ((Math.atan2(Math.cos(epsR) * Math.sin(ascR), Math.cos(ascR)) / d2r) + 360) % 360;
      const H    = (lst - ra + 360) % 360;
      if (H > 180) return asc;  // confirmed eastern horizon
    }
  }
  return 0;
}

// ------------------------------------------------------------
// TIMEZONE — try timeapi.io first (accurate historical DST),
// fall back to Open-Meteo if unavailable.
// ------------------------------------------------------------
async function getTimeZone(lat, lon) {
  try {
    const res  = await fetch(
      `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const data = await res.json();
    if (data.timeZone) return data.timeZone;
  } catch (_) {}

  // Fallback: Open-Meteo
  const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=0`);
  const data = await res.json();
  if (!data.timezone) throw new Error('No timezone returned');
  return data.timezone;
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
      birthUTC = new Date(`${birthDate}T${birthTime}:00Z`);
      birthUTC.setUTCMinutes(birthUTC.getUTCMinutes() - offsetH * 60);
    }
  } else {
    birthUTC = new Date(`${birthDate}T12:00:00Z`);
  }

  // 3. Calculate chart
  const jd      = toJD(birthUTC);
  const nodeLon = northNodeLongitude(jd);
  const ascLon  = birthTime ? ascendant(birthUTC, lat, lon) : null;
  const mcLon   = birthTime ? midheaven(birthUTC, lon) : null;

  let astroTime = null;
  try { astroTime = Astronomy.MakeTime(birthUTC); } catch (_) {}

  // Sun and Moon: use astronomy-engine (JPL accuracy) with Meeus fallback.
  // The simplified Meeus moon formula (~16 terms) can be 5-10° off near
  // sign boundaries — enough to show the wrong sign.
  let sunLon, moonLon;
  try {
    const vec = Astronomy.GeoVector('Sun', astroTime, true);
    sunLon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
  } catch (_) {
    sunLon = sunLongitude(jd);
  }
  try {
    const vec = Astronomy.GeoVector('Moon', astroTime, true);
    moonLon = ((Astronomy.Ecliptic(vec).elon % 360) + 360) % 360;
  } catch (_) {
    moonLon = moonLongitude(jd);
  }

  const result = {
    sun:        SIGNS[Math.floor(sunLon  / 30)],
    moon:       SIGNS[Math.floor(moonLon / 30)],
    rising:     ascLon !== null ? SIGNS[Math.floor(ascLon / 30)] : null,
    northNode:  SIGNS[Math.floor(nodeLon / 30)],
    southNode:  SIGNS[Math.floor(((nodeLon + 180) % 360) / 30)],
    midheaven:  mcLon !== null ? SIGNS[Math.floor(mcLon / 30)] : null,
    mercury:    astroTime ? natalPlanetSign('Mercury', astroTime) : null,
    venus:      astroTime ? natalPlanetSign('Venus',   astroTime) : null,
    mars:       astroTime ? natalPlanetSign('Mars',    astroTime) : null,
    jupiter:    astroTime ? natalPlanetSign('Jupiter', astroTime) : null,
    saturn:     astroTime ? natalPlanetSign('Saturn',  astroTime) : null,
  };
  console.log('[calculate-chart]', { birthDate, birthTime, birthCity, lat, lon, jd, sunLon, moonLon, ascLon, nodeLon, mcLon, result });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};
