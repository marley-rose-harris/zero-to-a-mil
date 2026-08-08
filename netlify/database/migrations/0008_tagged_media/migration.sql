CREATE TABLE IF NOT EXISTS processed_tags (
  id SERIAL PRIMARY KEY,
  media_id TEXT UNIQUE NOT NULL,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
