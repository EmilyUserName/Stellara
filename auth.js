// ============================================================
// auth.js — Supabase authentication
// ============================================================
// Handles sign in, sign up, sign out, and session state.
// The currentUser variable is read by app.js to gate content.
// ============================================================

const SUPABASE_URL = 'https://uqzrqyafjuheounwfajb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MUwjhSn76HY6ADWKeoMkrA_BuAMfrBI';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser          = null;
let currentSubscribed    = false;
let currentHasNatal      = false;
let currentSolarReturnYear = null;
let currentHasAstro      = false;
let activeTab            = 'signin';

// ------------------------------------------------------------
// AUTH STATE — fires on page load and whenever user signs in/out
// ------------------------------------------------------------
sb.auth.onAuthStateChange((_event, session) => {
  if (_event === 'PASSWORD_RECOVERY') {
    openResetPasswordModal();
    return;
  }
  currentUser = session?.user ?? null;
  updateAuthUI();
  if (currentUser) loadProfile();
});

// Handle return from Stripe checkout
const _qs = new URLSearchParams(window.location.search);
if (_qs.get('subscribed') === 'true' || _qs.get('natal') === 'true' || _qs.get('solar') === 'true' || _qs.get('astro') === 'true' || _qs.get('bundle') === 'true') {
  history.replaceState({}, '', '/');
  setTimeout(async () => { await loadProfile(); }, 2000);
}

function updateAuthUI() {
  const emailEl   = document.getElementById('userEmail');
  const topNav    = document.getElementById('topNav');
  const landing   = document.getElementById('landingSection');
  const inputCard = document.getElementById('inputCard');
  const bottomNav = document.getElementById('bottomNav');

  if (currentUser) {
    emailEl.textContent     = currentUser.email;
    topNav.style.display    = 'flex';
    landing.style.display   = 'none';
    inputCard.style.display = 'block';
    if (bottomNav) {
      bottomNav.style.display = 'flex';
      document.body.classList.add('has-bottom-nav');
    }
  } else {
    emailEl.textContent     = '';
    topNav.style.display    = 'none';
    landing.style.display   = 'block';
    inputCard.style.display = 'none';
    if (bottomNav) {
      bottomNav.style.display = 'none';
      document.body.classList.remove('has-bottom-nav');
    }
  }
}

function openSignUp() {
  // Switch modal to sign up tab, then open
  activeTab = 'signup';
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', i === 1);
  });
  document.getElementById('authModalTitle').textContent = 'Create your account';
  openAuthModal();
}

// ------------------------------------------------------------
// MODAL OPEN / CLOSE
// ------------------------------------------------------------
function openAuthModal() {
  document.getElementById('authOverlay').classList.add('active');
  document.getElementById('authEmail').focus();
}

function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('active');
  document.getElementById('authError').textContent = '';
}

// ------------------------------------------------------------
// TAB SWITCHING (Sign In / Sign Up)
// ------------------------------------------------------------
function switchTab(tab, el) {
  activeTab = tab;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('authModalTitle').textContent =
    tab === 'signin' ? 'Welcome back' : 'Create your account';
  document.getElementById('authError').textContent = '';
}

// ------------------------------------------------------------
// SIGN IN / SIGN UP
// ------------------------------------------------------------
async function handleAuth() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    return;
  }

  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;

  let result;
  if (activeTab === 'signin') {
    result = await sb.auth.signInWithPassword({ email, password });
  } else {
    result = await sb.auth.signUp({ email, password });
  }

  btn.disabled = false;

  if (result.error) {
    errEl.textContent = result.error.message;
    return;
  }

  closeAuthModal();
}

// ------------------------------------------------------------
// FORGOT PASSWORD
// ------------------------------------------------------------
async function forgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const errEl = document.getElementById('authError');

  if (!email) {
    errEl.style.color = '';
    errEl.textContent = 'Enter your email above first.';
    return;
  }

  await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://stellara-horoscope.com',
  });

  errEl.style.color = 'var(--accent)';
  errEl.textContent = 'Reset link sent — check your email.';
}

// ------------------------------------------------------------
// RESET PASSWORD MODAL
// ------------------------------------------------------------
function openResetPasswordModal() {
  closeAuthModal();
  document.getElementById('resetOverlay').classList.add('active');
  document.getElementById('newPassword').focus();
}

function closeResetPasswordModal() {
  document.getElementById('resetOverlay').classList.remove('active');
  document.getElementById('resetError').textContent = '';
}

async function submitNewPassword() {
  const password = document.getElementById('newPassword').value;
  const errEl    = document.getElementById('resetError');
  errEl.textContent = '';

  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  const btn = document.getElementById('resetSubmitBtn');
  btn.disabled = true;

  const { error } = await sb.auth.updateUser({ password });
  btn.disabled = false;

  if (error) {
    errEl.textContent = error.message;
    return;
  }

  closeResetPasswordModal();
}

// ------------------------------------------------------------
// SIGN OUT
// ------------------------------------------------------------
async function signOut() {
  await sb.auth.signOut();
}

// ------------------------------------------------------------
// GATE — auth and subscription checks
// ------------------------------------------------------------
function requireAuth() {
  if (currentUser) return true;
  openAuthModal();
  return false;
}

function requireSubscription() {
  if (!currentUser) { openAuthModal(); return false; }
  if (currentSubscribed) return true;
  openUpgradeModal();
  return false;
}

function requireNatalChart() {
  if (!currentUser) { openAuthModal(); return false; }
  if (currentHasNatal) return true;
  openNatalUpgradeModal();
  return false;
}

function requireSolarReturn() {
  if (!currentUser) { openAuthModal(); return false; }
  if (currentSolarReturnYear) return true;
  openSolarUpgradeModal();
  return false;
}

function requireAstrocartography() {
  if (!currentUser) { openAuthModal(); return false; }
  if (currentHasAstro) return true;
  openAstroUpgradeModal();
  return false;
}

// ------------------------------------------------------------
// UPGRADE — Stripe checkout
// ------------------------------------------------------------
function openUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.add('active');
}

function closeUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.remove('active');
}

function openNatalUpgradeModal() {
  document.getElementById('natalUpgradeOverlay').classList.add('active');
}
function closeNatalUpgradeModal() {
  document.getElementById('natalUpgradeOverlay').classList.remove('active');
}

function openSolarUpgradeModal() {
  document.getElementById('solarUpgradeOverlay').classList.add('active');
}
function closeSolarUpgradeModal() {
  document.getElementById('solarUpgradeOverlay').classList.remove('active');
}

function openAstroUpgradeModal() {
  document.getElementById('astroUpgradeOverlay').classList.add('active');
}
function closeAstroUpgradeModal() {
  document.getElementById('astroUpgradeOverlay').classList.remove('active');
}
async function startAstroCheckout() {
  const btn = document.getElementById('astroUpgradeBtn');
  btn.disabled    = true;
  btn.textContent = 'Redirecting…';
  const res  = await fetch('/api/create-astro-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
  });
  const data = await res.json();
  if (!data.url) {
    btn.disabled    = false;
    btn.textContent = 'Unlock Astrocartography — $9';
    return;
  }
  window.location.href = data.url;
}
async function startBundleCheckout() {
  const btn = document.getElementById('bundleUpgradeBtn');
  btn.disabled    = true;
  btn.textContent = 'Redirecting…';
  const res  = await fetch('/api/create-bundle-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
  });
  const data = await res.json();
  if (!data.url) {
    btn.disabled    = false;
    btn.textContent = 'Get Stellara Full Access — $45';
    return;
  }
  window.location.href = data.url;
}

async function startSolarCheckout() {
  const btn = document.getElementById('solarUpgradeBtn');
  btn.disabled    = true;
  btn.textContent = 'Redirecting…';

  const res  = await fetch('/api/create-solar-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
  });
  const data = await res.json();

  if (!data.url) {
    btn.disabled    = false;
    btn.textContent = `Unlock Solar Return ${new Date().getFullYear()} — $29`;
    return;
  }
  window.location.href = data.url;
}

async function startNatalCheckout() {
  const btn = document.getElementById('natalUpgradeBtn');
  btn.disabled    = true;
  btn.textContent = 'Redirecting…';

  const res  = await fetch('/api/create-natal-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
  });
  const data = await res.json();

  if (!data.url) {
    btn.disabled    = false;
    btn.textContent = 'Unlock Natal Chart — $19';
    return;
  }
  window.location.href = data.url;
}

async function startCheckout() {
  const btn = document.getElementById('upgradeBtn');
  btn.disabled = true;
  btn.textContent = 'Redirecting…';

  const res  = await fetch('/api/create-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: currentUser.id, email: currentUser.email }),
  });
  const data = await res.json();

  if (!data.url) {
    btn.disabled = false;
    btn.textContent = 'Upgrade to Pro — $12 / month';
    alert('Could not start checkout. Please try again or contact support.');
    console.error('[Stellara] Checkout error:', data);
    return;
  }

  window.location.href = data.url;
}

// ------------------------------------------------------------
// PROFILE — save and load birth info from Supabase
// ------------------------------------------------------------
async function loadProfile() {
  let result = await sb
    .from('profiles')
    .select('name, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, subscribed, has_natal_chart, solar_return_year, has_astrocartography, preferred_style, pro_expires_at, trial_start, email_opt_out, email_time_preference, weekly_spread_notifications, transit_alerts, reading_depth, reading_tone, reading_length')
    .eq('id', currentUser.id)
    .maybeSingle();

  // If query fails (e.g. new columns not yet added), retry without them
  if (result.error) {
    result = await sb
      .from('profiles')
      .select('name, birth_date, birth_time, birth_city, sun_sign, moon_sign, rising_sign, subscribed, preferred_style')
      .eq('id', currentUser.id)
      .maybeSingle();
  }

  const { data } = result;

  if (!data) {
    // New user — create a minimal profile row so webhook upserts always work
    await sb.from('profiles').upsert({
      id:    currentUser.id,
      email: currentUser.email,
    });
    const setupPrompt = document.getElementById('setupPrompt');
    if (setupPrompt) setupPrompt.style.display = 'block';
    showHome();
    return;
  }

  if (!data.name) {
    // Profile exists but no birth details yet
    const setupPrompt = document.getElementById('setupPrompt');
    if (setupPrompt) setupPrompt.style.display = 'block';
    showHome();
    return;
  }

  const today             = new Date().toISOString().slice(0, 10);
  const hasActiveEtsyTrial = data.pro_expires_at && data.pro_expires_at >= today;
  const hasActiveTrial    = data.trial_start && Math.floor((new Date() - new Date(data.trial_start + 'T00:00:00Z')) / 86400000) < 7;
  currentSubscribed      = data.subscribed || hasActiveEtsyTrial || hasActiveTrial || false;
  currentHasNatal        = data.has_natal_chart  || false;
  currentSolarReturnYear = data.solar_return_year || null;
  currentHasAstro        = data.has_astrocartography || false;
  document.body.classList.toggle('is-pro', currentSubscribed);

  // Show Week tab in bottom nav for Pro subscribers only
  const navWeek = document.getElementById('nav-week');
  if (navWeek) navWeek.style.display = currentSubscribed ? 'flex' : 'none';
  const homeWeekBtn = document.getElementById('homeWeekBtn');
  if (homeWeekBtn) homeWeekBtn.style.display = currentSubscribed ? 'block' : 'none';
  const upsell = document.getElementById('proUpsellCard');
  const topics = document.getElementById('proTopicsCard');
  const freeSection = document.getElementById('freeHoroscopesHome');
  if (upsell) upsell.style.display = currentSubscribed ? 'none' : 'block';
  if (topics) topics.style.display = currentSubscribed ? 'block' : 'none';
  if (freeSection) freeSection.style.display = currentSubscribed ? 'none' : 'block';
  document.querySelectorAll('.is-pro-only').forEach(el => {
    el.style.display = currentSubscribed ? 'inline' : 'none';
  });

  // Update home buttons to reflect what user already owns
  const hasAllBundle = currentHasNatal && currentHasAstro && currentSolarReturnYear;
  if (currentHasNatal) {
    const p = document.getElementById('natalPrice');
    if (p) p.textContent = '✓ Unlocked';
  }
  if (parseInt(currentSolarReturnYear) === new Date().getFullYear()) {
    const p = document.getElementById('solarPrice');
    if (p) p.textContent = '✓ Unlocked';
  }
  if (currentHasAstro) {
    const p = document.getElementById('astroPrice');
    if (p) p.textContent = '✓ Unlocked';
  }
  if (hasAllBundle) {
    const b = document.getElementById('homeBundleBtn');
    if (b) b.style.display = 'none';
  }
  if (currentSubscribed) {
    const upsell = document.getElementById('proUpsellCard');
    const p = document.getElementById('bundlePrice');
    if (p) p.textContent = '✓ Pro Active';
    if (upsell) upsell.style.display = 'none';
  }

  // Show upgrade prompt to users who haven't paid for anything
  const hasAnyPaid = currentSubscribed || currentHasNatal || currentHasAstro || currentSolarReturnYear;
  const upgradePrompt = document.getElementById('upgradePrompt');
  if (upgradePrompt) upgradePrompt.style.display = hasAnyPaid ? 'none' : 'block';

  document.getElementById('name').value        = data.name;
  const savedDate = data.birth_date || '';
  if (savedDate) {
    const [sy, sm, sd] = savedDate.split('-');
    document.getElementById('birthMonth').value = parseInt(sm, 10) || '';
    document.getElementById('birthDay').value   = parseInt(sd, 10) || '';
    document.getElementById('birthYear').value  = sy || '';
  }
  const savedTime = data.birth_time || '';
  if (savedTime) {
    const [th, tm] = savedTime.split(':');
    document.getElementById('birthHour').value   = th || '';
    document.getElementById('birthMinute').value = tm || '';
  }
  document.getElementById('birthCity').value   = data.birth_city  || '';
  // Sign dropdowns are for manual overrides only — don't pre-fill from
  // auto-calculated saved values, or they'd block fresh recalculation.

  // Restore preferred reading style
  if (data.preferred_style) {
    selectedStyle = data.preferred_style;
    document.querySelectorAll(`[data-style="${selectedStyle}"]`).forEach(c => c.classList.add('active'));
    document.querySelectorAll(`.style-card:not([data-style="${selectedStyle}"])`).forEach(c => c.classList.remove('active'));
  }

  // Restore notification preferences
  const dailyEmailEl = document.getElementById('dailyEmailEnabled');
  if (dailyEmailEl) dailyEmailEl.checked = !data.email_opt_out;

  const emailTimeEl = document.getElementById('emailTimePreference');
  if (emailTimeEl && data.email_time_preference) emailTimeEl.value = data.email_time_preference;

  const weeklyEl = document.getElementById('weeklySpreadEnabled');
  if (weeklyEl) weeklyEl.checked = data.weekly_spread_notifications !== false;

  const transitEl = document.getElementById('transitAlertsEnabled');
  if (transitEl) transitEl.checked = data.transit_alerts !== false;

  // Restore reading preference sliders
  const depthEl = document.getElementById('readingDepth');
  if (depthEl && data.reading_depth != null) { depthEl.value = data.reading_depth; depthEl.dispatchEvent(new Event('input')); }

  const toneEl = document.getElementById('readingTone');
  if (toneEl && data.reading_tone != null) { toneEl.value = data.reading_tone; toneEl.dispatchEvent(new Event('input')); }

  const lengthEl = document.getElementById('readingLength');
  if (lengthEl && data.reading_length != null) { lengthEl.value = data.reading_length; lengthEl.dispatchEvent(new Event('input')); }

  document.getElementById('welcomeName').textContent = data.name;
  showHome();

  // Check if today is their birthday (match month + day, ignore year)
  if (data.birth_date) {
    const now = new Date();
    const [, bm, bd] = data.birth_date.split('-');
    if (parseInt(bm, 10) === now.getMonth() + 1 && parseInt(bd, 10) === now.getDate()) {
      triggerBirthdayExperience(data.name);
    }
  }
}

function showHome() {
  if (typeof setActiveNav === 'function') setActiveNav('home');
  document.getElementById('homeSection').style.display  = 'block';
  document.getElementById('inputCard').style.display    = 'none';
  document.getElementById('results').className          = 'results card';
  // Hide setup prompt once profile is saved
  const setupPrompt = document.getElementById('setupPrompt');
  if (setupPrompt) setupPrompt.style.display = 'none';
}

function showForm() {
  document.getElementById('homeSection').style.display      = 'none';
  document.getElementById('inputCard').style.display        = 'block';
  document.getElementById('signOverrides').style.display    = 'block';
  document.getElementById('accountSettings').style.display  = 'block';
  document.getElementById('onboardingIntro').style.display  = 'none';
}

async function saveProfile() {
  if (!currentUser) return;
  const { error } = await sb.from('profiles').upsert({
    id:              currentUser.id,
    email:           currentUser.email,
    name:            document.getElementById('name').value.trim(),
    birth_date:      getBirthDate(),
    birth_time:      getBirthTime(),
    birth_city:      document.getElementById('birthCity').value.trim(),
    sun_sign:        document.getElementById('sunSign').value   || null,
    moon_sign:       document.getElementById('moonSign').value  || null,
    rising_sign:     document.getElementById('risingSign').value || null,
    preferred_style:              selectedStyle || 'psychological',
    email_opt_out:                !(document.getElementById('dailyEmailEnabled')?.checked ?? true),
    email_time_preference:        document.getElementById('emailTimePreference')?.value || '07:00',
    weekly_spread_notifications:  document.getElementById('weeklySpreadEnabled')?.checked ?? true,
    transit_alerts:               document.getElementById('transitAlertsEnabled')?.checked ?? true,
    reading_depth:                parseInt(document.getElementById('readingDepth')?.value  || 50),
    reading_tone:                 parseInt(document.getElementById('readingTone')?.value   || 50),
    reading_length:               parseInt(document.getElementById('readingLength')?.value || 50),
  });
  if (!error && typeof showToast === 'function') showToast('Settings saved ✦');
}
