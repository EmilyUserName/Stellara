// ============================================================
// astrology.js — Star sign calculations
// ============================================================
// This file figures out someone's Sun, Moon, and Rising signs
// based on their birth info. Want to improve the accuracy of
// any calculation? This is the only file you need to touch.
// ============================================================

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer",
  "Leo", "Virgo", "Libra", "Scorpio",
  "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

const SIGN_EMOJI = [
  "♈", "♉", "♊", "♋",
  "♌", "♍", "♎", "♏",
  "♐", "♑", "♒", "♓"
];

// ------------------------------------------------------------
// SUN SIGN
// Based on birth month and day.
// Each sign starts on a specific date — we check which one
// the birthday falls into.
// ------------------------------------------------------------
function getSunSign(month, day) {
  const cusps = [
    [0,  3, 21], // Aries starts March 21
    [1,  4, 20], // Taurus starts April 20
    [2,  5, 21], // Gemini starts May 21
    [3,  6, 21], // Cancer starts June 21
    [4,  7, 23], // Leo starts July 23
    [5,  8, 23], // Virgo starts August 23
    [6,  9, 23], // Libra starts September 23
    [7, 10, 23], // Scorpio starts October 23
    [8, 11, 22], // Sagittarius starts November 22
    [9, 12, 22], // Capricorn starts December 22
    [10, 1, 20], // Aquarius starts January 20
    [11, 2, 19], // Pisces starts February 19
  ];

  for (let i = 0; i < cusps.length; i++) {
    const [sign, sm, sd] = cusps[i];
    const [, nm, nd] = cusps[(i + 1) % 12];
    const inStart = month === sm && day >= sd;
    const inEnd   = month === nm && day < nd;
    if (inStart || inEnd) return sign;
  }

  return 9; // Capricorn fallback for late December
}

// ------------------------------------------------------------
// MOON SIGN
// Uses the moon's mean longitude at J2000.0 (Jan 1 2000 12:00 UTC)
// and advances by 13.17634°/day — accurate to within ~1 sign
// for most dates. True accuracy needs an ephemeris library.
// ------------------------------------------------------------
function estimateMoonSign(birthDate) {
  const epoch       = new Date('2000-01-01T12:00:00Z');
  const moonLon2000 = 218.32; // Moon's ecliptic longitude at J2000.0
  const daysDiff    = (birthDate - epoch) / 86400000;
  const moonLon     = ((moonLon2000 + 13.17634 * daysDiff) % 360 + 360) % 360;
  return Math.floor(moonLon / 30); // 0=Aries … 11=Pisces
}

// ------------------------------------------------------------
// RISING SIGN (Ascendant)
// Calculates the ascendant from birth date, local time,
// and geographic coordinates (lat/lon from birth city geocoding).
// Formula: LST = GMST + longitude, then standard ASC formula.
// ------------------------------------------------------------
function calculateRising(birthDate, birthTime, lat, lon) {
  if (!birthTime || lat == null || lon == null) return null;

  const [h, m] = birthTime.split(':').map(Number);

  // Approximate UTC offset from longitude (solar time)
  const utcOffset  = lon / 15;
  const utcHour    = ((h + m / 60) - utcOffset + 24) % 24;

  // Days since J2000.0 (Jan 1 2000, 12:00 UTC)
  const epoch      = new Date('2000-01-01T12:00:00Z');
  const birthUTC   = new Date(birthDate);
  birthUTC.setUTCHours(Math.floor(utcHour), Math.round((utcHour % 1) * 60), 0, 0);
  const d          = (birthUTC - epoch) / 86400000;

  // GMST in degrees
  const gmst       = ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;

  // Local Sidereal Time
  const lst        = ((gmst + lon) % 360 + 360) % 360;

  // Ascendant formula
  const eps        = 23.437 * Math.PI / 180; // obliquity of ecliptic
  const lstRad     = lst    * Math.PI / 180;
  const latRad     = lat    * Math.PI / 180;
  const y          = -Math.cos(lstRad);
  const x          = Math.sin(lstRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps);
  let   asc        = Math.atan2(y, x) * 180 / Math.PI;
  if (asc < 0) asc += 360;

  return Math.floor(asc / 30);
}
