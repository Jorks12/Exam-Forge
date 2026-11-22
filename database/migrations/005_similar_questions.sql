BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Respect existing installations of pg_trgm, including those in public.
DO $migration$
DECLARE
  extension_schema name;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION examforge.question_search_score(needle text, content text)
    RETURNS real LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN CASE
      WHEN pg_catalog.strpos(pg_catalog.lower(content), pg_catalog.lower(needle)) > 0 THEN 2::real
      WHEN pg_catalog.char_length(needle) >= 4
        THEN %I.word_similarity(pg_catalog.lower(needle), pg_catalog.lower(content))
      ELSE 0::real
    END
  $sql$, extension_schema);

  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION examforge.question_similarity(draft text, content text)
    RETURNS real LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN CASE
      WHEN pg_catalog.lower(draft) = pg_catalog.lower(content) THEN 1::real
      ELSE %I.similarity(pg_catalog.lower(draft), pg_catalog.lower(content))
    END
  $sql$, extension_schema);
END
$migration$;

REVOKE EXECUTE ON FUNCTION examforge.question_search_score(text, text),
  examforge.question_similarity(text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
