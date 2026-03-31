-- ============================================================
-- Weekly Spreads table — run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE weekly_spreads (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_date   date    NOT NULL,
  planet     text,
  glyph      text,
  energy     text,         -- 'high' | 'mid' | 'low'
  summary    text,
  topics     jsonb,        -- [{key, name, glyph, energy, snippet}]
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, day_date)
);

-- Row Level Security — users can only read their own rows
-- (Netlify functions use service key which bypasses RLS)
ALTER TABLE weekly_spreads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own weekly spreads"
  ON weekly_spreads
  FOR SELECT
  USING (auth.uid() = user_id);
