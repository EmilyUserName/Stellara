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
// The moon moves through all 12 signs roughly every 28 days
// (about 2.5 days per sign). This is an estimate based on
// how far the moon has traveled since a known starting point.
// For exact accuracy you'd need an astronomy library.
// ------------------------------------------------------------
function estimateMoonSign(birthDate) {
  const epoch = new Date('2000-01-06'); // Moon was in Capricorn ~here
  const daysDiff = Math.floor((birthDate - epoch) / (1000 * 60 * 60 * 24));
  const moonIdx = Math.floor(((daysDiff * 13.18) % 360) / 30);
  return ((moonIdx % 12) + 12) % 12;
}

// ------------------------------------------------------------
// RISING SIGN (Ascendant)
// The rising sign changes every ~2 hours as Earth rotates.
// This is a simplified estimate based on time of birth.
// A true calculation also needs the birth location's latitude,
// which would require an astronomy library to do properly.
// ------------------------------------------------------------
function estimateRising(birthTime) {
  if (!birthTime) return null;
  const [h, m] = birthTime.split(':').map(Number);
  const totalMinutes = h * 60 + m;
  return Math.floor(totalMinutes / 120) % 12;
}
