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
// STYLE SELECTION — controls the reading's tone and vocabulary
// ------------------------------------------------------------
let selectedStyle = 'psychological';

const STYLE_CONFIG = {
  psychological: {
    system: `You are Stellara, a depth psychology astrologer who speaks through the lens of Jungian thought. Draw on archetypes, the shadow, the anima/animus, and individuation. Your language is thoughtful, layered, and exploratory. Help the user understand themselves through the symbolic grammar of the psyche. Use terms like "the unconscious," "archetypal patterns," and "inner work" naturally. Tone: reflective, profound, transformative.`
  },
  spiritual: {
    system: `You are Stellara, a soul-centered spiritual guide and intuitive astrologer. Speak to the soul's journey, divine timing, energetic alignment, and cosmic connection. Your language is luminous, mystical, and heart-opening. Help the user feel held by the universe and aligned with their highest path. Tone: warm, ethereal, expansive, devotional.`
  },
  modern: {
    system: `You are Stellara, a modern astrology coach who gives clear, practical, no-nonsense guidance. Focus on what the chart reveals about personality, behavioral patterns, and real-life insights. Skip abstract mysticism — make it concrete, contemporary, and immediately useful. Tone: direct, confident, grounded, conversational.`
  },
  classical: {
    system: `You are Stellara, a classical astrologer steeped in ancient tradition. Draw on the mythology of the planets — Mars as the warrior god, Venus as the goddess of love and beauty, Saturn as the great timekeeper. Reference Hellenistic and Renaissance astrological wisdom, traditional dignities and debilities. Your language is rich with mythological depth and historical resonance. Tone: scholarly, mythic, timeless, dignified.`
  },
};

function selectStyle(el) {
  document.querySelectorAll(`[data-style="${el.dataset.style}"]`).forEach(c => c.classList.add('active'));
  document.querySelectorAll(`.style-card:not([data-style="${el.dataset.style}"])`).forEach(c => c.classList.remove('active'));
  selectedStyle = el.dataset.style;
}


// ------------------------------------------------------------
// TOPIC SELECTION — tracks which focus pill is active
// ------------------------------------------------------------
let selectedTopic = 'chart';

function selectTopic(el) {
  document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedTopic = el.dataset.topic;
  // Show partner input only for compatibility
  document.querySelectorAll('.partner-input').forEach(d => {
    d.style.display = selectedTopic === 'compatibility' ? 'block' : 'none';
  });
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
  thisMonth: {
    section1Label: 'Your Monthly Forecast',
    section2Label: 'Key themes and dates this month',
    prompt1: (name, sun, moon, rising) =>
      `Write a monthly forecast for ${name} based on their ${sun} Sun, ${moon} Moon${rising ? `, and ${rising} Rising` : ''}. What are the dominant themes this month? What areas of life are being activated? What is the overarching invitation of this month for ${name} specifically?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Based on this month's planetary movements — including any retrogrades, sign changes, or lunations — describe the key energetic phases of this month and how they interact with ${name}'s ${sun} Sun and ${moon} Moon. Give 2-3 specific things to lean into or be aware of this month.`,
  },
  communication: {
    section1Label: 'Your Mind & Voice',
    section2Label: 'Communication energy today',
    prompt1: (name, sun, moon, rising) =>
      `Focus on how ${name} thinks, communicates, and is perceived by others based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. How do they process information? What is their natural communication style? How do they come across to others, and where might there be a gap between how they intend to be heard and how they actually land?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe today's Mercury and Air sign energy and how it affects communication, thinking, and expression. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. Give 1-2 specific communication tips or awarenesses for ${name} today.`,
  },
  innerWorld: {
    section1Label: 'Your Inner Landscape',
    section2Label: 'What\'s stirring within today',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s inner emotional world, subconscious patterns, and hidden drives based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What do they need to feel emotionally safe? What patterns live beneath the surface? What does their inner child long for? Be tender and psychologically deep.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the Moon's current phase and sign, and what emotional undercurrents are active in the collective. Then speak to how this is landing specifically in ${name}'s inner world given their ${sun} Sun and ${moon} Moon. What is being stirred, and what might they need today?`,
  },
  energy: {
    section1Label: 'Your Natural Energy & Timing',
    section2Label: 'Today\'s energy forecast for you',
    prompt1: (name, sun, moon, rising) =>
      `Describe ${name}'s natural energy rhythms and relationship with time based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Are they a sprinter or a marathon runner? When do they do their best work? What drains them and what replenishes them? How should they structure their life to work with — not against — their natural cycles?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe today's overall cosmic energy level — is it a day for action, rest, reflection, or connection? Ground this in the current Mars, Sun, and Moon positions. Then tell ${name} specifically what kind of day today is for them given their ${sun} Sun and ${moon} Moon, and how to use the energy wisely.`,
  },
  travel: {
    section1Label: 'Your Adventure & Wanderlust',
    section2Label: 'Expansion energy right now',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s relationship with travel, adventure, and the world beyond their comfort zone based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What draws them when they travel? What kind of experiences feed their soul — deep immersion, cultural exploration, spontaneous adventure, or spiritual pilgrimage? Where in the world might call to them?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current Jupiter and Sagittarius energy around expansion, travel, and new horizons. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. Is now a time to plan, to go, or to explore closer to home? Give ${name} 1-2 concrete ideas for expanding their world right now.`,
  },
  spiritual: {
    section1Label: 'Your Soul\'s Path',
    section2Label: 'Spiritual currents today',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s spiritual nature, soul purpose, and karmic path based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What are they here to learn? What spiritual gifts do they carry? What keeps pulling them back to growth even when it's uncomfortable? Speak to the deeper "why" behind their life.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the spiritual and cosmic undercurrents active today — focus on Neptune, Chiron, and the Moon's influence. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. What is the universe asking of ${name} spiritually today? Give them one meaningful practice or awareness to carry.`,
  },
  compatibility: {
    section1Label: 'Your Cosmic Connection',
    section2Label: 'The energy between you today',
    prompt1: (name, sun, moon, rising, extra) =>
      `Explore the compatibility between ${name} (${sun} Sun, ${moon} Moon${rising ? `, ${rising} Rising` : ''}) and ${extra || 'their person'}. What is the natural dynamic between these energies? Where do they complement each other beautifully? Where might friction arise, and what is that friction here to teach? Be honest, warm, and specific.`,
    prompt2: (name, sun, moon, today, extra) =>
      `Today is ${today}. Describe the current Venus and relationship energy in the sky. Then connect this to the connection between ${name} (${sun} Sun, ${moon} Moon) and ${extra || 'their person'}. How is today's energy affecting this relationship? Give 1-2 concrete things ${name} can do to nurture or navigate this connection today.`,
  },
  shadow: {
    section1Label: 'Your Shadow & Hidden Gifts',
    section2Label: 'Shadow work invitation today',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s shadow — the unconscious patterns, suppressed traits, and hidden gifts that live in the darker corners of their chart based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What do they tend to project onto others? What part of themselves are they still learning to integrate? Be courageous, compassionate, and ultimately empowering.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current Pluto, Scorpio, and 12th house energy active in the collective. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. What shadow material might be surfacing for ${name} today, and what is the invitation in it? Give them one concrete shadow work reflection or practice.`,
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
  const err = document.getElementById('errorMsg') || document.getElementById('homeErrorMsg');
  err.className = 'error';

  // --- 3. Make sure required fields are filled in ---
  if (!name || !birthDate || !birthCity) {
    err.textContent = 'Please fill in your name, birth date, and birth city.';
    err.className = 'error active';
    return;
  }

  // --- 3b. Gate topic-specific readings behind subscription ---
  if (selectedTopic !== 'chart' && !requireSubscription()) return;

  // --- 4. Calculate the three placements from astrology.js ---
  const bd    = new Date(birthDate + 'T12:00:00');
  const month = bd.getMonth() + 1;
  const day   = bd.getDate();

  // Use manually entered signs if provided, otherwise calculate server-side
  const manualSun    = document.getElementById('sunSign').value;
  const manualMoon   = document.getElementById('moonSign').value;
  const manualRising = document.getElementById('risingSign').value;

  let sun    = manualSun    || null;
  let moon   = manualMoon   || null;
  let rising = manualRising || null;

  if (!sun || !moon || (!rising && birthTime)) {
    try {
      const chartRes = await fetch('/api/calculate-chart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ birthDate, birthTime, birthCity }),
      });
      if (chartRes.ok) {
        const chart = await chartRes.json();
        if (!sun)    sun    = chart.sun;
        if (!moon)   moon   = chart.moon;
        if (!rising) rising = chart.rising;
      }
    } catch (_) {
      // Fallback to client-side estimates
      if (!sun)  sun  = SIGNS[getSunSign(month, day)];
      if (!moon) moon = SIGNS[estimateMoonSign(bd)];
    }
  }

  // --- 5. Save birth info immediately (don't wait for reading to complete) ---
  saveProfile();

  // --- 6. Show the loading spinner, hide the form ---
  document.getElementById('inputCard').style.display  = 'none';
  document.getElementById('homeSection').style.display = 'none';
  document.getElementById('loading').className = 'loading active';

  const LOADING_MSGS = [
    'Reading the stars…',
    'Consulting the planets…',
    'Mapping your cosmos…',
    'Listening to the sky…',
    'Tracing your chart…',
    'The universe is speaking…',
    'Aligning the celestial spheres…',
    'Decoding your blueprint…',
  ];
  let msgIndex = 0;
  const loadingMsg = document.getElementById('loadingMsg');
  loadingMsg.textContent = LOADING_MSGS[Math.floor(Math.random() * LOADING_MSGS.length)];
  const msgInterval = setInterval(() => {
    loadingMsg.style.opacity = 0;
    setTimeout(() => {
      msgIndex = (msgIndex + 1) % LOADING_MSGS.length;
      loadingMsg.textContent = LOADING_MSGS[msgIndex];
      loadingMsg.style.opacity = 1;
    }, 300);
  }, 2500);

  // --- 6. Build the prompt that gets sent to Claude ---
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const topic = TOPIC_CONFIG[selectedTopic];
  const style = STYLE_CONFIG[selectedStyle];

  // Read partner info for compatibility topic
  const partnerEl = [...document.querySelectorAll('.partner-input-field')].find(el => el.offsetParent !== null);
  const partnerInfo = partnerEl ? partnerEl.value.trim() : '';

  const prompt = `${style.system}

The user's name is ${name}.
Sun sign: ${sun}
Moon sign: ${moon}
${rising ? `Rising sign: ${rising}` : 'Rising sign: unknown (no birth time provided)'}
Birth city: ${birthCity}
Today's date: ${today}

Write two sections separated by the exact delimiter "---TRANSITS---":

SECTION 1 — CHART READING (2 paragraphs max):
${topic.prompt1(name, sun, moon, rising, partnerInfo)}

SECTION 2 — TODAY (1–2 paragraphs max):
${topic.prompt2(name, sun, moon, today, partnerInfo)}

Be concise and potent — every sentence should land. No filler. No bullet points. No headers. Just paragraphs.`;

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
      { label: 'Sun',    value: sun },
      { label: 'Moon',   value: moon },
      { label: 'Rising', value: rising || '—' }
    ].map(p => `
      <div class="placement-card">
        <div class="placement-label">${p.label}</div>
        <div class="placement-value">${p.value}</div>
      </div>
    `).join('');

    document.getElementById('placements').innerHTML = placementsHTML;

    // --- 10. Fill in the reading text ---
    document.getElementById('resultName').textContent     = name + "'s";
    document.getElementById('chartReading').textContent   = parts[0].trim();
    document.getElementById('transitReading').textContent = (parts[1] || '').trim();
    document.getElementById('todayDate').textContent      = today;
    document.querySelector('#results .section-label').textContent       = topic.section1Label;
    document.querySelector('.today-card .section-label').textContent    = topic.section2Label;

    // --- 11. Hide loading, show results ---
    clearInterval(msgInterval);
    document.getElementById('loading').className  = 'loading';
    document.getElementById('results').className  = 'results card active';

  } catch (e) {
    // --- 12. If something went wrong, show an error ---
    clearInterval(msgInterval);
    document.getElementById('loading').className     = 'loading';
    document.getElementById('inputCard').style.display = 'block';
    err.textContent = 'Something went wrong. Please try again.';
    err.className   = 'error active';
  }
}


// ------------------------------------------------------------
// GO HOME — runs when the user clicks "← Home"
// ------------------------------------------------------------
function goHome() {
  document.getElementById('results').className = 'results card';
  // Reset topic pills to Full Chart
  selectedTopic = 'chart';
  document.querySelectorAll('.topic-pill').forEach((p, i) => {
    p.classList.toggle('active', i === 0);
  });
  showHome();
}
