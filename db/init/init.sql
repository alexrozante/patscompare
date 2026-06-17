/**
 * PATSCompare
 * init.sql
 * Database initialization script
 * (c) PATS Technologies
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

CREATE TABLE log (
  id          UUID PRIMARY KEY,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  module      VARCHAR(30) NOT NULL,
  type        CHAR(1),
  message     TEXT NOT NULL
);

CREATE INDEX log_ix_created_at ON log(module, created_at);

