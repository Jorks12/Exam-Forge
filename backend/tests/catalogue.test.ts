import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadCatalogue, minimumQuestionsPerBank, quotaFailures, seedCatalogue, sourceCounts } from '../scripts/catalogue-bank.ts';
import { createApp } from '../src/app.ts';
import type { Database } from '../src/repositories/database.ts';

const alice = '71111111-1111-4111-8111-111111111111';
const bob = '72222222-2222-4222-8222-222222222222';
const auth = { Authorization: 'Bearer alice' };
const other = { Authorization: 'Bearer bob' };
const pg = new PGlite();
const db: Database = { query: (text, values) => pg.query(text, values), transaction: operation => pg.transaction(operation) };
const api = request(createApp({ db, origin: 'http://localhost:3000', log: false,
  verify: async token => ({ alice, bob })[token] ?? null }));
const scope = { grade: 10, subjectId: 'math' };
const config = { ...scope, title: 'Каталог · математика', timeLimitMinutes: 5 };

beforeAll(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');`);
  const migration = async (file: string) => pg.exec(await readFile(
    new URL('../../database/migrations/' + file, import.meta.url), 'utf8'));
  await migration('001_examforge.sql');
  await migration('002_catalogue.sql');
  await pg.exec(await readFile(new URL('../../database/rollback/002_catalogue.sql', import.meta.url), 'utf8'));
  await migration('002_catalogue.sql');
  await migration('002_catalogue.sql');
  await migration('003_grade_12.sql');
  await migration('003_grade_12.sql');
  const banks = await loadCatalogue();
  const before = sourceCounts(banks);
  expect(quotaFailures(before)).toEqual([]);
  expect(await seedCatalogue(db, banks)).toEqual(before.toSorted(
    (a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject)));
}, 30000);
afterAll(() => pg.close());

it('reads all 36 subject-grade collections and verifies seed reruns preserve IDs and totals', async () => {
  const ids = async () => (await db.query('SELECT id FROM examforge.catalogue_questions ORDER BY id')).rows;
  const previous = await ids();
  const imported = await seedCatalogue(db, await loadCatalogue());
  expect(await ids()).toEqual(previous);
  expect(imported).toHaveLength(36);
  expect(quotaFailures(imported)).toEqual([]);
  expect((await api.get('/api/grades').set(auth).expect(200)).body.data.map(({ number }: { number: number }) => number))
    .toEqual([10, 11, 12]);
  for (const grade of [10, 11, 12]) {
    expect((await api.get('/api/subjects').set(auth).query({ grade }).expect(200)).body.data).toHaveLength(12);
  }
  const questionsForGrade = async (grade: number) =>
    (await api.get('/api/questions').set(auth).query({ grade, subjectId: 'math', limit: 100 }).expect(200)).body.data.items
      .map(({ id }: { id: string }) => id);
  for (const grade of [10, 11, 12]) {
    const { rows } = await db.query<{ id: string }>(`
      SELECT q.id FROM examforge.catalogue_questions q JOIN examforge.catalogue_topics t ON t.id = q.topic_id
      JOIN examforge.subject_grades sg ON sg.id = t.subject_grade_id
      WHERE sg.grade = $1 AND sg.subject_id = 'math' AND q.is_active ORDER BY q.id`, [grade]);
    expect((await questionsForGrade(grade)).sort()).toEqual(rows.map(row => row.id));
  }
  const subject = (await api.get('/api/subjects/math').set(auth).expect(200)).body.data;
  expect(subject.grades.map(({ grade }: { grade: number }) => grade)).toEqual([10, 11, 12]);
});

it('creates an exam with all 50 distinct questions from one subject and grade', async () => {
  const { body: { data: attempt } } = await api.post('/api/exams/generate').set(auth).send({
    ...config, grade: 12, subjectId: 'history', algorithm: 'balanced', questionCount: minimumQuestionsPerBank,
  }).expect(201);
  const { rows } = await db.query<{ total: number; distinct: number; in_scope: number }>(`
    SELECT count(*)::int AS total, count(DISTINCT i.catalogue_question_id)::int AS distinct,
      count(*) FILTER (WHERE sg.grade = 12 AND sg.subject_id = 'history')::int AS in_scope
    FROM examforge.attempt_items i
    JOIN examforge.catalogue_questions q ON q.id = i.catalogue_question_id
    JOIN examforge.catalogue_topics t ON t.id = q.topic_id
    JOIN examforge.subject_grades sg ON sg.id = t.subject_grade_id
    WHERE i.attempt_id = $1`, [attempt.id]);
  expect(rows[0]).toEqual({ total: 50, distinct: 50, in_scope: 50 });
});

it('keeps shared catalogue and private questions in separate authorization scopes', async () => {
  await api.get('/api/subjects').expect(401);
  await api.get('/api/questions').query(scope).expect(401);
  await api.get('/api/questions').set(auth).query({ grade: 10 }).expect(400);
  const topics = (await api.get('/api/subjects/math/topics').set(auth).query({ grade: 10 }).expect(200)).body.data;
  const medium = topics.find((topic: { medium: number }) => topic.medium > 0);
  const filter = { ...scope, topicId: medium.id, difficulty: 2 };
  const counts = (await api.get('/api/questions/counts').set(auth).query(filter).expect(200)).body.data;
  const questions = (await api.get('/api/questions').set(other).query(filter).expect(200)).body.data;
  expect(counts.active_count).toBe(medium.medium);
  expect(questions.total).toBe(counts.active_count);
  const first = questions.items[0];
  expect(first.options).toHaveLength(4);
  expect(first).not.toHaveProperty('correct_index');
  expect(first).not.toHaveProperty('explanation');
  await api.patch('/api/questions/' + first.id).set(auth).send({ difficulty: 1 }).expect(404);
  await api.delete('/api/questions/' + first.id).set(auth).expect(404);
  const { rows: [privileges] } = await db.query(`
    SELECT has_schema_privilege('authenticated', 'examforge', 'usage') AS can_use,
      has_table_privilege('authenticated', 'examforge.catalogue_questions', 'select') AS can_select,
      has_table_privilege('authenticated', 'examforge.catalogue_questions', 'update') AS can_update`);
  expect(privileges).toEqual({ can_use: false, can_select: false, can_update: false });
});

it('uses server filters in both algorithms and grades the immutable catalogue snapshot', async () => {
  const otherTopics = (await api.get('/api/subjects/math/topics').set(auth).query({ grade: 11 }).expect(200)).body.data;
  await api.post('/api/exams/generate').set(auth).send({
    ...config, algorithm: 'balanced', questionCount: 1, topicIds: [otherTopics[0].id],
  }).expect(404);
  const hard = (await api.get('/api/questions/counts').set(auth).query({ ...scope, difficulty: 3 }).expect(200)).body.data.hard;
  await api.post('/api/exams/generate').set(auth).send({
    ...config, algorithm: 'random', difficulty: 3, questionCount: hard + 1,
  }).expect(422);
  for (const algorithm of ['random', 'balanced']) {
    const { body: { data: attempt } } = await api.post('/api/exams/generate').set(auth).send({
      ...config, algorithm, difficulty: 3, questionCount: 2,
    }).expect(201);
    expect(attempt.catalogue).toEqual({ grade: 10, subject_id: 'math', subject_name: 'Математика' });
    if (algorithm === 'balanced') {
      expect(attempt.allocation.difficulties.map(({ target }: { target: number }) => target)).toEqual([0, 0, 2]);
      expect(attempt.allocation.topics.filter(({ target }: { target: number }) => target > 0)).toHaveLength(2);
    }
    const path = '/api/exams/' + attempt.id;
    await api.get(path).set(other).expect(404);
    const { body: { data: view } } = await api.get(path).set(auth).expect(200);
    expect(view.items.every((item: { difficulty: number }) => item.difficulty === 3)).toBe(true);
    expect(view.items[0]).not.toHaveProperty('correct_option_id');
    const { rows } = await db.query<{ id: string; correct_option_id: string; catalogue_question_id: string }>(`
      SELECT id, correct_option_id, catalogue_question_id FROM examforge.attempt_items WHERE attempt_id = $1`, [attempt.id]);
    expect(new Set(rows.map(row => row.catalogue_question_id)).size).toBe(2);
    for (const item of rows) await api.patch(path + '/answers').set(auth)
      .send({ itemId: item.id, optionId: item.correct_option_id }).expect(200);
    const { body: { data: result } } = await api.post(path + '/submit').set(auth).expect(200);
    expect(result.summary.percentage).toBe(100);
    expect(result.attempt.catalogue).toEqual(attempt.catalogue);
    await api.get('/api/results/' + attempt.id).set(other).expect(404);
  }
  const stats = (await api.get('/api/analytics/subjects').set(auth).query(scope).expect(200)).body.data;
  expect(stats).toEqual([{ id: 'math', name: 'Математика', total: 2, average: 100 }]);
  expect((await api.get('/api/analytics/subjects').set(other).query(scope).expect(200)).body.data).toEqual([]);
  const overview = async (query: object) => (await api.get('/api/analytics/overview').set(auth).query(query).expect(200)).body.data;
  expect((await overview(scope)).finalized).toBe(2);
  expect((await overview({ ...scope, grade: 11 })).finalized).toBe(0);
  expect((await overview({ ...scope, to: '2000-01-01' })).finalized).toBe(0);
  const rollback = await readFile(new URL('../../database/rollback/002_catalogue.sql', import.meta.url), 'utf8');
  await expect(pg.exec(rollback)).rejects.toThrow(/referenced by user records/);
  await pg.exec('ROLLBACK');
  expect((await overview(scope)).finalized).toBe(2);
});
