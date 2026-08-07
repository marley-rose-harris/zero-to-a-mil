ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_week TEXT;

CREATE TABLE IF NOT EXISTS milestones_reached (
  id SERIAL PRIMARY KEY,
  milestone_value INTEGER UNIQUE NOT NULL,
  reached_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS still_here_awards (
  id SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant_id, week_key)
);
