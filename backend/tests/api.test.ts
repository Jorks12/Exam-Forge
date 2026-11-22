import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Database } from '../src/repositories/database.ts';
import { seedBank } from '../scripts/seed-bank.ts';
import { catalogueAdminEmail } from '../src/middleware/auth.ts';

const alice = '71111111-1111-4111-8111-111111111111';
const bob = '72222222-2222-4222-8222-222222222222';
const pg = new PGlite({ extensions: { pg_trgm } });
const db: Database = {
  query: (text, values) => pg.query(text, values),
  transaction: operation => pg.transaction(operation),
};
const app = createApp({
  db, origin: 'http://localhost:3000', log: false,
  verify: async token => ({ alice: { id: alice, email: catalogueAdminEmail }, bob: { id: bob } })[token] ?? null,
});
const api = request(app);
const auth = { Authorization: 'Bearer alice' };
const other = { Authorization: 'Bearer bob' };
const generate = (topicIds: string[], algorithm = 'balanced', questionCount = 1) => ({
  title: 'Пробен изпит', topicIds, algorithm, questionCount, timeLimitMinutes: 5,
});

let topic: string;
let question: string;
beforeAll(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    INSERT INTO auth.users VALUES ('${alice}', '${catalogueAdminEmail}', now()), ('${bob}', 'bob@example.test', now());`);
  await pg.exec(await readFile(new URL('../../database/migrations/001_examforge.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../../database/migrations/002_catalogue.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../../database/migrations/003_grade_12.sql', import.meta.url), 'utf8'));
  const reviewMigration = await readFile(new URL('../../database/migrations/004_review_cards.sql', import.meta.url), 'utf8');
  await pg.exec(reviewMigration);
  await pg.exec(reviewMigration);
  const searchMigration = await readFile(new URL('../../database/migrations/005_similar_questions.sql', import.meta.url), 'utf8');
  await pg.exec(searchMigration);
  await pg.exec(searchMigration);
  const sharedMigration = await readFile(new URL('../../database/migrations/006_shared_question_bank.sql', import.meta.url), 'utf8');
  await pg.exec(sharedMigration);
  await pg.exec(sharedMigration);
  topic = (await api.post('/api/topics').set(auth).send({ name: 'Цикли' }).expect(201)).body.data.id;
  question = (await api.post('/api/questions').set(auth).send({
    topicId: topic, content: 'Колко е 2 + 2?', difficulty: 1, explanation: 'Събираме две двойки.',
    options: { A: '4', B: '3', C: '5', D: '6' }, correctLabel: 'A',
  }).expect(201)).body.data.id;
}, 30000);
afterAll(() => pg.close());

describe('REST API with the PostgreSQL migration', () => {
  it('checks authentication, ownership, validation, filters and topic references', async () => {
    await api.get('/api/health').expect(200);
    await api.get('/api/topics').expect(401);
    await api.get('/api/topics').set(other).expect(200, { data: [] });
    await api.get('/api/questions/' + question).set(other).expect(404);
    await api.patch('/api/questions/' + question).set(other).send({ difficulty: 2 }).expect(403);
    await api.post('/api/topics').set(auth).send({ name: '' }).expect(400);
    await api.delete('/api/topics/' + topic).set(auth).expect(409);
    const list = await api.get('/api/questions').set(auth).query({ topicId: topic, difficulty: 1, search: 'КОЛКО' }).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    await api.post('/api/exams/generate').set(other).send(generate([topic])).expect(404);
    await api.post('/api/exams/generate').set(auth).send(generate([topic], 'random', 20)).expect(422);
  });

  it('shares active admin questions without keys and keeps the student’s exam private', async () => {
    await api.get('/api/questions/shared').expect(401);
    await api.get('/api/topics/shared').set(other).expect(200)
      .expect(response => expect(response.body.data).toMatchObject([{ id: topic, active_count: 1, easy: 1 }]));
    const { body: { data: { items } } } = await api.get('/api/questions/shared').set(other).expect(200);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: question, topic_id: topic });
    expect(items[0]).not.toHaveProperty('correct_option_id');
    expect(items[0]).not.toHaveProperty('explanation');
    await api.post('/api/questions').set(other).send({}).expect(403);
    await api.delete('/api/questions/' + question).set(other).expect(403);
    await api.delete('/api/topics/' + topic).set(other).expect(403);
    const { body: { data: attempt } } = await api.post('/api/exams/generate').set(other)
      .send({ ...generate([topic]), shared: true }).expect(201);
    await api.get('/api/exams/' + attempt.id).set(auth).expect(404);
    const { body: { data: exam } } = await api.get('/api/exams/' + attempt.id).set(other).expect(200);
    expect(exam.items[0]).not.toHaveProperty('correct_option_id');
    await api.patch('/api/exams/' + attempt.id + '/answers').set(other)
      .send({ itemId: exam.items[0].id, optionId: exam.items[0].options.find((option: { content: string }) => option.content === '4').id })
      .expect(200);
    await api.post('/api/exams/' + attempt.id + '/submit').set(other).expect(200);
    await api.get('/api/results/' + attempt.id).set(other).expect(200)
      .expect(response => expect(response.body.data.attempt.score).toBe(1));
    await api.get('/api/results/' + attempt.id).set(auth).expect(404);
    await pg.query('DELETE FROM examforge.exam_attempts WHERE id = $1', [attempt.id]);
    await api.patch('/api/questions/' + question).set(auth).send({ content: 'Колко е сборът на 2 и 2?' }).expect(200);
    for (const account of [auth, other]) {
      await api.get('/api/questions/shared').set(account).expect(200)
        .expect(response => expect(response.body.data.items[0]).toMatchObject({
          id: question, content: 'Колко е сборът на 2 и 2?',
        }));
    }
    await api.patch('/api/questions/' + question).set(auth).send({ content: 'Колко е 2 + 2?' }).expect(200);
  });

  it('keeps answer keys out of active exams and grades a snapshot once', async () => {
    const generated = await api.post('/api/exams/generate').set(auth).send(generate([topic])).expect(201);
    const id = generated.body.data.id;
    const url = '/api/exams/' + id;
    await api.get(url).set(other).expect(404);
    await api.get('/api/results/' + id).set(auth).expect(409);
    const view = await api.get(url).set(auth).expect(200);
    const item = view.body.data.items[0];
    expect(item).not.toHaveProperty('correct_option_id');
    expect(item).not.toHaveProperty('explanation');
    expect(item).not.toHaveProperty('is_correct');
    await expect(pg.query('UPDATE examforge.attempt_items SET content = $1 WHERE id = $2', ['Tampered', item.id]))
      .rejects.toMatchObject({ code: '23514' });
    await api.patch(url + '/answers').set(auth).send({ itemId: item.id, optionId: alice }).expect(422);
    await api.patch(url + '/answers').set(auth).send({ itemId: item.id, optionId: item.options[0].id }).expect(200);
    await api.patch('/api/questions/' + question).set(auth).send({ content: 'Променен въпрос?', correctLabel: 'B' }).expect(200);
    await api.post(url + '/submit').set(other).expect(404);

    const [submitted, repeated] = await Promise.all([
      api.post(url + '/submit').set(auth).expect(200),
      api.post(url + '/submit').set(auth).expect(200),
    ]);
    expect(submitted.body.data).toEqual(repeated.body.data);
    expect(submitted.body.data.summary.percentage).toBe(100);
    expect(submitted.body.data.items[0].content).toBe('Колко е 2 + 2?');
    await api.patch(url + '/answers').set(auth).send({ itemId: item.id, optionId: null }).expect(409);
    await api.get('/api/results/' + id).set(other).expect(404);
    const overview = await api.get('/api/analytics/overview').set(auth).expect(200);
    expect(overview.body.data).toMatchObject({ completed: 1, answered: 1, average: 100 });
    const history = await api.get('/api/results').set(auth).expect(200);
    expect(history.body.data.items[0].id).toBe(id);
    await api.get('/api/analytics/topics').set(auth).expect(200);
    await api.get('/api/analytics/progress').set(auth).expect(200);
  });

  it('finalizes expiration while rejecting a late answer', async () => {
    const response = await api.post('/api/exams/generate').set(auth).send(generate([topic], 'random')).expect(201);
    const id = response.body.data.id;
    const view = await api.get('/api/exams/' + id).set(auth).expect(200);
    // Use database time in the past to exercise expiration without sleeping.
    await pg.exec(`ALTER TABLE examforge.exam_attempts DISABLE TRIGGER attempt_transition;
      UPDATE examforge.exam_attempts SET started_at = '2020-01-01 00:00:00+00', expires_at = '2020-01-01 00:05:00+00'
        WHERE id = '${id}';
      ALTER TABLE examforge.exam_attempts ENABLE TRIGGER attempt_transition;`);
    const late = await api.patch('/api/exams/' + id + '/answers').set(auth)
      .send({ itemId: view.body.data.items[0].id, optionId: null }).expect(409);
    expect(late.body.error.code).toBe('EXAM_EXPIRED');
    const result = await api.get('/api/results/' + id).set(auth).expect(200);
    expect(result.body.data.attempt.status).toBe('expired');
    expect(result.body.data.summary).toMatchObject({ unanswered: 1, percentage: 0, duration_seconds: 300 });
    await api.delete('/api/questions/' + question).set(auth).expect(204);
    await api.get('/api/questions/shared').set(other).query({ topicId: topic, active: 'false' })
      .expect(200, { data: { items: [], total: 0, page: 1, limit: 20 } });
    await api.post('/api/exams/generate').set(auth).send(generate([topic])).expect(422);
  });

  it('enforces deferred bank integrity and denies direct anonymous access', async () => {
    await expect(pg.query(`INSERT INTO examforge.questions(owner_id, topic_id, content, difficulty)
      VALUES ($1,$2,'Без отговори',1)`, [alice, topic])).rejects.toMatchObject({ code: '23514' });
    await expect(pg.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.exec('SELECT * FROM examforge.answer_keys');
    })).rejects.toMatchObject({ code: '42501' });
  });

  it('schedules missed questions with FSRS and rejects duplicate or foreign ratings', async () => {
    await api.get('/api/review/next').expect(401);
    const created = await api.post('/api/topics').set(auth).send({ name: 'Преговор' }).expect(201);
    const reviewTopic = created.body.data.id;
    await api.post('/api/questions').set(auth).send({
      topicId: reviewTopic, content: 'Кое число е четно?', difficulty: 1,
      options: { A: '2', B: '3', C: '5', D: '7' }, correctLabel: 'A',
    }).expect(201);

    async function attempt() {
      const response = await api.post('/api/exams/generate').set(auth).send(generate([reviewTopic])).expect(201);
      const path = '/api/exams/' + response.body.data.id;
      const view = await api.get(path).set(auth).expect(200);
      return { path, item: view.body.data.items[0] };
    }

    const { path, item } = await attempt();
    const rate = '/api/review/' + item.id;
    await api.get('/api/review/next').set(auth).expect(200, { data: { card: null, next_due_at: null } });
    await api.post(rate).set(auth).send({ revision: 0, rating: 'good' }).expect(404);
    await api.post(path + '/submit').set(auth).expect(200);
    const due = await api.get('/api/review/next').set(auth).expect(200);
    expect(due.body.data.card).toMatchObject({ id: item.id, revision: 0, correct_option_id: item.options[0].id });
    await api.get('/api/review/next').set(other).expect(200, { data: { card: null, next_due_at: null } });
    await api.post(rate).set(other).send({ revision: 0, rating: 'good' }).expect(404);
    await api.post(rate).set(auth).send({ revision: 0, rating: 'wrong' }).expect(400);

    const responses = await Promise.all([
      api.post(rate).set(auth).send({ revision: 0, rating: 'again' }),
      api.post(rate).set(auth).send({ revision: 0, rating: 'again' }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([204, 409]);
    const scheduled = await api.get('/api/review/next').set(auth).expect(200);
    expect(scheduled.body.data.card).toBeNull();
    expect(Date.parse(scheduled.body.data.next_due_at)).toBeGreaterThan(Date.now());
    await expect(pg.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.exec('SELECT * FROM examforge.review_cards');
    })).rejects.toMatchObject({ code: '42501' });

    await pg.query(`UPDATE examforge.review_cards
      SET due_at = now() - interval '1 day', state = state || jsonb_build_object(
        'dueAt', now() - interval '1 day', 'lastReviewAt', now() - interval '2 days')
      WHERE item_id = $1`, [item.id]);
    const repeated = await api.get('/api/review/next').set(auth).expect(200);
    expect(repeated.body.data.card).toMatchObject({ id: item.id, revision: 1 });
    await api.post(rate).set(auth).send({ revision: 1, rating: 'easy' }).expect(204);
    const persisted = await pg.query('SELECT revision, state FROM examforge.review_cards WHERE item_id = $1', [item.id]);
    expect(persisted.rows[0]).toMatchObject({ revision: 2, state: { reps: 2 } });

    const retried = await attempt();
    await api.patch(retried.path + '/answers').set(auth).send({ itemId: retried.item.id, optionId: retried.item.options[0].id }).expect(200);
    await api.post(retried.path + '/submit').set(auth).expect(200);
    await api.get('/api/review/next').set(auth).expect(200, { data: { card: null, next_due_at: null } });
  });

  it('imports 120 questions and preserves existing questions on repeat', async () => {
    expect(await seedBank(db, bob)).toBe(120);
    expect(await seedBank(db, bob)).toBe(0);
    const topics = await api.get('/api/topics').set(other).expect(200);
    expect(topics.body.data.map((row: { active_count: number }) => row.active_count)).toEqual([30, 30, 30, 30]);
    for (const algorithm of ['random', 'balanced']) {
      const response = await api.post('/api/exams/generate').set(other)
        .send(generate(topics.body.data.map((row: { id: string }) => row.id), algorithm, 20)).expect(201);
      const attempt = response.body.data;
      const exam = await api.get('/api/exams/' + attempt.id).set(other).expect(200);
      expect(exam.body.data.items).toHaveLength(20);
      if (algorithm === 'balanced') {
        expect(attempt.allocation.topics.map((row: { actual: number }) => row.actual)).toEqual([5, 5, 5, 5]);
        expect(attempt.allocation.difficulties.map((row: { actual: number }) => row.actual)).toEqual([6, 10, 4]);
      }
    }
  });

  it('ranks typo-tolerant search and restricts duplicate suggestions to the owner', async () => {
    const reviewTopic = (await api.post('/api/topics').set(auth).send({ name: 'Търсене' }).expect(201)).body.data.id;
    const content = 'Кое е числото, което се дели на шест без остатък?';
    const duplicate = (await api.post('/api/questions').set(auth).send({
      topicId: reviewTopic, content, difficulty: 1,
      options: { A: '6', B: '3', C: '5', D: '7' }, correctLabel: 'A',
    }).expect(201)).body.data.id;
    const filters = { search: 'числто', topicId: reviewTopic };
    const list = await api.get('/api/questions').set(auth).query(filters).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, items: [{ id: duplicate }] });
    const counts = await api.get('/api/questions/counts').set(auth).query(filters).expect(200);
    expect(counts.body.data.active_count).toBe(1);
    await api.post('/api/questions/similar').set(auth).send({ content: 'Кое е числото, което се дели на шест без остатък!' })
      .expect(200, { data: [{ id: duplicate, content, topic_name: 'Търсене', is_active: true, similarity: 1 }] });
    await api.post('/api/questions/similar').set(auth).send({ content, excludeId: duplicate }).expect(200, { data: [] });
    await api.post('/api/questions/similar').set(other).send({ content }).expect(200, { data: [] });
    await api.post('/api/questions/similar').send({ content }).expect(401);
  });

  it('reports answer counts and correlation for the latest question version using only owned exams', async () => {
    const quality = '/api/analytics/questions';
    await api.get(quality).expect(401);
    await api.get(quality).set(other).expect(200, { data: { items: [], total: 0, page: 1, limit: 20, minimum_sample: 10 } });
    const qualityTopic = (await api.post('/api/topics').set(auth).send({ name: 'Качество' }).expect(201)).body.data.id;
    const content = 'Кое от тези числа е четно?';
    const [focus] = await Promise.all([content, 'Кое число е единственото четно просто число?'].map(async title => (
      await api.post('/api/questions').set(auth).send({
        topicId: qualityTopic, content: title, difficulty: 1, options: { A: '2', B: '3', C: '5', D: '7' }, correctLabel: 'A',
      }).expect(201)).body.data.id as string));

    async function completedAttempt(index: number) {
      const generated = await api.post('/api/exams/generate').set(auth)
        .send(generate([qualityTopic], 'balanced', 2)).expect(201);
      const attemptId = generated.body.data.id;
      await pg.query(`
        UPDATE examforge.attempt_items
        SET selected_option_id = CASE WHEN (question_id = $2::uuid) = $3::boolean THEN correct_option_id
          WHEN question_id = $2::uuid AND $4::boolean THEN NULL ELSE (options->1->>'id')::uuid END
        WHERE attempt_id = $1`, [attemptId, focus, index % 2 === 0, index === 1]);
      await api.post('/api/exams/' + attemptId + '/submit').set(auth).expect(200);
    }

    await completedAttempt(0);
    const small = await api.get(quality).set(auth).expect(200);
    expect(small.body.data.items.find((row: { id: string }) => row.id === focus)).toMatchObject({
      attempts: 1, comparable: 1, discrimination: null,
    });
    const single = await api.post('/api/exams/generate').set(auth).send(generate([qualityTopic])).expect(201);
    await api.post('/api/exams/' + single.body.data.id + '/submit').set(auth).expect(200);
    const mixed = await api.get(quality).set(auth).expect(200);
    const singleQuestion = mixed.body.data.items.find((row: { attempts: number }) => row.attempts === 2);
    expect(singleQuestion).toMatchObject({ attempts: 2, comparable: 1, discrimination: null });
    for (let i = 1; i < 10; i++) await completedAttempt(i);
    const report = await api.get(quality).set(auth).expect(200);
    const row = report.body.data.items.find((row: { id: string }) => row.id === focus);
    expect(row).toMatchObject({ comparable: 10, discrimination: -1 });
    expect(row.correct).toBe(5);
    expect(row.unanswered).toBe(row.attempts - 9);
    expect(row.options.map((option: { selected: number }) => option.selected)).toEqual([5, 4, 0, 0]);

    await api.patch('/api/questions/' + focus).set(auth).send({ content: content + ' Изберете само едно.' }).expect(200);
    await completedAttempt(10);
    const edited = await api.get(quality).set(auth).expect(200);
    expect(edited.body.data.items.find((row: { id: string }) => row.id === focus)).toMatchObject({
      attempts: 1, correct: 1, comparable: 1, discrimination: null,
    });
  });

  it('uses the previous four comparable dates before the 50 visible progress points', async () => {
    await pg.exec(`
      INSERT INTO examforge.exam_attempts
        (user_id, title, algorithm, status, time_limit_minutes, started_at, expires_at, submitted_at, total_questions, score, allocation)
      SELECT '${alice}', 'Trend ' || n, 'balanced', 'completed', 5, submitted - interval '1 minute',
        submitted + interval '4 minutes', submitted, 1, CASE WHEN n <= 5 THEN 1 ELSE 0 END, '{}'
      FROM generate_series(1, 55) n CROSS JOIN LATERAL (SELECT timestamptz '2025-01-01 10:00:00+02' + n * interval '1 day' AS submitted) t;
    `);
    const query = { from: '2025-01-01', to: '2025-03-01' };
    const report = await api.get('/api/analytics/progress').set(auth).query(query).expect(200);
    expect(report.body.data).toHaveLength(50);
    expect(report.body.data.slice(0, 5)).toMatchObject([
      { title: 'Trend 6', percentage: 0, rolling_average: 80 }, { rolling_average: 60 },
      { rolling_average: 40 }, { rolling_average: 20 }, { rolling_average: 0 },
    ]);
    const short = await api.get('/api/analytics/progress').set(auth)
      .query({ from: '2025-01-06', to: '2025-01-07' }).expect(200);
    expect(short.body.data).toMatchObject([{ rolling_average: 100 }, { rolling_average: 50 }]);
  });

  it('imports fifty active questions per grade 12 subject without duplicates on repeat', async () => {
    expect(await seedBank(db, bob, 'grade-12')).toBe(250);
    expect(await seedBank(db, bob, 'grade-12')).toBe(0);
    const topics = await api.get('/api/topics').set(other).expect(200);
    const subjects = topics.body.data.filter((row: { name: string }) => row.name.endsWith('– XII клас'));
    expect(subjects.map((row: { active_count: number }) => row.active_count)).toEqual([50, 50, 50, 50, 50]);
    const subject = subjects.find((row: { name: string }) => row.name.startsWith('Математика'));
    const response = await api.post('/api/exams/generate').set(other)
      .send(generate([subject.id], 'balanced', 50)).expect(201);
    const exam = await api.get('/api/exams/' + response.body.data.id).set(other).expect(200);
    expect(exam.body.data.items).toHaveLength(50);
  });

  it('grades multiple expired attempts when reading history', async () => {
    const topics = await api.get('/api/topics').set(other).expect(200);
    const subject = topics.body.data.find((row: { active_count: number }) => row.active_count === 50);
    const attempts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const generated = await api.post('/api/exams/generate').set(other).send(generate([subject.id])).expect(201);
      attempts.push(generated.body.data.id);
    }
    await pg.query('UPDATE examforge.attempt_items SET selected_option_id = correct_option_id WHERE attempt_id = $1', [attempts[0]]);
    await pg.transaction(async tx => {
      await tx.exec('ALTER TABLE examforge.exam_attempts DISABLE TRIGGER attempt_transition');
      await tx.query(`UPDATE examforge.exam_attempts
        SET started_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes'
        WHERE id = ANY($1::uuid[])`, [attempts]);
      await tx.exec('ALTER TABLE examforge.exam_attempts ENABLE TRIGGER attempt_transition');
    });

    const history = await api.get('/api/results').set(other).expect(200);
    expect(history.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: attempts[0], status: 'expired', score: 1 }),
      expect.objectContaining({ id: attempts[1], status: 'expired', score: 0 }),
    ]));
  });
});
