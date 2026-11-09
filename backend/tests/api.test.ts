import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Database } from '../src/repositories/database.ts';
import { seedBank } from '../scripts/seed-bank.ts';

const alice = '71111111-1111-4111-8111-111111111111';
const bob = '72222222-2222-4222-8222-222222222222';
const pg = new PGlite();
const db: Database = {
  query: (text, values) => pg.query(text, values),
  transaction: operation => pg.transaction(operation),
};
const app = createApp({
  db, origin: 'http://localhost:3000', log: false,
  verify: async token => ({ alice, bob })[token] ?? null,
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
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');`);
  await pg.exec(await readFile(new URL('../../database/migrations/001_examforge.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../../database/migrations/002_catalogue.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../../database/migrations/003_grade_12.sql', import.meta.url), 'utf8'));
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
    await api.patch('/api/questions/' + question).set(other).send({ difficulty: 2 }).expect(404);
    await api.post('/api/topics').set(auth).send({ name: '' }).expect(400);
    await api.delete('/api/topics/' + topic).set(auth).expect(409);
    const list = await api.get('/api/questions').set(auth).query({ topicId: topic, difficulty: 1, search: 'КОЛКО' }).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    await api.post('/api/exams/generate').set(other).send(generate([topic])).expect(404);
    await api.post('/api/exams/generate').set(auth).send(generate([topic], 'random', 20)).expect(422);
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
