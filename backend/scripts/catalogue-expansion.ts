import type { Database, Sql } from '../src/repositories/database.ts';
import { duplicateQuestion, sourceCounts, type Bank } from './catalogue-bank.ts';

type SeedQuestion = { content: string; source_key: string };
type Scope = { grade: number; subject: string };

export async function catalogueScopes(sql: Sql, grade?: number): Promise<Scope[]> {
  const { rows } = await sql.query<Scope>(`
    SELECT sg.grade, sg.subject_id AS subject FROM examforge.subject_grades sg
    JOIN examforge.subjects s ON s.id = sg.subject_id AND s.is_active
    WHERE sg.grade IN (10, 11, 12) AND ($1::smallint IS NULL OR sg.grade = $1)
    ORDER BY sg.grade, sg.subject_id`, [grade ?? null]);
  return rows;
}

function validateBank(bank: Bank, seedRows: SeedQuestion[]) {
  const { grade, subject, records } = bank;
  const [quota] = sourceCounts([bank]);
  if (quota.active !== 50 || quota.easy !== 15 || quota.medium !== 25 || quota.hard !== 10 || quota.topics < 5) {
    throw new Error(`Невалидна квота за ${grade}/${subject}.`);
  }
  for (const row of records) {
    const conflict = duplicateQuestion(row.content, seedRows);
    if (conflict) throw new Error(`${row.source_key} съвпада или е сходен с ${conflict.source_key} от изходните файлове.`);
  }
}

export async function expandCatalogue(db: Database, bank: Bank, seedRows: SeedQuestion[]) {
  const [result] = await expandCatalogueBanks(db, [bank], seedRows);
  return result;
}

export async function expandCatalogueBanks(db: Database, banks: Bank[], seedRows: SeedQuestion[],
  requiredCoverage?: 'all' | number) {
  for (const bank of banks) validateBank(bank, seedRows);
  return db.transaction(async sql => {
    await sql.query('SELECT pg_advisory_xact_lock(91202411)');
    if (requiredCoverage !== undefined) {
      const expected = (await catalogueScopes(sql, requiredCoverage === 'all' ? undefined : requiredCoverage))
        .map(({ grade, subject }) => `${grade}/${subject}`).sort();
      const received = banks.map(({ grade, subject }) => `${grade}/${subject}`).sort();
      if (!expected.length || expected.join(',') !== received.join(',')) {
        throw new Error('Партидите трябва да покриват точно всички активни комбинации предмет–клас.');
      }
    }
    const results = [];
    for (const bank of banks) results.push(await importBank(sql, bank));
    return results;
  });
}

async function importBank(sql: Sql, { grade, subject, records }: Bank) {
  const { rows: topics } = await sql.query<{ id: string; slug: string }>(`
    SELECT t.id, t.slug FROM examforge.catalogue_topics t
    JOIN examforge.subject_grades sg ON sg.id = t.subject_grade_id
    JOIN examforge.subjects s ON s.id = sg.subject_id AND s.is_active
    WHERE sg.grade = $1 AND sg.subject_id = $2`, [grade, subject]);
  const topicIds = new Map(topics.map(topic => [topic.slug, topic.id]));
  const rows = records.map(row => {
    const topic_id = topicIds.get(row.topic);
    if (!topic_id) throw new Error(`Липсва тема за ${row.source_key}.`);
    return { ...row, topic_id };
  });
  const { rows: existing } = await sql.query<{
    source_key: string; fingerprint: string; content: string; topic_id: string; difficulty: number;
    explanation: string; options: string[]; correct_index: number; is_active: boolean;
  }>('SELECT source_key, fingerprint, content, topic_id, difficulty, explanation, options, correct_index, is_active FROM examforge.catalogue_questions');
  const keys = new Set(rows.map(row => row.source_key));
  const previous = existing.filter(row => keys.has(row.source_key));
  const scope = new Set(topicIds.values());
  const before = existing.filter(row => scope.has(row.topic_id) && row.is_active).length;
  if (previous.length) {
    const byKey = new Map(previous.map(row => [row.source_key, row]));
    for (const row of rows) {
      const stored = byKey.get(row.source_key);
      if (!stored?.is_active || stored.topic_id !== row.topic_id || stored.fingerprint !== row.fingerprint
        || stored.content !== row.content || stored.difficulty !== row.difficulty || stored.explanation !== row.explanation
        || stored.correct_index !== row.correct_index || JSON.stringify(stored.options) !== JSON.stringify(row.options)) {
        throw new Error(`Частична или променена партида при ${row.source_key}.`);
      }
    }
    return { grade, subject, before, added: 0, after: before, verified: previous.length };
  }
  for (const row of rows) {
    const conflict = duplicateQuestion(row.content, existing);
    if (conflict) throw new Error(`${row.source_key} съвпада или е сходен с ${conflict.source_key} от базата.`);
  }
  const { rows: inserted } = await sql.query<{ source_key: string }>(`
    INSERT INTO examforge.catalogue_questions
      (topic_id, source_key, fingerprint, content, difficulty, explanation, options, correct_index)
    SELECT topic_id, source_key, fingerprint, content, difficulty, explanation, options, correct_index
    FROM jsonb_to_recordset($1) AS r(topic_id uuid, source_key text, fingerprint text, content text,
      difficulty smallint, explanation text, options text[], correct_index smallint)
    RETURNING source_key`, [JSON.stringify(rows)]);
  if (inserted.length !== 50 || inserted.some(row => !keys.has(row.source_key))) {
    throw new Error(`Непълна партида за ${grade}/${subject}.`);
  }
  return { grade, subject, before, added: inserted.length, after: before + inserted.length, verified: inserted.length };
}
