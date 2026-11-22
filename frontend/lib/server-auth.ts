import { createServerClient } from '@supabase/ssr';
import type { CookieOptions, SetAllCookies } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { Account } from './auth-routes';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const authConfigured = Boolean(url && key);
export const sessionPolicy = 'examforge-remember';
export const accountHeader = 'x-examforge-verified-account';
const rememberAge = 60 * 60 * 24 * 30;
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' } as const;

export function account(user: User): Account {
  return { id: user.id, email: user.email ?? null, emailConfirmed: Boolean(user.email_confirmed_at) };
}

export async function verifiedAccount(): Promise<Account | null> {
  const header = (await headers()).get(accountHeader);
  return header ? JSON.parse(decodeURIComponent(header)) as Account : null;
}

export function sessionOptions(options: CookieOptions, remember: boolean): CookieOptions {
  // Keep explicit expiration when Supabase removes an obsolete cookie or chunk.
  if (options.maxAge === 0) return { ...options, ...cookieOptions };
  return { ...options, ...cookieOptions, maxAge: remember ? rememberAge : undefined, expires: undefined };
}

export function serverClient(getAll: () => { name: string; value: string }[], setAll: SetAllCookies) {
  if (!url || !key) return null;
  return createServerClient(url, key, { cookieOptions, cookies: { getAll, setAll } });
}

export async function routeAuth(remember?: boolean) {
  const jar = await cookies();
  const persistent = remember ?? jar.get(sessionPolicy)?.value === 'yes';
  const client = serverClient(() => jar.getAll(), changes => {
    for (const { name, value, options } of changes) jar.set(name, value, sessionOptions(options, persistent));
  });
  return {
    client,
    savePolicy: () => jar.set(sessionPolicy, persistent ? 'yes' : 'no', sessionOptions({}, persistent)),
    clearPolicy: () => jar.set(sessionPolicy, '', { ...cookieOptions, maxAge: 0 }),
  };
}

export function requestOrigin(request: NextRequest) {
  const configured = process.env.EXAMFORGE_ORIGIN;
  if (configured) return new URL(configured).origin;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : request.nextUrl.protocol;
  return host ? new URL(protocol + '//' + host).origin : request.nextUrl.origin;
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === requestOrigin(request) && request.headers.get('sec-fetch-site') !== 'cross-site');
}

export const privateHeaders = { 'Cache-Control': 'private, no-store' };

export function authError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status, headers: privateHeaders });
}
