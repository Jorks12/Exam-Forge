import type { Database, Sql } from './database.ts';
import type { Option } from './bank.ts';
import type { Catalogue } from './catalogue.ts';
import type { AnalyticsFilters, GenerateInput } from '../validators/schemas.ts';
import { found } from '../utils/errors.ts';

export interface Attempt {
  id: string;
  title: string;
  algorithm: GenerateInput['algorithm'];
  status: 'in_progress' | 'completed' | 'expired';
  time_limit_minutes: number;
  started_at: Date;
  expires_at: Date;
  submitted_at: Date | null;
  score: number | null;
  total_questions: number;
  catalogue: Catalogue | null;
  allocation: {
    topics: { id: string; name: string; actual: number; target: number | null }[];
    difficulties: { difficulty: number; actual: number; target: number | null }[];
  };
}

export interface AttemptItem {
  id: string;
  position: number;
  content: string;
  topic_id: string;
  topic_name: string;
  difficulty: number;
  options: Option[];
  selected_option_id: string | null;
  correct_option_id: string;
  explanation: string | null;
  is_correct: boolean | null;
}

export const attemptColumns = `id, title, algorithm, status, time_limit_minutes, started_at,
  expires_at, submitted_at, score, total_questions, allocation, catalogue`;

const analyticsScope = `
  WITH exams AS (
    SELECT a.* FROM examforge.exam_attempts a
    LEFT JOIN examforge.subject_grades sg ON sg.id = a.subject_grade_id
    WHERE a.user_id = $1 AND a.status <> 'in_progress'
      AND ($2::smallint IS NULL OR sg.grade = $2)
      AND ($3::text IS NULL OR sg.subject_id = $3)
      AND ($4::date IS NULL OR a.submitted_at >= ($4::date::timestamp AT TIME ZONE 'Europe/Sofia'))
      AND ($5::date IS NULL OR a.submitted_at < (($5::date + 1)::timestamp AT TIME ZONE 'Europe/Sofia'))
  )`;

function scopeValues(userId: string, filters: AnalyticsFilters) {
  return [userId, filters.grade ?? null, filters.subjectId ?? null, filters.from ?? null, filters.to ?? null];
}

export async function attemptItems(sql: Sql, attemptId: string) {
  return (await sql.query<AttemptItem>(`
    SELECT id, position, content, topic_id, topic_name, difficulty, options, selected_option_id,
      correct_option_id, explanation, is_correct
    FROM examforge.attempt_items WHERE attempt_id = $1 ORDER BY position`, [attemptId])).rows;
}

export async function lockAttempt(sql: Sql, userId: string, id: string) {
  const { rows } = await sql.query<Attempt & { now: Date }>(`
    WITH locked AS MATERIALIZED (
      SELECT ${attemptColumns} FROM examforge.exam_attempts WHERE user_id = $1 AND id = $2 FOR UPDATE
    )
    SELECT locked.*, date_trunc('milliseconds', clock_timestamp()) AS now FROM locked`, [userId, id]);
  const { now, ...attempt } = found(rows[0]);
  return { attempt, now };
}

export function attemptRepository(db: Database) {
  return {
    async list(userId: string, page: number, limit: number) {
      const { rows } = await db.query<{ total: number; items: Attempt[] }>(`
        SELECT (SELECT count(*)::int FROM examforge.exam_attempts WHERE user_id = $1) AS total,
          (SELECT coalesce(jsonb_agg(result), '[]'::jsonb) FROM (
            SELECT ${attemptColumns} FROM examforge.exam_attempts WHERE user_id = $1
            ORDER BY started_at DESC, id LIMIT $2 OFFSET $3
          ) result) AS items`, [userId, limit, (page - 1) * limit]);
      return { ...rows[0], page, limit };
    },
    async overview(userId: string, filters: AnalyticsFilters) {
      const { rows } = await db.query(`
        ${analyticsScope}, exam_stats AS (
          SELECT count(*)::int AS finalized, count(*) FILTER (WHERE status = 'completed')::int AS completed,
            coalesce(round(avg(100.0 * score / total_questions), 2), 0)::float8 AS average,
            coalesce(round(max(100.0 * score / total_questions), 2), 0)::float8 AS highest FROM exams
        ), item_stats AS (
          SELECT count(i.selected_option_id)::int AS answered, count(*) FILTER (WHERE i.is_correct)::int AS correct,
            count(*) FILTER (WHERE i.selected_option_id IS NOT NULL AND NOT i.is_correct)::int AS incorrect,
            count(*) FILTER (WHERE i.selected_option_id IS NULL)::int AS unanswered
          FROM exams e JOIN examforge.attempt_items i ON i.attempt_id = e.id
        )
        SELECT *, CASE WHEN answered = 0 THEN 0 ELSE round(100.0 * correct / answered, 2)::float8 END AS correct_rate
        FROM exam_stats CROSS JOIN item_stats`, scopeValues(userId, filters));
      return rows[0];
    },
    async topics(userId: string, filters: AnalyticsFilters) {
      return (await db.query(`
        ${analyticsScope}
        SELECT i.topic_id, (array_agg(i.topic_name ORDER BY a.submitted_at DESC, a.id))[1] AS name,
          count(*)::int AS total, count(*) FILTER (WHERE i.is_correct)::int AS correct,
          round(100.0 * count(*) FILTER (WHERE i.is_correct) / count(*), 2)::float8 AS percentage
        FROM examforge.attempt_items i JOIN exams a ON a.id = i.attempt_id
        GROUP BY i.topic_id ORDER BY name`, scopeValues(userId, filters))).rows;
    },
    async progress(userId: string, filters: AnalyticsFilters) {
      return (await db.query(`
        ${analyticsScope}
        SELECT * FROM (
          SELECT id, title, submitted_at, round(100.0 * score / total_questions, 2)::float8 AS percentage
          FROM exams
          ORDER BY submitted_at DESC, id DESC LIMIT 50
        ) recent ORDER BY submitted_at, id`, scopeValues(userId, filters))).rows;
    },
    async subjects(userId: string, filters: AnalyticsFilters) {
      return (await db.query(`
        ${analyticsScope}
        SELECT s.id, s.name, count(*)::int AS total,
          round(avg(100.0 * a.score / a.total_questions), 2)::float8 AS average
        FROM exams a JOIN examforge.subject_grades sg ON sg.id = a.subject_grade_id
        JOIN examforge.subjects s ON s.id = sg.subject_id
        GROUP BY s.id ORDER BY average DESC, s.name, s.id`, scopeValues(userId, filters))).rows;
    },
  };
}
