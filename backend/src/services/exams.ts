import { randomUUID } from 'node:crypto';
import { grade } from '../algorithms/grading.ts';
import { balancedSelection } from '../algorithms/balancedSelection.ts';
import { randomSelection } from '../algorithms/randomSelection.ts';
import { attemptColumns, attemptItems, attemptRepository, lockAttempt } from '../repositories/attempts.ts';
import type { Attempt, AttemptItem } from '../repositories/attempts.ts';
import { eligibleQuestions, selectedQuestions, sharedBankOwner } from '../repositories/bank.ts';
import { catalogueScope, eligibleCatalogueQuestions, selectedCatalogueQuestions } from '../repositories/catalogue.ts';
import type { Database, Sql } from '../repositories/database.ts';
import { ApiError, found } from '../utils/errors.ts';
import type { AnalyticsFilters, AnswerInput, GenerateInput } from '../validators/schemas.ts';

async function finalize(sql: Sql, attempt: Attempt, now: Date, items: AttemptItem[]) {
  const expired = now >= attempt.expires_at;
  const graded = grade(items);
  await sql.query(`
    UPDATE examforge.attempt_items i SET is_correct = v.verdict
    FROM unnest($2::uuid[], $3::boolean[]) v(id, verdict)
    WHERE i.attempt_id = $1 AND i.id = v.id`, [attempt.id, items.map(item => item.id), graded.verdicts]);
  const { rows } = await sql.query<Attempt>(`
    UPDATE examforge.exam_attempts SET status = $2, submitted_at = $3, score = $4
    WHERE id = $1 RETURNING ${attemptColumns}`,
  [attempt.id, expired ? 'expired' : 'completed', expired ? attempt.expires_at : now, graded.correct]);
  items.forEach((item, index) => { item.is_correct = graded.verdicts[index]; });
  return rows[0];
}

function safeItem(item: AttemptItem) {
  const { id, position, content, topic_id, topic_name, difficulty, options, selected_option_id } = item;
  return { id, position, content, topic_id, topic_name, difficulty, options, selected_option_id };
}

function result(attempt: Attempt, items: AttemptItem[]) {
  const correct = attempt.score ?? 0;
  const unanswered = items.filter(item => item.selected_option_id === null).length;
  const topics = new Map<string, { name: string; total: number; correct: number }>();
  for (const item of items) {
    const row = topics.get(item.topic_id) ?? { name: item.topic_name, total: 0, correct: 0 };
    row.total++;
    if (item.is_correct) row.correct++;
    topics.set(item.topic_id, row);
  }

  return {
    attempt,
    summary: {
      correct, incorrect: items.length - correct - unanswered, unanswered,
      percentage: Math.round(10000 * correct / attempt.total_questions) / 100,
      duration_seconds: Math.floor(((attempt.submitted_at ?? attempt.expires_at).getTime() - attempt.started_at.getTime()) / 1000),
    },
    topics: [...topics].map(([id, row]) => ({ id, ...row })),
    items: items.map(item => ({
      ...safeItem(item), explanation: item.explanation, correct_option_id: item.correct_option_id,
      is_correct: item.is_correct,
    })),
  };
}

export function examService(db: Database) {
  const repository = attemptRepository(db);

  async function expireDue(userId: string) {
    const { rows: [check] } = await db.query<{ due: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM examforge.exam_attempts
        WHERE user_id = $1 AND status = 'in_progress' AND expires_at <= statement_timestamp()
      ) AS due`, [userId]);
    if (!check.due) return;

    await db.transaction(async sql => {
      const { rows } = await sql.query<{ id: string }>(`
        SELECT id FROM examforge.exam_attempts
        WHERE user_id = $1 AND status = 'in_progress' AND expires_at <= statement_timestamp()
        ORDER BY expires_at, id FOR UPDATE`, [userId]);
      if (rows.length === 0) return;
      const ids = rows.map(attempt => attempt.id);
      // Item guards require the attempt to still be in progress when updating grades.
      await sql.query(`
        UPDATE examforge.attempt_items SET is_correct = coalesce(selected_option_id = correct_option_id, false)
        WHERE attempt_id = ANY($1::uuid[])`, [ids]);
      await sql.query(`
        WITH scores AS (
          SELECT a.id, count(*) FILTER (WHERE i.is_correct)::int AS correct
          FROM examforge.exam_attempts a LEFT JOIN examforge.attempt_items i ON i.attempt_id = a.id
          WHERE a.id = ANY($1::uuid[]) GROUP BY a.id
        )
        UPDATE examforge.exam_attempts a
        SET status = 'expired', submitted_at = a.expires_at, score = scores.correct
        FROM scores WHERE a.id = scores.id`, [ids]);
    });
  }

  async function access(userId: string, id: string, operation: 'view' | 'result' | 'submit') {
    return db.transaction(async sql => {
      const locked = await lockAttempt(sql, userId, id);
      let { attempt } = locked;
      const { now } = locked;
      if (attempt.status === 'in_progress' && (now >= attempt.expires_at || operation === 'submit')) {
        const items = await attemptItems(sql, id);
        attempt = await finalize(sql, attempt, now, items);
        if (operation !== 'view') return result(attempt, items);
      }
      if (operation === 'view') {
        const items = attempt.status === 'in_progress' ? (await attemptItems(sql, id)).map(safeItem) : [];
        return { attempt, server_now: now, items };
      }
      if (attempt.status === 'in_progress') throw new ApiError(409, 'EXAM_ACTIVE', 'Изпитът още не е приключил.');
      return result(attempt, await attemptItems(sql, id));
    });
  }

  return {
    expireDue,
    async generate(userId: string, input: GenerateInput) {
      return db.transaction(async sql => {
        const scope = input.grade !== undefined && input.subjectId
          ? await catalogueScope(sql, input.grade, input.subjectId) : null;
        const bankOwner = input.shared ? found(await sharedBankOwner(sql) ?? undefined) : userId;
        const { questions, topics } = scope
          ? await eligibleCatalogueQuestions(sql, scope.id, input.topicIds, input.difficulty)
          : await eligibleQuestions(sql, bankOwner, input.topicIds ?? [], input.difficulty);
        if (input.questionCount > questions.length) {
          throw new ApiError(422, 'INSUFFICIENT_QUESTIONS', `Налични са ${questions.length} активни въпроса.`);
        }
        const candidateTopics = new Set(questions.map(question => question.topic_id));
        const balancedTopics = topics.filter(topic => !scope || candidateTopics.has(topic.id)).map(topic => topic.id);
        const balanced = input.algorithm === 'balanced'
          ? balancedSelection(questions, input.questionCount, balancedTopics, Math.random,
            input.difficulty === undefined ? undefined
              : [Number(input.difficulty === 1), Number(input.difficulty === 2), Number(input.difficulty === 3)])
          : null;
        const chosen = balanced?.questions ?? randomSelection(questions, input.questionCount);
        const allocation: Attempt['allocation'] = {
          topics: topics.map(topic => ({
            ...topic,
            target: balanced ? balanced.topics.find(row => row.id === topic.id)?.target ?? 0 : null,
            actual: chosen.filter(question => question.topic_id === topic.id).length,
          })),
          difficulties: ([1, 2, 3] as const).map(difficulty => ({
            difficulty,
            target: balanced?.difficulties.find(row => row.difficulty === difficulty)?.target ?? null,
            actual: chosen.filter(question => question.difficulty === difficulty).length,
          })),
        };
        const ids = chosen.map(question => question.id);
        const selected = scope ? await selectedCatalogueQuestions(sql, ids) : await selectedQuestions(sql, bankOwner, ids);
        const metadata = scope && { grade: scope.grade, subject_id: scope.subject_id, subject_name: scope.subject_name };
        const { rows } = await sql.query<Attempt>(`
          WITH clock AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS started)
          INSERT INTO examforge.exam_attempts
            (user_id, title, algorithm, time_limit_minutes, started_at, expires_at, total_questions, allocation,
              subject_grade_id, catalogue)
          SELECT $1, $2, $3, $4, started, started + $4::int * interval '1 minute', $5, $6, $7, $8 FROM clock
          RETURNING ${attemptColumns}`, [
          userId, input.title, input.algorithm, input.timeLimitMinutes, input.questionCount, JSON.stringify(allocation),
          scope?.id ?? null, metadata ? JSON.stringify(metadata) : null,
        ]);
        const attempt = rows[0];
        const snapshots = selected.map((question, index) => {
          const options = question.options.map(option => ({ ...option, id: randomUUID() }));
          return {
            question_id: scope ? null : question.id, catalogue_question_id: scope ? question.id : null,
            position: index + 1, topic_id: question.topic_id, topic_name: question.topic_name,
            difficulty: question.difficulty, content: question.content, explanation: question.explanation, options,
            correct_option_id: options[question.options.findIndex(option => option.id === question.correct_option_id)].id,
          };
        });
        await sql.query(`
          INSERT INTO examforge.attempt_items (attempt_id, user_id, question_id, catalogue_question_id, position, topic_id,
            topic_name, difficulty, content, explanation, options, correct_option_id)
          SELECT $1, $2, s.* FROM jsonb_to_recordset($3) AS s(question_id uuid, catalogue_question_id uuid, position integer,
            topic_id uuid, topic_name text, difficulty smallint, content text, explanation text,
            options jsonb, correct_option_id uuid)`, [attempt.id, userId, JSON.stringify(snapshots)]);
        return attempt;
      }, 'repeatable read');
    },
    view: (userId: string, id: string) => access(userId, id, 'view'),
    result: (userId: string, id: string) => access(userId, id, 'result'),
    submit: (userId: string, id: string) => access(userId, id, 'submit'),
    async answer(userId: string, id: string, input: AnswerInput) {
      const status = await db.transaction(async sql => {
        const { attempt, now } = await lockAttempt(sql, userId, id);
        if (attempt.status !== 'in_progress') return attempt.status;
        if (now >= attempt.expires_at) {
          await finalize(sql, attempt, now, await attemptItems(sql, id));
          return 'expired';
        }
        const { rows: [change] } = await sql.query<{ saved: boolean; item_exists: boolean }>(`
          WITH saved AS (
            UPDATE examforge.attempt_items SET selected_option_id = $3::text::uuid
            WHERE attempt_id = $1 AND id = $2
              AND ($3::text IS NULL OR options @> jsonb_build_array(jsonb_build_object('id', $3::text)))
            RETURNING id
          )
          SELECT EXISTS (SELECT 1 FROM saved) AS saved,
            EXISTS (SELECT 1 FROM examforge.attempt_items WHERE attempt_id = $1 AND id = $2) AS item_exists`,
        [id, input.itemId, input.optionId]);
        if (!change.saved) {
          found(change.item_exists ? change : undefined);
          throw new ApiError(422, 'INVALID_OPTION', 'Отговорът не принадлежи към този въпрос.');
        }
        return 'saved';
      });
      if (status !== 'saved') {
        throw new ApiError(409, status === 'expired' ? 'EXAM_EXPIRED' : 'EXAM_FINALIZED', 'Изпитът е приключил.');
      }
      return { itemId: input.itemId, optionId: input.optionId };
    },
    async list(userId: string, page: number, limit: number) {
      await expireDue(userId);
      return repository.list(userId, page, limit);
    },
    async overview(userId: string, filters: AnalyticsFilters) {
      await expireDue(userId);
      return repository.overview(userId, filters);
    },
    async analyticsSummary(userId: string, filters: AnalyticsFilters) {
      await expireDue(userId);
      const [overview, topics, progress, subjects] = await Promise.all([
        repository.overview(userId, filters), repository.topics(userId, filters),
        repository.progress(userId, filters), repository.subjects(userId, filters),
      ]);
      return { overview, topics, progress, subjects };
    },
    async topics(userId: string, filters: AnalyticsFilters) {
      await expireDue(userId);
      return repository.topics(userId, filters);
    },
    async progress(userId: string, filters: AnalyticsFilters) {
      await expireDue(userId);
      return repository.progress(userId, filters);
    },
    async subjects(userId: string, filters: AnalyticsFilters) {
      await expireDue(userId);
      return repository.subjects(userId, filters);
    },
  };
}
