// ============================================================
// app.js — UI logic & behavior
// ============================================================
// This file controls what happens when the user interacts
// with the app — clicking buttons, showing/hiding sections,
// calling the API, and displaying results.
//
// Want to change what happens when someone clicks "Reveal"?
// Want to add a new section to the results? This is your file.
// ============================================================


// ------------------------------------------------------------
// REVEAL — runs when the user clicks "Reveal My Chart"
// ------------------------------------------------------------
async function reveal() {

  // --- 1. Read what the user typed into the form ---
  const name      = document.getElementById('name').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const birthTime = document.getElementById('birthTime').value;
  const birthCity = document.getElementById('birthCity').value.trim();

  // --- 2. Clear any previous error message ---
  const err = document.getElementById('errorMsg');
  err.className = 'error';

  // --- 3. Make sure required fields are filled in ---
  if (!name || !birthDate || !birthCity) {
    err.textContent = 'Please fill in your name, birth date, and birth city.';
    err.className = 'error active';
    return;
  }

  // --- 4. Calculate the three placements from astrology.js ---
  // We parse the date at noon to avoid timezone edge cases
  const bd    = new Date(birthDate + 'T12:00:00');
  const month = bd.getMonth() + 1;
  const day   = bd.getDate();

  const sunIdx    = getSunSign(month, day);
  const moonIdx   = estimateMoonSign(bd);
  const risingIdx = estimateRising(birthTime);

  const sun    = SIGNS[sunIdx];
  const moon   = SIGNS[moonIdx];
  const rising = risingIdx !== null ? SIGNS[risingIdx] : null;

  // --- 5. Show the loading spinner, hide the form ---
  document.getElementById('inputCard').style.display = 'none';
  document.getElementById('loading').className = 'loading active';

  // --- 6. Build the prompt that gets sent to Claude ---
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const prompt = `You are Stellara, a sophisticated and poetic astrology guide. You combine psychological depth with cosmic wisdom. Your tone is warm, modern, and insightful — never generic.

The user's name is ${name}.
Sun sign: ${sun}
Moon sign: ${moon}
${rising ? `Rising sign: ${rising}` : 'Rising sign: unknown (no birth time provided)'}
Birth city: ${birthCity}
Today's date: ${today}

Write two sections separated by the exact delimiter "---TRANSITS---":

SECTION 1 — BIRTH CHART READING (3–4 paragraphs):
Give a personal, psychologically rich reading of their Sun/Moon${rising ? '/Rising' : ''} combination. Speak directly to ${name}. Highlight the interplay between their placements. Be specific and insightful, not generic. Avoid clichés. Reveal something they might not have heard before.

SECTION 2 — TODAY'S TRANSITS (2–3 paragraphs):
Today is ${today}. Describe the current planetary weather (invent plausible but general transit themes for today — Mercury, Venus, Mars, Jupiter movements) and then specifically connect how this energy interacts with ${name}'s ${sun} Sun and ${moon} Moon. Give them 1-2 concrete things to lean into or watch out for today. Be specific to their chart, not generic horoscope copy.

Write in a flowing, literary style. No bullet points. No headers. Just paragraphs.`;

  // --- 7. Send the prompt to our serverless function ---
  // (horoscope.js in netlify/functions — that's what holds the API key safely)
  try {
    const response = await fetch("/api/horoscope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }]
      })
    });

    // --- 8. Parse the response from Claude ---
    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');

    // The response contains two sections split by ---TRANSITS---
    const parts = text.split('---TRANSITS---');

    // --- 9. Render the placement cards (Sun / Moon / Rising) ---
    const placementsHTML = [
      { label: 'Sun',    emoji: '☀️', value: sun },
      { label: 'Moon',   emoji: '🌙', value: moon },
      { label: 'Rising', emoji: '⬆️', value: rising || '—' }
    ].map(p => `
      <div class="placement-card">
        <div class="placement-emoji">${p.emoji}</div>
        <div class="placement-label">${p.label}</div>
        <div class="placement-value">${p.value}</div>
      </div>
    `).join('');

    document.getElementById('placements').innerHTML = placementsHTML;

    // --- 10. Fill in the reading text ---
    document.getElementById('resultName').textContent    = name;
    document.getElementById('chartReading').textContent  = parts[0].trim();
    document.getElementById('transitReading').textContent = (parts[1] || '').trim();
    document.getElementById('todayDate').textContent     = today;

    // --- 11. Hide loading, show results ---
    document.getElementById('loading').className  = 'loading';
    document.getElementById('results').className  = 'results card active';

  } catch (e) {
    // --- 12. If something went wrong, show an error ---
    document.getElementById('loading').className     = 'loading';
    document.getElementById('inputCard').style.display = 'block';
    err.textContent = 'Something went wrong. Please try again.';
    err.className   = 'error active';
  }
}


// ------------------------------------------------------------
// RESET — runs when the user clicks "Read Another Chart"
// ------------------------------------------------------------
function reset() {
  // Hide results, show the form again, clear all fields
  document.getElementById('results').className      = 'results card';
  document.getElementById('inputCard').style.display = 'block';
  document.getElementById('name').value      = '';
  document.getElementById('birthDate').value = '';
  document.getElementById('birthTime').value = '';
  document.getElementById('birthCity').value = '';
}
