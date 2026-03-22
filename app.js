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
// TOPIC SELECTION — tracks which focus pill is active
// ------------------------------------------------------------
let selectedTopic = 'chart';

function selectTopic(el) {
  document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedTopic = el.dataset.topic;
}

const TOPIC_CONFIG = {
  chart: {
    section1Label: 'Your Cosmic Blueprint',
    section2Label: 'How the sky speaks to your chart today',
    prompt1: (name, sun, moon, rising) =>
      `Give a personal, psychologically rich reading of ${name}'s ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''} combination. Highlight the interplay between their placements. Be specific and insightful, not generic. Avoid clichés. Reveal something they might not have heard before.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary weather (invent plausible but general transit themes for today — Mercury, Venus, Mars, Jupiter movements) and then specifically connect how this energy interacts with ${name}'s ${sun} Sun and ${moon} Moon. Give them 1-2 concrete things to lean into or watch out for today.`,
  },
  love: {
    section1Label: 'Your Heart & Relational Style',
    section2Label: 'Love energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s approach to love, relationships, and intimacy based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore how they give and receive love, what they need from a partner, their attachment style, and patterns they may repeat. Be psychologically honest and compassionate.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe what the current planetary energy means for love and relationships — focus on Venus, Mars, and the Moon's movements. Then connect this specifically to how ${name}'s ${sun} Sun and ${moon} Moon are being activated. Give 1-2 concrete things they can do or watch out for in their relationships today.`,
  },
  career: {
    section1Label: 'Your Purpose & Ambition',
    section2Label: 'Career energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s career, life purpose, and ambition based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What drives them professionally? What kind of work fulfills them? What are their natural strengths and potential blind spots in a career context? Where are they being called to grow?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around work and ambition — focus on Saturn, Mars, Mercury, and the Sun's movements. Then connect this specifically to ${name}'s ${sun} Sun and ${moon} Moon. Give 1-2 concrete actions or awarenesses for their professional life today.`,
  },
  finances: {
    section1Label: 'Your Relationship with Abundance',
    section2Label: 'Financial energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s relationship with money, resources, and material security based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore their values around wealth, how they earn and spend, what abundance means to them at a deeper level, and any patterns around scarcity or generosity to be aware of.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around finances and material decisions — focus on Venus, Jupiter, and Saturn movements. Then connect this to how ${name}'s ${sun} Sun and ${moon} Moon are being influenced. Give 1-2 concrete financial insights or awarenesses for today.`,
  },
  health: {
    section1Label: 'Your Body, Mind & Rhythms',
    section2Label: 'Wellbeing energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s health, wellbeing, and daily rhythms based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore their physical and emotional needs, how stress shows up in their body, what restores them, and the connection between their inner world and physical vitality. Be holistic and grounded.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around health and wellbeing — focus on the Moon, Mars, and Chiron movements. Then connect this to how ${name}'s ${sun} Sun and ${moon} Moon are being influenced. Give 1-2 concrete things they can do today to support their body and mind.`,
  },
};


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

  // --- 3b. Gate topic-specific readings behind auth ---
  if (selectedTopic !== 'chart' && !requireAuth()) return;

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

  const topic = TOPIC_CONFIG[selectedTopic];

  const prompt = `You are Stellara, a sophisticated and poetic astrology guide. You combine psychological depth with cosmic wisdom. Your tone is warm, modern, and insightful — never generic.

The user's name is ${name}.
Sun sign: ${sun}
Moon sign: ${moon}
${rising ? `Rising sign: ${rising}` : 'Rising sign: unknown (no birth time provided)'}
Birth city: ${birthCity}
Today's date: ${today}

Write two sections separated by the exact delimiter "---TRANSITS---":

SECTION 1 — CHART READING (3–4 paragraphs):
${topic.prompt1(name, sun, moon, rising)}

SECTION 2 — TODAY (2–3 paragraphs):
${topic.prompt2(name, sun, moon, today)}

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
    document.getElementById('resultName').textContent     = name;
    document.getElementById('chartReading').textContent   = parts[0].trim();
    document.getElementById('transitReading').textContent = (parts[1] || '').trim();
    document.getElementById('todayDate').textContent      = today;
    document.querySelector('#results .section-label').textContent       = topic.section1Label;
    document.querySelector('.today-card .section-label').textContent    = topic.section2Label;

    // --- 11. Hide loading, show results ---
    document.getElementById('loading').className  = 'loading';
    document.getElementById('results').className  = 'results card active';

    // --- 12. Save birth info to profile ---
    saveProfile();

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
