import type { Database, Sql } from './database.ts';
import type { Candidate } from '../algorithms/randomSelection.ts';
import type { Filters, QuestionInput, QuestionPatch, labels } from '../validators/schemas.ts';
import { found } from '../utils/errors.ts';
import { questionSearchScore } from './question-search.ts';
import { catalogueAdminEmail } from '../middleware/auth.ts';

export async function sharedBankOwner(sql: Sql) {
  const { rows } = await sql.query<{ id: string }>(`
    SELECT id FROM auth.users
    WHERE lower(email) = $1 AND email_confirmed_at IS NOT NULL
    LIMIT 2`, [catalogueAdminEmail]);
  return rows.length === 1 ? rows[0].id : null;
}

export interface Option {
  id: string;
  label: typeof labels[number];
  content: string;
}

export interface Question extends Candidate {
  topic_name: string;
  content: string;
  explanation: string | null;
  is_active: boolean;
  options: Option[];
  correct_option_id: string;
}

const questionView = `
  SELECT q.id, q.topic_id, q.content, q.difficulty, q.explanation, q.is_active,
    t.name AS topic_name, t.subject_grade_id, k.correct_option_id,
    (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'content', o.content) ORDER BY o.label)
      FROM examforge.question_options o WHERE o.question_id = q.id) AS options
  FROM examforge.questions q
  JOIN examforge.topics t ON t.id = q.topic_id
  JOIN examforge.answer_keys k ON k.question_id = q.id`;

interface TopicInput {
  name: string;
  description?: string | null;
  subjectGradeId?: string | null;
}

export function bankRepository(db: Database) {
  async function getQuestion(userId: string, id: string, sql: Sql = db) {
    return found((await sql.query<Question>(questionView + ' WHERE q.owner_id = $1 AND q.id = $2', [userId, id])).rows[0]);
  }

  return {
    async topics(userId: string | null, activeOnly = false) {
      return (await db.query(`
        SELECT t.id, t.name, t.description, t.subject_grade_id, count(q.id)::int AS question_count,
          count(q.id) FILTER (WHERE q.is_active)::int AS active_count,
          count(q.id) FILTER (WHERE q.is_active AND q.difficulty = 1)::int AS easy,
          count(q.id) FILTER (WHERE q.is_active AND q.difficulty = 2)::int AS medium,
          count(q.id) FILTER (WHERE q.is_active AND q.difficulty = 3)::int AS hard
        FROM examforge.topics t LEFT JOIN examforge.questions q ON q.topic_id = t.id AND (NOT $2::boolean OR q.is_active)
        WHERE t.owner_id = $1 GROUP BY t.id
        HAVING NOT $2::boolean OR count(q.id) > 0
        ORDER BY t.name, t.id`, [userId, activeOnly])).rows;
    },
    async createTopic(userId: string, input: TopicInput) {
      return (await db.query(`
        INSERT INTO examforge.topics(owner_id, name, description, subject_grade_id)
        VALUES ($1, $2, $3, $4) RETURNING id, name, description, subject_grade_id`,
      [userId, input.name, input.description ?? null, input.subjectGradeId ?? null])).rows[0];
    },
    async updateTopic(userId: string, id: string, input: Partial<TopicInput>) {
      return found((await db.query(`
        UPDATE examforge.topics SET name = coalesce($3, name),
          description = CASE WHEN $4 THEN $5 ELSE description END,
          subject_grade_id = CASE WHEN $6 THEN $7 ELSE subject_grade_id END, updated_at = now()
        WHERE owner_id = $1 AND id = $2 RETURNING id, name, description, subject_grade_id`,
      [userId, id, input.name ?? null, input.description !== undefined, input.description ?? null,
        input.subjectGradeId !== undefined, input.subjectGradeId ?? null])).rows[0]);
    },
    async deleteTopic(userId: string, id: string) {
      found((await db.query('DELETE FROM examforge.topics WHERE owner_id = $1 AND id = $2 RETURNING id', [userId, id])).rows[0]);
    },
    async listQuestions(userId: string | null, filters: Filters, includeAnswers = true) {
      const score = questionSearchScore('$5', 'q.content', Boolean(filters.search));
      const where = ` WHERE q.owner_id = $1 AND ($2::uuid IS NULL OR q.topic_id = $2)
        AND ($3::int IS NULL OR q.difficulty = $3)
        AND ($4::boolean IS NULL OR q.is_active = $4)
        AND ${score} >= 0.5`;
      const values = [userId, filters.topicId ?? null, filters.difficulty ?? null, filters.active ?? null, filters.search || null];
      const { rows } = await db.query<{ total: number; items: Question[] }>(`
        SELECT (SELECT count(*)::int FROM examforge.questions q ${where}) AS total,
          (SELECT coalesce(jsonb_agg(${includeAnswers ? 'to_jsonb(record)' : "to_jsonb(record) - 'correct_option_id' - 'explanation'"}), '[]'::jsonb) FROM (${questionView}${where}
            ORDER BY ${score} DESC, q.created_at DESC, q.id LIMIT $6 OFFSET $7) record) AS items`,
      [...values, filters.limit, (filters.page - 1) * filters.limit]);
      return { ...rows[0], page: filters.page, limit: filters.limit };
    },
    getQuestion,
    async similarQuestions(userId: string, content: string, excludeId?: string) {
      return (await db.query(`
        WITH candidates AS MATERIALIZED (
          SELECT q.id, q.content, t.name AS topic_name, q.is_active,
            examforge.question_similarity($2, q.content) AS similarity
          FROM examforge.questions q JOIN examforge.topics t ON t.id = q.topic_id
          WHERE q.owner_id = $1 AND ($3::uuid IS NULL OR q.id <> $3)
        )
        SELECT * FROM candidates WHERE similarity >= 0.72
        ORDER BY similarity DESC, id LIMIT 3`, [userId, content, excludeId ?? null])).rows;
    },
    async counts(userId: string, filters: { topicId?: string; difficulty?: number; search?: string }) {
      const score = questionSearchScore('$4', 'content', Boolean(filters.search));
      return (await db.query(`
        SELECT count(*)::int AS active_count,
          count(*) FILTER (WHERE difficulty = 1)::int AS easy,
          count(*) FILTER (WHERE difficulty = 2)::int AS medium,
          count(*) FILTER (WHERE difficulty = 3)::int AS hard
        FROM examforge.questions WHERE owner_id = $1 AND is_active
          AND ($2::uuid IS NULL OR topic_id = $2) AND ($3::smallint IS NULL OR difficulty = $3)
          AND ${score} >= 0.5`,
      [userId, filters.topicId ?? null, filters.difficulty ?? null, filters.search || null])).rows[0];
    },
    async saveQuestion(userId: string, input: QuestionInput | QuestionPatch, id?: string) {
      return db.transaction(async sql => {
        if (input.topicId) {
          found((await sql.query('SELECT id FROM examforge.topics WHERE owner_id = $1 AND id = $2 FOR KEY SHARE',
            [userId, input.topicId])).rows[0]);
        }
        let questionId: string;
        if (id) {
          questionId = found((await sql.query<{ id: string }>(`
            UPDATE examforge.questions SET topic_id = coalesce($3, topic_id), content = coalesce($4, content),
              difficulty = coalesce($5, difficulty), explanation = CASE WHEN $6 THEN $7 ELSE explanation END,
              is_active = coalesce($8, is_active), updated_at = now()
            WHERE owner_id = $1 AND id = $2 RETURNING id`, [
            userId, id, input.topicId ?? null, input.content ?? null, input.difficulty ?? null,
            input.explanation !== undefined, input.explanation ?? null, input.isActive ?? null,
          ])).rows[0]).id;
        } else {
          questionId = (await sql.query<{ id: string }>(`
            INSERT INTO examforge.questions(owner_id, topic_id, content, difficulty, explanation, is_active)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [
            userId, input.topicId, input.content, input.difficulty, input.explanation ?? null, input.isActive ?? true,
          ])).rows[0].id;
        }

        if (input.options) {
          await sql.query(`
            INSERT INTO examforge.question_options(question_id, label, content)
            SELECT $1, key, value FROM jsonb_each_text($2)
            ON CONFLICT (question_id, label) DO UPDATE SET content = excluded.content`,
          [questionId, JSON.stringify(input.options)]);
        }
        if (input.correctLabel) {
          await sql.query(`
            INSERT INTO examforge.answer_keys(question_id, correct_option_id)
            SELECT question_id, id FROM examforge.question_options WHERE question_id = $1 AND label = $2
            ON CONFLICT (question_id) DO UPDATE SET correct_option_id = excluded.correct_option_id`,
          [questionId, input.correctLabel]);
        }
        return getQuestion(userId, questionId, sql);
      });
    },
    async archive(userId: string, id: string) {
      found((await db.query(`
        UPDATE examforge.questions SET is_active = false, updated_at = now()
        WHERE owner_id = $1 AND id = $2 RETURNING id`, [userId, id])).rows[0]);
    },
  };
}

export async function eligibleQuestions(sql: Sql, userId: string, topicIds: string[], difficulty?: number) {
  const { rows: [selection] } = await sql.query<{ topics: { id: string; name: string }[]; questions: Candidate[] }>(`
    SELECT
      (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT id, name FROM examforge.topics WHERE owner_id = $1 AND id = ANY($2::uuid[])
      ) t) AS topics,
      (SELECT coalesce(jsonb_agg(c ORDER BY c.id), '[]'::jsonb) FROM (
        SELECT q.id, q.topic_id, q.difficulty
        FROM examforge.questions q JOIN examforge.answer_keys k ON k.question_id = q.id
        WHERE q.owner_id = $1 AND q.is_active AND q.topic_id = ANY($2::uuid[])
          AND ($3::smallint IS NULL OR q.difficulty = $3)
      ) c) AS questions`, [userId, topicIds, difficulty ?? null]);
  if (selection.topics.length !== topicIds.length) found(undefined);
  return selection;
}

export async function selectedQuestions(sql: Sql, userId: string, ids: string[]) {
  const { rows } = await sql.query<Question>(questionView + ' WHERE q.owner_id = $1 AND q.id = ANY($2::uuid[])', [userId, ids]);
  const byId = new Map(rows.map(question => [question.id, question]));
  return ids.map(id => found(byId.get(id)));
}
