BEGIN;

CREATE TABLE IF NOT EXISTS examforge.review_cards (
  item_id uuid PRIMARY KEY REFERENCES examforge.attempt_items(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  due_at timestamptz NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);
REVOKE ALL ON examforge.review_cards FROM PUBLIC, anon, authenticated;
ALTER TABLE examforge.review_cards ENABLE ROW LEVEL SECURITY;

COMMIT;
