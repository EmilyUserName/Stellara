-- ============================================================
-- Stellara — Row Level Security
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- SELECT: users can only read their own row
-- ----------------------------------------------------------------
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- ----------------------------------------------------------------
-- INSERT: users can only create a row for themselves
-- ----------------------------------------------------------------
CREATE POLICY "Users can create own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- UPDATE: users can only update their own row
-- ----------------------------------------------------------------
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- DELETE: not needed by the app, but block it explicitly
-- ----------------------------------------------------------------
-- (No DELETE policy = nobody can delete via anon/user key)
-- Service role key bypasses all RLS so Netlify functions are unaffected.
