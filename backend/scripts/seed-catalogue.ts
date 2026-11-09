import { readFile } from 'node:fs/promises';
import { postgres } from '../src/repositories/database.ts';
import { loadCatalogue, quotaFailures, seedCatalogue, sourceCounts } from './catalogue-bank.ts';

const args = new Set(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (args.has('--migrate-only')) {
  if (!databaseUrl) throw new Error('Липсва DATABASE_URL.');
  const { database, close } = postgres(databaseUrl);
  try {
    for (const file of ['002_catalogue.sql', '003_grade_12.sql']) {
      await database.query(await readFile(new URL('../../database/migrations/' + file, import.meta.url), 'utf8'));
      console.log('Приложена миграция', file);
    }
  } finally { await close(); }
} else {
  const banks = await loadCatalogue();
  const counts = sourceCounts(banks);
  const allowPartial = args.has('--allow-partial');
  if (args.has('--check') || (!allowPartial && quotaFailures(counts).length)) {
    console.table(counts);
    const failures = quotaFailures(counts).length;
    if (failures) {
      console.error(`${failures} банки са под минимума за активни въпроси или теми.`);
      process.exitCode = 1;
    }
  } else {
    if (!databaseUrl) throw new Error('Липсва DATABASE_URL.');
    const { database, close } = postgres(databaseUrl);
    try {
      const imported = await seedCatalogue(database, banks, allowPartial);
      console.table(imported);
      console.log('Активни записи в базата:', imported.reduce((total, row) => total + row.active, 0));
      const failures = quotaFailures(imported).length;
      if (failures) console.log(`Частичен импорт. ${failures} банки все още не покриват квотите.`);
    } finally { await close(); }
  }
}
