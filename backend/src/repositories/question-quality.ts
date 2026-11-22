import { sampleCorrelation } from 'simple-statistics';
import type { Database } from './database.ts';
import { labels } from '../validators/schemas.ts';

const minimumSample = 10;

interface QualityRow {
  id: string;
  catalogue: boolean;
  content: string;
  topic_name: string;
  correct_label: typeof labels[number];
  options: Record<typeof labels[number], string>;
  submitted_at: string;
  attempts: number;
  correct: number;
  unanswered: number;
  selections: number[];
  item_scores: number[] | null;
  rest_scores: number[] | null;
}

export async function questionQuality(db: Database, userId: string, page: number, limit: number) {
  const { rows: [result] } = await db.query<{ total: number; items: QualityRow[] }>(`
    WITH snapshots AS MATERIALIZED (
      SELECT a.id AS attempt_id, a.submitted_at, coalesce(i.question_id, i.catalogue_question_id) AS id,
        i.catalogue_question_id IS NOT NULL AS catalogue, i.content, i.topic_name, i.is_correct::int AS correct,
        opts.*, (a.score - i.is_correct::int)::float8 / nullif(a.total_questions - 1, 0) AS rest_score
      FROM examforge.exam_attempts a JOIN examforge.attempt_items i ON i.attempt_id = a.id
      CROSS JOIN LATERAL (
        SELECT jsonb_object_agg(o->>'label', o->>'content') AS options,
          max(o->>'label') FILTER (WHERE o->>'id' = i.correct_option_id::text) AS correct_label,
          max(o->>'label') FILTER (WHERE o->>'id' = i.selected_option_id::text) AS selected_label
        FROM jsonb_array_elements(i.options) o
      ) opts
      WHERE a.user_id = $1 AND a.status IN ('completed', 'expired') AND i.is_correct IS NOT NULL
    ), latest AS (
      SELECT DISTINCT ON (catalogue, id) * FROM snapshots
      ORDER BY catalogue, id, submitted_at DESC, attempt_id DESC
    ), requested AS (
      SELECT id, catalogue, content, topic_name, options, correct_label, submitted_at
      FROM latest ORDER BY submitted_at DESC, catalogue, id LIMIT $2 OFFSET $3
    )
    SELECT (SELECT count(*)::int FROM latest) AS total,
      coalesce((SELECT jsonb_agg(q ORDER BY q.submitted_at DESC, q.catalogue, q.id) FROM (
        SELECT r.*, s.* FROM requested r
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS attempts, sum(correct)::int AS correct,
            count(*) FILTER (WHERE selected_label IS NULL)::int AS unanswered,
            ARRAY[count(*) FILTER (WHERE selected_label = 'A')::int,
              count(*) FILTER (WHERE selected_label = 'B')::int, count(*) FILTER (WHERE selected_label = 'C')::int,
              count(*) FILTER (WHERE selected_label = 'D')::int] AS selections,
            array_agg(correct ORDER BY attempt_id) FILTER (WHERE rest_score IS NOT NULL) AS item_scores,
            array_agg(rest_score ORDER BY attempt_id) FILTER (WHERE rest_score IS NOT NULL) AS rest_scores
          FROM snapshots s
          WHERE s.catalogue = r.catalogue AND s.id = r.id AND s.content = r.content
            AND s.options = r.options AND s.correct_label = r.correct_label
        ) s
      ) q), '[]'::jsonb) AS items`, [userId, limit, (page - 1) * limit]);

  const items = result.items.map(({ item_scores, rest_scores, selections, ...row }) => {
    const comparable = item_scores?.length ?? 0;
    const discrimination = item_scores && rest_scores && comparable >= minimumSample
      && item_scores.some(value => value !== item_scores[0]) && rest_scores.some(value => value !== rest_scores[0])
      ? Math.max(-1, Math.min(1, sampleCorrelation(item_scores, rest_scores))) : null;
    return {
      ...row, discrimination, comparable,
      options: labels.map((label, index) => ({
        label, content: row.options[label], selected: selections[index], correct: label === row.correct_label,
      })),
    };
  });
  return { items, total: result.total, page, limit, minimum_sample: minimumSample };
}
