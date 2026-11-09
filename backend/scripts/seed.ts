import { postgres } from '../src/repositories/database.ts';
import { id } from '../src/validators/schemas.ts';
import { seedBank, seedBanks } from './seed-bank.ts';

const owner = id.safeParse(process.argv[2]);
const databaseUrl = process.env.DATABASE_URL;
const bank = process.argv[3] ?? 'programming';
if (!owner.success || !databaseUrl || !Object.hasOwn(seedBanks, bank)) {
  throw new Error('Usage: npm run seed -w backend -- USER_UUID [programming|grade-12] (requires backend/.env)');
}

const { database, close } = postgres(databaseUrl);
try {
  const created = await seedBank(database, owner.data, bank as keyof typeof seedBanks);
  console.log(`Added ${created} questions. Existing seeded questions were preserved.`);
} finally {
  await close();
}
