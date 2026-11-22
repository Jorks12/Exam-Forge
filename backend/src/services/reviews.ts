import { DefaultScheduler, Rating } from 'ts-fsrs';
import type { AttemptItem } from '../repositories/attempts.ts';
import type { Database } from '../repositories/database.ts';
import { ApiError, found } from '../utils/errors.ts';

const ratings = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<'FSRS-7'>>>;
type Card = Parameters<Scheduler['review']>[0]['card'];
type StoredCard = Omit<Card, 'dueAt' | 'lastReviewAt'> & {
  dueAt: string; lastReviewAt?: string | null;
};

// A new exam supersedes the previous snapshot for the same source question.
const latest = `
  WITH latest AS (
    SELECT DISTINCT ON (i.question_id, i.catalogue_question_id) i.id, i.is_correct, a.submitted_at
    FROM examforge.exam_attempts a JOIN examforge.attempt_items i ON i.attempt_id = a.id
    WHERE a.user_id = $1 AND a.status IN ('completed', 'expired')
    ORDER BY i.question_id, i.catalogue_question_id, a.submitted_at DESC, a.id DESC
  ), queue AS (
    SELECT latest.id, coalesce(r.revision, 0) AS revision,
      coalesce(r.due_at, latest.submitted_at) AS due_at, r.state
    FROM latest LEFT JOIN examforge.review_cards r ON r.item_id = latest.id
    WHERE latest.is_correct = false
  )`;

export function reviewService(db: Database) {
  let scheduler: Promise<Scheduler> | undefined;
  return {
    async next(userId: string) {
      const { rows: [candidate] } = await db.query<Pick<AttemptItem, 'id' | 'content' | 'topic_name' |
        'options' | 'correct_option_id' | 'explanation'> & { revision: number; due_at: Date; due: boolean }>(`
        ${latest}
        SELECT i.id, i.content, i.topic_name, i.options, i.correct_option_id, i.explanation,
          q.revision, q.due_at, q.due_at <= statement_timestamp() AS due
        FROM queue q JOIN examforge.attempt_items i ON i.id = q.id
        ORDER BY due DESC, CASE WHEN q.due_at <= statement_timestamp() THEN q.revision = 0 ELSE false END,
          q.due_at, q.id LIMIT 1`, [userId]);
      if (!candidate) return { card: null, next_due_at: null };
      const { due, due_at, ...card } = candidate;
      return due ? { card, next_due_at: null } : { card: null, next_due_at: due_at };
    },

    async rate(userId: string, itemId: string, revision: number, rating: keyof typeof ratings) {
      const { rows } = await db.query<{ revision: number; due_at: Date; state: StoredCard | null; now: Date }>(`
        ${latest}
        SELECT revision, due_at, state, statement_timestamp() AS now FROM queue WHERE id = $2`, [userId, itemId]);
      const { due_at, state, now, revision: current } = found(rows[0]);
      const conflict = () => new ApiError(409, 'REVIEW_UPDATED', 'Преговорът е обновен. Заредете следващия въпрос.');
      if (revision !== current || due_at > now) throw conflict();
      const engine = await (scheduler ??= DefaultScheduler({ version: 'FSRS-7', enableFuzz: false }));
      const card = state ? { ...state, dueAt: new Date(state.dueAt),
        lastReviewAt: state.lastReviewAt ? new Date(state.lastReviewAt) : null } : engine.newCard({ now });
      const next = engine.review({ card, now, grade: ratings[rating] }).card;
      const { rows: saved } = await db.query(`
        INSERT INTO examforge.review_cards (item_id, revision, due_at, state)
        VALUES ($1, $2::integer + 1, $3, $4)
        ON CONFLICT (item_id) DO UPDATE SET revision = EXCLUDED.revision,
          due_at = EXCLUDED.due_at, state = EXCLUDED.state
        WHERE review_cards.revision = $2
        RETURNING item_id`, [itemId, revision, next.dueAt, JSON.stringify(next)]);
      if (!saved.length) throw conflict();
    },
  };
}
