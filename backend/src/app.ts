import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { authenticate } from './middleware/auth.ts';
import type { VerifyToken } from './middleware/auth.ts';
import type { Database } from './repositories/database.ts';
import { apiRoutes } from './routes/api.ts';
import { ApiError } from './utils/errors.ts';

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Проверете въведените данни.',
        fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) },
    });
    return;
  }
  const code = errorCode(error);
  let safe = error instanceof ApiError ? error : undefined;
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    safe = new ApiError(400, 'INVALID_JSON', 'Невалиден JSON.');
  }
  if (typeof error === 'object' && error && 'status' in error && error.status === 413) {
    safe = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Заявката е твърде голяма.');
  }
  if (code === '23505') safe = new ApiError(409, 'DUPLICATE', 'Вече съществува запис със същите данни.');
  if (code === '23503') safe = new ApiError(409, 'REFERENCE_CONFLICT', 'Записът е свързан с други данни или липсва.');
  if (!safe) {
    console.error('API failure', typeof code === 'string' ? code : error instanceof Error ? error.name : 'unknown');
    safe = new ApiError(500, 'INTERNAL_ERROR', 'Възникна грешка. Опитайте отново.');
  }
  res.status(safe.status).json({ error: { code: safe.code, message: safe.message } });
};

export function createApp(options: { db: Database; verify: VerifyToken; origin: string; log?: boolean }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.origin, methods: ['GET', 'POST', 'PATCH', 'DELETE'], maxAge: 600 }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (options.log !== false) {
    app.use((req, res, next) => {
      const start = performance.now();
      res.on('finish', () => console.info(req.method, req.route?.path ?? 'request', res.statusCode,
        Math.round(performance.now() - start) + 'ms'));
      next();
    });
  }
  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  const rateMessage = { error: { code: 'RATE_LIMITED', message: 'Твърде много заявки. Опитайте след минута.' } };
  app.use('/api', rateLimit({
    windowMs: 60_000, limit: 1800, standardHeaders: false, legacyHeaders: false,
    message: rateMessage,
  }), authenticate(options.verify), rateLimit({
    windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (_req, res) => res.locals.userId as string,
    message: rateMessage,
  }), express.json({ limit: '32kb' }), apiRoutes(options.db));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Адресът не е намерен.')));
  app.use(handleError);
  return app;
}
