// ============================================================
// get-sky.js — Returns today's actual astronomical positions
// Pure computation using Meeus formulas + astronomy-engine.
// No external API calls. Called before every reading so Claude
// receives real sky data instead of inventing placements.
// ============================================================
const Astronomy = require('astronomy-engine');

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
               'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

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

function sunLongitude(jd) {
  const T   = (jd - 2451545.0) / 36525;
  const d2r = Math.PI / 180;
  const L0  = (280.46646 + 36000.76983 * T) % 360;
  const M   = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360 + 360) % 360;
  const Mrad = M * d2r;
  const C   = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
            + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
            +  0.000289                 * Math.sin(3 * Mrad);
  const omega = 125.04 - 1934.136 * T;
  const lon = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * d2r);
  return ((lon % 360) + 360) % 360;
}

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

function moonPhase(moonLon, sunLon) {
  const angle = ((moonLon - sunLon) + 360) % 360;
  if (angle < 45)  return 'New Moon';
  if (angle < 90)  return 'Waxing Crescent';
  if (angle < 135) return 'First Quarter';
  if (angle < 180) return 'Waxing Gibbous';
  if (angle < 225) return 'Full Moon';
  if (angle < 270) return 'Waning Gibbous';
  if (angle < 315) return 'Last Quarter';
  return 'Waning Crescent';
}

function planetSign(bodyName, time) {
  try {
    const vec = Astronomy.GeoVector(bodyName, time, true);
    const ecl = Astronomy.Ecliptic(vec);
    const lon = ((ecl.elon % 360) + 360) % 360;
    return SIGNS[Math.floor(lon / 30)];
  } catch (e) {
    console.error(`[get-sky] ${bodyName} error:`, e.message);
    return null;
  }
}

exports.handler = async function () {
  try {
    const now  = new Date();
    const jd   = toJD(now);
    const sunLon  = sunLongitude(jd);
    const moonLon = moonLongitude(jd);
    const time = Astronomy.MakeTime(now);

    const sky = {
      sun:       SIGNS[Math.floor(sunLon  / 30)],
      moon:      SIGNS[Math.floor(moonLon / 30)],
      moonPhase: moonPhase(moonLon, sunLon),
      mercury:   planetSign('Mercury', time),
      venus:     planetSign('Venus',   time),
      mars:      planetSign('Mars',    time),
      jupiter:   planetSign('Jupiter', time),
      saturn:    planetSign('Saturn',  time),
    };

    console.log('[get-sky]', sky);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sky),
    };
  } catch (err) {
    console.error('[get-sky] error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
