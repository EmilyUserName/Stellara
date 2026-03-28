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
// BIRTH TIME — populate hour/minute selects in 24-hour format
// and expose getBirthTime() for the rest of the app to use.
// ------------------------------------------------------------
(function () {
  const hourSel = document.getElementById('birthHour');
  const minSel  = document.getElementById('birthMinute');
  if (!hourSel || !minSel) return;

  for (let h = 0; h < 24; h++) {
    const opt  = document.createElement('option');
    const hStr = String(h).padStart(2, '0');
    opt.value       = hStr;
    opt.textContent = h === 0 ? '00 — midnight' : h === 12 ? '12 — noon' : hStr;
    hourSel.appendChild(opt);
  }

  for (let m = 0; m < 60; m++) {
    const opt  = document.createElement('option');
    opt.value       = String(m).padStart(2, '0');
    opt.textContent = String(m).padStart(2, '0');
    minSel.appendChild(opt);
  }
})();

// ------------------------------------------------------------
// BIRTH DATE — MM / DD / YYYY text inputs with auto-advance.
// getBirthDate() returns "YYYY-MM-DD" or "".
// ------------------------------------------------------------
(function () {
  const mEl = document.getElementById('birthMonth');
  const dEl = document.getElementById('birthDay');
  const yEl = document.getElementById('birthYear');
  if (!mEl || !dEl || !yEl) return;

  // Auto-advance: jump to next field when enough digits entered
  mEl.addEventListener('input', () => { if (mEl.value.length >= 2) dEl.focus(); });
  dEl.addEventListener('input', () => { if (dEl.value.length >= 2) yEl.focus(); });
})();

function getBirthDate() {
  const m = document.getElementById('birthMonth')?.value;
  const d = document.getElementById('birthDay')?.value;
  const y = document.getElementById('birthYear')?.value;
  if (!m || !d || !y || y.length < 4) return '';
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function getBirthTime() {
  const h = document.getElementById('birthHour')?.value;
  const m = document.getElementById('birthMinute')?.value;
  return (h && m) ? `${h}:${m}` : '';
}


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

const FREE_STYLES = ['psychological'];

function selectStyle(el) {
  const hasAnyPaid = currentSubscribed || currentHasNatal || currentHasAstro || currentSolarReturnYear;
  if (!FREE_STYLES.includes(el.dataset.style) && !hasAnyPaid) { openUpgradeModal(); return; }
  document.querySelectorAll(`[data-style="${el.dataset.style}"]`).forEach(c => c.classList.add('active'));
  document.querySelectorAll(`.style-card:not([data-style="${el.dataset.style}"])`).forEach(c => c.classList.remove('active'));
  selectedStyle = el.dataset.style;
}


// ------------------------------------------------------------
// TOPIC SELECTION — tracks which focus pill is active
// ------------------------------------------------------------
let selectedTopic = 'daily';

const FREE_TOPICS = ['birthday'];

function selectTopic(el) {
  if (!el) return;
  const topic = el.dataset.topic;
  // If it's a Pro topic and user isn't subscribed, open upgrade flow immediately
  if (!FREE_TOPICS.includes(topic) && topic !== 'chart') {
    if (!currentUser) { openAuthModal(); return; }
    if (!currentSubscribed) { openUpgradeModal(); return; }
  }
  document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedTopic = topic;
  // Show partner input only for compatibility
  document.querySelectorAll('.partner-input').forEach(d => {
    d.style.display = selectedTopic === 'compatibility' ? 'block' : 'none';
  });
}

const TOPIC_CONFIG = {
  chart: {
    mode: 'chart',
    displayName: 'Birth Chart',
    section1Label: 'Your Cosmic Blueprint',
    maxTokens: 2200,
    prompt1: (name, sun, moon, rising) =>
      `Write ${name}'s full Natal Birth Chart reading. This is a paid, comprehensive reading — it should feel thorough, personal, and genuinely revelatory. Not a sun-sign horoscope. A real chart interpretation.

${name}'s placements:
Sun: ${sun}
Moon: ${moon}
${rising ? `Rising: ${rising}` : 'Rising: unknown (no birth time provided)'}

Write exactly 6 sections using the titles below, each on its own line in ALL CAPS, followed immediately by the reading text. No bullet points. No markdown. Plain paragraphs only. Every sentence should earn its place.

CORE IDENTITY
Who is ${name} at their essence? Synthesize the Sun${rising ? ', Rising' : ''}, and Moon into a coherent portrait of their character — how they move through the world, what drives them at their core, how they experience themselves. 2–3 paragraphs.

EMOTIONAL WORLD
${name}'s inner life, instincts, and emotional needs as revealed by their ${moon} Moon. How do they process feeling? What makes them feel safe, nourished, and at home? What does their inner world actually look like — the private self almost no one sees? 2 paragraphs.

LOVE & RELATIONSHIPS
What does ${name} bring to love, and what do they need in return? How does their chart shape their relational style — the way they attach, the patterns they fall into, what they're drawn to and why? Be honest and specific. 2 paragraphs.

WORK & PURPOSE
What does ${name}'s chart reveal about their vocation, creative drive, and sense of purpose? Where do they thrive? What kind of work lights them up? What are they here to build or contribute? 2 paragraphs.

GIFTS & EDGES
What are ${name}'s greatest strengths — the qualities written into their chart that are genuinely exceptional? And what are the edges — the patterns or tendencies that might hold them back if left unconscious? Be direct and compassionate. 2 paragraphs.

A WORD TO CARRY
A closing reflection — 2 to 3 sentences ${name} can return to. Something that captures the essence of what their chart is asking of them in this life. Make it land.`,
  },
  birthday: {
    mode: 'chart',
    displayName: 'Solar Return Reading',
    section1Label: 'Your New Year in the Stars',
    prompt1: (name, sun, moon, rising) =>
      `Today is ${name}'s birthday — their Solar Return. The Sun has completed its full journey and returned to the exact degree it occupied the moment they were born. Write ${name} a deeply personal birthday reading. What chapter is closing and what is opening? Based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}, what are the defining themes, gifts, and growth edges of this new year of their life? What is the cosmos asking of them in this next orbit? Make this feel like a genuine cosmic gift — honest, warm, and full of insight that only their chart could reveal. Speak to the magic of this specific moment.`,
  },
  daily: {
    mode: 'daily',
    displayName: "Today's Sky",
    section2Label: "Today's cosmic weather for you",
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Give ${name} (${sun} Sun, ${moon} Moon) their personal daily reading. Describe the most significant planetary energy active today — the Moon's sign and phase, any major aspects or movements worth noting. Invent plausible but grounded transit themes for today. Then make it personal: how does today's cosmic weather interact with ${name}'s chart specifically? What is today asking of them? What should they lean into, and what should they move through carefully? Fresh, direct, potent. 2 paragraphs max.`,
  },
  love: {
    displayName: 'Love Reading',
    section1Label: 'Your Heart & Relational Style',
    section2Label: 'Love energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s approach to love, relationships, and intimacy based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore how they give and receive love, what they need from a partner, their attachment style, and patterns they may repeat. Be psychologically honest and compassionate.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe what the current planetary energy means for love and relationships — focus on Venus, Mars, and the Moon's movements. Then connect this specifically to how ${name}'s ${sun} Sun and ${moon} Moon are being activated. Give 1-2 concrete things they can do or watch out for in their relationships today.`,
  },
  career: {
    displayName: 'Career Reading',
    section1Label: 'Your Purpose & Ambition',
    section2Label: 'Career energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s career, life purpose, and ambition based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What drives them professionally? What kind of work fulfills them? What are their natural strengths and potential blind spots in a career context? Where are they being called to grow?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around work and ambition — focus on Saturn, Mars, Mercury, and the Sun's movements. Then connect this specifically to ${name}'s ${sun} Sun and ${moon} Moon. Give 1-2 concrete actions or awarenesses for their professional life today.`,
  },
  finances: {
    displayName: 'Finances Reading',
    section1Label: 'Your Relationship with Abundance',
    section2Label: 'Financial energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s relationship with money, resources, and material security based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore their values around wealth, how they earn and spend, what abundance means to them at a deeper level, and any patterns around scarcity or generosity to be aware of.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around finances and material decisions — focus on Venus, Jupiter, and Saturn movements. Then connect this to how ${name}'s ${sun} Sun and ${moon} Moon are being influenced. Give 1-2 concrete financial insights or awarenesses for today.`,
  },
  health: {
    displayName: 'Health & Wellbeing',
    section1Label: 'Your Body, Mind & Rhythms',
    section2Label: 'Wellbeing energy in the sky today',
    prompt1: (name, sun, moon, rising) =>
      `Focus entirely on ${name}'s health, wellbeing, and daily rhythms based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Explore their physical and emotional needs, how stress shows up in their body, what restores them, and the connection between their inner world and physical vitality. Be holistic and grounded.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current planetary energy around health and wellbeing — focus on the Moon, Mars, and Chiron movements. Then connect this to how ${name}'s ${sun} Sun and ${moon} Moon are being influenced. Give 1-2 concrete things they can do today to support their body and mind.`,
  },
  thisMonth: {
    displayName: 'Monthly Forecast',
    section1Label: 'Your Monthly Forecast',
    section2Label: 'Key themes and dates this month',
    prompt1: (name, sun, moon, rising) =>
      `Write a monthly forecast for ${name} based on their ${sun} Sun, ${moon} Moon${rising ? `, and ${rising} Rising` : ''}. What are the dominant themes this month? What areas of life are being activated? What is the overarching invitation of this month for ${name} specifically?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Based on this month's planetary movements — including any retrogrades, sign changes, or lunations — describe the key energetic phases of this month and how they interact with ${name}'s ${sun} Sun and ${moon} Moon. Give 2-3 specific things to lean into or be aware of this month.`,
  },
  communication: {
    displayName: 'Communication Reading',
    section1Label: 'Your Mind & Voice',
    section2Label: 'Communication energy today',
    prompt1: (name, sun, moon, rising) =>
      `Focus on how ${name} thinks, communicates, and is perceived by others based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. How do they process information? What is their natural communication style? How do they come across to others, and where might there be a gap between how they intend to be heard and how they actually land?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe today's Mercury and Air sign energy and how it affects communication, thinking, and expression. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. Give 1-2 specific communication tips or awarenesses for ${name} today.`,
  },
  innerWorld: {
    displayName: 'Inner World Reading',
    section1Label: 'Your Inner Landscape',
    section2Label: 'What\'s stirring within today',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s inner emotional world, subconscious patterns, and hidden drives based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What do they need to feel emotionally safe? What patterns live beneath the surface? What does their inner child long for? Be tender and psychologically deep.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the Moon's current phase and sign, and what emotional undercurrents are active in the collective. Then speak to how this is landing specifically in ${name}'s inner world given their ${sun} Sun and ${moon} Moon. What is being stirred, and what might they need today?`,
  },
  energy: {
    displayName: 'Energy & Timing',
    section1Label: 'Your Natural Energy & Timing',
    section2Label: 'Today\'s energy forecast for you',
    prompt1: (name, sun, moon, rising) =>
      `Describe ${name}'s natural energy rhythms and relationship with time based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. Are they a sprinter or a marathon runner? When do they do their best work? What drains them and what replenishes them? How should they structure their life to work with — not against — their natural cycles?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe today's overall cosmic energy level — is it a day for action, rest, reflection, or connection? Ground this in the current Mars, Sun, and Moon positions. Then tell ${name} specifically what kind of day today is for them given their ${sun} Sun and ${moon} Moon, and how to use the energy wisely.`,
  },
  travel: {
    displayName: 'Travel Reading',
    section1Label: 'Your Adventure & Wanderlust',
    section2Label: 'Expansion energy right now',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s relationship with travel, adventure, and the world beyond their comfort zone based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What draws them when they travel? What kind of experiences feed their soul — deep immersion, cultural exploration, spontaneous adventure, or spiritual pilgrimage? Where in the world might call to them?`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the current Jupiter and Sagittarius energy around expansion, travel, and new horizons. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. Is now a time to plan, to go, or to explore closer to home? Give ${name} 1-2 concrete ideas for expanding their world right now.`,
  },
  spiritual: {
    displayName: 'Spiritual Path Reading',
    section1Label: 'Your Soul\'s Path',
    section2Label: 'Spiritual currents today',
    prompt1: (name, sun, moon, rising) =>
      `Explore ${name}'s spiritual nature, soul purpose, and karmic path based on their ${sun} Sun and ${moon} Moon${rising ? ` and ${rising} Rising` : ''}. What are they here to learn? What spiritual gifts do they carry? What keeps pulling them back to growth even when it's uncomfortable? Speak to the deeper "why" behind their life.`,
    prompt2: (name, sun, moon, today) =>
      `Today is ${today}. Describe the spiritual and cosmic undercurrents active today — focus on Neptune, Chiron, and the Moon's influence. Then connect this to ${name}'s ${sun} Sun and ${moon} Moon. What is the universe asking of ${name} spiritually today? Give them one meaningful practice or awareness to carry.`,
  },
  compatibility: {
    displayName: 'Compatibility Reading',
    section1Label: 'Your Cosmic Connection',
    section2Label: 'The energy between you today',
    prompt1: (name, sun, moon, rising, extra) =>
      `Explore the compatibility between ${name} (${sun} Sun, ${moon} Moon${rising ? `, ${rising} Rising` : ''}) and ${extra || 'their person'}. What is the natural dynamic between these energies? Where do they complement each other beautifully? Where might friction arise, and what is that friction here to teach? Be honest, warm, and specific.`,
    prompt2: (name, sun, moon, today, extra) =>
      `Today is ${today}. Describe the current Venus and relationship energy in the sky. Then connect this to the connection between ${name} (${sun} Sun, ${moon} Moon) and ${extra || 'their person'}. How is today's energy affecting this relationship? Give 1-2 concrete things ${name} can do to nurture or navigate this connection today.`,
  },
  shadow: {
    displayName: 'Shadow Work Reading',
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
  const birthDate = getBirthDate();
  const birthTime = getBirthTime();
  const birthCity = document.getElementById('birthCity').value.trim();

  // --- 2. Clear any previous error message ---
  const err = document.getElementById('errorMsg') || document.getElementById('homeErrorMsg');
  err.className = 'error';

  // --- 3. Make sure required fields are filled in ---
  if (!name || !birthDate || !birthCity) {
    // No birth details saved yet — send them to the form
    showForm();
    return;
  }

  // --- 3b. Gate topic-specific readings ---
  // Full Chart = $19 natal chart purchase
  // All other topics (except birthday) = $12/mo Pro subscription
  if (selectedTopic === 'chart' && !requireNatalChart()) return;
  if (!['chart', 'birthday'].includes(selectedTopic) && !requireSubscription()) return;

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

  // Also persist calculated signs so future emails don't recalculate
  // (only save if not manually overridden — overrides are already saved by saveProfile)
  if (currentUser) {
    const patch = {};
    if (!manualSun    && sun)    patch.sun_sign    = sun;
    if (!manualMoon   && moon)   patch.moon_sign   = moon;
    if (!manualRising && rising) patch.rising_sign = rising;
    if (Object.keys(patch).length) {
      sb.from('profiles').update(patch).eq('id', currentUser.id).then(() => {});
    }
  }

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
  const mode  = topic.mode || 'both';
  const style = STYLE_CONFIG[selectedStyle];

  // Read partner info for compatibility topic
  const homeVisible = document.getElementById('partnerInputHome')?.style.display !== 'none';
  const nameId  = homeVisible ? 'partnerNameHome'  : 'partnerNameCard';
  const signId  = homeVisible ? 'partnerSignHome'  : 'partnerSignCard';
  const partnerName = (document.getElementById(nameId)?.value || '').trim();
  const partnerSign = (document.getElementById(signId)?.value || '').trim();
  const partnerInfo = [partnerName, partnerSign].filter(Boolean).join(', ');

  const userContext = `The user's name is ${name}.
Sun sign: ${sun}
Moon sign: ${moon}
${rising ? `Rising sign: ${rising}` : 'Rising sign: unknown (no birth time provided)'}
Birth city: ${birthCity} (this is where they were born, not necessarily where they live now — do not make assumptions about their current location)`;

  // When no birth time was given, ask Claude to be honest about it in the reading
  const noTimeNote = !birthTime
    ? `\n\nNote: ${name} did not provide a birth time, so their Rising sign cannot be calculated. Weave this into your reading naturally and honestly — briefly acknowledge that without a birth time the Rising sign is unknown, and let the depth of the reading rest on their Sun and Moon combination instead. Don't dwell on it, just be transparent.`
    : '';

  let prompt;
  if (mode === 'chart') {
    prompt = `${style.system}

${userContext}

${topic.prompt1(name, sun, moon, rising, partnerInfo)}${noTimeNote}

Be concise and potent — every sentence should land. No filler. No bullet points. No headers. Just paragraphs.`;
  } else if (mode === 'daily') {
    prompt = `${style.system}

${userContext}
Today's date: ${today}

${topic.prompt2(name, sun, moon, today, partnerInfo)}${noTimeNote}

Be concise and potent — every sentence should land. No filler. No bullet points. No headers. Just paragraphs.`;
  } else {
    prompt = `${style.system}

${userContext}
Today's date: ${today}

Write two sections separated by the exact delimiter "---TRANSITS---":

SECTION 1 — CHART READING (2 paragraphs max):
${topic.prompt1(name, sun, moon, rising, partnerInfo)}

SECTION 2 — TODAY (1–2 paragraphs max):
${topic.prompt2(name, sun, moon, today, partnerInfo)}${noTimeNote}

Be concise and potent — every sentence should land. No filler. No bullet points. No headers. Just paragraphs.`;
  }

  // --- 7. Send the prompt to our serverless function ---
  // (horoscope.js in netlify/functions — that's what holds the API key safely)
  try {
    const response = await fetch("/api/horoscope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        maxTokens: topic.maxTokens || 900,
      })
    });

    // --- 8. Parse the response from Claude ---
    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');

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
    document.getElementById('resultName').textContent   = name + "'s";
    document.getElementById('resultTopic').textContent  = topic.displayName;
    document.getElementById('todayDate').textContent    = today;

    const chartSection = document.getElementById('chartSection');
    const divider      = document.querySelector('#results .divider');
    const todayCard    = document.querySelector('.today-card');

    if (mode === 'chart') {
      chartSection.style.display = 'block';
      chartSection.querySelector('.section-label').textContent = topic.section1Label;
      divider.style.display   = 'none';
      todayCard.style.display = 'none';

      const CHART_SECTIONS = ['CORE IDENTITY', 'EMOTIONAL WORLD', 'LOVE & RELATIONSHIPS', 'WORK & PURPOSE', 'GIFTS & EDGES', 'A WORD TO CARRY'];
      const readingEl = document.getElementById('chartReading');

      // Try to parse sections; fall back to plain text if format is unexpected
      let parsedHTML = '';
      let remaining = text.trim();
      let foundAny = false;
      CHART_SECTIONS.forEach((section, i) => {
        const next = CHART_SECTIONS[i + 1];
        const start = remaining.indexOf(section);
        if (start === -1) return;
        foundAny = true;
        const end = next ? remaining.indexOf(next, start + section.length) : remaining.length;
        const content = remaining.slice(start + section.length, end).trim();
        parsedHTML += `<div class="chart-section">
          <div class="chart-section-label">${section}</div>
          <div class="chart-section-body">${content.split('\n\n').filter(Boolean).map(p => `<p>${p.trim()}</p>`).join('')}</div>
        </div>`;
      });

      readingEl.innerHTML = foundAny ? parsedHTML : `<p>${remaining}</p>`;
    } else if (mode === 'daily') {
      chartSection.style.display = 'none';
      divider.style.display      = 'none';
      todayCard.style.display    = 'block';
      todayCard.querySelector('.section-label').textContent = topic.section2Label;
      document.getElementById('transitReading').textContent = text.trim();
    } else {
      const parts = text.split('---TRANSITS---');
      chartSection.style.display = 'block';
      chartSection.querySelector('.section-label').textContent = topic.section1Label;
      document.getElementById('chartReading').textContent = parts[0].trim();
      divider.style.display   = 'block';
      todayCard.style.display = 'block';
      todayCard.querySelector('.section-label').textContent = topic.section2Label;
      document.getElementById('transitReading').textContent = (parts[1] || '').trim();
    }

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


// ------------------------------------------------------------
// BIRTH CITY AUTOCOMPLETE
// Debounced search → dropdown of "City, State, Country" options
// so users always pick an unambiguous location.
// ------------------------------------------------------------
(function () {
  let debounceTimer = null;
  let skipNext = false; // prevent re-triggering after programmatic value set

  const input = document.getElementById('birthCity');
  if (!input) return;

  // Create and position the dropdown
  const wrap = input.parentNode;
  wrap.style.position = 'relative';
  const dropdown = document.createElement('div');
  dropdown.className = 'city-dropdown';
  wrap.appendChild(dropdown);

  input.addEventListener('input', () => {
    if (skipNext) { skipNext = false; return; }
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { closeDropdown(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 350);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) closeDropdown();
  });

  async function fetchSuggestions(q) {
    try {
      const res = await fetch(`/api/geocode?city=${encodeURIComponent(q)}&autocomplete=true`);
      if (!res.ok) { closeDropdown(); return; }
      const results = await res.json();
      renderDropdown(results);
    } catch (_) { closeDropdown(); }
  }

  // Build "City, State, Country" from Nominatim address object
  function formatPlace(addr) {
    const city    = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state   = addr.state || addr.region || '';
    const country = addr.country || '';
    return [city, state, country].filter(Boolean).join(', ');
  }

  function renderDropdown(results) {
    dropdown.innerHTML = '';
    const seen = new Set();
    results.forEach(r => {
      const label = formatPlace(r.address);
      if (!label || seen.has(label)) return;
      seen.add(label);
      const item = document.createElement('div');
      item.className = 'city-dropdown-item';
      item.textContent = label;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input
        skipNext = true;
        input.value = label;
        // Cache coordinates so calculate-chart can skip re-geocoding
        input.dataset.lat = r.lat;
        input.dataset.lon = r.lon;
        closeDropdown();
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.toggle('active', dropdown.children.length > 0);
  }

  function closeDropdown() {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
  }
})();


// ------------------------------------------------------------
// SOLAR RETURN LOCATION AUTOCOMPLETE
// Same debounced geocode behaviour as birthCity, but for the
// setup modal's solarLocation field.
// ------------------------------------------------------------
(function () {
  let debounceTimer = null;
  let skipNext = false;

  const input    = document.getElementById('solarLocation');
  const dropdown = document.getElementById('solarLocationSuggestions');
  if (!input || !dropdown) return;

  // dropdown is position:absolute — needs a positioned ancestor
  input.parentNode.style.position = 'relative';

  input.addEventListener('input', () => {
    if (skipNext) { skipNext = false; return; }
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { closeDropdown(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 350);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && !dropdown.contains(e.target)) closeDropdown();
  });

  async function fetchSuggestions(q) {
    try {
      const res = await fetch(`/api/geocode?city=${encodeURIComponent(q)}&autocomplete=true`);
      if (!res.ok) { closeDropdown(); return; }
      const results = await res.json();
      renderDropdown(results);
    } catch (_) { closeDropdown(); }
  }

  function formatPlace(addr) {
    const city    = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state   = addr.state || addr.region || '';
    const country = addr.country || '';
    return [city, state, country].filter(Boolean).join(', ');
  }

  function renderDropdown(results) {
    dropdown.innerHTML = '';
    const seen = new Set();
    results.forEach(r => {
      const label = formatPlace(r.address);
      if (!label || seen.has(label)) return;
      seen.add(label);
      const item = document.createElement('div');
      item.className = 'city-dropdown-item';
      item.textContent = label;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        skipNext = true;
        input.value = label;
        input.dataset.lat = r.lat;
        input.dataset.lon = r.lon;
        closeDropdown();
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.toggle('active', dropdown.children.length > 0);
  }

  function closeDropdown() {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
  }
})();


// ------------------------------------------------------------
// SHARE — native share sheet on mobile, clipboard fallback on desktop
// ------------------------------------------------------------
async function shareStellara() {
  const shareData = {
    title: 'Stellara',
    text: 'Get a personalized astrology reading based on your birth chart — not just your sign.',
    url:  'https://stellara-horoscope.com',
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText('https://stellara-horoscope.com');
      const btn = document.querySelector('.share-btn');
      const orig = btn.textContent;
      btn.textContent = 'Link copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  } catch (_) {}
}


// ------------------------------------------------------------
// MANAGE SUBSCRIPTION — Stripe customer portal
// ------------------------------------------------------------
async function manageSubscription() {
  try {
    const res  = await fetch('/api/customer-portal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: currentUser.id }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Unable to open subscription portal. Please contact support.');
    }
  } catch (err) {
    alert('Unable to reach the subscription portal. Please try again.');
  }
}


// ------------------------------------------------------------
// ADD TO HOME SCREEN — custom install prompt
// ------------------------------------------------------------
let installPromptEvent = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPromptEvent = e;
  showInstallBanner('android');
});

function showInstallBanner(type) {
  if (localStorage.getItem('installBannerDismissed')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.getElementById('installBanner');
  const msg    = document.getElementById('installBannerMsg');
  const btn    = document.getElementById('installBtn');

  if (type === 'ios') {
    msg.textContent = 'Add Stellara to your home screen: tap Share then "Add to Home Screen."';
    btn.style.display = 'none';
  }
  banner.style.display = 'flex';
}

function installApp() {
  if (installPromptEvent) {
    installPromptEvent.prompt();
    installPromptEvent.userChoice.then(() => { installPromptEvent = null; });
  }
  dismissInstallBanner();
}

function dismissInstallBanner() {
  document.getElementById('installBanner').style.display = 'none';
  localStorage.setItem('installBannerDismissed', '1');
}

// Detect iOS Safari and show manual instructions
(function () {
  const isIOS    = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && isSafari && !isStandalone) showInstallBanner('ios');
})();


// ------------------------------------------------------------
// BIRTHDAY EXPERIENCE
// Called from auth.js when the user's birth month+day matches today.
// ------------------------------------------------------------
function triggerBirthdayExperience(name) {
  // Swap welcome text
  const welcomeEl = document.querySelector('.welcome-text');
  if (welcomeEl) welcomeEl.style.display = 'none';

  // Show birthday banner
  document.getElementById('birthdayBanner').style.display = 'block';
  document.getElementById('birthdayName').textContent = name;

  // Pre-select the birthday/solar return topic
  selectedTopic = 'birthday';
  document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));

  // Update the reveal button label
  const btn = document.querySelector('#homeSection .btn');
  if (btn) btn.textContent = '✦  Reveal My Solar Return Reading';

  // Confetti — Stellara gold & blue palette, two waves
  const COLORS = ['#c8a96e', '#d4b97e', '#7ea8d4', '#a8c4e0', '#f5f8ff'];

  function burst(opts) {
    confetti({ colors: COLORS, ...opts });
  }

  // First wave — upward fountain from center
  burst({ particleCount: 80,  spread: 70,  origin: { x: 0.5, y: 0.6 }, startVelocity: 55 });
  burst({ particleCount: 40,  spread: 120, origin: { x: 0.5, y: 0.6 }, startVelocity: 35, scalar: 1.2 });

  // Second wave after a beat — from the sides
  setTimeout(() => {
    burst({ particleCount: 60, angle: 60,  spread: 55, origin: { x: 0, y: 0.65 }, startVelocity: 60 });
    burst({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, startVelocity: 60 });
  }, 600);

  // Third wave — gentle shimmer finishing touch
  setTimeout(() => {
    burst({ particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.5 }, startVelocity: 20, gravity: 0.5, scalar: 0.8, ticks: 300 });
  }, 1400);
}

// ============================================================
// FEEDBACK
// ============================================================
function openFeedback() {
  document.getElementById('feedbackText').value = '';
  document.getElementById('feedbackStatus').textContent = '';
  document.getElementById('feedbackBackdrop').style.display = 'block';
  document.getElementById('feedbackModal').style.display = 'block';
  setTimeout(() => document.getElementById('feedbackText').focus(), 50);
}

function closeFeedback() {
  document.getElementById('feedbackBackdrop').style.display = 'none';
  document.getElementById('feedbackModal').style.display = 'none';
}

async function submitFeedback() {
  const text = document.getElementById('feedbackText').value.trim();
  const status = document.getElementById('feedbackStatus');
  if (!text) { status.style.color = '#e74c3c'; status.textContent = 'Please write something first.'; return; }

  status.style.color = 'var(--silver)';
  status.textContent = 'Sending…';

  const name  = document.getElementById('name')?.value?.trim() || '';
  const email = currentUser?.email || '';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, text }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    status.style.color = '#2ecc71';
    status.textContent = 'Thank you! We really appreciate it. ✦';
    document.getElementById('feedbackText').value = '';
    setTimeout(closeFeedback, 2200);
  } catch (err) {
    status.style.color = '#e74c3c';
    status.textContent = 'Something went wrong. Please try again.';
  }
}

// ============================================================
// FREE DAILY HOROSCOPES — landing page, no login required
// ============================================================
let _freeHoroscopes = null; // cached for the session

const SIGN_NAMES = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};

const SIGN_SYMBOLS = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍',
  libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sign-pill').forEach(btn => {
    btn.addEventListener('click', () => selectSign(btn.dataset.sign, btn.dataset.target));
  });
});

async function selectSign(sign, target) {
  // target = 'home' for logged-in section, undefined/null for landing
  const suffix    = target === 'home' ? 'Home' : '';
  const readingEl = document.getElementById('freeHoroscopeReading' + suffix);
  const textEl    = document.getElementById('freeHoroscopeText' + suffix);
  const nameEl    = document.getElementById('freeHoroscopeSignName' + suffix);
  const loadingEl = document.getElementById('freeHoroscopeLoading' + suffix);

  // Highlight active pill within the same group
  const container = target === 'home'
    ? document.getElementById('freeHoroscopeSignsHome')
    : document.getElementById('freeHoroscopeSigns');
  container.querySelectorAll('.sign-pill').forEach(b => b.classList.toggle('active', b.dataset.sign === sign));

  readingEl.style.display = 'none';
  loadingEl.style.display = 'block';

  if (!_freeHoroscopes) {
    try {
      const res  = await fetch('/api/daily-horoscopes');
      const data = await res.json();
      if (data && data[sign]) _freeHoroscopes = data;
    } catch (e) {
      loadingEl.style.display = 'none';
      return;
    }
  }

  loadingEl.style.display = 'none';
  if (!_freeHoroscopes?.[sign]) return;

  nameEl.textContent      = `${SIGN_SYMBOLS[sign]} ${SIGN_NAMES[sign]}`;
  textEl.textContent      = _freeHoroscopes[sign];
  readingEl.style.display = 'block';
}

// ============================================================
// BUNDLE MODAL
// ============================================================
function openBundleModal() {
  if (!requireAuth()) return;
  document.getElementById('bundleUpgradeOverlay').classList.add('active');
}
function closeBundleUpgradeModal() {
  document.getElementById('bundleUpgradeOverlay').classList.remove('active');
}

// ============================================================
// NATAL CHART — dedicated button on home screen
// ============================================================
function openNatalChart() {
  if (!requireAuth()) return;
  if (currentHasNatal) {
    // Already purchased — generate their chart reading
    selectedTopic = 'chart';
    reveal();
  } else {
    openNatalUpgradeModal();
  }
}

// ============================================================
// SOLAR RETURN
// ============================================================
function openSolarReturn() {
  if (!requireAuth()) return;
  if (!requireSolarReturn()) return;

  // Pre-fill year with current year
  document.getElementById('solarYear').value = new Date().getFullYear();
  document.getElementById('solarLocation').value = '';
  document.getElementById('solarSetupOverlay').classList.add('active');
}

function closeSolarSetup() {
  document.getElementById('solarSetupOverlay').classList.remove('active');
}

function submitSolarSetup() {
  const year     = parseInt(document.getElementById('solarYear').value);
  const location = document.getElementById('solarLocation').value.trim();

  if (!year || year < 1950 || year > 2050) {
    alert('Please enter a valid year.');
    return;
  }
  if (!location) {
    alert('Please enter the city where you were (or will be) on your birthday.');
    return;
  }

  closeSolarSetup();
  loadSolarReturn(year, location);
}

function loadSolarReturn(year, location) {
  document.getElementById('solarReturnYearTitle').textContent = year;
  document.querySelector('.container').style.display = 'none';
  document.getElementById('solarSection').style.display = 'block';
  document.getElementById('solarLoading').style.display = 'block';
  document.getElementById('solarReadingBody').style.display = 'none';

  fetch('/api/solar-return', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, year, returnLocation: location }),
  })
    .then(r => r.json())
    .then(data => {
      document.getElementById('solarLoading').style.display = 'none';
      if (data.reading) {
        renderSolarReading(data.reading, year);
      } else {
        document.getElementById('solarReadingBody').innerHTML =
          '<p style="color:#e74c3c;text-align:center;">Could not load your reading. Please try again.</p>';
        document.getElementById('solarReadingBody').style.display = 'block';
      }
    })
    .catch(err => {
      console.error('[Solar] fetch error:', err);
      document.getElementById('solarLoading').style.display = 'none';
      document.getElementById('solarReadingBody').innerHTML =
        '<p style="color:#e74c3c;text-align:center;">Something went wrong. Please try again.</p>';
      document.getElementById('solarReadingBody').style.display = 'block';
    });
}

function closeSolarReturn() {
  document.getElementById('solarSection').style.display = 'none';
  document.querySelector('.container').style.display = 'block';
}

const SOLAR_SECTIONS = ['THE YEAR AHEAD', 'LOVE & RELATIONSHIPS', 'WORK & PURPOSE', 'INNER WORK', 'A WORD TO CARRY'];

function renderSolarReading(text, year) {
  const body = document.getElementById('solarReadingBody');

  // Split into labelled sections
  let html = `<p style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);opacity:0.7;margin-bottom:24px;">${year} Personal Year</p>`;

  let remaining = text.trim();
  SOLAR_SECTIONS.forEach((section, i) => {
    const next  = SOLAR_SECTIONS[i + 1];
    const start = remaining.indexOf(section);
    if (start === -1) return;
    const end     = next ? remaining.indexOf(next, start + section.length) : remaining.length;
    const content = remaining.slice(start + section.length, end).trim();

    html += `<div style="margin-bottom:28px;">
      <div style="font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:10px;">${section}</div>
      <div style="font-size:0.95rem;color:var(--light);line-height:1.85;">
        ${content.split('\n\n').filter(Boolean).map(p => `<p style="margin:0 0 14px 0;">${p.trim()}</p>`).join('')}
      </div>
    </div>`;
  });

  body.innerHTML = html;
  body.style.display = 'block';
}

// Pre-fill year labels in the upgrade modal whenever it opens
const _origOpenSolar = window.openSolarUpgradeModal;
window.openSolarUpgradeModal = function() {
  const y = new Date().getFullYear();
  const lbl = document.getElementById('solarReturnYearLabel');
  const btn = document.getElementById('solarReturnYearBtn');
  if (lbl) lbl.textContent = y;
  if (btn) btn.textContent = y;
  document.getElementById('solarUpgradeOverlay').classList.add('active');
};
