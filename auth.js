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

let currentUser      = null;
let currentSubscribed = false;
let activeTab        = 'signin';

// ------------------------------------------------------------
// AUTH STATE — fires on page load and whenever user signs in/out
// ------------------------------------------------------------
sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  updateAuthUI();
  if (currentUser) loadProfile();
});

// Handle return from Stripe checkout
if (new URLSearchParams(window.location.search).get('subscribed') === 'true') {
  history.replaceState({}, '', '/');
  // Poll briefly — webhook may not have fired yet
  setTimeout(async () => {
    await loadProfile();
  }, 2000);
}

function updateAuthUI() {
  const emailEl  = document.getElementById('userEmail');
  const topNav   = document.getElementById('topNav');
  const landing  = document.getElementById('landingSection');
  const inputCard = document.getElementById('inputCard');

  if (currentUser) {
    emailEl.textContent    = currentUser.email;
    topNav.style.display   = 'flex';
    landing.style.display  = 'none';
    inputCard.style.display = 'block';
  } else {
    emailEl.textContent    = '';
    topNav.style.display   = 'none';
    landing.style.display  = 'block';
    inputCard.style.display = 'none';
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

  if (activeTab === 'signup' && !result.data.session) {
    // Email confirmation required
    errEl.style.color = 'var(--accent)';
    errEl.textContent = 'Check your email to confirm your account, then sign in.';
  } else {
    closeAuthModal();
  }
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

// ------------------------------------------------------------
// UPGRADE — Stripe checkout
// ------------------------------------------------------------
function openUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.add('active');
}

function closeUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.remove('active');
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
  const { url } = await res.json();
  window.location.href = url;
}

// ------------------------------------------------------------
// PROFILE — save and load birth info from Supabase
// ------------------------------------------------------------
async function loadProfile() {
  const { data } = await sb
    .from('profiles')
    .select('name, birth_date, birth_time, birth_city, subscribed')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (!data || !data.name) {
    showForm();
    return;
  }

  currentSubscribed = data.subscribed || false;

  document.getElementById('name').value      = data.name;
  document.getElementById('birthDate').value = data.birth_date || '';
  document.getElementById('birthTime').value = data.birth_time || '';
  document.getElementById('birthCity').value = data.birth_city || '';

  document.getElementById('welcomeName').textContent = data.name;
  showHome();
}

function showHome() {
  document.getElementById('homeSection').style.display  = 'block';
  document.getElementById('inputCard').style.display    = 'none';
  document.getElementById('results').className          = 'results card';
}

function showForm() {
  document.getElementById('homeSection').style.display = 'none';
  document.getElementById('inputCard').style.display   = 'block';
}

async function saveProfile() {
  if (!currentUser) return;
  await sb.from('profiles').upsert({
    id:         currentUser.id,
    name:       document.getElementById('name').value.trim(),
    birth_date: document.getElementById('birthDate').value,
    birth_time: document.getElementById('birthTime').value,
    birth_city: document.getElementById('birthCity').value.trim(),
  });
}
