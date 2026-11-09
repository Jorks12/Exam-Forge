import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../utils/errors.ts';

export function verifySupabaseToken(url: string, key: string) {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const inFlight = new Map<string, Promise<string | null>>();

  async function verify(token: string) {
    const { data, error } = await client.auth.getUser(token);
    if (error && (!error.status || error.status >= 500)) {
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Услугата за вход временно е недостъпна.');
    }
    return data.user?.id ?? null;
  }

  return (token: string) => {
    const pending = inFlight.get(token);
    if (pending) return pending;
    const verification = verify(token).finally(() => inFlight.delete(token));
    inFlight.set(token, verification);
    return verification;
  };
}
