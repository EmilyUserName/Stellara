// ============================================================
// astrocartography.js — Calculates planetary lines for a birth chart
// Returns MC/IC (vertical lines) and ASC/DSC (curved lines)
// for 10 planets using astronomy-engine for accuracy.
// ============================================================
const Astronomy = require('astronomy-engine');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PLANETS = [
  { name: 'Sun',     color: '#f4d03f' },
  { name: 'Moon',    color: '#dce4f0' },
  { name: 'Mercury', color: '#aed6f1' },
  { name: 'Venus',   color: '#f9a7b0' },
  { name: 'Mars',    color: '#e74c3c' },
  { name: 'Jupiter', color: '#e8a87c' },
  { name: 'Saturn',  color: '#d4a853' },
  { name: 'Uranus',  color: '#76d7c4' },
  { name: 'Neptune', color: '#5dade2' },
  { name: 'Pluto',   color: '#9b59b6' },
];

// ------------------------------------------------------------
// TIMEZONE (same pattern as calculate-chart.js)
// ------------------------------------------------------------
async function getTimeZone(lat, lon) {
  try {
    const res = await fetch(
      `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const data = await res.json();
    if (data.timeZone) return data.timeZone;
  } catch (_) {}
  const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=0`);
  const data = await res.json();
  if (!data.timezone) throw new Error('No timezone returned');
  return data.timezone;
}

function localToUTC(birthDate, birthTime, timeZone) {
  const [wantH, wantM] = birthTime.split(':').map(Number);
  const approxUTC = new Date(`${birthDate}T${birthTime}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false
  }).formatToParts(approxUTC).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  const h = parseInt(parts.hour) % 24;
  const m = parseInt(parts.minute);
  let diffMin = (wantH * 60 + wantM) - (h * 60 + m);
  if (diffMin < -720) diffMin += 1440;
  if (diffMin >  720) diffMin -= 1440;
  return new Date(approxUTC.getTime() + diffMin * 60000);
}

// ------------------------------------------------------------
// MATH HELPERS
// ------------------------------------------------------------
function normalizeLon(deg) {
  let d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

// Compute the Ascendant ecliptic longitude from Local Sidereal Time
function ascFromLST(lst_rad, eps, phi_rad) {
  const y = -Math.cos(lst_rad);
  const x =  Math.sin(lst_rad) * Math.cos(eps) + Math.tan(phi_rad) * Math.sin(eps);
  let asc = Math.atan2(y, x) * 180 / Math.PI;
  return asc < 0 ? asc + 360 : asc;
}

function angleDiff(a, b) {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? 360 - d : d;
}

// Split a polyline into segments wherever it crosses the antimeridian
function splitAtAntimeridian(points) {
  if (points.length < 2) return points.length ? [points] : [];
  const segments = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i][1] - points[i - 1][1]) > 180) {
      if (current.length >= 2) segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

// ------------------------------------------------------------
// CORE LINE CALCULATION for one planet
// eclLon — geocentric ecliptic longitude (degrees)
// ra     — right ascension (hours)
// ------------------------------------------------------------
function computeLines(eclLon, ra, gast_deg, eps_deg) {
  const eps = eps_deg * Math.PI / 180;

  // MC / IC — vertical lines (constant longitude)
  const mc_lon = normalizeLon(ra * 15 - gast_deg);
  const ic_lon = normalizeLon(ra * 15 - gast_deg + 180);

  // ASC / DSC — curved lines solved per latitude
  const ascPoints = [];
  const dscPoints = [];

  const lambda   = eclLon * Math.PI / 180;
  const cosLam   = Math.cos(lambda);
  const sinLam   = Math.sin(lambda);

  for (let lat = -78; lat <= 78; lat += 1.5) {
    const phi    = lat * Math.PI / 180;
    const tanPhi = Math.tan(phi);

    let lst_asc_deg, lst_dsc_deg;

    if (Math.abs(cosLam) < 0.001) {
      // Edge case: ecliptic lon near 90° or 270° (tan undefined)
      lst_asc_deg = sinLam > 0 ? 90 : 270;
      lst_dsc_deg = sinLam > 0 ? 270 : 90;
    } else {
      const tanLam = sinLam / cosLam;
      // Solve: cos(LST) + B·sin(LST) = C
      const B  = tanLam * Math.cos(eps);
      const C  = -tanLam * tanPhi * Math.sin(eps);
      const R  = Math.sqrt(1 + B * B);

      if (Math.abs(C) > R) continue; // no solution — circumpolar latitude

      const theta0 = Math.atan2(B, 1);
      const delta  = Math.acos(Math.max(-1, Math.min(1, C / R)));

      const lst1_rad = theta0 + delta;
      const lst2_rad = theta0 - delta;

      // Verify which solution is ASC by plugging back in
      const asc1 = ascFromLST(lst1_rad, eps, phi);
      const isSol1Asc = angleDiff(asc1, eclLon) < 90;

      lst_asc_deg = (isSol1Asc ? lst1_rad : lst2_rad) * 180 / Math.PI;
      lst_dsc_deg = (isSol1Asc ? lst2_rad : lst1_rad) * 180 / Math.PI;
    }

    ascPoints.push([lat, normalizeLon(lst_asc_deg - gast_deg)]);
    dscPoints.push([lat, normalizeLon(lst_dsc_deg - gast_deg)]);
  }

  return {
    mc:  mc_lon,
    ic:  ic_lon,
    asc: splitAtAntimeridian(ascPoints),
    dsc: splitAtAntimeridian(dscPoints),
  };
}

// ------------------------------------------------------------
// HANDLER
// ------------------------------------------------------------
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { birthDate, birthTime, birthCity } = JSON.parse(event.body || '{}');
  if (!birthDate || !birthTime || !birthCity) {
    return { statusCode: 400, body: 'birthDate, birthTime, and birthCity are required' };
  }

  // Geocode
  const geoRes  = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(birthCity)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'Stellara/1.0 (stellara-horoscope.com)' } }
  );
  const geoData = await geoRes.json();
  if (!geoData.length) return { statusCode: 404, body: JSON.stringify({ error: 'City not found' }) };

  const birthLat = parseFloat(geoData[0].lat);
  const birthLonGeo = parseFloat(geoData[0].lon);

  // UTC conversion
  let birthUTC;
  try {
    const tz = await getTimeZone(birthLat, birthLonGeo);
    birthUTC = localToUTC(birthDate, birthTime, tz);
  } catch (_) {
    const offsetH = birthLonGeo / 15;
    birthUTC = new Date(`${birthDate}T${birthTime}:00Z`);
    birthUTC.setUTCMinutes(birthUTC.getUTCMinutes() - offsetH * 60);
  }

  const time     = Astronomy.MakeTime(birthUTC);
  const gast_deg = Astronomy.SiderealTime(time) * 15;
  const eps_deg  = Astronomy.e_tilt(time).tobl;
  const obs      = new Astronomy.Observer(0, 0, 0);

  const planets = [];

  for (const planet of PLANETS) {
    try {
      let eclLon, ra;

      if (planet.name === 'Sun') {
        eclLon = Astronomy.SunPosition(time).elon;
      } else {
        const body   = Astronomy.Body[planet.name];
        const geoVec = Astronomy.GeoVector(body, time, true);
        eclLon = Astronomy.Ecliptic(geoVec).elon;
      }

      const body = Astronomy.Body[planet.name] ?? Astronomy.Body.Sun;
      ra = Astronomy.Equator(body, time, obs, true, true).ra;

      planets.push({
        name:  planet.name,
        color: planet.color,
        ...computeLines(eclLon, ra, gast_deg, eps_deg),
      });
    } catch (e) {
      console.error(`[astrocartography] Error for ${planet.name}:`, e.message);
    }
  }

  console.log(`[astrocartography] Computed ${planets.length} planets for ${birthDate} ${birthTime} ${birthCity}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planets }),
  };
};
