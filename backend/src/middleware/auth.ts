import type { RequestHandler } from 'express';
import { ApiError } from '../utils/errors.ts';

export type VerifyToken = (token: string) => Promise<string | null>;

export function authenticate(verify: VerifyToken): RequestHandler {
  return async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const userId = token ? await verify(token) : null;
    if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Влезте отново, за да продължите.');
    res.locals.userId = userId;
    next();
  };
}
