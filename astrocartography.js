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
  if (!requireSubscription()) return;
  if (!currentUser) return;

  document.getElementById('homeSection').style.display       = 'none';
  document.getElementById('inputCard').style.display         = 'none';
  document.getElementById('results').style.display           = 'none';
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
  closePanelImmediate();
  document.getElementById('astroSection').style.display = 'none';
  document.getElementById('homeSection').style.display  = 'block';
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
    document.getElementById('astroExplainer').style.display     = 'block';
    document.getElementById('astroMapContainer').style.display  = 'block';
    document.getElementById('astroControls').style.display      = 'block';

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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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
