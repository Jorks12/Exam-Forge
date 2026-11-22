BEGIN;

-- An attempt belongs to the student, while its source question can belong
-- to the shared bank administrator. The attempt/user foreign key stays intact.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'examforge.attempt_items'::regclass AND conname = 'attempt_items_question_id_fkey'
  ) THEN
    ALTER TABLE examforge.attempt_items
      DROP CONSTRAINT attempt_items_question_id_user_id_fkey,
      ADD CONSTRAINT attempt_items_question_id_fkey
        FOREIGN KEY (question_id) REFERENCES examforge.questions(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

COMMIT;
