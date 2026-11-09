BEGIN;

LOCK TABLE examforge.topics, examforge.exam_attempts, examforge.attempt_items IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM examforge.attempt_items WHERE catalogue_question_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM examforge.exam_attempts WHERE subject_grade_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM examforge.topics WHERE subject_grade_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Catalogue data is referenced by user records. Keep migration 002 to preserve history and classification.';
  END IF;
END $$;

ALTER TABLE examforge.attempt_items DROP CONSTRAINT attempt_item_one_source,
  DROP COLUMN catalogue_question_id, ALTER COLUMN question_id SET NOT NULL;
ALTER TABLE examforge.exam_attempts DROP CONSTRAINT attempt_catalogue_snapshot,
  DROP COLUMN catalogue, DROP COLUMN subject_grade_id;
ALTER TABLE examforge.topics DROP COLUMN subject_grade_id;
DROP TABLE examforge.catalogue_questions, examforge.catalogue_topics, examforge.subject_grades,
  examforge.subjects, examforge.grades;

COMMIT;
