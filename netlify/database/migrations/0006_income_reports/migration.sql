CREATE TABLE IF NOT EXISTS income_reports (
  id SERIAL PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant_id, month_key)
);
