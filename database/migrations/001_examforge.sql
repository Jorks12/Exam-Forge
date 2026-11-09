BEGIN;

CREATE SCHEMA examforge;
REVOKE ALL ON SCHEMA examforge FROM PUBLIC, anon, authenticated;
SET LOCAL search_path = examforge, public;

CREATE TABLE topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE UNIQUE INDEX topics_owner_name ON topics (owner_id, lower(name));

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  explanation text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  FOREIGN KEY (topic_id, owner_id) REFERENCES topics(id, owner_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX questions_owner_filter ON questions (owner_id, topic_id, is_active, difficulty);
CREATE INDEX questions_owner_order ON questions (owner_id, created_at DESC, id);

CREATE TABLE question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label char(1) NOT NULL CHECK (label IN ('A','B','C','D')),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 1000),
  UNIQUE (question_id, label),
  UNIQUE (question_id, id)
);

CREATE TABLE answer_keys (
  question_id uuid PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  correct_option_id uuid NOT NULL,
  FOREIGN KEY (question_id, correct_option_id) REFERENCES question_options(question_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION validate_active_question() RETURNS trigger
LANGUAGE plpgsql SET search_path = examforge, pg_catalog AS $$
DECLARE
  q uuid;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    q := NEW.id;
  ELSE
    q := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_id ELSE NEW.question_id END;
    IF TG_OP = 'UPDATE' AND OLD.question_id <> NEW.question_id THEN
      RAISE EXCEPTION 'Question references are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM questions WHERE id = q AND is_active FOR UPDATE) THEN
    IF (SELECT count(*) FROM question_options WHERE question_id = q) <> 4
      OR NOT EXISTS (SELECT 1 FROM answer_keys WHERE question_id = q) THEN
      RAISE EXCEPTION 'An active question requires four options and an answer key' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER check_active_question AFTER INSERT OR UPDATE ON questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_question();
CREATE CONSTRAINT TRIGGER check_active_options AFTER INSERT OR UPDATE OR DELETE ON question_options
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_question();
CREATE CONSTRAINT TRIGGER check_active_key AFTER INSERT OR UPDATE OR DELETE ON answer_keys
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_question();

CREATE TABLE exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  algorithm text NOT NULL CHECK (algorithm IN ('random', 'balanced')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','expired')),
  time_limit_minutes integer NOT NULL CHECK (time_limit_minutes BETWEEN 1 AND 180),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = started_at + time_limit_minutes * interval '1 minute'),
  submitted_at timestamptz,
  score integer CHECK (score BETWEEN 0 AND total_questions),
  total_questions integer NOT NULL CHECK (total_questions BETWEEN 1 AND 100),
  allocation jsonb NOT NULL,
  UNIQUE (id, user_id),
  CHECK (
    (status = 'in_progress' AND submitted_at IS NULL AND score IS NULL) OR
    (status = 'completed' AND submitted_at >= started_at AND submitted_at < expires_at AND score IS NOT NULL AND submitted_at IS NOT NULL) OR
    (status = 'expired' AND submitted_at = expires_at AND score IS NOT NULL AND submitted_at IS NOT NULL)
  )
);
CREATE INDEX attempts_user_started ON exam_attempts (user_id, started_at DESC, id);
CREATE INDEX attempts_due ON exam_attempts (user_id, expires_at, id) WHERE status = 'in_progress';

CREATE TABLE attempt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 100),
  topic_id uuid NOT NULL,
  topic_name text NOT NULL,
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  content text NOT NULL,
  explanation text,
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  correct_option_id uuid NOT NULL,
  selected_option_id uuid,
  is_correct boolean,
  FOREIGN KEY (attempt_id, user_id) REFERENCES exam_attempts(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, user_id) REFERENCES questions(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (attempt_id, position),
  UNIQUE (attempt_id, question_id),
  CHECK (options @> jsonb_build_array(jsonb_build_object('id', correct_option_id::text))),
  CHECK (selected_option_id IS NULL OR options @> jsonb_build_array(jsonb_build_object('id', selected_option_id::text))),
  CHECK (is_correct IS NULL OR is_correct = coalesce(selected_option_id = correct_option_id, false))
);
CREATE INDEX items_question ON attempt_items (question_id);

CREATE FUNCTION guard_attempt_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = examforge, pg_catalog AS $$
BEGIN
  IF (to_jsonb(OLD) - 'selected_option_id' - 'is_correct')
      IS DISTINCT FROM (to_jsonb(NEW) - 'selected_option_id' - 'is_correct') THEN
    RAISE EXCEPTION 'Exam snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM exam_attempts WHERE id = OLD.attempt_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'Exam is finalized' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempt_item_update BEFORE UPDATE ON attempt_items
  FOR EACH ROW EXECUTE FUNCTION guard_attempt_item();

CREATE FUNCTION guard_attempt_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status <> 'in_progress' OR NEW.status = 'in_progress' THEN
    RAISE EXCEPTION 'Invalid attempt transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempt_transition BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION guard_attempt_transition();

REVOKE ALL ON ALL TABLES IN SCHEMA examforge FROM PUBLIC, anon, authenticated;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_items ENABLE ROW LEVEL SECURITY;

COMMIT;
