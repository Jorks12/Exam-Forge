import { verifySupabaseToken } from './config/supabase.ts';
import { z } from 'zod';
import { createApp } from './app.ts';
import { postgres } from './repositories/database.ts';

const environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.url().default('http://localhost:3000'),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
}).safeParse(process.env);
if (!environment.success) {
  throw new Error('Invalid or missing settings: ' + environment.error.issues.map(issue => issue.path.join('.')).join(', '));
}
const env = environment.data;
const { database, close } = postgres(env.DATABASE_URL);
const server = createApp({
  db: database,
  origin: new URL(env.FRONTEND_ORIGIN).origin,
  verify: verifySupabaseToken(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY),
}).listen(env.PORT, () => console.info('ExamForge API listening on port', env.PORT));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => void close()));
}
