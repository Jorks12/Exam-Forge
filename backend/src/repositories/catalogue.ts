import type { Candidate } from '../algorithms/randomSelection.ts';
import { found } from '../utils/errors.ts';
import { labels } from '../validators/schemas.ts';
import type { CountFilters, Filters } from '../validators/schemas.ts';
import type { Database, Sql } from './database.ts';
import type { Question } from './bank.ts';
import { questionSearchScore } from './question-search.ts';

export interface Catalogue {
  grade: number;
  subject_id: string;
  subject_name: string;
}

const subjectList = `
  SELECT sg.id AS subject_grade_id, sg.grade, s.id, s.name, s.icon, s.description, sg.scope,
    count(DISTINCT t.id)::int AS topic_count, count(q.id)::int AS active_count
  FROM examforge.subject_grades sg JOIN examforge.subjects s ON s.id = sg.subject_id
  LEFT JOIN examforge.catalogue_topics t ON t.subject_grade_id = sg.id
  LEFT JOIN examforge.catalogue_questions q ON q.topic_id = t.id AND q.is_active
  WHERE s.is_active AND ($1::int IS NULL OR sg.grade = $1) AND ($2::text IS NULL OR s.id = $2)
  GROUP BY sg.id, s.id ORDER BY sg.grade, s.name, s.id`;

const filtered = (active: string) => `
  FROM examforge.catalogue_questions q
  JOIN examforge.catalogue_topics t ON t.id = q.topic_id
  WHERE t.subject_grade_id = $1 AND q.is_active = ${active}
    AND ($2::uuid IS NULL OR t.id = $2)
    AND ($3::smallint IS NULL OR q.difficulty = $3)`;

export async function catalogueScope(sql: Sql, grade: number, subjectId: string) {
  return found((await sql.query<Catalogue & { id: string }>(`
    SELECT sg.id, sg.grade, s.id AS subject_id, s.name AS subject_name
    FROM examforge.subject_grades sg JOIN examforge.subjects s ON s.id = sg.subject_id
    WHERE sg.grade = $1 AND s.id = $2 AND s.is_active`, [grade, subjectId])).rows[0]);
}

export function catalogueRepository(db: Database) {
  async function subjects(grade?: number, subjectId?: string) {
    return (await db.query(subjectList, [grade ?? null, subjectId ?? null])).rows;
  }

  return {
    async grades() {
      return (await db.query('SELECT number, name FROM examforge.grades ORDER BY number')).rows;
    },
    subjects,
    async subject(subjectId: string, grade?: number) {
      const grades = await subjects(grade, subjectId);
      const { id, name, icon, description } = found(grades[0]);
      return { id, name, icon, description, grades };
    },
    async topics(subjectId: string, grade: number) {
      const scope = await catalogueScope(db, grade, subjectId);
      return (await db.query(`
        SELECT t.id, t.name, count(q.id)::int AS active_count,
          count(q.id) FILTER (WHERE q.difficulty = 1)::int AS easy,
          count(q.id) FILTER (WHERE q.difficulty = 2)::int AS medium,
          count(q.id) FILTER (WHERE q.difficulty = 3)::int AS hard
        FROM examforge.catalogue_topics t
        LEFT JOIN examforge.catalogue_questions q ON q.topic_id = t.id AND q.is_active
        WHERE t.subject_grade_id = $1 GROUP BY t.id ORDER BY t.name, t.id`, [scope.id])).rows;
    },
    async setQuestionActive(questionId: string, isActive: boolean) {
      return found((await db.query(`
        UPDATE examforge.catalogue_questions SET is_active = $2 WHERE id = $1 RETURNING id`,
      [questionId, isActive])).rows[0]);
    },
    async list(filters: Filters & { grade: number; subjectId: string }, admin = false) {
      const { grade, subjectId, page, limit, active, topicId, difficulty, search } = filters;
      const scope = await catalogueScope(db, grade, subjectId);
      if (active === 'false' && !admin) return { items: [], total: 0, page, limit };
      const score = questionSearchScore('$4', 'q.content', Boolean(search));
      const { rows: [data] } = await db.query(`
        WITH matches AS MATERIALIZED (
          SELECT q.id, q.topic_id, t.name AS topic_name, q.content, q.difficulty, q.options,
            ${score} AS search_score ${filtered('$7::boolean')} AND ${score} >= 0.5
        )
        SELECT (SELECT count(*)::int FROM matches) AS total,
          (SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
            FROM (SELECT id, topic_id, topic_name, content, difficulty, options
              FROM matches ORDER BY search_score DESC, topic_name, id LIMIT $5 OFFSET $6) item) AS items`,
      [scope.id, topicId ?? null, difficulty ?? null, search || null, limit, (page - 1) * limit, active !== 'false']);
      return { ...data, page, limit };
    },
    async counts(filters: CountFilters & { grade: number; subjectId: string }) {
      const scope = await catalogueScope(db, filters.grade, filters.subjectId);
      const score = questionSearchScore('$4', 'q.content', Boolean(filters.search));
      return (await db.query(`
        SELECT count(*)::int AS active_count,
          count(*) FILTER (WHERE q.difficulty = 1)::int AS easy,
          count(*) FILTER (WHERE q.difficulty = 2)::int AS medium,
          count(*) FILTER (WHERE q.difficulty = 3)::int AS hard
        ${filtered('true')} AND ${score} >= 0.5`, [scope.id, filters.topicId ?? null, filters.difficulty ?? null, filters.search || null])).rows[0];
    },
  };
}

export async function eligibleCatalogueQuestions(sql: Sql, scopeId: string, topicIds?: string[], difficulty?: number) {
  const { rows: [data] } = await sql.query<{ topics: { id: string; name: string }[]; questions: Candidate[] }>(`
    WITH topics AS (
      SELECT id, name FROM examforge.catalogue_topics
      WHERE subject_grade_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
    )
    SELECT (SELECT coalesce(jsonb_agg(t ORDER BY id), '[]') FROM topics t) AS topics,
      (SELECT coalesce(jsonb_agg(c ORDER BY c.id), '[]') FROM (
        SELECT q.id, q.topic_id, q.difficulty FROM examforge.catalogue_questions q
        JOIN topics t ON t.id = q.topic_id WHERE q.is_active AND ($3::smallint IS NULL OR q.difficulty = $3)
      ) c) AS questions`, [scopeId, topicIds ?? null, difficulty ?? null]);
  if (topicIds && data.topics.length !== topicIds.length) found(undefined);
  return data;
}

export async function selectedCatalogueQuestions(sql: Sql, ids: string[]): Promise<Question[]> {
  const { rows } = await sql.query<Omit<Question, 'options' | 'correct_option_id'> & {
    options: string[]; correct_index: number;
  }>(`
    SELECT q.id, q.topic_id, t.name AS topic_name, q.difficulty, q.is_active, q.content,
      q.explanation, q.options, q.correct_index
    FROM examforge.catalogue_questions q JOIN examforge.catalogue_topics t ON t.id = q.topic_id
    WHERE q.id = ANY($1::uuid[])`, [ids]);
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.map(id => {
    const { options, correct_index, ...question } = found(byId.get(id));
    return {
      ...question, options: labels.map((label, index) => ({ id: label, label, content: options[index] })),
      correct_option_id: labels[correct_index - 1],
    };
  });
}
