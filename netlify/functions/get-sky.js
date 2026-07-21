// ============================================================
// get-sky.js — Returns today's actual astronomical positions
// All bodies use astronomy-engine (JPL DE431 accuracy).
// Meeus formulas kept as fallback for Sun/Moon only.
// ============================================================
const Astronomy = require('astronomy-engine');

const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
               'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

// Meeus fallbacks — only used if astronomy-engine GeoVector fails
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

function sunLongitudeMeeus(jd) {
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

function moonLongitudeMeeus(jd) {
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

function moonPhase(angle) {
  if (angle < 45)  return 'New Moon';
  if (angle < 90)  return 'Waxing Crescent';
  if (angle < 135) return 'First Quarter';
  if (angle < 180) return 'Waxing Gibbous';
  if (angle < 225) return 'Full Moon';
  if (angle < 270) return 'Waning Gibbous';
  if (angle < 315) return 'Last Quarter';
  return 'Waning Crescent';
}

// Primary path for all bodies — JPL DE431 accuracy via astronomy-engine
function bodyLongitude(bodyName, time) {
  const vec = Astronomy.GeoVector(bodyName, time, true);
  const ecl = Astronomy.Ecliptic(vec);
  return ((ecl.elon % 360) + 360) % 360;
}

function bodySign(bodyName, time) {
  try {
    return SIGNS[Math.floor(bodyLongitude(bodyName, time) / 30)];
  } catch (e) {
    console.error(`[get-sky] ${bodyName} error:`, e.message);
    return null;
  }
}

// Raw degree (0-360), used for transit-to-natal aspect math — signs alone
// stay identical for weeks/months, but exact degrees shift every day.
function safeLon(bodyName, time) {
  try {
    return bodyLongitude(bodyName, time);
  } catch (e) {
    return null;
  }
}

exports.handler = async function () {
  try {
    const now  = new Date();
    const time = Astronomy.MakeTime(now);

    // Sun and Moon use astronomy-engine (same JPL path as planets).
    // Meeus is fallback only — its ~16-term moon formula can be 5-10°
    // off near sign boundaries, which causes wrong sign reports.
    let sunLon, moonLon;
    try {
      sunLon = bodyLongitude('Sun', time);
    } catch (e) {
      console.error('[get-sky] Sun fallback to Meeus:', e.message);
      sunLon = sunLongitudeMeeus(toJD(now));
    }
    try {
      moonLon = bodyLongitude('Moon', time);
    } catch (e) {
      console.error('[get-sky] Moon fallback to Meeus:', e.message);
      moonLon = moonLongitudeMeeus(toJD(now));
    }

    // Find the most recent new moon to report the lunation sign correctly.
    // "New Moon in Aries" means the conjunction was in Aries — not the current
    // transit sign (which may have moved on already).
    let newMoonSign = null;
    let newMoonDate = null;
    try {
      const nm    = Astronomy.SearchMoonPhase(0, time, -40);
      const nmVec = Astronomy.GeoVector('Moon', nm, true);
      const nmLon = ((Astronomy.Ecliptic(nmVec).elon % 360) + 360) % 360;
      newMoonSign = SIGNS[Math.floor(nmLon / 30)];
      newMoonDate = nm.date.toISOString().slice(0, 10);
    } catch (e) {
      console.error('[get-sky] new moon search error:', e.message);
    }

    // Use astronomy-engine's own phase angle for an accurate phase name
    const phaseAngle = Astronomy.MoonPhase(time);

    const sky = {
      sun:         SIGNS[Math.floor(sunLon  / 30)],
      moon:        SIGNS[Math.floor(moonLon / 30)],
      moonPhase:   moonPhase(phaseAngle),
      newMoonSign: newMoonSign,
      newMoonDate: newMoonDate,
      mercury:   bodySign('Mercury', time),
      venus:     bodySign('Venus',   time),
      mars:      bodySign('Mars',    time),
      jupiter:   bodySign('Jupiter', time),
      saturn:    bodySign('Saturn',  time),
      uranus:    bodySign('Uranus',  time),
      neptune:   bodySign('Neptune', time),
      pluto:     bodySign('Pluto',   time),
      longitudes: {
        sun:     sunLon,
        moon:    moonLon,
        mercury: safeLon('Mercury', time),
        venus:   safeLon('Venus',   time),
        mars:    safeLon('Mars',    time),
        jupiter: safeLon('Jupiter', time),
        saturn:  safeLon('Saturn',  time),
        uranus:  safeLon('Uranus',  time),
        neptune: safeLon('Neptune', time),
        pluto:   safeLon('Pluto',   time),
      },
    };

    console.log('[get-sky]', sky);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sky),
    };
  } catch (err) {
    // Outermost catch: attempt Meeus fallback so Claude never invents
    console.error('[get-sky] outer error:', err);
    try {
      const jd      = toJD(new Date());
      const sunLon  = sunLongitudeMeeus(jd);
      const moonLon = moonLongitudeMeeus(jd);
      const angle = ((moonLon - sunLon) + 360) % 360;
      const fallback = {
        sun:       SIGNS[Math.floor(sunLon  / 30)],
        moon:      SIGNS[Math.floor(moonLon / 30)],
        moonPhase: moonPhase(angle),
        longitudes: { sun: sunLon, moon: moonLon },
      };
      console.log('[get-sky] Meeus fallback:', fallback);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fallback) };
    } catch (e2) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }
};
