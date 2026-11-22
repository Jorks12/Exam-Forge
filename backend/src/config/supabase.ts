import { createClient } from '@supabase/supabase-js';
import type { VerifyToken, VerifiedUser } from '../middleware/auth.ts';
import { ApiError } from '../utils/errors.ts';

export function verifySupabaseToken(url: string, key: string): VerifyToken {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const inFlight = new Map<string, Promise<VerifiedUser | null>>();

  async function verify(token: string) {
    const { data, error } = await client.auth.getUser(token);
    if (error && (!error.status || error.status >= 500)) {
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Услугата за вход временно е недостъпна.');
    }
    return !error && data.user?.email_confirmed_at ? { id: data.user.id, email: data.user.email } : null;
  }

  return (token: string) => {
    const pending = inFlight.get(token);
    if (pending) return pending;
    const verification = verify(token).finally(() => inFlight.delete(token));
    inFlight.set(token, verification);
    return verification;
  };
}
