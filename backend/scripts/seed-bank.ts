import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Database } from '../src/repositories/database.ts';
import { labels, questionInput } from '../src/validators/schemas.ts';

export const seedBanks = {
  programming: { file: 'programming-bg.txt', topicCount: 4, questionsPerTopic: 30 },
  'grade-12': { file: 'grade-12-bg.txt', topicCount: 5, questionsPerTopic: 50 },
} as const;

export async function seedBank(database: Database, ownerId: string, bank: keyof typeof seedBanks = 'programming') {
  const { file, topicCount, questionsPerTopic } = seedBanks[bank];
  const source = await readFile(new URL('../../database/seed/' + file, import.meta.url), 'utf8');
  const topics = new Map<string, string[][]>();
  let current: string[][] | undefined;
  for (const line of source.split(/\r?\n/).filter(Boolean)) {
    if (line.startsWith('# ')) {
      const name = line.slice(2);
      if (topics.has(name)) throw new Error(`Repeated seed topic: ${name}`);
      current = [];
      topics.set(name, current);
    } else {
      if (!current) throw new Error('Missing seed topic');
      current.push(line.split('|'));
    }
  }
  if (topics.size !== topicCount || [...topics.values()].some(rows => rows.length !== questionsPerTopic
    || rows.some(row => row.length !== 7 || row.some(field => !field.trim()))
    || new Set(rows.map(row => row[1].trim())).size !== rows.length)) {
    throw new Error(`Invalid ${bank} bank. Expected ${topicCount} topics with ${questionsPerTopic} distinct questions each.`);
  }

  function seedId(topic: string, question: string) {
    const hash = createHash('sha256').update(JSON.stringify([ownerId, topic, question])).digest('hex');
    return [hash.slice(0, 8), hash.slice(8, 12), '4' + hash.slice(13, 16), '8' + hash.slice(17, 20), hash.slice(20, 32)].join('-');
  }

  return database.transaction(async sql => {
    let count = 0;
    for (const [name, questions] of topics) {
      await sql.query('INSERT INTO examforge.topics(owner_id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ownerId, name]);
      const { rows } = await sql.query<{ id: string }>(
        'SELECT id FROM examforge.topics WHERE owner_id = $1 AND lower(name) = lower($2)', [ownerId, name],
      );
      const topicId = rows[0].id;
      const records = questions.map(([difficulty, content, correct, ...rest], index) => {
        const options = [correct, ...rest.slice(0, 3)];
        const offset = index % 4;
        const rotated = Object.fromEntries(labels.map((label, i) => [label, options[(i + 4 - offset) % 4]]));
        const question = questionInput.parse({
          topicId, content, difficulty: Number(difficulty), explanation: rest[3], options: rotated, correctLabel: labels[offset],
        });
        return {
          id: seedId(name, content), content, difficulty: question.difficulty,
          explanation: question.explanation, options: question.options, correct_label: question.correctLabel,
        };
      });
      const { rows: inserted } = await sql.query<{ id: string }>(`
        WITH seed AS (SELECT * FROM jsonb_to_recordset($3) AS r(id uuid, content text, difficulty smallint,
            explanation text, options jsonb, correct_label text)),
          questions AS (
            INSERT INTO examforge.questions(id, owner_id, topic_id, content, difficulty, explanation)
            SELECT id, $1, $2, content, difficulty, explanation FROM seed ON CONFLICT (id) DO NOTHING RETURNING id
          ),
          options AS (
            INSERT INTO examforge.question_options(question_id, label, content)
            SELECT q.id, o.key, o.value FROM questions q JOIN seed s ON s.id = q.id
            CROSS JOIN LATERAL jsonb_each_text(s.options) o
            RETURNING id, question_id, label
          )
        INSERT INTO examforge.answer_keys(question_id, correct_option_id)
        SELECT o.question_id, o.id FROM options o JOIN seed s ON s.id = o.question_id AND s.correct_label = o.label
        RETURNING question_id AS id`, [ownerId, topicId, JSON.stringify(records)]);
      count += inserted.length;
    }
    return count;
  });
}
