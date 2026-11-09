// Test-only Supabase Auth HTTP double. Domain requests use the real Express app and PostgreSQL SQL.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import cors from 'cors';
import { seedBank } from '../scripts/seed-bank.ts';
import { loadCatalogue, seedCatalogue } from '../scripts/catalogue-bank.ts';
import express from 'express';
import { createApp } from '../src/app.ts';
import { verifySupabaseToken } from '../src/config/supabase.ts';
import type { Database } from '../src/repositories/database.ts';

const origin = 'http://127.0.0.1:3011';
const address = 'http://127.0.0.1:4011';
const email = 'student@example.test';
const user = {
  id: '73333333-3333-4333-8333-333333333333', email, aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z',
};
const token = 'examforge-playwright-token';
const pg = new PGlite();
await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${user.id}');`);
await pg.exec(await readFile(new URL('../../database/migrations/001_examforge.sql', import.meta.url), 'utf8'));
await pg.exec(await readFile(new URL('../../database/migrations/002_catalogue.sql', import.meta.url), 'utf8'));
await pg.exec(await readFile(new URL('../../database/migrations/003_grade_12.sql', import.meta.url), 'utf8'));
const db: Database = { query: (text, params) => pg.query(text, params), transaction: operation => pg.transaction(operation) };
await seedBank(db, user.id);
await seedCatalogue(db, await loadCatalogue(), true);
const app = express();
const session = { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user };
app.use('/auth/v1', cors({ origin }), express.json());
app.post('/auth/v1/signup', (req, res) => {
  if (req.body.email !== email || req.body.password !== 'coursework-only') return res.sendStatus(400);
  res.json({ ...user, email_confirmed_at: undefined });
});
app.post('/auth/v1/token', (req, res) => {
  if (req.body.email !== email || req.body.password !== 'coursework-only') {
    return res.set('X-Supabase-API-Version', '2024-01-01').status(400)
      .json({ code: 'invalid_credentials', msg: 'Invalid credentials' });
  }
  res.json(session);
});
app.post('/auth/v1/verify', (req, res) => {
  if (req.body.token_hash !== 'fixture-confirmation' || req.body.type !== 'email') return res.sendStatus(400);
  res.json(session);
});
app.get('/auth/v1/user', (req, res) => {
  if (req.get('authorization') !== 'Bearer ' + token) {
    return res.status(401).json({ code: 'bad_jwt', msg: 'Invalid token' });
  }
  res.json(user);
});
app.post('/auth/v1/logout', (_req, res) => res.sendStatus(204));
app.use(createApp({ db, origin, log: false, verify: verifySupabaseToken(address, 'playwright-fixture-key') }));
app.listen(4011, '127.0.0.1');
