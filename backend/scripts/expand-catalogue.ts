import { readFile } from 'node:fs/promises';
import { postgres } from '../src/repositories/database.ts';
import { loadCatalogue, parseBank } from './catalogue-bank.ts';
import { catalogueScopes, expandCatalogueBanks } from './catalogue-expansion.ts';

const [grade, subject] = process.argv.slice(2);
const all = grade === '--all' && subject === undefined;
const validGrade = /^(10|11|12)$/.test(grade ?? '');
if (!all && (!validGrade || (subject !== undefined && !/^[a-z][a-z0-9-]*$/.test(subject)))) {
  throw new Error('Посочи --all, клас или клас и идентификатор на предмет.');
}
if (!process.env.DATABASE_URL) throw new Error('Липсва DATABASE_URL.');
const seeds = await loadCatalogue();
const legacy = (await Promise.all(['grade-12-bg.txt', 'programming-bg.txt'].map(async file => {
  const source = await readFile(new URL('../../database/seed/' + file, import.meta.url), 'utf8');
  return source.split(/\r?\n/).flatMap((line, index) => {
    const [difficulty, content] = line.trim().split('|');
    return /^[123]$/.test(difficulty) && content ? [{ content, source_key: `${file}:${index + 1}` }] : [];
  });
}))).flat();
const { database, close } = postgres(process.env.DATABASE_URL);
try {
  const coverage = all ? 'all' : subject === undefined ? Number(grade) : undefined;
  const scopes = coverage === undefined
    ? [{ grade: Number(grade), subject }]
    : await catalogueScopes(database, coverage === 'all' ? undefined : coverage);
  const missing: string[] = [];
  const banks = [];
  for (const scope of scopes) {
    const path = new URL(`../../database/expansion/grade-${scope.grade}/${scope.subject}.txt`, import.meta.url);
    try {
      banks.push(parseBank(await readFile(path, 'utf8'), scope.grade, scope.subject));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(`${scope.grade}/${scope.subject}`);
    }
  }
  if (missing.length) throw new Error(`Липсват ${missing.length} партиди: ${missing.join(', ')}`);
  console.table(await expandCatalogueBanks(database, banks, [...seeds.flatMap(seed => seed.records), ...legacy], coverage));
} finally {
  await close();
}
