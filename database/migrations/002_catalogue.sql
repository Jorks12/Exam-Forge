BEGIN;

CREATE TABLE IF NOT EXISTS examforge.grades (
  number smallint PRIMARY KEY CHECK (number BETWEEN 1 AND 12),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS examforge.subjects (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]*$'),
  name text NOT NULL,
  icon text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS examforge.subject_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade smallint NOT NULL REFERENCES examforge.grades(number),
  subject_id text NOT NULL REFERENCES examforge.subjects(id),
  scope text NOT NULL CHECK (scope IN ('general', 'profile', 'practice')),
  UNIQUE (grade, subject_id)
);

CREATE TABLE IF NOT EXISTS examforge.catalogue_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_grade_id uuid NOT NULL REFERENCES examforge.subject_grades(id),
  slug text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  UNIQUE (subject_grade_id, slug)
);

CREATE TABLE IF NOT EXISTS examforge.catalogue_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES examforge.catalogue_topics(id),
  source_key text NOT NULL UNIQUE,
  fingerprint text NOT NULL UNIQUE,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  explanation text NOT NULL CHECK (length(btrim(explanation)) BETWEEN 1 AND 4000),
  options text[] NOT NULL CHECK (
    array_ndims(options) = 1 AND array_lower(options, 1) = 1 AND cardinality(options) = 4
    AND array_position(options, NULL) IS NULL
    AND length(btrim(options[1])) BETWEEN 1 AND 1000 AND length(btrim(options[2])) BETWEEN 1 AND 1000
    AND length(btrim(options[3])) BETWEEN 1 AND 1000 AND length(btrim(options[4])) BETWEEN 1 AND 1000
    AND lower(btrim(options[1])) NOT IN (lower(btrim(options[2])), lower(btrim(options[3])), lower(btrim(options[4])))
    AND lower(btrim(options[2])) NOT IN (lower(btrim(options[3])), lower(btrim(options[4])))
    AND lower(btrim(options[3])) <> lower(btrim(options[4]))
  ),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 1 AND 4),
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS catalogue_questions_filter
  ON examforge.catalogue_questions (topic_id, difficulty, id) WHERE is_active;

ALTER TABLE examforge.topics ADD COLUMN IF NOT EXISTS subject_grade_id uuid REFERENCES examforge.subject_grades(id);
ALTER TABLE examforge.exam_attempts ADD COLUMN IF NOT EXISTS subject_grade_id uuid REFERENCES examforge.subject_grades(id);
ALTER TABLE examforge.exam_attempts ADD COLUMN IF NOT EXISTS catalogue jsonb;
ALTER TABLE examforge.attempt_items ALTER COLUMN question_id DROP NOT NULL;
ALTER TABLE examforge.attempt_items ADD COLUMN IF NOT EXISTS catalogue_question_id uuid REFERENCES examforge.catalogue_questions(id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'examforge.attempt_items'::regclass AND conname = 'attempt_item_one_source') THEN
    ALTER TABLE examforge.attempt_items ADD CONSTRAINT attempt_item_one_source
      CHECK (num_nonnulls(question_id, catalogue_question_id) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'examforge.exam_attempts'::regclass AND conname = 'attempt_catalogue_snapshot') THEN
    ALTER TABLE examforge.exam_attempts ADD CONSTRAINT attempt_catalogue_snapshot
      CHECK ((subject_grade_id IS NULL) = (catalogue IS NULL));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS attempt_catalogue_unique ON examforge.attempt_items (attempt_id, catalogue_question_id)
  WHERE catalogue_question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attempt_catalogue_reference ON examforge.attempt_items (catalogue_question_id)
  WHERE catalogue_question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attempts_subject_report ON examforge.exam_attempts (user_id, subject_grade_id, submitted_at)
  WHERE status <> 'in_progress';

INSERT INTO examforge.grades (number, name) VALUES (10, 'X клас'), (11, 'XI клас')
ON CONFLICT (number) DO NOTHING;

INSERT INTO examforge.subjects (id, name, icon) VALUES
  ('bulgarian', 'Български език и литература', 'book'),
  ('math', 'Математика', 'calculator'),
  ('english', 'Английски език', 'languages'),
  ('history', 'История и цивилизации', 'landmark'),
  ('geography', 'География и икономика', 'globe'),
  ('biology', 'Биология и здравно образование', 'dna'),
  ('chemistry', 'Химия и опазване на околната среда', 'flask'),
  ('physics', 'Физика и астрономия', 'atom'),
  ('informatics', 'Информатика', 'code'),
  ('it', 'Информационни технологии', 'monitor'),
  ('philosophy', 'Философия', 'brain'),
  ('civics', 'Гражданско образование', 'users')
ON CONFLICT (id) DO NOTHING;

INSERT INTO examforge.subject_grades (grade, subject_id, scope)
SELECT g.number, s.id, CASE
  WHEN g.number = 10 AND s.id IN ('informatics', 'civics') THEN 'practice'
  WHEN g.number = 11 AND s.id NOT IN ('bulgarian', 'math', 'english', 'civics') THEN 'profile'
  ELSE 'general'
END
FROM examforge.grades g CROSS JOIN examforge.subjects s
WHERE g.number IN (10, 11) AND s.id IN ('bulgarian', 'math', 'english', 'history', 'geography', 'biology',
  'chemistry', 'physics', 'informatics', 'it', 'philosophy', 'civics')
ON CONFLICT (grade, subject_id) DO NOTHING;

REVOKE ALL ON examforge.grades, examforge.subjects, examforge.subject_grades,
  examforge.catalogue_topics, examforge.catalogue_questions FROM PUBLIC, anon, authenticated;
ALTER TABLE examforge.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE examforge.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE examforge.subject_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE examforge.catalogue_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE examforge.catalogue_questions ENABLE ROW LEVEL SECURITY;

COMMIT;
