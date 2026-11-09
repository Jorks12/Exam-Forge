import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Database } from '../src/repositories/database.ts';
import { questionInput } from '../src/validators/schemas.ts';

export const subjects = ['bulgarian', 'math', 'english', 'history', 'geography', 'biology', 'chemistry',
  'physics', 'informatics', 'it', 'philosophy', 'civics'] as const;
const grades = [10, 11, 12] as const;
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
const recordKey = z.string().regex(/^[a-z0-9-]{1,40}$/);
const topicLine = z.tuple([slug, z.string().trim().min(1).max(100)]);
const placeholder = /\b(?:lorem ipsum|todo|tbd|placeholder)\b|попълнете тук|примерен въпрос/iu;
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('bg')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const template = (value: string) => normalize(value).replace(/\p{N}+/gu, '#');
const shingles = (value: string) => {
  const words = value.split(' ');
  return new Set(words.slice(2).map((word, index) => [words[index], words[index + 1], word].join(' ')));
};

interface RecordRow {
  source_key: string; fingerprint: string; topic: string; topic_name: string; content: string;
  explanation: string; difficulty: number; options: string[]; correct_index: number;
}

interface Bank {
  grade: number;
  subject: string;
  records: RecordRow[];
}

function nearDuplicate(left: Set<string>, right: Set<string>) {
  if (left.size < 5 || right.size < 5) return false;
  let intersection = 0;
  for (const term of left) if (right.has(term)) intersection++;
  return intersection / (left.size + right.size - intersection) >= 0.82;
}

function parseBank(text: string, grade: number, subject: string, fingerprints: Set<string>): Bank {
  const records: RecordRow[] = [];
  const keys = new Set<string>();
  const topicKeys = new Set<string>();
  const templates = new Set<string>();
  const signatures: { key: string; words: Set<string> }[] = [];
  let topic: [string, string] | undefined;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('|').map(field => field.trim());
    try {
      if (line.startsWith('@')) {
        topic = topicLine.parse([fields[0].slice(1), ...fields.slice(1)]);
        if (topicKeys.has(topic[0])) throw new Error('Повторен идентификатор на тема.');
        topicKeys.add(topic[0]);
        continue;
      }
      if (!topic || fields.length !== 8) throw new Error('Очакват се тема и осем полета на ред.');
      if (placeholder.test(line)) throw new Error('Въпросът съдържа служебен текст.');
      const [key, level, content, answer, b, c, d, note] = fields;
      const source_key = [grade, subject, topic[0], recordKey.parse(key)].join('/');
      if (keys.has(source_key)) throw new Error('Повторен идентификатор на въпрос.');
      const validated = questionInput.omit({ topicId: true, isActive: true }).parse({
        content, difficulty: Number(level), options: { A: answer, B: b, C: c, D: d }, correctLabel: 'A', explanation: note,
      });
      if (note.length < 18 || normalize(note) === normalize(answer)) throw new Error('Липсва обяснение на отговора.');
      const options = Object.values(validated.options);
      if (new Set(options.map(option => option.normalize('NFKC').toLocaleLowerCase('bg').replace(/\s+/gu, ' '))).size !== 4) {
        throw new Error('Вариантите за отговор се повтарят.');
      }
      // Keep symbols in the exact fingerprint so different operators are not treated as equal.
      const fingerprint = hash(content.normalize('NFKC').toLocaleLowerCase('bg').replace(/\s+/gu, ' '));
      const pattern = template(content);
      const words = shingles(pattern);
      if (fingerprints.has(fingerprint) || templates.has(pattern)) throw new Error('Повторен въпрос или числов вариант.');
      const similar = signatures.find(signature => nearDuplicate(words, signature.words));
      if (similar) throw new Error('Силно сходен въпрос с ' + similar.key);
      fingerprints.add(fingerprint);
      templates.add(pattern);
      keys.add(source_key);
      signatures.push({ key: source_key, words });

      // The source stores the correct option first for editing. The imported order is stable per record.
      const offset = Number.parseInt(hash(source_key).slice(0, 2), 16) % options.length;
      const ordered = [...options.slice(offset), ...options.slice(0, offset)];
      records.push({ source_key, fingerprint, topic: topic[0], topic_name: topic[1], content, explanation: note,
        difficulty: validated.difficulty, options: ordered, correct_index: ordered.indexOf(answer) + 1 });
    } catch (error) {
      throw new Error(`${grade}/${subject} ред ${index + 1}. ${error instanceof Error ? error.message : error}`);
    }
  }
  return { grade, subject, records };
}

export interface BankCount {
  grade: number; subject: string; active: number; easy: number; medium: number; hard: number; topics: number;
}

export const minimumQuestionsPerBank = 50;

export function quotaFailures(counts: BankCount[]) {
  return counts.filter(row => row.active < minimumQuestionsPerBank || row.topics < 5);
}

export function sourceCounts(banks: Bank[]): BankCount[] {
  return banks.map(({ grade, subject, records }) => ({
    grade, subject, active: records.length, topics: new Set(records.map(row => row.topic)).size,
    easy: records.filter(row => row.difficulty === 1).length,
    medium: records.filter(row => row.difficulty === 2).length,
    hard: records.filter(row => row.difficulty === 3).length,
  }));
}

export async function loadCatalogue() {
  const fingerprints = new Set<string>();
  const banks: Bank[] = [];
  for (const grade of grades) {
    for (const subject of subjects) {
      const url = new URL(`../../database/seed/grade-${grade}/${subject}.txt`, import.meta.url);
      banks.push(parseBank(await readFile(url, 'utf8'), grade, subject, fingerprints));
    }
  }
  return banks;
}

export async function seedCatalogue(db: Database, banks: Bank[], allowPartial = false) {
  if (!allowPartial && quotaFailures(sourceCounts(banks)).length) throw new Error('Изходните банки са под изискванията.');
  return db.transaction(async sql => {
    // Serialize complete imports and preserve identifiers referenced by attempts.
    await sql.query('SELECT pg_advisory_xact_lock(91202411)');
    for (const { grade, subject, records } of banks) {
      const { rows: [scope] } = await sql.query<{ id: string }>(
        'SELECT id FROM examforge.subject_grades WHERE grade = $1 AND subject_id = $2', [grade, subject]);
      if (!scope) throw new Error(`Липсва предметът ${subject} за ${grade}. клас.`);
      await sql.query(`
        INSERT INTO examforge.catalogue_topics (subject_grade_id, slug, name)
        SELECT DISTINCT $1::uuid, topic, topic_name
        FROM jsonb_to_recordset($2) AS r(topic text, topic_name text)
        ON CONFLICT (subject_grade_id, slug) DO UPDATE SET name = excluded.name
        WHERE examforge.catalogue_topics.name IS DISTINCT FROM excluded.name`, [scope.id, JSON.stringify(records)]);
      await sql.query(`
        INSERT INTO examforge.catalogue_questions
          (topic_id, source_key, fingerprint, content, difficulty, explanation, options, correct_index)
        SELECT t.id, r.source_key, r.fingerprint, r.content, r.difficulty, r.explanation, r.options, r.correct_index
        FROM jsonb_to_recordset($2) AS r(topic text, source_key text, fingerprint text, content text,
          difficulty smallint, explanation text, options text[], correct_index smallint)
        JOIN examforge.catalogue_topics t ON t.subject_grade_id = $1 AND t.slug = r.topic
        ON CONFLICT (source_key) DO UPDATE SET topic_id = excluded.topic_id, fingerprint = excluded.fingerprint,
          content = excluded.content, difficulty = excluded.difficulty, explanation = excluded.explanation,
          options = excluded.options, correct_index = excluded.correct_index
        WHERE (examforge.catalogue_questions.topic_id, examforge.catalogue_questions.fingerprint,
          examforge.catalogue_questions.content, examforge.catalogue_questions.difficulty,
          examforge.catalogue_questions.explanation, examforge.catalogue_questions.options,
          examforge.catalogue_questions.correct_index) IS DISTINCT FROM
          (excluded.topic_id, excluded.fingerprint, excluded.content, excluded.difficulty,
          excluded.explanation, excluded.options, excluded.correct_index)`, [scope.id, JSON.stringify(records)]);
    }
    const { rows } = await sql.query<BankCount>(`
      SELECT sg.grade, sg.subject_id AS subject, count(q.id)::int AS active,
        count(DISTINCT q.topic_id)::int AS topics,
        count(q.id) FILTER (WHERE q.difficulty = 1)::int AS easy,
        count(q.id) FILTER (WHERE q.difficulty = 2)::int AS medium,
        count(q.id) FILTER (WHERE q.difficulty = 3)::int AS hard
      FROM examforge.subject_grades sg
      LEFT JOIN examforge.catalogue_topics t ON t.subject_grade_id = sg.id
      LEFT JOIN examforge.catalogue_questions q ON q.topic_id = t.id AND q.is_active
      WHERE sg.grade IN (10, 11, 12) GROUP BY sg.id ORDER BY sg.grade, subject`);
    if (!allowPartial && (rows.length < grades.length * subjects.length || quotaFailures(rows).length)) {
      throw new Error('Импортът не покрива квотите.');
    }
    return rows;
  });
}
