import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { privateHeaders, requestOrigin, routeAuth } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  const { client, savePolicy } = await routeAuth(false);
  const code = request.nextUrl.searchParams.get('code');
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const result = code ? await client?.auth.exchangeCodeForSession(code)
    : token_hash && (type === 'email' || type === 'signup') ? await client?.auth.verifyOtp({ token_hash, type }) : undefined;
  if (result?.data.session) savePolicy();
  const login = new URL('/login', requestOrigin(request));
  login.searchParams.set('confirmation', result && !result.error ? 'success' : 'failed');
  const response = NextResponse.redirect(login);
  response.headers.set('Cache-Control', privateHeaders['Cache-Control']);
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
