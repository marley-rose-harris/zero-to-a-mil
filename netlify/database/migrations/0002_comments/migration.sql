CREATE TABLE IF NOT EXISTS processed_comments (
  id SERIAL PRIMARY KEY,
  comment_id TEXT UNIQUE NOT NULL,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
