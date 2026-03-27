// ============================================================
// astrocartography.js — Frontend map rendering and interactions
// ============================================================

let astroMap      = null;
let astroLayers   = {};   // planet name → { asc, dsc, mc, ic } Leaflet layer groups
let astroData     = null; // cached planet line data
let astroVisible  = {};   // planet name → boolean

// ------------------------------------------------------------
// OPEN / CLOSE
// ------------------------------------------------------------
function openAstroMap() {
  if (!requireSubscription()) return;
  if (!currentUser) return;

  document.getElementById('homeSection').style.display  = 'none';
  document.getElementById('inputCard').style.display    = 'none';
  document.getElementById('results').style.display      = 'none';
  document.getElementById('astroSection').style.display = 'block';
  document.getElementById('astroLoading').style.display = 'block';
  document.getElementById('astroMapContainer').style.display = 'none';
  document.getElementById('astroControls').style.display = 'none';
  document.getElementById('astroPanel').style.display   = 'none';

  // Load birth data from the profile fields
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
  document.getElementById('astroSection').style.display = 'none';
  document.getElementById('homeSection').style.display  = 'block';
}

function closeAstroPanel() {
  document.getElementById('astroPanel').style.display = 'none';
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

  // Dark map tiles — CartoDB Dark Matter
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
    subdomains:  'abcd',
    maxZoom:     19,
  }).addTo(astroMap);

  astroLayers = {};
  astroVisible = {};

  planets.forEach(planet => {
    astroVisible[planet.name] = true;
    astroLayers[planet.name] = drawPlanetLines(planet, userData);
  });
}

function drawPlanetLines(planet, userData) {
  const group = L.layerGroup().addTo(astroMap);
  const col   = planet.color;

  const lineStyles = {
    ASC: { color: col, weight: 1.5, opacity: 0.85, dashArray: null },
    DSC: { color: col, weight: 1.5, opacity: 0.85, dashArray: '6 4' },
    MC:  { color: col, weight: 1.5, opacity: 0.85, dashArray: null },
    IC:  { color: col, weight: 1.5, opacity: 0.85, dashArray: '2 4' },
  };

  const addCurved = (segments, type) => {
    segments.forEach(seg => {
      if (seg.length < 2) return;
      const latlngs = seg.map(([lat, lon]) => [lat, lon]);
      L.polyline(latlngs, lineStyles[type])
        .on('click', (e) => onLineClick(e, planet, type, userData))
        .on('mouseover', function () { this.setStyle({ weight: 3, opacity: 1 }); })
        .on('mouseout',  function () { this.setStyle({ weight: 1.5, opacity: 0.85 }); })
        .addTo(group);
    });
  };

  const addVertical = (lon, type) => {
    const latlngs = [[-85, lon], [85, lon]];
    L.polyline(latlngs, lineStyles[type])
      .on('click', (e) => onLineClick(e, planet, type, userData))
      .on('mouseover', function () { this.setStyle({ weight: 3, opacity: 1 }); })
      .on('mouseout',  function () { this.setStyle({ weight: 1.5, opacity: 0.85 }); })
      .addTo(group);
  };

  addCurved(planet.asc, 'ASC');
  addCurved(planet.dsc, 'DSC');
  addVertical(planet.mc, 'MC');
  addVertical(planet.ic, 'IC');

  return group;
}

// ------------------------------------------------------------
// LINE CLICK — get AI interpretation
// ------------------------------------------------------------
async function onLineClick(e, planet, lineType, userData) {
  const panel = document.getElementById('astroPanel');
  const title = document.getElementById('astroPanelTitle');
  const body  = document.getElementById('astroPanelBody');

  title.innerHTML = `<span style="color:${planet.color}">●</span> ${planet.name} ${lineType} Line`;
  body.innerHTML  = '<div class="orbit" style="margin:20px auto;"></div>';
  panel.style.display = 'block';

  // Rough location name from clicked coordinates
  const lat = e.latlng.lat.toFixed(1);
  const lon = e.latlng.lng.toFixed(1);
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

    const data = await res.json();
    const paragraphs = (data.text || '').split('\n\n').filter(Boolean);
    body.innerHTML = paragraphs
      .map(p => `<p style="margin:0 0 16px 0;line-height:1.8;">${p.trim()}</p>`)
      .join('');
  } catch (err) {
    body.innerHTML = `<p style="color:#e74c3c;">Error loading interpretation.</p>`;
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
    label.style.setProperty('--planet-color', planet.color);

    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => togglePlanet(planet.name, cb.checked));

    const dot  = document.createElement('span');
    dot.className = 'astro-toggle-dot';
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
  if (visible) {
    astroLayers[planetName].addTo(astroMap);
  } else {
    astroLayers[planetName].remove();
  }
}
