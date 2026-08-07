ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES participants(id);
