BEGIN;

INSERT INTO examforge.grades (number, name) VALUES (12, 'XII клас')
ON CONFLICT (number) DO NOTHING;

INSERT INTO examforge.subject_grades (grade, subject_id, scope)
SELECT 12, s.id, CASE WHEN s.id IN ('bulgarian', 'math', 'english', 'civics') THEN 'general' ELSE 'profile' END
FROM examforge.subjects s WHERE s.is_active
ON CONFLICT (grade, subject_id) DO NOTHING;

COMMIT;
