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
// Uses Greenwich Mean Sidereal Time + birth hour to estimate
// the ascendant. Still approximate without exact latitude/longitude
// but far more accurate than splitting the day into 12 chunks.
// ------------------------------------------------------------
function estimateRising(birthDate, birthTime) {
  if (!birthTime) return null;
  const [h, m]      = birthTime.split(':').map(Number);
  const epoch       = new Date('2000-01-01T12:00:00Z');
  const daysSince   = (birthDate - epoch) / 86400000;
  // GMST at J2000.0 was 280.46° — advances 360.9856°/day
  const gmst        = (280.46 + 360.9856 * daysSince) % 360;
  const hourDeg     = (h + m / 60) * 15; // 15° per hour
  const ascLon      = ((gmst + hourDeg) % 360 + 360) % 360;
  return Math.floor(ascLon / 30);
}
