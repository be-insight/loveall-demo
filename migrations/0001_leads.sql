-- Leads from the quote form and the chat assistant.
-- Rows older than 24 months are deleted daily by workers/lead-cleanup.
CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,                 -- random UUID
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source       TEXT NOT NULL CHECK (source IN ('quote_form', 'chat')),
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  location     TEXT,
  service      TEXT,
  issue        TEXT,
  urgency      TEXT,
  best_time    TEXT,
  transcript   TEXT,                             -- JSON array of {role, text} for chat leads
  page_url     TEXT,
  user_agent   TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  email_id     TEXT,                             -- Resend message id
  email_error  TEXT
);

CREATE INDEX IF NOT EXISTS leads_created_at ON leads (created_at);
