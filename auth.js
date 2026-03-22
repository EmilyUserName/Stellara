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

let currentUser = null;
let activeTab    = 'signin';

// ------------------------------------------------------------
// AUTH STATE — fires on page load and whenever user signs in/out
// ------------------------------------------------------------
sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  updateAuthUI();
});

function updateAuthUI() {
  const btn     = document.getElementById('authBtn');
  const emailEl = document.getElementById('userEmail');
  if (currentUser) {
    emailEl.textContent = currentUser.email;
    btn.textContent     = 'Sign Out';
    btn.onclick         = signOut;
  } else {
    emailEl.textContent = '';
    btn.textContent     = 'Sign In';
    btn.onclick         = openAuthModal;
  }
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
// GATE — call this before showing a paid/auth-gated feature
// Returns true if user is logged in, false + opens modal if not
// ------------------------------------------------------------
function requireAuth() {
  if (currentUser) return true;
  openAuthModal();
  return false;
}
