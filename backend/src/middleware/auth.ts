import type { RequestHandler } from 'express';
import { ApiError } from '../utils/errors.ts';

export type VerifiedUser = { id: string; email?: string };
export type VerifyToken = (token: string) => Promise<VerifiedUser | null>;
export const catalogueAdminEmail = 'zhivkoarbalov@gmail.com';

export function authenticate(verify: VerifyToken): RequestHandler {
  return async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const user = token ? await verify(token) : null;
    if (!user?.id) throw new ApiError(401, 'UNAUTHENTICATED', 'Влезте отново, за да продължите.');
    res.locals.userId = user.id;
    res.locals.catalogueAdmin = user.email?.toLowerCase() === catalogueAdminEmail;
    next();
  };
}
