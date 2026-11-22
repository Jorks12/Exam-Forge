import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadCatalogue, minimumQuestionsPerBank, parseBank, quotaFailures, seedCatalogue, sourceCounts } from '../scripts/catalogue-bank.ts';
import { catalogueScopes, expandCatalogue, expandCatalogueBanks } from '../scripts/catalogue-expansion.ts';
import { createApp } from '../src/app.ts';
import type { Database } from '../src/repositories/database.ts';

const alice = '71111111-1111-4111-8111-111111111111';
const bob = '72222222-2222-4222-8222-222222222222';
const auth = { Authorization: 'Bearer alice' };
const other = { Authorization: 'Bearer bob' };
const pg = new PGlite({ extensions: { pg_trgm } });
const db: Database = { query: (text, values) => pg.query(text, values), transaction: operation => pg.transaction(operation) };
const api = request(createApp({ db, origin: 'http://localhost:3000', log: false,
  verify: async token => ({
    alice: { id: alice, email: 'ZhivkoArbalov@gmail.com' }, bob: { id: bob, email: 'student@example.test' },
  })[token] ?? null }));
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
  await pg.exec('CREATE EXTENSION pg_trgm WITH SCHEMA public');
  await migration('005_similar_questions.sql');
  const banks = await loadCatalogue();
  const before = sourceCounts(banks);
  expect(quotaFailures(before)).toEqual([]);
  expect(await seedCatalogue(db, banks)).toEqual(before.toSorted(
    (a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject)));
}, 30000);
afterAll(() => pg.close());

it('requires every catalogue scope and rolls back all inserts when a later bank fails', async () => {
  const source = await readFile(new URL('../../database/expansion/grade-10/math.txt', import.meta.url), 'utf8');
  const bank = parseBank(source, 10, 'math');
  const seeds = (await loadCatalogue()).flatMap(seed => seed.records);
  await expect(expandCatalogueBanks(db, [bank], seeds, 'all')).rejects.toThrow('всички активни комбинации');
  await expect(expandCatalogueBanks(db, [bank], seeds, 10)).rejects.toThrow('всички активни комбинации');
  const gradeScopes = await catalogueScopes(db, 12);
  expect(gradeScopes).toHaveLength(12);
  expect(gradeScopes.every(scope => scope.grade === 12)).toBe(true);
  const invalid = parseBank(source.replace('@quadratic|', '@unknown-topic|'), 10, 'physics');
  await expect(expandCatalogueBanks(db, [bank, invalid], seeds)).rejects.toThrow('Липсва тема');
  expect((await db.query("SELECT count(*)::int AS total FROM examforge.catalogue_questions WHERE source_key LIKE '%/exp-%'")).rows)
    .toEqual([{ total: 0 }]);
});

it('imports a full expansion without overwriting seed rows, then safely reruns', async () => {
  const source = await readFile(new URL('../../database/expansion/grade-10/math.txt', import.meta.url), 'utf8');
  const bank = parseBank(source, 10, 'math');
  const seeds = (await loadCatalogue()).flatMap(seed => seed.records);
  await expect(expandCatalogue(db, { ...bank, records: bank.records.slice(1) }, seeds)).rejects.toThrow('квота');
  const dupe = { ...bank.records[0], content: seeds[0].content };
  await expect(expandCatalogue(db, { ...bank, records: [dupe, ...bank.records.slice(1)] }, seeds)).rejects.toThrow('сходен');
  // Roll back the entire test fixture so the original 50-question scenarios still exercise their baseline.
  const rollback = new Error('Rollback expansion test');
  await expect(db.transaction(async sql => {
    const isolated: Database = { query: sql.query.bind(sql), transaction: operation => operation(sql) };
    const original = (await sql.query('SELECT * FROM examforge.catalogue_questions ORDER BY id')).rows;
    expect(await expandCatalogue(isolated, bank, seeds)).toEqual({
      grade: 10, subject: 'math', before: 50, added: 50, after: 100, verified: 50,
    });
    expect(await expandCatalogue(isolated, bank, seeds)).toMatchObject({ added: 0, after: 100, verified: 50 });
    expect((await sql.query(`
      SELECT difficulty, count(*)::int AS count, count(DISTINCT topic_id)::int AS topics
      FROM examforge.catalogue_questions
      WHERE source_key = ANY($1) AND is_active AND cardinality(options) = 4
        AND options[correct_index] IS NOT NULL AND btrim(explanation) <> ''
      GROUP BY difficulty ORDER BY difficulty`, [bank.records.map(row => row.source_key)])).rows)
      .toEqual([{ difficulty: 1, count: 15, topics: 5 }, { difficulty: 2, count: 25, topics: 5 }, { difficulty: 3, count: 10, topics: 5 }]);
    expect((await sql.query(`SELECT * FROM examforge.catalogue_questions
      WHERE NOT (source_key = ANY($1)) ORDER BY id`, [bank.records.map(row => row.source_key)])).rows).toEqual(original);
    const expandedApi = request(createApp({ db: isolated, origin: 'http://localhost:3000', log: false,
      verify: async () => ({ id: alice, email: 'zhivkoarbalov@gmail.com' }) }));
    const { body: { data: counts } } = await expandedApi.get('/api/questions/counts').set(auth).query(scope).expect(200);
    expect(counts.active_count).toBe(100);
    const { body: { data: topics } } = await expandedApi.get('/api/subjects/math/topics').set(auth).query({ grade: 10 }).expect(200);
    const quadratic = topics.find((topic: { name: string }) => topic.name === 'Квадратни уравнения и неравенства');
    for (const algorithm of ['random', 'balanced']) {
      const { body: { data: attempt } } = await expandedApi.post('/api/exams/generate').set(auth).send({
        ...config, algorithm, topicIds: [quadratic.id], questionCount: 13,
      }).expect(201);
      const path = '/api/exams/' + attempt.id;
      const { body: { data: view } } = await expandedApi.get(path).set(auth).expect(200);
      expect(view.items).toHaveLength(13);
      for (const item of view.items) expect(item).not.toHaveProperty('correct_option_id');
      const { rows: items } = await sql.query<{ id: string; correct_option_id: string; source_key: string }>(`
        SELECT i.id, i.correct_option_id, q.source_key FROM examforge.attempt_items i
        JOIN examforge.catalogue_questions q ON q.id = i.catalogue_question_id WHERE i.attempt_id = $1`, [attempt.id]);
      const newItems = items.filter(item => item.source_key.includes('/exp-'));
      expect(newItems).toHaveLength(10);
      for (const item of items) await expandedApi.patch(path + '/answers').set(auth)
        .send({ itemId: item.id, optionId: item.correct_option_id }).expect(200);
      const { body: { data: result } } = await expandedApi.post(path + '/submit').set(auth).expect(200);
      expect(result.summary.percentage).toBe(100);
    }
    const { body: { data: analytics } } = await expandedApi.get('/api/analytics/overview').set(auth).query(scope).expect(200);
    expect(analytics.finalized).toBe(2);
    throw rollback;
  })).rejects.toBe(rollback);
}, 30000);

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
  await api.get('/api/catalogue/access').set(auth).expect(200, { data: { admin: true } });
  await api.get('/api/catalogue/access').set(other).expect(200, { data: { admin: false } });
  for (const path of ['/api/grades', '/api/subjects', '/api/subjects/math', '/api/subjects/math/topics?grade=10']) {
    await api.get(path).set(other).expect(200);
  }
  await api.get('/api/questions/counts').set(other).query(filter).expect(200);
  await api.post('/api/exams/generate').set(other).send({
    ...config, algorithm: 'random', questionCount: 1,
  }).expect(201);
  await api.get('/api/questions').set(other).expect(200);
  const questions = (await api.get('/api/questions').set(other).query(filter).expect(200)).body.data;
  expect(counts.active_count).toBe(medium.medium);
  expect(questions.total).toBe(counts.active_count);
  const first = questions.items[0];
  expect(first.options).toHaveLength(4);
  expect(first).not.toHaveProperty('correct_index');
  expect(first).not.toHaveProperty('explanation');
  const adminPath = '/api/catalogue/questions/' + first.id;
  await api.patch(adminPath).set(other).send({ isActive: false }).expect(403);
  await api.patch(adminPath).set(auth).send({ isActive: false }).expect(204);
  try {
    const archived = { ...filter, active: 'false' };
    const ownerList = (await api.get('/api/questions').set(auth).query(archived).expect(200)).body.data;
    expect(ownerList.items.map((item: { id: string }) => item.id)).toContain(first.id);
    const regularList = (await api.get('/api/questions').set(other).query(archived).expect(200)).body.data;
    expect(regularList.items).toEqual([]);
    const active = (await api.get('/api/questions/counts').set(other).query(filter).expect(200)).body.data;
    expect(active.active_count).toBe(counts.active_count - 1);
  } finally {
    await api.patch(adminPath).set(auth).send({ isActive: true }).expect(204);
  }
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
  const summary = await api.get('/api/analytics/summary').set(auth).query(scope).expect(200);
  expect(summary.body.data).toMatchObject({
    overview: { finalized: 2, average: 100 }, subjects: stats,
    progress: [{ percentage: 100, rolling_average: 100 }, { percentage: 100, rolling_average: 100 }],
  });
  const foreign = await api.get('/api/analytics/summary').set(other).query(scope).expect(200);
  expect(foreign.body.data).toMatchObject({ overview: { finalized: 0 }, subjects: [], topics: [], progress: [] });
  await api.get('/api/analytics/summary').query(scope).expect(401);
  const rollback = await readFile(new URL('../../database/rollback/002_catalogue.sql', import.meta.url), 'utf8');
  await expect(pg.exec(rollback)).rejects.toThrow(/referenced by user records/);
  await pg.exec('ROLLBACK');
  expect((await overview(scope)).finalized).toBe(2);
});
