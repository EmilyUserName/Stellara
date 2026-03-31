// ============================================================
// astrocartography.js — Frontend map rendering and interactions
// ============================================================

let astroMap      = null;
let astroLayers   = {};   // planet name → Leaflet layer group
let astroData     = null; // cached planet line data
let astroVisible  = {};   // planet name → boolean

// ------------------------------------------------------------
// OPEN / CLOSE
// ------------------------------------------------------------
function openAstroMap() {
  if (!requireAstrocartography()) return;
  if (!currentUser) return;

  document.querySelector('.container').style.display         = 'none';
  document.getElementById('astroSection').style.display      = 'block';
  document.getElementById('astroLoading').style.display      = 'block';
  document.getElementById('astroExplainer').style.display    = 'none';
  document.getElementById('astroMapContainer').style.display = 'none';
  document.getElementById('astroControls').style.display     = 'none';
  closePanelImmediate();

  const birthDate = getBirthDate();
  const birthTime = getBirthTime();
  const birthCity = document.getElementById('birthCity').value.trim();

  if (!birthDate || !birthTime || !birthCity) {
    document.getElementById('astroLoading').innerHTML =
      '<p style="color:var(--silver);text-align:center;">Please fill in your birth date, time, and city first.</p>';
    return;
  }

  const name    = document.getElementById('name').value.trim();
  const sunSign = typeof currentSun !== 'undefined' ? currentSun : '';

  document.getElementById('astroSubtitle').textContent =
    `${name}  ·  ${birthDate}  ·  ${birthCity}`;

  fetchAstroLines(birthDate, birthTime, birthCity, { name, sun: sunSign });
}

function closeAstroMap() {
  if (typeof setActiveNav === 'function') setActiveNav('home');
  closePanelImmediate();
  document.getElementById('astroSection').style.display  = 'none';
  document.querySelector('.container').style.display     = 'block';
}

function closePanelImmediate() {
  document.getElementById('astroPanel').style.display        = 'none';
  document.getElementById('astroPanelBackdrop').style.display = 'none';
}

function closeAstroPanel() {
  closePanelImmediate();
}

// ------------------------------------------------------------
// FETCH LINES FROM BACKEND
// ------------------------------------------------------------
async function fetchAstroLines(birthDate, birthTime, birthCity, userData) {
  try {
    const res = await fetch('/api/astrocartography', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ birthDate, birthTime, birthCity }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    astroData = data.planets;

    document.getElementById('astroLoading').style.display       = 'none';
    document.getElementById('astroMapContainer').style.display  = 'block';
    document.getElementById('astroControls').style.display      = 'block';

    const explainer = document.getElementById('astroExplainer');
    explainer.innerHTML = [
      '<div style="background:rgba(19,36,64,0.85);border:1px solid rgba(126,168,212,0.25);border-radius:14px;padding:24px 22px;margin-bottom:16px;">',

      // What is astrocartography
      '<div style="margin-bottom:22px;">',
        '<div style="font-size:0.7rem;letter-spacing:0.13em;text-transform:uppercase;color:#7ea8d4;font-weight:600;margin-bottom:10px;">What is Astrocartography?</div>',
        '<p style="font-size:0.9rem;color:#dce4f0;line-height:1.8;margin:0;">At the exact moment you were born, each planet occupied a precise position in the sky. Astrocartography projects those positions onto a world map — showing where each planet\'s energy is most powerfully activated in your life. Some places make you feel seen and successful. Others pull you toward love, deep inner work, or transformation. This map shows you where.</p>',
      '</div>',

      // Line types
      '<div style="margin-bottom:22px;">',
        '<div style="font-size:0.7rem;letter-spacing:0.13em;text-transform:uppercase;color:#7ea8d4;font-weight:600;margin-bottom:14px;">What the Lines Mean</div>',
        '<div style="display:flex;flex-direction:column;gap:14px;">',
          '<div style="display:flex;align-items:flex-start;gap:14px;"><span style="flex-shrink:0;display:block;width:26px;height:2px;background:#7ea8d4;margin-top:8px;"></span><div style="color:#dce4f0;font-size:0.88rem;line-height:1.5;"><span style="color:#ffffff;font-weight:600;">ASC — Ascendant</span><br><span style="color:rgba(220,228,240,0.75);font-size:0.82rem;">The planet was rising at the eastern horizon. Places on this line shape your identity — you feel most like yourself here.</span></div></div>',
          '<div style="display:flex;align-items:flex-start;gap:14px;"><span style="flex-shrink:0;display:block;width:26px;height:2px;background:repeating-linear-gradient(90deg,#7ea8d4 0 5px,transparent 5px 9px);margin-top:8px;"></span><div style="color:#dce4f0;font-size:0.88rem;line-height:1.5;"><span style="color:#ffffff;font-weight:600;">DSC — Descendant</span><br><span style="color:rgba(220,228,240,0.75);font-size:0.82rem;">The planet was setting on the western horizon. This line governs relationships and who you attract.</span></div></div>',
          '<div style="display:flex;align-items:flex-start;gap:14px;"><span style="flex-shrink:0;display:block;width:26px;height:2px;background:#7ea8d4;margin-top:8px;"></span><div style="color:#dce4f0;font-size:0.88rem;line-height:1.5;"><span style="color:#ffffff;font-weight:600;">MC — Midheaven</span><br><span style="color:rgba(220,228,240,0.75);font-size:0.82rem;">The planet was at its peak in the sky. Vertical line. Relates to career, reputation, and how the world sees you.</span></div></div>',
          '<div style="display:flex;align-items:flex-start;gap:14px;"><span style="flex-shrink:0;display:block;width:26px;height:2px;background:repeating-linear-gradient(90deg,#7ea8d4 0 2px,transparent 2px 6px);margin-top:8px;"></span><div style="color:#dce4f0;font-size:0.88rem;line-height:1.5;"><span style="color:#ffffff;font-weight:600;">IC — Imum Coeli</span><br><span style="color:rgba(220,228,240,0.75);font-size:0.82rem;">The planet was at its lowest point. Speaks to home, roots, and inner life. Can feel deeply nourishing.</span></div></div>',
        '</div>',
      '</div>',

      // How to use
      '<div>',
        '<div style="font-size:0.7rem;letter-spacing:0.13em;text-transform:uppercase;color:#7ea8d4;font-weight:600;margin-bottom:14px;">How to Use</div>',
        '<div style="display:flex;flex-direction:column;gap:12px;">',
          '<div style="display:flex;align-items:flex-start;gap:12px;"><span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:rgba(126,168,212,0.15);border:1px solid rgba(126,168,212,0.4);color:#7ea8d4;font-size:0.74rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px;">1</span><span style="font-size:0.88rem;color:#dce4f0;line-height:1.65;">Use the <span style="color:#ffffff;font-weight:600;">planet toggles</span> below the map to show or hide individual planets. Sun, Moon, Venus, and Jupiter are great starting points.</span></div>',
          '<div style="display:flex;align-items:flex-start;gap:12px;"><span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:rgba(126,168,212,0.15);border:1px solid rgba(126,168,212,0.4);color:#7ea8d4;font-size:0.74rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px;">2</span><span style="font-size:0.88rem;color:#dce4f0;line-height:1.65;"><span style="color:#ffffff;font-weight:600;">Tap any line</span> on the map for a personalized interpretation of what that planet and angle means for you in that part of the world.</span></div>',
          '<div style="display:flex;align-items:flex-start;gap:12px;"><span style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:rgba(126,168,212,0.15);border:1px solid rgba(126,168,212,0.4);color:#7ea8d4;font-size:0.74rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px;">3</span><span style="font-size:0.88rem;color:#dce4f0;line-height:1.65;">Notice places you\'ve lived or feel drawn to — they often sit near significant lines in your chart.</span></div>',
        '</div>',
      '</div>',

      '</div>',
    ].join('');
    explainer.style.display = 'block';

    initMap(data.planets, userData);
    buildPlanetToggles(data.planets);
  } catch (err) {
    document.getElementById('astroLoading').innerHTML =
      `<p style="color:#e74c3c;text-align:center;">Error loading map: ${err.message}</p>`;
  }
}

// ------------------------------------------------------------
// LEAFLET MAP
// ------------------------------------------------------------
function initMap(planets, userData) {
  if (astroMap) {
    astroMap.remove();
    astroMap = null;
  }

  astroMap = L.map('astroMapContainer', {
    center: [20, 0],
    zoom:   2,
    minZoom: 2,
    maxZoom: 6,
    worldCopyJump: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
    subdomains:  'abcd',
    maxZoom:     19,
  }).addTo(astroMap);

  astroLayers  = {};
  astroVisible = {};

  planets.forEach(planet => {
    astroVisible[planet.name] = true;
    astroLayers[planet.name]  = drawPlanetLines(planet, userData);
  });
}

function drawPlanetLines(planet, userData) {
  const group = L.layerGroup().addTo(astroMap);
  const col   = planet.color;

  const baseStyle = { color: col, opacity: 0.85 };
  const lineStyles = {
    ASC: { ...baseStyle, weight: 2 },
    DSC: { ...baseStyle, weight: 2, dashArray: '6 4' },
    MC:  { ...baseStyle, weight: 2 },
    IC:  { ...baseStyle, weight: 2, dashArray: '3 5' },
  };

  function attachLine(polyline, type) {
    polyline
      .on('mouseover', function () { this.setStyle({ weight: 4, opacity: 1 }); })
      .on('mouseout',  function () { this.setStyle({ weight: 2, opacity: 0.85 }); })
      .on('click',     (e) => onLineClick(e, planet, type, userData))
      .addTo(group);
  }

  // Curved ASC / DSC lines
  planet.asc.forEach(seg => {
    if (seg.length >= 2) attachLine(L.polyline(seg.map(([la, lo]) => [la, lo]), { ...lineStyles.ASC, weight: 12, opacity: 0.001 }), 'ASC');
    if (seg.length >= 2) attachLine(L.polyline(seg.map(([la, lo]) => [la, lo]), lineStyles.ASC), 'ASC');
  });
  planet.dsc.forEach(seg => {
    if (seg.length >= 2) attachLine(L.polyline(seg.map(([la, lo]) => [la, lo]), { ...lineStyles.DSC, weight: 12, opacity: 0.001 }), 'DSC');
    if (seg.length >= 2) attachLine(L.polyline(seg.map(([la, lo]) => [la, lo]), lineStyles.DSC), 'DSC');
  });

  // Vertical MC / IC lines
  const mcLatlngs = [[-85, planet.mc], [85, planet.mc]];
  const icLatlngs = [[-85, planet.ic], [85, planet.ic]];
  attachLine(L.polyline(mcLatlngs, { ...lineStyles.MC, weight: 12, opacity: 0.001 }), 'MC');
  attachLine(L.polyline(mcLatlngs, lineStyles.MC), 'MC');
  attachLine(L.polyline(icLatlngs, { ...lineStyles.IC, weight: 12, opacity: 0.001 }), 'IC');
  attachLine(L.polyline(icLatlngs, lineStyles.IC), 'IC');

  return group;
}

// ------------------------------------------------------------
// LINE CLICK — show panel + fetch AI interpretation
// ------------------------------------------------------------
async function onLineClick(e, planet, lineType, userData) {
  const panel    = document.getElementById('astroPanel');
  const backdrop = document.getElementById('astroPanelBackdrop');
  const title    = document.getElementById('astroPanelTitle');
  const body     = document.getElementById('astroPanelBody');

  // Show the panel immediately with a loading spinner
  title.innerHTML = `<span style="color:${planet.color}">●</span> ${planet.name} ${lineType} Line`;
  body.innerHTML  = '<div class="orbit" style="margin:24px auto;"></div>';
  panel.style.display    = 'block';
  backdrop.style.display = 'block';

  const lat      = e.latlng.lat.toFixed(1);
  const lon      = e.latlng.lng.toFixed(1);
  const location = `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`;

  try {
    const res = await fetch('/api/astrocartography-interpret', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planet:   planet.name,
        lineType,
        location,
        name:     userData.name,
        sun:      userData.sun,
        moon:     typeof currentMoon   !== 'undefined' ? currentMoon   : '',
        rising:   typeof currentRising !== 'undefined' ? currentRising : '',
        style:    typeof selectedStyle !== 'undefined' ? selectedStyle : 'psychological',
      }),
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    if (!data.text) throw new Error('Empty response from server');

    body.innerHTML = data.text
      .split('\n\n')
      .filter(Boolean)
      .map(p => `<p style="margin:0 0 16px 0;line-height:1.8;">${p.trim()}</p>`)
      .join('');
  } catch (err) {
    console.error('[astrocartography-interpret]', err);
    body.innerHTML = `<p style="color:#e74c3c;">Could not load interpretation. Please try again.</p>`;
  }
}

// ------------------------------------------------------------
// PLANET TOGGLES
// ------------------------------------------------------------
function buildPlanetToggles(planets) {
  const container = document.getElementById('astroPlanetToggles');
  container.innerHTML = '';

  planets.forEach(planet => {
    const label = document.createElement('label');
    label.className = 'astro-planet-toggle';

    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => togglePlanet(planet.name, cb.checked));

    const dot = document.createElement('span');
    dot.className        = 'astro-toggle-dot';
    dot.style.background = planet.color;

    const name = document.createElement('span');
    name.textContent = planet.name;

    label.appendChild(cb);
    label.appendChild(dot);
    label.appendChild(name);
    container.appendChild(label);
  });
}

function togglePlanet(planetName, visible) {
  astroVisible[planetName] = visible;
  if (!astroMap || !astroLayers[planetName]) return;
  visible ? astroLayers[planetName].addTo(astroMap) : astroLayers[planetName].remove();
}
