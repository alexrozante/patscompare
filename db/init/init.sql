/**
 * PATSCompare
 * init.sql
 * Criacao do BD PatsCompare
 * PATS Technologies
 * 16/06/2026
 */
CREATE TABLE comparisons (
  id          UUID PRIMARY KEY,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status      TEXT NOT NULL, -- queued | running | done | failed
  input_a     TEXT NOT NULL,
  input_b     TEXT NOT NULL,
  total_pages INTEGER,
  matches     JSONB,
  artifacts   JSONB,
  error       TEXT
);

CREATE INDEX comparisons_ix_created_at ON comparisons(created_at);
